require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const { calculateAdaptiveLevel, difficultyToParams } = require('./adaptive');
const { filterValidQuestions } = require('./validation');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Supabase admin client (service_role key — never sent to the browser)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cabeceras necesarias para que Godot HTML5 funcione (SharedArrayBuffer)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Parsear body JSON en las peticiones POST
app.use(express.json());

// Servir archivos estáticos
app.use(express.static(path.join(__dirname)));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Strips markdown code fences that Gemini sometimes wraps around JSON
function extractJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text.trim();
}

// Retries an async function up to maxAttempts times on 503 errors,
// waiting 1s, 2s, 4s between attempts (exponential backoff).
async function withRetry(fn, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status !== 503 || i === maxAttempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

// Deterministic fallback summaries used when the Gemini API is unavailable.
function buildFallbackStudentSummary({ accuracy, bestGame, bestAccuracy, worstGame, worstAccuracy }) {
  const best = bestGame ? `${bestGame}${bestAccuracy != null ? ` (${bestAccuracy}%)` : ''}` : 'your best minigame';
  const worst = worstGame ? `${worstGame}${worstAccuracy != null ? ` (${worstAccuracy}%)` : ''}` : 'your weakest minigame';
  if (accuracy < 50) {
    return `Your current accuracy of ${accuracy}% shows that the material needs more dedicated practice. The area that most needs your attention right now is ${worst}. Try reviewing the underlying concepts before your next session. Focused practice in these specific areas will make a real difference.`;
  }
  if (accuracy < 65) {
    return `Your overall accuracy is ${accuracy}%, which shows a solid base with room to grow. Your strongest area is ${best}, while ${worst} still needs work. Keep practising your weaker areas consistently to see improvement.`;
  }
  return `Great progress — your overall accuracy is ${accuracy}%. ${best} is clearly your strongest area. Continue working on ${worst} to round out your skills.`;
}

function buildFallbackGroupAnalysis({ groupName, studentCount, groupAccuracy, minigameBreakdown, difficultyBreakdown }) {
  let weakestGame = null, weakestAcc = Infinity;
  if (minigameBreakdown) {
    for (const [game, acc] of Object.entries(minigameBreakdown)) {
      if (acc < weakestAcc) { weakestAcc = acc; weakestGame = game; }
    }
  }
  let weakestDiff = null, weakestDiffAcc = Infinity;
  if (difficultyBreakdown) {
    for (const [level, acc] of Object.entries(difficultyBreakdown)) {
      if (acc < weakestDiffAcc) { weakestDiffAcc = acc; weakestDiff = level; }
    }
  }
  let text = `Group "${groupName}" (${studentCount ?? '?'} students) has an average accuracy of ${groupAccuracy}%. `;
  if (weakestGame) text += `The minigame with the lowest performance is ${weakestGame} (${weakestAcc}%), which suggests this concept may need reinforcement in class. `;
  if (weakestDiff) text += `Difficulty level ${weakestDiff} also shows the weakest results (${weakestDiffAcc}%). `;
  text += groupAccuracy < 60
    ? `Consider revisiting foundational concepts with the group before advancing to harder difficulty levels.`
    : `Overall the group is performing adequately; targeted practice on the weakest areas should help close remaining gaps.`;
  return text;
}

function buildFallbackStudentSummaryTeacher({ studentName, accuracy, bestGame, bestAccuracy, worstGame, worstAccuracy }) {
  const best = bestGame ? `${bestGame}${bestAccuracy != null ? ` (${bestAccuracy}%)` : ''}` : 'their best minigame';
  const worst = worstGame ? `${worstGame}${worstAccuracy != null ? ` (${worstAccuracy}%)` : ''}` : 'their weakest minigame';
  let text = `${studentName ?? 'This student'} has an overall accuracy of ${accuracy}%. Their strongest area is ${best}, while ${worst} is where they struggle most. `;
  if (accuracy < 50) {
    text += `All areas are below 50%, indicating the student needs immediate targeted intervention. Consider one-on-one support focused on ${worstGame ?? 'the weakest minigame'}.`;
  } else if (accuracy < 65) {
    text += `There are clear areas of concern. Targeted practice on ${worstGame ?? 'the weakest minigame'} is recommended.`;
  } else {
    text += `The student is performing well overall. Build on their strength in ${bestGame ?? 'their best area'} and encourage continued practice in ${worstGame ?? 'weaker areas'}.`;
  }
  return text;
}

const ALLOWED_MINIGAMES = [
  'fraction-race',
  'labyrinth',
  'dividing-hills',
  'decimal-meteors',
  'endless-runner'
];

// Prompt templates per minigame. Receive the desired question count.
const MINIGAME_PROMPTS = {
  labyrinth: (count) =>
    `Generate exactly ${count} rule of three (direct and inverse proportionality) math word problems for middle school students. Use varied real-world contexts (maps, workers, quantities, prices, speeds, recipes…).

Respond ONLY with a valid JSON array, no markdown, no extra text:
[
  {
    "question": "If 10cm of a map are 750m in reality, how many meters\\n are 13cm in the map?",
    "answerA": ["1000m", false],
    "answerB": ["975m", true],
    "answerC": ["5000m", false],
    "answerD": ["13m", false],
    "difficulty": 3
  }
]
Rules:
- Exactly one answer per question must be true.
- Use \\n for line breaks in questions.
- "difficulty" must be an integer 1-10: 1-3 = direct proportionality with small numbers; 4-6 = larger numbers or inverse proportionality; 7-10 = compound proportionality with multiple variables. Distribute difficulties evenly across the ${count} questions.
Return ONLY the JSON array.`,

  'dividing-hills': (count) =>
    `Generate exactly ${count} math problems about divisibility and GCD (Greatest Common Divisor) for middle school students. Mix both types roughly equally.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[
  {"type":0,"text":"Is 450 divisible by 5?","answer":"B","options":{"A":"No","B":"Yes"}},
  {"type":1,"text":"Select the gcd of 24 and 36:","answer":"A","options":{"A":"12","B":"6","C":"4","D":"8"}}
]
Rules:
- Type 0: "answer" is "A" (No) or "B" (Yes). Only use divisibility criteria: 2, 3, 4, 5, 6, 9, 10, 11.
- Type 1: four numerical options, exactly one is the correct GCD, the rest are plausible wrong answers.
Return ONLY the JSON array.`,

  'decimal-meteors': (count) =>
    `Generate exactly ${count} metric system unit conversion problems for middle school students.
Use only these units — mass: mg, g, kg; length: mm, cm, m, km; volume in liters: ml, l, kl.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[{"question":"250mg","value":0.25,"unit":"g"}]
Where:
- "question": the original number + unit shown to the player (e.g. "250mg")
- "value": the converted number the player must identify (e.g. 0.25)
- "unit": the target unit (e.g. "g")
Keep numbers reasonable: both original and converted values between 0.001 and 1000, max 5 digits.
Return ONLY the JSON array.`,

  'endless-runner': (count) =>
    `Generate exactly ${count} arithmetic problems for middle school students. Mix addition (+), subtraction (-), and multiplication (*) roughly equally.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[{"operand1":45,"operator":"+","operand2":32,"answer":77}]
Rules:
- Addition/subtraction: both operands between 10 and 99.
- Subtraction: operand1 >= operand2 (result must be non-negative).
- Multiplication: operand1 between 10-99, operand2 between 0-9.
- Use "+" "-" or "*" as operator values.
Return ONLY the JSON array.`
};

const DEFAULT_COUNTS = {
  labyrinth: 15,
  'dividing-hills': 15,
  'decimal-meteors': 50,
  'endless-runner': 50
};

// ---------------------------------------------------------------------------
// Rate limiter for all AI endpoints (Phase 9)
// Prevents a single IP from exhausting the Gemini free-tier daily quota.
// Applied to every route under /api/ai/* via app.use before the first route.
// ---------------------------------------------------------------------------
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour sliding window
  max: 20,                   // max 20 requests per IP per hour
  standardHeaders: true,     // sends RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please wait before trying again.' },
});
app.use('/api/ai', aiLimiter);

// ---------------------------------------------------------------------------
// AI endpoints — student/teacher analysis (Phases 2 & 3)
// ---------------------------------------------------------------------------

// POST /api/ai/student-summary
// Receives student stats and returns an AI-generated analysis paragraph
app.post('/api/ai/student-summary', async (req, res) => {
  const {
    sessions,
    accuracy,
    avgTime,
    bestGame,
    bestAccuracy,
    worstGame,
    worstAccuracy,
    minigameStats,
    difficultyBreakdown
  } = req.body;

  if (sessions === undefined || accuracy === undefined) {
    return res.status(400).json({ error: 'Missing required stats' });
  }

  const diffText = difficultyBreakdown
    ? Object.entries(difficultyBreakdown)
        .map(([level, acc]) => `level ${level}: ${acc}%`)
        .join(', ')
    : 'no data';

  const allBelowHalf = (accuracy !== null && accuracy !== undefined && accuracy < 50)
    || (bestAccuracy !== null && bestAccuracy !== undefined && bestAccuracy < 50);

  const sentence1 = (bestAccuracy !== null && bestAccuracy >= 50)
    ? `Acknowledge that their overall accuracy of ${accuracy}% means they are struggling in most areas, but note that ${bestGame} (${bestAccuracy}%) is a relative strength to build on.`
    : `Acknowledge that their current accuracy of ${accuracy}% means they are finding the material genuinely difficult and need to work on improving across all areas.`;

  let prompt;
  if (allBelowHalf) {
    prompt = `A student has played ${sessions} sessions with the following results:
- Global accuracy: ${accuracy}%
- Best minigame: ${bestGame ?? 'N/A'} (${bestAccuracy ?? '—'}% accuracy)
- Worst minigame: ${worstGame ?? 'N/A'} (${worstAccuracy ?? '—'}% accuracy)

Write a short paragraph (maximum 80 words) addressed directly to the student using EXACTLY this 4-sentence structure:
1. ${sentence1}
2. Point out that ${worstGame ?? 'their weakest minigame'} is the area that needs the most attention right now.
3. Give one specific, concrete action they can take to improve (e.g., reviewing a specific concept or practising a specific skill).
4. A single short closing sentence of honest encouragement — not falsely cheerful, but genuine.

Example of the expected tone:
"Your current accuracy of 12% across all minigames shows that the concepts covered in the game need more dedicated practice. The area that most needs your attention right now is Endless Runner, where arithmetic operations are the key challenge. Before your next session, try reviewing basic addition and subtraction exercises so the operations feel more familiar. You can improve — focused practice in these specific areas will make a real difference."

Respond only with the paragraph. Do not add titles, praise the number of sessions played, or describe any accuracy below 50% as a success or strength.`;
  } else {
    const toneInstruction = accuracy < 65
      ? 'Be balanced: acknowledge both effort and areas that clearly need improvement. Avoid excessive praise.'
      : 'Be encouraging and positive, highlighting progress and strengths.';

    const minigameText = minigameStats && minigameStats.length > 0
      ? minigameStats.map(g => `${g.name}: ${g.accuracy}%`).join(', ')
      : `${bestGame ?? 'N/A'}: ${bestAccuracy ?? '—'}%, ${worstGame ?? 'N/A'}: ${worstAccuracy ?? '—'}%`;

    prompt = `You are a math tutor providing feedback to a student. A student has the following performance data:
- Global accuracy: ${accuracy}%
- Average time per answer: ${avgTime}s
- Accuracy per minigame: ${minigameText}

Write a short paragraph (maximum 80 words) addressed directly to the student. Do not open with praise for completing sessions or for effort. Start by assessing their overall accuracy. Briefly mention all minigames — highlight the strongest, identify the one needing most practice, and note whether others are in a stable or improving range. End with one actionable suggestion for their weakest area. ${toneInstruction} Respond only with the paragraph, no titles or extra formatting.`;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await withRetry(() => model.generateContent(prompt));
    const summary = result.response.text();
    res.json({ summary });
  } catch (err) {
    console.error('Gemini API error:', err);
    res.json({ summary: buildFallbackStudentSummary({ accuracy, bestGame, bestAccuracy, worstGame, worstAccuracy }) });
  }
});

// POST /api/ai/group-analysis
// Receives group-level stats and returns an AI-generated analysis for the teacher
app.post('/api/ai/group-analysis', async (req, res) => {
  const {
    groupName,
    studentCount,
    totalSessions,
    groupAccuracy,
    avgTime,
    minigameBreakdown,
    difficultyBreakdown
  } = req.body;

  if (!groupName || groupAccuracy === undefined) {
    return res.status(400).json({ error: 'Missing required stats' });
  }

  const minigameText = minigameBreakdown
    ? Object.entries(minigameBreakdown)
        .map(([game, acc]) => `${game}: ${acc}%`)
        .join(', ')
    : 'no data';

  const diffText = difficultyBreakdown
    ? Object.entries(difficultyBreakdown)
        .map(([level, acc]) => `level ${level}: ${acc}%`)
        .join(', ')
    : 'no data';

  const prompt = `You are an assistant helping a math teacher analyze their students' performance. The group "${groupName}" has the following data:
- Number of students: ${studentCount}
- Total sessions played by the group: ${totalSessions}
- Group average accuracy: ${groupAccuracy}%
- Average time per answer: ${avgTime}s
- Accuracy by minigame: ${minigameText}
- Accuracy by difficulty level: ${diffText}

Write a short paragraph (maximum 80 words) addressed to the teacher. Identify which minigame or difficulty level the group struggles with most, and suggest what to reinforce in class. Be specific and professional. Respond only with the paragraph, no titles or extra formatting.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await withRetry(() => model.generateContent(prompt));
    res.json({ summary: result.response.text() });
  } catch (err) {
    console.error('Gemini API error:', err);
    res.json({ summary: buildFallbackGroupAnalysis({ groupName, studentCount, groupAccuracy, minigameBreakdown, difficultyBreakdown }) });
  }
});

// POST /api/ai/student-summary-teacher
// Receives individual student stats and returns a 3rd-person AI summary for the teacher
app.post('/api/ai/student-summary-teacher', async (req, res) => {
  const {
    studentName,
    sessions,
    accuracy,
    avgTime,
    bestGame,
    bestAccuracy,
    worstGame,
    worstAccuracy,
    minigameStats,
    difficultyBreakdown
  } = req.body;

  if (!studentName || sessions === undefined) {
    return res.status(400).json({ error: 'Missing required stats' });
  }

  const minigameText = minigameStats && minigameStats.length > 0
    ? minigameStats.map(g => `${g.name}: ${g.accuracy}%`).join(', ')
    : `${bestGame ?? 'N/A'}: ${bestAccuracy ?? '—'}%, ${worstGame ?? 'N/A'}: ${worstAccuracy ?? '—'}%`;

  const allBelowHalfTeacher = (accuracy !== null && accuracy !== undefined && accuracy < 50)
    || (bestAccuracy !== null && bestAccuracy !== undefined && bestAccuracy < 50);
  const hasRelativeStrength = bestAccuracy !== null && bestAccuracy >= 50;
  const urgencyNote = allBelowHalfTeacher
    ? hasRelativeStrength
      ? `This student's overall accuracy of ${accuracy}% is below 50%, indicating significant struggles in most areas. Note that ${bestGame} (${bestAccuracy}%) is a relative strength, but do not use it to soften the assessment — ${worstGame} at ${worstAccuracy}% requires targeted intervention. Give one concrete pedagogical recommendation focused on the weakest area.`
      : 'This student has no minigame above 50% accuracy. Flag them as needing immediate intervention. Do not soften this assessment. Clearly state that all areas are underperforming and give one direct pedagogical recommendation.'
    : accuracy < 65
      ? 'Note areas of concern clearly and suggest targeted intervention.'
      : 'Highlight strengths and suggest how the teacher can build on them.';

  const prompt = `You are an assistant helping a math teacher track individual student performance. The student ${studentName} has the following data:
- Overall accuracy: ${accuracy}%
- Average time per answer: ${avgTime}s
- Accuracy per minigame: ${minigameText}

Write a short paragraph (maximum 60 words) in third person addressed to the teacher. Cover all minigames — highlight the strongest, identify the one needing most intervention, and note whether others are stable or improving. End with one concrete pedagogical suggestion for the weakest area. ${urgencyNote} Be concise and professional. Respond only with the paragraph, no titles or extra formatting.`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await withRetry(() => model.generateContent(prompt));
    res.json({ summary: result.response.text() });
  } catch (err) {
    console.error('Gemini API error:', err);
    res.json({ summary: buildFallbackStudentSummaryTeacher({ studentName, accuracy, bestGame, bestAccuracy, worstGame, worstAccuracy }) });
  }
});

// ---------------------------------------------------------------------------
// AI question generation — Phase 5
// ---------------------------------------------------------------------------

const AI_MINIGAMES = ['labyrinth', 'dividing-hills', 'decimal-meteors', 'endless-runner'];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // regenerate after 24 h

// Core generation function shared by auto-generation and the teacher dashboard.
// Returns the questions array or throws on failure.
// After parsing, filters out mathematically invalid questions.
// Retries once if fewer than 70% of the requested questions pass validation.
async function callGeminiForQuestions(minigame) {
  const count = DEFAULT_COUNTS[minigame];
  const prompt = MINIGAME_PROMPTS[minigame](count);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const minValid = Math.ceil(count * 0.7);

  let bestQuestions = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await withRetry(() => model.generateContent(prompt));
    const raw = result.response.text();
    let parsed;
    try {
      parsed = JSON.parse(extractJSON(raw));
    } catch { continue; }
    if (!Array.isArray(parsed)) continue;

    const valid = filterValidQuestions(minigame, parsed);
    if (valid.length > bestQuestions.length) bestQuestions = valid;
    if (valid.length >= minValid) break;
  }

  if (bestQuestions.length === 0) throw new Error('AI returned no valid questions after 2 attempts');

  if (minigame === 'labyrinth') {
    bestQuestions = bestQuestions.map(q => ({ ...q, explanation: [''] }));
  }

  return bestQuestions;
}

// Saves questions to disk with a timestamp for cache invalidation.
function saveQuestionsToDisk(minigame, questions) {
  const filePath = path.join(__dirname, 'questions', `${minigame}.json`);
  fs.writeFileSync(filePath, JSON.stringify({ questions, generated_at: new Date().toISOString() }, null, 2));
}

// Returns true if the file has questions generated less than CACHE_TTL_MS ago.
function hasFreshQuestions(minigame) {
  const filePath = path.join(__dirname, 'questions', `${minigame}.json`);
  if (!fs.existsSync(filePath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.questions || data.questions.length === 0) return false;
    if (!data.generated_at) return false;
    return Date.now() - new Date(data.generated_at).getTime() < CACHE_TTL_MS;
  } catch { return false; }
}

// Auto-generates questions for a minigame if the cache is missing or stale.
// Called at server startup; runs in the background, does not block.
async function autoGenerateIfNeeded(minigame) {
  if (hasFreshQuestions(minigame)) {
    console.log(`[questions] ${minigame}: using cached questions`);
    return;
  }
  console.log(`[questions] ${minigame}: generating with AI...`);
  try {
    const questions = await callGeminiForQuestions(minigame);
    saveQuestionsToDisk(minigame, questions);
    console.log(`[questions] ${minigame}: generated ${questions.length} questions`);
  } catch (err) {
    console.error(`[questions] ${minigame}: auto-generation failed —`, err.message);
  }
}

// POST /api/ai/generate-questions/:minigame
// Called from the teacher dashboard to force-regenerate questions for a minigame.
app.post('/api/ai/generate-questions/:minigame', async (req, res) => {
  const { minigame } = req.params;
  if (!MINIGAME_PROMPTS[minigame]) {
    return res.status(400).json({ error: `AI generation not supported for: ${minigame}` });
  }
  try {
    const questions = await callGeminiForQuestions(minigame);
    res.json({ questions });
  } catch (err) {
    console.error('Question generation error:', err);
    res.status(500).json({ error: 'Failed to generate questions. Try again.' });
  }
});

// POST /api/levels/:minigame/activate
// Called from the teacher dashboard to write a question set to disk.
app.post('/api/levels/:minigame/activate', (req, res) => {
  const { minigame } = req.params;
  if (!ALLOWED_MINIGAMES.includes(minigame)) {
    return res.status(400).json({ error: 'Unknown minigame' });
  }
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'Body must contain a questions array' });
  }
  try {
    saveQuestionsToDisk(minigame, questions);
    res.json({ success: true, count: questions.length });
  } catch (err) {
    console.error('Error saving questions:', err);
    res.status(500).json({ error: 'Failed to save questions' });
  }
});

// ---------------------------------------------------------------------------
// Question files — Phase 4 + 5
// GET /api/levels/:minigame
// Serves the questions JSON. For AI-supported minigames, generates on the fly
// if the cache is empty (e.g. first request before startup generation finishes).
// Godot falls back to procedural generation if this returns {questions:[]}.
// ---------------------------------------------------------------------------

app.get('/api/levels/:minigame', async (req, res) => {
  const { minigame } = req.params;
  if (!ALLOWED_MINIGAMES.includes(minigame)) {
    return res.status(404).json({ error: 'Unknown minigame' });
  }

  const filePath = path.join(__dirname, 'questions', `${minigame}.json`);

  // Serve from cache if available
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.questions && data.questions.length > 0) {
        return res.json({ questions: data.questions });
      }
    } catch { /* fall through to generation */ }
  }

  // Cache empty or missing: generate now if AI-supported (covers first-run edge case)
  if (MINIGAME_PROMPTS[minigame]) {
    try {
      const questions = await callGeminiForQuestions(minigame);
      saveQuestionsToDisk(minigame, questions);
      return res.json({ questions });
    } catch (err) {
      console.error(`[questions] on-demand generation failed for ${minigame}:`, err.message);
    }
  }

  // Fallback: Godot will use procedural generation
  res.json({ questions: [] });
});

// ---------------------------------------------------------------------------
// Adaptive levels — Phase 6
// GET /api/adaptive-level/:minigame/:userId
// Reads the student's last 10 sessions for that minigame, calculates accuracy,
// and returns difficulty parameters tailored to their current level.
// ---------------------------------------------------------------------------

app.get('/api/adaptive-level/:minigame/:userId', async (req, res) => {
  const { minigame, userId } = req.params;

  if (!ALLOWED_MINIGAMES.includes(minigame)) {
    return res.status(400).json({ error: 'Unknown minigame' });
  }

  const DEFAULT_LEVEL = 5;

  try {
    // 1. Get the last 10 sessions for this user + minigame
    const { data: sessions, error: sessErr } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('minigame', minigame)
      .order('date', { ascending: false })
      .limit(10);

    if (sessErr) throw sessErr;

    if (!sessions || sessions.length === 0) {
      return res.json({ difficulty_level: DEFAULT_LEVEL, ...difficultyToParams(minigame, DEFAULT_LEVEL) });
    }

    const sessionIds = sessions.map(s => s.id);

    // 2. Get all answers for those sessions
    const { data: answers, error: ansErr } = await supabaseAdmin
      .from('answers')
      .select('correct, difficulty')
      .in('session_id', sessionIds);

    if (ansErr) throw ansErr;

    if (!answers || answers.length === 0) {
      return res.json({ difficulty_level: DEFAULT_LEVEL, ...difficultyToParams(minigame, DEFAULT_LEVEL) });
    }

    // 3-5. Calculate new difficulty level using the adaptive algorithm
    const newLevel = calculateAdaptiveLevel(answers, DEFAULT_LEVEL);

    // 6. Return difficulty_level + minigame-specific params
    res.json({ difficulty_level: newLevel, ...difficultyToParams(minigame, newLevel) });

  } catch (err) {
    console.error('[adaptive-level] error:', err.message);
    // On any error, return safe defaults so the game is never blocked
    res.json({ difficulty_level: DEFAULT_LEVEL, ...difficultyToParams(minigame, DEFAULT_LEVEL) });
  }
});

// ---------------------------------------------------------------------------
// Group lookup — Phase 9
// GET /api/groups/lookup?code=XXXXXXXX
// Replaces the client-side db.from('groups').select('id, name') mass query.
// Accepts an 8-char invite code, verifies the JWT, and returns only the
// matching group — or 404. This way the client never sees other groups' data.
// ---------------------------------------------------------------------------
app.get('/api/groups/lookup', async (req, res) => {
  // 1. Verify the caller is an authenticated user.
  //    Without this check, any unauthenticated request could probe group codes.
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // 2. Validate the code format (8 hex chars, lowercase).
  const code = (req.query.code || '').toLowerCase().trim();
  if (!/^[0-9a-f]{8}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }

  // 3. Look up only the group whose UUID starts with this code.
  //    supabaseAdmin bypasses RLS — this is intentional: we want the server
  //    to find the group without requiring a public RLS policy on 'groups'.
  const { data: group, error: groupErr } = await supabaseAdmin
    .from('groups')
    .select('id, name')
    .gte('id', `${code}-0000-0000-0000-000000000000`)
    .lte('id', `${code}-ffff-ffff-ffff-ffffffffffff`)
    .maybeSingle();

  if (groupErr) {
    console.error('[groups/lookup] DB error:', groupErr.message);
    return res.status(500).json({ error: 'Database error' });
  }

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  // 4. Return only the fields the client needs.
  res.json({ id: group.id, name: group.name });
});

// ---------------------------------------------------------------------------
// CSV export
// GET /api/groups/:groupId/export/sessions
// GET /api/groups/:groupId/export/answers
// Both require a valid teacher JWT and verify that the caller owns the group.
// ---------------------------------------------------------------------------

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(fields) {
  return fields.map(escapeCsv).join(',');
}

// Extracts and verifies the Bearer token, then checks that the authenticated
// user is the teacher_id of the requested group. Returns the group row on
// success, or sends the appropriate error response and returns null.
async function verifyTeacherGroupAccess(req, res, groupId) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('teacher_id, name')
    .eq('id', groupId)
    .maybeSingle();
  if (!group || group.teacher_id !== user.id) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  return group;
}

app.get('/api/groups/:groupId/export/sessions', async (req, res) => {
  const { groupId } = req.params;
  const group = await verifyTeacherGroupAccess(req, res, groupId);
  if (!group) return;

  try {
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('id, user_id, minigame, date, duration')
      .eq('group_id', groupId)
      .order('date', { ascending: true });

    const allSessions = sessions ?? [];
    const sessionIds  = allSessions.map(s => s.id);

    const userIds = [...new Set(allSessions.map(s => s.user_id))];
    const { data: users } = userIds.length > 0
      ? await supabaseAdmin.from('users').select('id, name').in('id', userIds)
      : { data: [] };
    const nameMap = {};
    for (const u of (users ?? [])) nameMap[u.id] = u.name;

    const { data: answers } = sessionIds.length > 0
      ? await supabaseAdmin.from('answers').select('session_id, correct, time, difficulty').in('session_id', sessionIds)
      : { data: [] };

    // Aggregate per session: correct count, total, avg difficulty
    const bySession = {};
    for (const a of (answers ?? [])) {
      if (!bySession[a.session_id]) bySession[a.session_id] = { correct: 0, total: 0, diffSum: 0, diffCount: 0 };
      bySession[a.session_id].total++;
      if (a.correct) bySession[a.session_id].correct++;
      if ((a.difficulty ?? 0) >= 1) {
        bySession[a.session_id].diffSum  += a.difficulty;
        bySession[a.session_id].diffCount++;
      }
    }

    const header = 'student_name,student_id,minigame,date,duration_s,correct,total,accuracy_pct,avg_difficulty';
    const rows = allSessions.map(s => {
      const agg = bySession[s.id] ?? { correct: 0, total: 0, diffSum: 0, diffCount: 0 };
      const accuracy = agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : '';
      const avgDiff  = agg.diffCount > 0 ? (agg.diffSum / agg.diffCount).toFixed(1) : '';
      return rowToCsv([
        nameMap[s.user_id] ?? '',
        s.user_id,
        s.minigame ?? '',
        s.date ? new Date(s.date).toISOString() : '',
        s.duration ?? '',
        agg.correct,
        agg.total,
        accuracy,
        avgDiff
      ]);
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="group_${groupId.slice(0, 8)}_sessions.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[export/sessions] error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

app.get('/api/groups/:groupId/export/answers', async (req, res) => {
  const { groupId } = req.params;
  const group = await verifyTeacherGroupAccess(req, res, groupId);
  if (!group) return;

  try {
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('id, user_id, minigame, date')
      .eq('group_id', groupId)
      .order('date', { ascending: true });

    const allSessions = sessions ?? [];
    const sessionIds  = allSessions.map(s => s.id);

    const userIds = [...new Set(allSessions.map(s => s.user_id))];
    const { data: users } = userIds.length > 0
      ? await supabaseAdmin.from('users').select('id, name').in('id', userIds)
      : { data: [] };
    const nameMap = {};
    for (const u of (users ?? [])) nameMap[u.id] = u.name;

    const sessionMeta = {};
    for (const s of allSessions) sessionMeta[s.id] = s;

    const { data: answers } = sessionIds.length > 0
      ? await supabaseAdmin.from('answers')
          .select('session_id, correct, time, difficulty')
          .in('session_id', sessionIds)
      : { data: [] };

    const header = 'student_name,student_id,session_id,minigame,date,correct,time_s,difficulty';
    const rows = (answers ?? []).map(a => {
      const meta = sessionMeta[a.session_id] ?? {};
      return rowToCsv([
        nameMap[meta.user_id] ?? '',
        meta.user_id ?? '',
        a.session_id,
        meta.minigame ?? '',
        meta.date ? new Date(meta.date).toISOString() : '',
        a.correct ? 1 : 0,
        a.time ?? '',
        a.difficulty ?? ''
      ]);
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="group_${groupId.slice(0, 8)}_answers.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[export/answers] error:', err.message);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  // Auto-generate questions for all AI-supported minigames in the background.
  // Skips any minigame whose cache is still fresh (< 24 h old).
  for (const minigame of AI_MINIGAMES) {
    autoGenerateIfNeeded(minigame).catch(() => {});
  }
});
