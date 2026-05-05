(async () => {

  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const userId = session.user.id;

  const { data: profile } = await db
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  document.getElementById('user-name').textContent =
    profile?.name ?? session.user.email;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'auth.html';
  });


  const groupStatus = document.getElementById('group-status');

  const { data: memberships } = await db
    .from('group_members')
    .select('group_id, groups(id, name)')
    .eq('student_id', userId);

  const myGroups = (memberships ?? []).map(m => m.groups);
  const myGroupIds = new Set(myGroups.map(g => g.id));

  function renderGroupStatus() {
    let html = '';
    if (myGroups.length > 0) {
      html += '<div class="my-groups-list">';
      myGroups.forEach(g => {
        html += `
          <div class="group-info-row">
            <p>You are in group <strong>${g.name}</strong>.</p>
            <button class="btn-leave-group" onclick="leaveGroup('${g.id}')">Leave group</button>
          </div>`;
      });
      html += '</div>';
      document.getElementById('dash-tabs').style.display = 'flex';
    }
    html += `
      <form id="form-join-group" class="create-group-form" style="margin-top:${myGroups.length > 0 ? '12px' : '0'}">
        <input type="text" id="join-code-input" placeholder="Enter invite code" required />
        <button type="submit">Join group</button>
      </form>
      <p id="join-msg" class="mensaje"></p>`;
    groupStatus.innerHTML = html;

    document.getElementById('form-join-group').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('join-code-input').value.trim().toLowerCase();
      const msg = document.getElementById('join-msg');

      const lookupRes = await fetch(`/api/groups/lookup?code=${encodeURIComponent(code)}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!lookupRes.ok) {
        msg.textContent = 'Invalid invite code. Please check and try again.';
        msg.className = 'mensaje error';
        return;
      }
      const match = await lookupRes.json();

      const { error } = await db
        .from('group_members')
        .insert({ group_id: match.id, student_id: userId });

      if (error) {
        msg.textContent = 'Could not join group. You may already be a member.';
        msg.className = 'mensaje error';
        return;
      }

      msg.textContent = `You have joined group ${match.name}!`;
      msg.className = 'mensaje';
      setTimeout(() => window.location.reload(), 1200);
    });
  }

  renderGroupStatus();

  window.leaveGroup = function (groupId) {
    const modal = document.getElementById('leave-modal');
    modal.style.display = 'flex';

    document.getElementById('leave-modal-cancel').onclick = () => {
      modal.style.display = 'none';
    };

    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = 'none';
    };

    document.getElementById('leave-modal-confirm').onclick = async () => {
      modal.style.display = 'none';
      const { data, error } = await db
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('student_id', userId)
        .select();
      if (!error && data?.length > 0) {
        window.location.reload();
      } else {
        console.error('Leave group failed:', error ?? 'no rows deleted (RLS?)');
        alert('Could not leave the group. Please try again or contact your teacher.');
      }
    };
  };


  const sessionsResult = await db
    .from('sessions')
    .select('id, minigame, date, duration, group_id')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  const allSessions = sessionsResult.data ?? [];
  const allSessionIds = allSessions.map(s => s.id);

  const answersResult = allSessionIds.length > 0
    ? await db
        .from('answers')
        .select('session_id, correct, time, difficulty')
        .in('session_id', allSessionIds)
    : { data: [] };

  const allAnswers = answersResult.data ?? [];


  //badge definitions
  const BADGES = [
    { id: 'first_game',      name: 'First Steps',     icon: '🎮', desc: 'Complete your first session' },
    { id: 'ten_sessions',    name: 'Dedicated',        icon: '⭐', desc: 'Play 10 sessions' },
    { id: 'accuracy_master', name: 'Perfect Score',    icon: '🎯', desc: '100% accuracy in a session (min. 5 answers)' },
    { id: 'rising_star',     name: 'Rising Star',      icon: '🚀', desc: 'Reach difficulty level 8 in any minigame' },
    { id: 'all_minigames',   name: 'AI Explorer',      icon: '🤖', desc: 'Play all 4 AI-powered minigames' },
    { id: 'comeback',        name: 'Comeback',         icon: '💪', desc: 'Improve accuracy by 20+ points vs previous session' },
    { id: 'week_player',     name: 'On a Roll',        icon: '🔥', desc: 'Play on 5 different days in the last 7 days' },
  ];

  const privateSessions  = allSessions.filter(s => !s.group_id);
  const allGroupSessions = allSessions.filter(s => s.group_id && myGroupIds.has(s.group_id));


  const { data: existingAchievements } = await db
    .from('achievements')
    .select('badge_type')
    .eq('user_id', userId);

  const existingBadgeTypes = new Set((existingAchievements ?? []).map(a => a.badge_type));
  const newlyEarned = checkAndAwardAchievements(allSessions, allAnswers, existingBadgeTypes);

  if (newlyEarned.length > 0) {
    await db.from('achievements').upsert(
      newlyEarned.map(badge_type => ({
        user_id: userId, badge_type, earned_at: new Date().toISOString()
      })),
      { onConflict: 'user_id,badge_type', ignoreDuplicates: true }
    );
    for (const badgeId of newlyEarned) {
      const def = BADGES.find(b => b.id === badgeId);
      if (def) showAchievementToast(def);
    }
  }

  renderAchievements(new Set([...existingBadgeTypes, ...newlyEarned]));


  let activeTab = 'private';
  let activeGroupIdForStats = myGroups.length > 0 ? myGroups[0].id : null;
  let chartInstances = {};
  let lastStats = null;
  let diffHistoryDataCache = {};

  function getGroupSessions(groupId) {
    return allGroupSessions.filter(s => s.group_id === groupId);
  }

  function renderGroupSelector() {
    const selector = document.getElementById('group-selector');
    if (myGroups.length <= 1) {
      selector.style.display = 'none';
      return;
    }
    selector.style.display = 'flex';
    selector.innerHTML = myGroups.map(g => `
      <button class="group-sel-btn${g.id === activeGroupIdForStats ? ' active' : ''}"
              onclick="selectGroupStats('${g.id}')">${g.name}</button>
    `).join('');
  }

  window.selectGroupStats = function (groupId) {
    activeGroupIdForStats = groupId;
    renderGroupSelector();
    renderDashboard(getGroupSessions(groupId));
    renderAdaptiveLevelsChart(groupId);
  };

  window.switchDashTab = function (tab) {
    activeTab = tab;
    document.getElementById('tab-private').classList.toggle('active', tab === 'private');
    document.getElementById('tab-group').classList.toggle('active', tab === 'group');
    if (tab === 'private') {
      document.getElementById('group-selector').style.display = 'none';
      renderDashboard(privateSessions);
      renderAdaptiveLevelsChart(null);
    } else {
      renderGroupSelector();
      renderDashboard(activeGroupIdForStats ? getGroupSessions(activeGroupIdForStats) : allGroupSessions);
      renderAdaptiveLevelsChart(activeGroupIdForStats);
    }
  };

  window.requestAISummary = async function () {
    if (!lastStats) return;

    const btn     = document.getElementById('btn-ai-analysis');
    const content = document.getElementById('ai-summary-content');

    btn.disabled = true;
    content.className = 'ai-summary-text loading';
    content.textContent = 'Generating analysis...';

    try {
      const res = await fetch('/api/ai/student-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastStats)
      });
      const data = await res.json();

      if (data.summary) {
        content.className = 'ai-summary-text';
        content.textContent = data.summary;
        btn.textContent = 'Regenerate analysis';
        await db.from('ai_summaries').upsert(
          { user_id: userId, summary_type: 'student', content: data.summary, generated_at: new Date().toISOString() },
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


  //exposed on window so the HTML onchange can call it
  window.updateDiffHistoryChart = function (minigame) {
    if (chartInstances.diffHistory) {
      chartInstances.diffHistory.destroy();
      chartInstances.diffHistory = null;
    }
    const canvas   = document.getElementById('chart-diff-history');
    const emptyMsg = document.getElementById('diff-history-empty');
    const data = diffHistoryDataCache[minigame] ?? [];
    if (data.length === 0) {
      canvas.style.display   = 'none';
      emptyMsg.style.display = 'block';
      return;
    }
    canvas.style.display   = 'block';
    emptyMsg.style.display = 'none';
    chartInstances.diffHistory = renderDiffHistoryChart('chart-diff-history', data);
  };


  renderDashboard(privateSessions);

  //load cached AI summary if fresh enough
  const { data: cached } = await db
    .from('ai_summaries')
    .select('content, generated_at')
    .eq('user_id', userId)
    .eq('summary_type', 'student')
    .maybeSingle();

  if (cached) {
    const ageMs = Date.now() - new Date(cached.generated_at).getTime();
    if (ageMs < 24 * 60 * 60 * 1000) {
      document.getElementById('ai-summary-content').textContent = cached.content;
      document.getElementById('btn-ai-analysis').textContent = 'Regenerate analysis';
    }
  }

  await renderAdaptiveLevelsChart();


  function renderDashboard(sessions) {
    const sessionIds = new Set(sessions.map(s => s.id));
    const answers = allAnswers.filter(a => sessionIds.has(a.session_id));

    const sessionMinigameMap = {};
    for (const s of sessions) sessionMinigameMap[s.id] = s.minigame;
    const answersWithMinigame = answers.map(a => ({
      ...a, minigame: sessionMinigameMap[a.session_id] ?? 'Unknown'
    }));
    const byMinigame = groupByKey(answersWithMinigame, a => a.minigame);
    const minigameEntries = Object.entries(byMinigame)
      .map(([name, g]) => ({ name, accuracy: Math.round((g.correct / g.total) * 100) }))
      .sort((a, b) => b.accuracy - a.accuracy);

    const byDiff = groupByKey(answers, a => a.difficulty ?? 1);
    const difficultyBreakdown = {};
    for (const [level, g] of Object.entries(byDiff)) {
      if (g.total > 0) difficultyBreakdown[level] = Math.round((g.correct / g.total) * 100);
    }

    const totalAnswers = answers.length;
    const correctCount = answers.filter(a => a.correct).length;
    lastStats = {
      sessions: sessions.length,
      accuracy: totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0,
      avgTime: totalAnswers > 0
        ? parseFloat((answers.reduce((s, a) => s + (a.time ?? 0), 0) / totalAnswers).toFixed(1))
        : 0,
      bestGame:      minigameEntries[0]?.name ?? null,
      bestAccuracy:  minigameEntries[0]?.accuracy ?? null,
      worstGame:     minigameEntries[minigameEntries.length - 1]?.name ?? null,
      worstAccuracy: minigameEntries[minigameEntries.length - 1]?.accuracy ?? null,
      minigameStats: minigameEntries,
      difficultyBreakdown
    };

    renderSummaryCards(sessions, answers);
    renderCharts(sessions, answers);
    renderSessionsTable(sessions, answers);
  }


  function renderSummaryCards(sessions, answers) {
    const totalAnswers   = answers.length;
    const correctCount   = answers.filter(a => a.correct).length;
    const globalAccuracy = totalAnswers > 0 ? Math.round((correctCount / totalAnswers) * 100) : 0;
    const avgTime        = totalAnswers > 0
      ? (answers.reduce((sum, a) => sum + (a.time ?? 0), 0) / totalAnswers).toFixed(1)
      : 0;

    document.getElementById('total-sessions').textContent  = sessions.length;
    document.getElementById('total-answers').textContent   = totalAnswers;
    document.getElementById('global-accuracy').textContent = `${globalAccuracy}%`;
    document.getElementById('avg-time').textContent        = avgTime;
  }


  function renderCharts(sessions, answers) {
    //adaptiveLevels is global and not re-rendered per tab, so preserve it
    const preserved = { adaptiveLevels: chartInstances.adaptiveLevels };
    Object.entries(chartInstances).forEach(([k, c]) => k !== 'adaptiveLevels' && c && c.destroy());
    chartInstances = preserved;

    const sessionMinigameMap = {};
    for (const s of sessions) sessionMinigameMap[s.id] = s.minigame;

    const answersWithMinigame = answers.map(a => ({
      ...a,
      minigame: sessionMinigameMap[a.session_id] ?? 'Unknown'
    }));

    const byMinigame     = groupByKey(answersWithMinigame, a => a.minigame);
    const minigameLabels = Object.keys(byMinigame);
    const accuracyData   = minigameLabels.map(
      k => Math.round((byMinigame[k].correct / byMinigame[k].total) * 100)
    );
    const avgTimeData    = minigameLabels.map(
      k => parseFloat((byMinigame[k].timeSum / byMinigame[k].total).toFixed(1))
    );

    chartInstances.accuracy = renderBarChart('chart-accuracy', minigameLabels, accuracyData, {
      label: 'Accuracy rate (%)',
      color: 'rgba(34, 197, 94, 0.8)',
      max: 100,
      suffix: '%'
    });

    chartInstances.time = renderBarChart('chart-time', minigameLabels, avgTimeData, {
      label: 'Avg. time (sec)',
      color: 'rgba(59, 130, 246, 0.8)',
      suffix: 's'
    });

    const byDifficulty = groupByKey(answers, a => a.difficulty ?? 1);
    const diffLabels   = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => `Difficulty ${d}`);
    const diffAccuracy = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => {
      const g = byDifficulty[d];
      if (!g || g.total === 0) return null;
      return Math.round((g.correct / g.total) * 100);
    });

    chartInstances.difficulty = renderLineChart('chart-difficulty', diffLabels, diffAccuracy, {
      label: 'Accuracy rate (%)',
      color: 'rgba(168, 85, 247, 0.8)',
      max: 100
    });

    diffHistoryDataCache = computeDiffHistoryData(sessions, answers);
    const diffSelect    = document.getElementById('diff-minigame-select');
    const diffMinigames = Object.keys(diffHistoryDataCache);
    diffSelect.innerHTML = diffMinigames
      .map(mg => `<option value="${mg}">${mg}</option>`)
      .join('');
    if (diffMinigames.length > 0) {
      diffSelect.style.display = '';
      window.updateDiffHistoryChart(diffMinigames[0]);
    } else {
      diffSelect.style.display = 'none';
      document.getElementById('chart-diff-history').style.display = 'none';
      document.getElementById('diff-history-empty').style.display = 'block';
    }
  }


  function renderSessionsTable(sessions, answers) {
    const answersBySession = {};
    for (const a of answers) {
      if (!answersBySession[a.session_id]) {
        answersBySession[a.session_id] = { correct: 0, total: 0 };
      }
      answersBySession[a.session_id].total++;
      if (a.correct) answersBySession[a.session_id].correct++;
    }

    const wrapper = document.getElementById('sessions-table-wrapper');

    if (sessions.length === 0) {
      wrapper.innerHTML = '<p class="empty-text">No sessions yet.</p>';
      return;
    }

    const rows = sessions.slice(0, 20).map(s => {
      const stats = answersBySession[s.id] ?? { correct: 0, total: 0 };
      const acc   = stats.total > 0
        ? Math.round((stats.correct / stats.total) * 100) + '%'
        : '—';
      const dur  = s.duration != null ? `${s.duration}s` : '—';
      const date = new Date(s.date).toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      return `
        <tr>
          <td>${date}</td>
          <td>${s.minigame ?? '—'}</td>
          <td>${stats.correct} / ${stats.total}</td>
          <td>${acc}</td>
          <td>${dur}</td>
        </tr>`;
    }).join('');

    wrapper.innerHTML = `
      <table class="sessions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Minigame</th>
            <th>Correct</th>
            <th>Accuracy</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
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
          tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}${opts.suffix ?? ''}` } }
        },
        scales: {
          y: { beginAtZero: true, max: opts.max, ticks: { color: '#888' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          x: { ticks: { color: '#555' }, grid: { color: 'rgba(0,0,0,0.06)' } }
        }
      }
    });
  }

  function computeDiffHistoryData(sessions, answers) {
    const answersBySession = {};
    for (const a of answers) {
      if (!answersBySession[a.session_id]) answersBySession[a.session_id] = [];
      answersBySession[a.session_id].push(a);
    }
    const byMinigame = {};
    for (const s of sessions) {
      const sa = answersBySession[s.id] ?? [];
      const validDiffs = sa.filter(a => a.difficulty >= 1).map(a => a.difficulty);
      if (validDiffs.length === 0) continue;
      const avgDifficulty = validDiffs.reduce((sum, d) => sum + d, 0) / validDiffs.length;
      const correct  = sa.filter(a => a.correct).length;
      const accuracy = sa.length > 0 ? (correct / sa.length) * 100 : null;
      const mg = s.minigame ?? 'Unknown';
      if (!byMinigame[mg]) byMinigame[mg] = [];
      byMinigame[mg].push({ date: s.date, avgDifficulty, accuracy });
    }
    for (const mg of Object.keys(byMinigame)) {
      byMinigame[mg].sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    return byMinigame;
  }

  function renderDiffHistoryChart(canvasId, sessionData) {
    const data     = sessionData.slice(-20);
    const labels   = data.map(d => {
      const dt = new Date(d.date);
      return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    });
    const diffData = data.map(d => parseFloat(d.avgDifficulty.toFixed(1)));
    //accuracy is divided by 10 to share the 0–10 y-axis with difficulty
    const accData  = data.map(d =>
      d.accuracy != null ? parseFloat((d.accuracy / 10).toFixed(2)) : null
    );
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Difficulty level',
            data: diffData,
            borderColor: 'rgba(245, 158, 11, 0.9)',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            pointBackgroundColor: 'rgba(245, 158, 11, 0.9)',
            pointRadius: 5,
            fill: true,
            tension: 0.3,
            spanGaps: true,
          },
          {
            label: 'Accuracy (÷10)',
            data: accData,
            borderColor: 'rgba(168, 85, 247, 0.7)',
            backgroundColor: 'transparent',
            pointBackgroundColor: 'rgba(168, 85, 247, 0.7)',
            pointRadius: 4,
            fill: false,
            tension: 0.3,
            spanGaps: true,
            borderDash: [5, 3],
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: '#555', font: { size: 11 }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            callbacks: {
              label: ctx => ctx.datasetIndex === 0
                ? `Difficulty: ${ctx.parsed.y}`
                : `Accuracy: ${Math.round(ctx.parsed.y * 10)}%`
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 10,
            ticks: { color: '#888', stepSize: 1 },
            grid: { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { color: '#555', maxRotation: 45 },
            grid: { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });
  }


  function checkAndAwardAchievements(sessions, answers, existingTypes) {
    const earned = new Set(existingTypes);
    const newlyEarned = [];

    const answersBySession = {};
    for (const a of answers) {
      if (!answersBySession[a.session_id]) answersBySession[a.session_id] = [];
      answersBySession[a.session_id].push(a);
    }

    //first_game
    if (!earned.has('first_game') && sessions.length >= 1) {
      newlyEarned.push('first_game'); earned.add('first_game');
    }

    //ten_sessions
    if (!earned.has('ten_sessions') && sessions.length >= 10) {
      newlyEarned.push('ten_sessions'); earned.add('ten_sessions');
    }

    //accuracy_master: 100% correct in a session with at least 5 answers
    if (!earned.has('accuracy_master')) {
      for (const s of sessions) {
        const ans = answersBySession[s.id] ?? [];
        if (ans.length >= 5 && ans.every(a => a.correct)) {
          newlyEarned.push('accuracy_master'); earned.add('accuracy_master');
          break;
        }
      }
    }

    //rising_star: avg difficulty >= 8 in any session (min 3 answers)
    if (!earned.has('rising_star')) {
      for (const s of sessions) {
        const valid = (answersBySession[s.id] ?? []).filter(a => (a.difficulty ?? 0) >= 1);
        if (valid.length >= 3) {
          const avg = valid.reduce((sum, a) => sum + a.difficulty, 0) / valid.length;
          if (avg >= 8) { newlyEarned.push('rising_star'); earned.add('rising_star'); break; }
        }
      }
    }

    //all_minigames: played all 4 AI-powered minigames at least once
    if (!earned.has('all_minigames')) {
      const AI_MINIGAMES = ['labyrinth', 'dividing-hills', 'decimal-meteors', 'endless-runner'];
      const playedMinigames = new Set(sessions.map(s => s.minigame).filter(Boolean));
      if (AI_MINIGAMES.every(m => playedMinigames.has(m))) {
        newlyEarned.push('all_minigames'); earned.add('all_minigames');
      }
    }

    //comeback: accuracy improves by 20+ points vs previous session in the same minigame
    if (!earned.has('comeback')) {
      const byMinigame = {};
      for (const s of sessions) {
        if (!s.minigame) continue;
        if (!byMinigame[s.minigame]) byMinigame[s.minigame] = [];
        byMinigame[s.minigame].push(s);
      }
      outer:
      for (const mgs of Object.values(byMinigame)) {
        const sorted = mgs.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
        for (let i = 1; i < sorted.length; i++) {
          const prev = answersBySession[sorted[i - 1].id] ?? [];
          const curr = answersBySession[sorted[i].id]     ?? [];
          if (prev.length === 0 || curr.length === 0) continue;
          const prevAcc = prev.filter(a => a.correct).length / prev.length * 100;
          const currAcc = curr.filter(a => a.correct).length / curr.length * 100;
          if (currAcc - prevAcc >= 20) {
            newlyEarned.push('comeback'); earned.add('comeback');
            break outer;
          }
        }
      }
    }

    //week_player: sessions on at least 5 distinct days in the last 7 days
    if (!earned.has('week_player')) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentDays = new Set(
        sessions
          .filter(s => s.date && new Date(s.date).getTime() >= cutoff)
          .map(s => new Date(s.date).toISOString().slice(0, 10))
      );
      if (recentDays.size >= 5) { newlyEarned.push('week_player'); earned.add('week_player'); }
    }

    return newlyEarned;
  }

  function renderAchievements(earnedTypes) {
    const wrapper = document.getElementById('achievements-grid');
    if (!wrapper) return;
    wrapper.innerHTML = BADGES.map(b => {
      const earned = earnedTypes.has(b.id);
      return `
        <div class="badge-card ${earned ? 'badge-earned' : 'badge-locked'}" title="${b.desc}">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-name">${b.name}</div>
          <div class="badge-hint">${b.desc}</div>
        </div>`;
    }).join('');
  }

  function showAchievementToast(badge) {
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `<span class="toast-icon">${badge.icon}</span><span>Achievement unlocked: <strong>${badge.name}</strong>!</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, 4000);
  }


  async function renderAdaptiveLevelsChart(groupId = null) {
    const MINIGAMES = ['labyrinth', 'dividing-hills', 'decimal-meteors', 'endless-runner'];
    const LABELS    = ['Labyrinth', 'Dividing Hills', 'Decimal Meteors', 'Endless Runner'];

    const groupParam = groupId ? `?group_id=${encodeURIComponent(groupId)}` : '';
    const levels = await Promise.all(
      MINIGAMES.map(mg =>
        fetch(`/api/adaptive-level/${mg}/${userId}${groupParam}`)
          .then(r => r.json())
          .then(d => d.difficulty_level ?? 5)
          .catch(() => 5)
      )
    );

    const canvas   = document.getElementById('chart-adaptive-levels');
    const emptyMsg = document.getElementById('adaptive-levels-empty');

    if (allSessions.length === 0) {
      canvas.style.display   = 'none';
      emptyMsg.style.display = 'block';
      return;
    }

    if (chartInstances.adaptiveLevels) {
      chartInstances.adaptiveLevels.destroy();
    }
    chartInstances.adaptiveLevels = renderBarChart('chart-adaptive-levels', LABELS, levels, {
      label: 'Current difficulty level',
      color: 'rgba(245, 158, 11, 0.8)',
      max: 10,
      suffix: ''
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
