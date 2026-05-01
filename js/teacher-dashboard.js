(async function () {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const teacherId = session.user.id;

  const { data: teacher } = await db
    .from('users')
    .select('name, role')
    .eq('id', teacherId)
    .single();

  if (!teacher || teacher.role !== 'teacher') {
    window.location.href = 'game.html';
    return;
  }

  document.getElementById('teacher-name').textContent = teacher.name;

  //caches populated in loadGroupStudents
  const groupStatsCache = {};
  const studentStatsMapCache = {};

  window.logout = async function () {
    await db.auth.signOut();
    window.location.href = 'auth.html';
  };

  document.querySelectorAll('.qgen-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.qgen-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  await loadGroups();

  document.getElementById('form-create-group').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) return;

    const { error } = await db.from('groups').insert({ teacher_id: teacherId, name });
    if (error) {
      console.error('Error creating group:', error);
      return;
    }
    document.getElementById('group-name-input').value = '';
    await loadGroups();
  });

  window.removeStudent = async function (studentId, groupId) {
    if (!confirm('Remove this student from the group?')) return;
    const { error } = await db
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('student_id', studentId);
    if (!error) await loadGroups();
  };

  async function loadGroups() {
    const { data: groups } = await db
      .from('groups')
      .select('id, name')
      .eq('teacher_id', teacherId)
      .order('name');

    const container = document.getElementById('groups-container');
    const selector  = document.getElementById('teacher-group-selector');
    container.innerHTML = '';
    selector.innerHTML  = '';

    if (!groups || groups.length === 0) {
      container.innerHTML = '<p class="empty-msg">No groups yet. Create one above.</p>';
      selector.style.display = 'none';
      return;
    }

    selector.style.display = 'flex';
    groups.forEach(group => {
      const btn = document.createElement('button');
      btn.className = 'group-sel-btn';
      btn.dataset.groupId = group.id;
      btn.textContent = group.name;
      btn.onclick = () => selectTeacherGroup(group.id);
      selector.appendChild(btn);
    });

    for (const group of groups) {
      const section = document.createElement('div');
      section.className = 'group-section';
      section.id = `group-section-${group.id}`;
      section.style.display = 'none';
      section.innerHTML = `
        <div class="group-header">
          <h3>${group.name}</h3>
          <span class="group-code">Invite code: <strong>${group.id.slice(0, 8).toUpperCase()}</strong></span>
        </div>
        <div id="students-${group.id}" class="students-container">Loading...</div>
      `;
      container.appendChild(section);
      loadGroupStudents(group.id);
    }

    selectTeacherGroup(groups[0].id);
  }

  function selectTeacherGroup(groupId) {
    document.querySelectorAll('#teacher-group-selector .group-sel-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.groupId === groupId);
    });
    document.querySelectorAll('#groups-container .group-section').forEach(section => {
      section.style.display = section.id === `group-section-${groupId}` ? 'block' : 'none';
    });
  }

  async function loadGroupStudents(groupId) {
    const container = document.getElementById(`students-${groupId}`);

    const { data: members } = await db
      .from('group_members')
      .select('student_id, users(id, name, email)')
      .eq('group_id', groupId);

    if (!members || members.length === 0) {
      container.innerHTML = '<p class="empty-msg">No students yet.</p>';
      return;
    }

    const { data: sessions } = await db
      .from('sessions')
      .select('id, user_id, minigame, date')
      .eq('group_id', groupId);

    const allSessions = sessions ?? [];
    const sessionIds  = allSessions.map(s => s.id);

    const { data: answersData } = sessionIds.length > 0
      ? await db.from('answers').select('session_id, correct, time, difficulty').in('session_id', sessionIds)
      : { data: [] };

    const allAnswers = answersData ?? [];

    const studentIds = members.map(m => m.users.id);
    const { data: badgesData } = studentIds.length > 0
      ? await db.from('achievements').select('user_id').in('user_id', studentIds)
      : { data: [] };
    const badgeCountMap = {};
    for (const b of (badgesData ?? [])) {
      badgeCountMap[b.user_id] = (badgeCountMap[b.user_id] ?? 0) + 1;
    }

    const sessionMap = {};
    for (const s of allSessions) sessionMap[s.id] = s;

    const nameMap = {};
    for (const m of members) nameMap[m.users.id] = m.users.name;

    let tableHTML = `
      <table class="stats-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Sessions</th>
            <th>Accuracy</th>
            <th>Avg. time / answer</th>
            <th>🏆</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
    `;

    //group-level stats for the AI analysis prompt
    const enrichedForGroup = allAnswers.map(a => ({
      ...a,
      minigame: sessionMap[a.session_id]?.minigame ?? 'Unknown'
    }));
    const byMinigameGroup = groupByKey(enrichedForGroup, a => a.minigame);
    const minigameBreakdownGroup = {};
    for (const [game, g] of Object.entries(byMinigameGroup)) {
      minigameBreakdownGroup[game] = Math.round((g.correct / g.total) * 100);
    }
    const byDiffGroup = groupByKey(allAnswers, a => a.difficulty ?? 1);
    const diffBreakdownGroup = {};
    for (const [level, g] of Object.entries(byDiffGroup)) {
      if (g.total > 0) diffBreakdownGroup[level] = Math.round((g.correct / g.total) * 100);
    }
    const totalGroupAnswers   = allAnswers.length;
    const correctGroupAnswers = allAnswers.filter(a => a.correct).length;
    const groupStats = {
      studentCount: members.length,
      totalSessions: allSessions.length,
      groupAccuracy: totalGroupAnswers > 0 ? Math.round((correctGroupAnswers / totalGroupAnswers) * 100) : 0,
      avgTime: totalGroupAnswers > 0
        ? Math.round(allAnswers.reduce((s, a) => s + (a.time ?? 0), 0) / totalGroupAnswers)
        : 0,
      minigameBreakdown: minigameBreakdownGroup,
      difficultyBreakdown: diffBreakdownGroup
    };

    groupStatsCache[groupId] = groupStats;

    const answersBySession = {};
    for (const a of allAnswers) {
      if (!answersBySession[a.session_id]) answersBySession[a.session_id] = [];
      answersBySession[a.session_id].push(a);
    }
    const studentAlertsMap = {};

    for (const member of members) {
      const student = member.users;
      const studentSessions   = allSessions.filter(s => s.user_id === student.id);
      const studentSessionIds = new Set(studentSessions.map(s => s.id));
      const studentAnswers    = allAnswers.filter(a => studentSessionIds.has(a.session_id));

      const byMinigameSt = groupByKey(
        studentAnswers.map(a => ({ ...a, minigame: sessionMap[a.session_id]?.minigame ?? 'Unknown' })),
        a => a.minigame
      );
      const minigameEntries = Object.entries(byMinigameSt)
        .map(([name, g]) => ({ name, accuracy: Math.round((g.correct / g.total) * 100) }))
        .sort((a, b) => b.accuracy - a.accuracy);
      const byDiffSt = groupByKey(studentAnswers, a => a.difficulty ?? 1);
      const diffBreakdownSt = {};
      for (const [level, g] of Object.entries(byDiffSt)) {
        if (g.total > 0) diffBreakdownSt[level] = Math.round((g.correct / g.total) * 100);
      }
      const totalSt   = studentAnswers.length;
      const correctSt = studentAnswers.filter(a => a.correct).length;

      studentStatsMapCache[`${student.id}-${groupId}`] = {
        sessions:     studentSessions.length,
        accuracy:     totalSt > 0 ? Math.round((correctSt / totalSt) * 100) : 0,
        avgTime:      totalSt > 0 ? Math.round(studentAnswers.reduce((s, a) => s + (a.time ?? 0), 0) / totalSt) : 0,
        bestGame:     minigameEntries[0]?.name ?? null,
        bestAccuracy: minigameEntries[0]?.accuracy ?? null,
        worstGame:     minigameEntries[minigameEntries.length - 1]?.name ?? null,
        worstAccuracy: minigameEntries[minigameEntries.length - 1]?.accuracy ?? null,
        minigameStats: minigameEntries,
        difficultyBreakdown: diffBreakdownSt
      };
      studentAlertsMap[student.id] = detectAlerts(studentSessions, answersBySession, sessionMap);
    }

    const alertStudents = members
      .map(m => ({ student: m.users, alert: studentAlertsMap[m.users.id] }))
      .filter(({ alert }) => alert.negative.level !== 'ok' || alert.positive.level !== 'ok');

    let alertsHTML = '';
    if (alertStudents.length > 0) {
      const badStudents  = alertStudents.filter(({ alert }) => alert.negative.level !== 'ok');
      const goodStudents = alertStudents.filter(({ alert }) => alert.positive.level !== 'ok');
      const hasCritical  = badStudents.some(({ alert }) => alert.negative.level === 'critical');

      //critical entries first
      badStudents.sort((a, b) => {
        if (a.alert.negative.level === 'critical' && b.alert.negative.level !== 'critical') return -1;
        if (b.alert.negative.level === 'critical' && a.alert.negative.level !== 'critical') return 1;
        return 0;
      });

      const badSection = badStudents.length > 0 ? `
        <div class="alerts-section alerts-section--bad">
          <div class="alerts-section-title">Needs Attention</div>
          ${badStudents.map(({ student, alert }) => `
            <div class="alert-entry alert-entry--${alert.negative.level}">
              <span class="alert-dot alert-dot--${alert.negative.level}"></span>
              <span class="alert-student-name">${student.name}</span>
              <span class="alert-msg">${alert.negative.messages.join(' · ')}</span>
            </div>
          `).join('')}
        </div>
      ` : '';

      const goodSection = goodStudents.length > 0 ? `
        <div class="alerts-section alerts-section--good">
          <div class="alerts-section-title">Doing Great</div>
          ${goodStudents.map(({ student, alert }) => `
            <div class="alert-entry alert-entry--excellent">
              <span class="alert-dot alert-dot--excellent"></span>
              <span class="alert-student-name">${student.name}</span>
              <span class="alert-msg">${alert.positive.message}</span>
            </div>
          `).join('')}
        </div>
      ` : '';

      const badBadge  = badStudents.length  > 0 ? `<span class="alerts-count alerts-count--${hasCritical ? 'critical' : 'warning'}">${badStudents.length} need attention</span>` : '';
      const goodBadge = goodStudents.length > 0 ? `<span class="alerts-count alerts-count--excellent">${goodStudents.length} doing great</span>` : '';

      alertsHTML = `
        <div class="alerts-card">
          <div class="alerts-header">
            <h2 class="section-title">Student Alerts</h2>
            <div style="display:flex;gap:0.4rem;">${badBadge}${goodBadge}</div>
          </div>
          <div class="alerts-list">${badSection}${goodSection}</div>
        </div>
      `;
    }

    for (const member of members) {
      const student  = member.users;
      const stats    = studentStatsMapCache[`${student.id}-${groupId}`];
      const accuracy = stats.accuracy > 0 ? stats.accuracy + '%' : '—';
      const avgTime  = stats.avgTime  > 0 ? stats.avgTime  + 's' : '—';

      const _alert  = studentAlertsMap[student.id];
      const _negLvl = _alert?.negative?.level;
      const _posLvl = _alert?.positive?.level;
      const _dotHTML = _negLvl !== 'ok'
        ? `<span class="alert-dot alert-dot--${_negLvl}" title="${_alert.negative.messages.join(' | ')}"></span> `
        : _posLvl !== 'ok'
        ? `<span class="alert-dot alert-dot--${_posLvl}" title="${_alert.positive.message}"></span> `
        : '';

      tableHTML += `
        <tr>
          <td>${_dotHTML}${student.name}</td>
          <td>${stats.sessions}</td>
          <td>${accuracy}</td>
          <td>${avgTime}</td>
          <td>${badgeCountMap[student.id] ?? 0}</td>
          <td style="display:flex;gap:6px;">
            <button class="btn-remove" onclick="removeStudent('${student.id}', '${groupId}')">Remove</button>
            <button class="btn-ai-student" onclick="requestStudentSummary('${student.id}', '${groupId}', '${student.name.replace(/'/g, "\\'")}')">AI</button>
          </td>
        </tr>
        <tr class="student-ai-row" id="ai-row-${student.id}-${groupId}" style="display:none;">
          <td colspan="6">
            <div class="student-ai-content" id="ai-content-${student.id}-${groupId}"></div>
          </td>
        </tr>
      `;
    }

    tableHTML += '</tbody></table>';

    const chartsHTML = `
      <div class="group-charts">
        <div class="group-charts-grid">
          <div class="chart-card">
            <h2 class="chart-title">Accuracy by minigame</h2>
            <div class="chart-wrapper"><canvas id="chart-minigame-${groupId}"></canvas></div>
          </div>
          <div class="chart-card">
            <h2 class="chart-title">Accuracy by student</h2>
            <div class="chart-wrapper"><canvas id="chart-students-${groupId}"></canvas></div>
          </div>
          <div class="chart-card chart-card--full">
            <h2 class="chart-title">Accuracy by difficulty level</h2>
            <div class="chart-wrapper"><canvas id="chart-difficulty-${groupId}"></canvas></div>
          </div>
        </div>
      </div>
    `;

    const aiCardHTML = `
      <div class="group-ai-card">
        <div class="ai-analysis-header">
          <h2 class="section-title">AI Group Analysis</h2>
          <span class="ai-badge">AI</span>
        </div>
        <div id="ai-group-content-${groupId}" class="ai-summary-text"></div>
        <button class="btn-ai-group" id="btn-ai-group-${groupId}"
          onclick="requestGroupAnalysis('${groupId}')">Get AI group analysis</button>
      </div>
    `;

    const exportHTML = `
      <div class="group-export-row">
        <button class="btn-export" onclick="exportGroupData('${groupId}', 'sessions', this)">↓ Sessions CSV</button>
        <button class="btn-export" onclick="exportGroupData('${groupId}', 'answers', this)">↓ Answers CSV</button>
      </div>
    `;

    container.innerHTML = alertsHTML + tableHTML + chartsHTML + aiCardHTML + exportHTML;

    loadCachedSummary(groupId, `group-${groupId}`,
      `ai-group-content-${groupId}`, `btn-ai-group-${groupId}`);

    if (allAnswers.length === 0) return;

    const enriched = allAnswers.map(a => ({
      ...a,
      minigame: sessionMap[a.session_id]?.minigame ?? 'Unknown',
      userId:   sessionMap[a.session_id]?.user_id
    }));

    const byMinigame      = groupByKey(enriched, a => a.minigame);
    const minigameLabels  = Object.keys(byMinigame);
    const minigameAccuracy = minigameLabels.map(k =>
      Math.round((byMinigame[k].correct / byMinigame[k].total) * 100)
    );
    renderBarChart(`chart-minigame-${groupId}`, minigameLabels, minigameAccuracy, {
      label: 'Accuracy (%)', color: 'rgba(34, 197, 94, 0.8)', max: 100
    });

    const byStudent      = groupByKey(enriched, a => a.userId);
    const studentKeys    = Object.keys(byStudent);
    const studentLabels  = studentKeys.map(id => nameMap[id] ?? id);
    const studentAccuracy = studentKeys.map(k =>
      Math.round((byStudent[k].correct / byStudent[k].total) * 100)
    );
    renderBarChart(`chart-students-${groupId}`, studentLabels, studentAccuracy, {
      label: 'Accuracy (%)', color: 'rgba(59, 130, 246, 0.8)', max: 100
    });

    const byDifficulty = groupByKey(enriched, a => a.difficulty ?? 1);
    const diffLabels   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `Level ${d}`);
    const diffAccuracy = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => {
      const g = byDifficulty[d];
      if (!g || g.total === 0) return null;
      return Math.round((g.correct / g.total) * 100);
    });
    renderLineChart(`chart-difficulty-${groupId}`, diffLabels, diffAccuracy, {
      label: 'Accuracy (%)', color: 'rgba(168, 85, 247, 0.8)', max: 100
    });
  }

  async function loadCachedSummary(groupId, summaryType, contentId, btnId) {
    const { data: cached } = await db
      .from('ai_summaries')
      .select('content, generated_at')
      .eq('user_id', teacherId)
      .eq('summary_type', summaryType)
      .maybeSingle();

    if (!cached) return;
    const ageMs = Date.now() - new Date(cached.generated_at).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      const el  = document.getElementById(contentId);
      const btn = document.getElementById(btnId);
      if (el) el.textContent = cached.content;
      if (btn) btn.textContent = btn.textContent.replace('Get', 'Regenerate');
    }
  }

  window.requestGroupAnalysis = async function (groupId) {
    const stats = groupStatsCache[groupId];
    if (!stats) return;

    const btn       = document.getElementById(`btn-ai-group-${groupId}`);
    const content   = document.getElementById(`ai-group-content-${groupId}`);
    const groupName = document.querySelector(`#students-${groupId}`)
      ?.closest('.group-section')?.querySelector('h3')?.textContent ?? 'Group';

    btn.disabled = true;
    content.className = 'ai-summary-text loading';
    content.textContent = 'Generating analysis...';

    try {
      const res = await fetch('/api/ai/group-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName, ...stats })
      });
      const data = await res.json();

      if (data.summary) {
        content.className = 'ai-summary-text';
        content.textContent = data.summary;
        btn.textContent = 'Regenerate group analysis';
        await db.from('ai_summaries').upsert(
          { user_id: teacherId, summary_type: `group-${groupId}`, content: data.summary, generated_at: new Date().toISOString() },
          { onConflict: 'user_id,summary_type' }
        );
      } else {
        content.className = 'ai-summary-text';
        content.textContent = 'Could not generate analysis. Try again later.';
        btn.disabled = false;
      }
    } catch {
      content.className = 'ai-summary-text';
      content.textContent = 'Could not generate analysis. Try again later.';
      btn.disabled = false;
    }
  };

  window.requestStudentSummary = async function (studentId, groupId, studentName) {
    const stats = studentStatsMapCache[`${studentId}-${groupId}`];
    if (!stats) return;

    const row     = document.getElementById(`ai-row-${studentId}-${groupId}`);
    const content = document.getElementById(`ai-content-${studentId}-${groupId}`);
    const btn     = document.querySelector(`button[onclick="requestStudentSummary('${studentId}', '${groupId}', '${studentName.replace(/'/g, "\\'")}')"]`);

    row.style.display = '';
    btn.disabled = true;
    content.className = 'ai-summary-text loading';
    content.textContent = 'Generating summary...';

    const summaryType = `student-${studentId}-${groupId}`;

    //check cache first
    const { data: cached } = await db
      .from('ai_summaries')
      .select('content, generated_at')
      .eq('user_id', teacherId)
      .eq('summary_type', summaryType)
      .maybeSingle();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.generated_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        content.className = 'ai-summary-text';
        content.textContent = cached.content;
        btn.textContent = 'Regenerate';
        btn.disabled = false;
        return;
      }
    }

    try {
      const res = await fetch('/api/ai/student-summary-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName, ...stats })
      });
      const data = await res.json();

      if (data.summary) {
        content.className = 'ai-summary-text';
        content.textContent = data.summary;
        btn.textContent = 'Regenerate';
        btn.disabled = false;
        await db.from('ai_summaries').upsert(
          { user_id: teacherId, summary_type: summaryType, content: data.summary, generated_at: new Date().toISOString() },
          { onConflict: 'user_id,summary_type' }
        );
      } else {
        content.className = 'ai-summary-text';
        content.textContent = 'Could not generate summary. Try again later.';
        btn.disabled = false;
      }
    } catch {
      content.className = 'ai-summary-text';
      content.textContent = 'Could not generate summary. Try again later.';
      btn.disabled = false;
    }
  };

  window.exportGroupData = async function (groupId, type, btn) {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Downloading…';

    try {
      const res = await fetch(`/api/groups/${groupId}/export/${type}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `group_${groupId.slice(0, 8)}_${type}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      btn.disabled    = false;
      btn.textContent = originalText;
    }
  };

  let _pendingQuestions = null;

  window.generateQuestions = async function () {
    const minigame = document.querySelector('.qgen-chip.active')?.dataset.value;
    const btn      = document.getElementById('qgen-btn');
    const status   = document.getElementById('qgen-status');
    const preview  = document.getElementById('qgen-preview');
    const list     = document.getElementById('qgen-list');

    btn.disabled = true;
    preview.style.display = 'none';
    status.style.display = 'block';
    status.className = 'ai-summary-text loading';
    status.textContent = 'Generating questions…';
    _pendingQuestions = null;

    try {
      const res = await fetch(`/api/ai/generate-questions/${minigame}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();

      if (!data.questions) throw new Error(data.error || 'Unknown error');

      _pendingQuestions = { minigame, questions: data.questions };

      status.className = 'ai-summary-text';
      status.textContent = `Generated ${data.questions.length} questions. Review and activate below.`;

      list.innerHTML = renderQuestionsPreview(minigame, data.questions);
      preview.style.display = 'block';
    } catch (err) {
      status.className = 'ai-summary-text';
      status.textContent = `Error: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  };

  window.activateQuestions = async function () {
    if (!_pendingQuestions) return;
    const { minigame, questions } = _pendingQuestions;

    const btn    = document.getElementById('qgen-activate-btn');
    const status = document.getElementById('qgen-status');
    btn.disabled = true;

    try {
      const res = await fetch(`/api/levels/${minigame}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions })
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Unknown error');

      status.className = 'ai-summary-text';
      status.textContent = `✓ ${data.count} questions activated for "${minigame}". Students will receive them next time they play.`;
      document.getElementById('qgen-preview').style.display = 'none';
      _pendingQuestions = null;
    } catch (err) {
      status.className = 'ai-summary-text';
      status.textContent = `Error activating: ${err.message}`;
      btn.disabled = false;
    }
  };

  function renderQuestionsPreview(minigame, questions) {
    const items = questions.slice(0, 10).map((q, i) => {
      let text = '';
      if (minigame === 'labyrinth') {
        const correct = ['answerA', 'answerB', 'answerC', 'answerD'].find(k => q[k]?.[1]);
        text = `${q.question?.replace(/\n/g, ' ')} — ✓ ${q[correct]?.[0] ?? ''}`;
      } else if (minigame === 'dividing-hills') {
        text = `[Type ${q.type}] ${q.text} — ✓ ${q.options?.[q.answer] ?? ''}`;
      } else if (minigame === 'decimal-meteors') {
        text = `${q.question} → ${q.value} ${q.unit}`;
      } else if (minigame === 'endless-runner') {
        const op = q.operator === '*' ? '×' : q.operator;
        text = `${q.operand1} ${op} ${q.operand2} = ${q.answer}`;
      }
      return `<div class="qgen-item"><span class="qgen-num">${i + 1}</span>${text}</div>`;
    });

    const extra = questions.length > 10
      ? `<div class="qgen-item" style="color:#888;">…and ${questions.length - 10} more</div>`
      : '';

    return items.join('') + extra;
  }

  function detectAlerts(studentSessions, answersBySession, sessionMap) {
    const byMinigame = {};
    for (const s of studentSessions) {
      const mg = sessionMap[s.id]?.minigame ?? s.minigame ?? 'Unknown';
      if (!byMinigame[mg]) byMinigame[mg] = [];
      byMinigame[mg].push(s);
    }

    const criticalGames  = [];
    const warningGames   = [];
    const excellentGames = [];

    for (const [mg, mgs] of Object.entries(byMinigame)) {
      const sorted = mgs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const accuracies = sorted
        .map(s => {
          const ans = answersBySession[s.id] ?? [];
          if (ans.length === 0) return null;
          return (ans.filter(a => a.correct).length / ans.length) * 100;
        })
        .filter(acc => acc !== null);

      if (accuracies.length === 0) continue;

      //critical: last 3 sessions all below 50%
      if (accuracies.length >= 3 && accuracies.slice(0, 3).every(acc => acc < 50)) {
        criticalGames.push(mg);
      //warning: last 5 sessions all below 60%
      } else if (accuracies.length >= 5 && accuracies.slice(0, 5).every(acc => acc < 60)) {
        warningGames.push(mg);
      }

      //excellent: 10+ sessions with avg accuracy > 80% (same threshold as the adaptive algorithm's level-up criterion)
      if (accuracies.length >= 10) {
        const avg = accuracies.slice(0, 10).reduce((sum, a) => sum + a, 0) / 10;
        if (avg > 80) excellentGames.push(mg);
      }
    }

    const negativeAlerts = [];

    if (criticalGames.length > 0) {
      negativeAlerts.push({ level: 'critical', message: `Below 50% accuracy in last 3 sessions: ${criticalGames.join(', ')}` });
    }
    if (warningGames.length > 0) {
      negativeAlerts.push({ level: 'warning', message: `Below 60% accuracy in last 5 sessions: ${warningGames.join(', ')}` });
    }

    //inactivity check
    if (studentSessions.length > 0) {
      const lastDate = studentSessions.reduce(
        (latest, s) => new Date(s.date) > new Date(latest) ? s.date : latest,
        studentSessions[0].date
      );
      const daysSince = Math.floor((Date.now() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7) {
        negativeAlerts.push({ level: 'warning', message: `Last session ${daysSince} day${daysSince !== 1 ? 's' : ''} ago` });
      }
    }

    //variety check: warn if >= 80% of sessions are in a single minigame
    const totalSessions = studentSessions.length;
    if (totalSessions >= 5) {
      for (const [mg, mgs] of Object.entries(byMinigame)) {
        const pct = (mgs.length / totalSessions) * 100;
        if (pct >= 80) {
          negativeAlerts.push({
            level: 'warning',
            message: `${Math.round(pct)}% of sessions in ${mg} (${mgs.length}/${totalSessions} sessions)`
          });
        }
      }
    }

    const worstLevel = negativeAlerts.some(a => a.level === 'critical') ? 'critical'
      : negativeAlerts.length > 0 ? 'warning'
      : 'ok';

    const negative = { level: worstLevel, messages: negativeAlerts.map(a => a.message) };
    const positive = excellentGames.length > 0
      ? { level: 'excellent', message: `Above 80% avg accuracy in last 10 sessions: ${excellentGames.join(', ')}` }
      : { level: 'ok', message: null };

    return { negative, positive };
  }

  function groupByKey(arr, keyFn) {
    const map = {};
    for (const item of arr) {
      const key = keyFn(item);
      if (!map[key]) map[key] = { correct: 0, total: 0, timeSum: 0 };
      map[key].total++;
      if (item.correct) map[key].correct++;
      map[key].timeSum += item.time ?? 0;
    }
    return map;
  }

  function renderBarChart(canvasId, labels, data, opts) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: opts.label,
          data,
          backgroundColor: opts.color,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: opts.max, ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          x: { ticks: { color: '#555' }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function renderLineChart(canvasId, labels, data, opts) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: opts.label,
          data,
          borderColor: opts.color,
          backgroundColor: opts.color.replace('0.8', '0.12'),
          pointBackgroundColor: opts.color,
          pointRadius: 5,
          fill: true,
          tension: 0.3,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y ?? '—'}%` } }
        },
        scales: {
          y: { beginAtZero: true, max: opts.max, ticks: { color: '#888', callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          x: { ticks: { color: '#555' }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }
})();
