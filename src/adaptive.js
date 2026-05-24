// Pure functions for adaptive difficulty calculation.
// Extracted here so they can be unit-tested without importing the full server.

// Time thresholds (seconds) per minigame. Three boundaries define four bands:
//   time <= fast                        → correct answer scores 1.00
//   fast < time <= slow                 → correct answer scores 0.85
//   slow < time <= very_slow            → correct answer scores 0.70
//   time > very_slow                    → correct answer scores 0.50
//   incorrect (any time)                → scores 0.00
const TIME_THRESHOLDS = {
  'endless-runner':  { fast: 8,  slow: 13, very_slow: 22  },
  'decimal-meteors': { fast: 10, slow: 15, very_slow: 30  },
  'dividing-hills':  { fast: 10, slow: 18, very_slow: 30  },
  'labyrinth':       { fast: 40, slow: 70, very_slow: 100 },
};

function answerScore(answer, thresholds) {
  if (!answer.correct) return 0;
  if (!thresholds || answer.time == null) return 1.0;
  if (answer.time <= thresholds.fast)      return 1.0;
  if (answer.time <= thresholds.slow)      return 0.85;
  if (answer.time <= thresholds.very_slow) return 0.70;
  return 0.50;
}

function calculateAdaptiveLevel(answers, defaultLevel = 5, minigame = null) {
  if (!answers || answers.length === 0) return defaultLevel;

  const thresholds = minigame ? (TIME_THRESHOLDS[minigame] ?? null) : null;

  const total = answers.length;
  const weightedScore = answers.reduce((sum, a) => sum + answerScore(a, thresholds), 0) / total;

  const validDiffs = answers
    .map(a => a.difficulty)
    .filter(d => d != null && d >= 1 && d <= 10);

  const currentLevel = validDiffs.length > 0
    ? Math.round(validDiffs.reduce((sum, d) => sum + d, 0) / validDiffs.length)
    : defaultLevel;

  if (weightedScore > 0.8)  return Math.min(currentLevel + 2, 10);
  if (weightedScore >= 0.6) return currentLevel;
  return Math.max(currentLevel - 1, 1);
}

function difficultyToParams(minigame, level) {
  switch (minigame) {
    case 'endless-runner': {
      if (level <= 3) return { operation_types: ['add'], max_operand: 20 };
      if (level <= 5) return { operation_types: ['add', 'sub'], max_operand: 50 };
      if (level <= 7) return { operation_types: ['add', 'sub', 'mul'], max_operand: 50 };
      return { operation_types: ['add', 'sub', 'mul'], max_operand: 99 };
    }
    case 'dividing-hills': {
      if (level <= 3) return { max_divisor: 20, use_gcd: false };
      if (level <= 6) return { max_divisor: 50, use_gcd: true };
      return { max_divisor: 100, use_gcd: true };
    }
    case 'decimal-meteors': {
      if (level <= 3) return { max_exponent: 3, mixed_units: false };
      if (level <= 6) return { max_exponent: 6, mixed_units: false };
      return { max_exponent: 9, mixed_units: true };
    }
    // labyrinth and fraction-race: difficulty_level passed directly for question filtering
    default:
      return { difficulty_level: level };
  }
}

module.exports = { calculateAdaptiveLevel, difficultyToParams, TIME_THRESHOLDS, answerScore };
