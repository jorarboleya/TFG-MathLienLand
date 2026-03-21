// js/dashboard.js
// Lógica del dashboard de rendimiento

(async () => {

  // ─── 1. AUTENTICACIÓN ────────────────────────────────────────────────────────
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'auth.html';
    return;
  }

  const userId = session.user.id;

  // Mostrar nombre de usuario
  const { data: profile } = await db
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  document.getElementById('user-name').textContent =
    profile?.name ?? session.user.email;

  // Botón de logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await db.auth.signOut();
    window.location.href = 'auth.html';
  });


  // ─── 2. FETCH DE DATOS ───────────────────────────────────────────────────────
  const [sessionsResult, answersResult] = await Promise.all([
    db
      .from('sessions')
      .select('id, minigame, date, duration')
      .eq('user_id', userId)
      .order('date', { ascending: false }),

    db
      .from('answers')
      .select('session_id, correct, time, difficulty, sessions!inner(user_id)')
      .eq('sessions.user_id', userId)
  ]);

  const sessions = sessionsResult.data ?? [];
  const answers  = answersResult.data  ?? [];


  // ─── 3. TARJETAS DE RESUMEN ──────────────────────────────────────────────────
  const totalSessions  = sessions.length;
  const totalAnswers   = answers.length;
  const correctCount   = answers.filter(a => a.correct).length;
  const globalAccuracy = totalAnswers > 0
    ? Math.round((correctCount / totalAnswers) * 100)
    : 0;
  const avgTime = totalAnswers > 0
    ? (answers.reduce((sum, a) => sum + (a.time ?? 0), 0) / totalAnswers).toFixed(1)
    : 0;

  document.getElementById('total-sessions').textContent  = totalSessions;
  document.getElementById('total-answers').textContent   = totalAnswers;
  document.getElementById('global-accuracy').textContent = `${globalAccuracy}%`;
  document.getElementById('avg-time').textContent        = avgTime;


  // ─── 4. HELPER DE AGRUPACIÓN ─────────────────────────────────────────────────
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


  // ─── 5. GRÁFICAS POR MINIJUEGO ───────────────────────────────────────────────
  // Mapa sessionId → minigame para enriquecer cada answer
  const sessionMinigameMap = {};
  for (const s of sessions) {
    sessionMinigameMap[s.id] = s.minigame;
  }

  const answersWithMinigame = answers.map(a => ({
    ...a,
    minigame: sessionMinigameMap[a.session_id] ?? 'Desconocido'
  }));

  const byMinigame    = groupByKey(answersWithMinigame, a => a.minigame);
  const minigameLabels = Object.keys(byMinigame);
  const accuracyData   = minigameLabels.map(
    k => Math.round((byMinigame[k].correct / byMinigame[k].total) * 100)
  );
  const avgTimeData    = minigameLabels.map(
    k => parseFloat((byMinigame[k].timeSum / byMinigame[k].total).toFixed(1))
  );

  renderBarChart('chart-accuracy', minigameLabels, accuracyData, {
    label: 'Tasa de acierto (%)',
    color: 'rgba(34, 197, 94, 0.8)',
    max: 100,
    suffix: '%'
  });

  renderBarChart('chart-time', minigameLabels, avgTimeData, {
    label: 'Tiempo medio (seg)',
    color: 'rgba(59, 130, 246, 0.8)',
    suffix: 's'
  });


  // ─── 6. GRÁFICA POR DIFICULTAD ───────────────────────────────────────────────
  const byDifficulty = groupByKey(answers, a => a.difficulty ?? 1);
  const diffLabels   = [1, 2, 3, 4, 5].map(d => `Dificultad ${d}`);
  const diffAccuracy = [1, 2, 3, 4, 5].map(d => {
    const g = byDifficulty[d];
    if (!g || g.total === 0) return null;
    return Math.round((g.correct / g.total) * 100);
  });

  renderLineChart('chart-difficulty', diffLabels, diffAccuracy, {
    label: 'Tasa de acierto (%)',
    color: 'rgba(168, 85, 247, 0.8)',
    max: 100
  });


  // ─── 7. TABLA DE SESIONES RECIENTES ─────────────────────────────────────────
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
    wrapper.innerHTML = '<p class="empty-text">Todavía no tienes sesiones registradas.</p>';
  } else {
    const rows = sessions.slice(0, 20).map(s => {
      const stats = answersBySession[s.id] ?? { correct: 0, total: 0 };
      const acc   = stats.total > 0
        ? Math.round((stats.correct / stats.total) * 100) + '%'
        : '—';
      const dur   = s.duration != null ? `${s.duration}s` : '—';
      const date  = new Date(s.date).toLocaleDateString('es-ES', {
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
            <th>Fecha</th>
            <th>Minijuego</th>
            <th>Correctas</th>
            <th>Precisión</th>
            <th>Duración</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }


  // ─── 8. FUNCIONES DE GRÁFICAS ────────────────────────────────────────────────
  function renderBarChart(canvasId, labels, data, opts) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
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
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y}${opts.suffix ?? ''}`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: opts.max,
            ticks: { color: '#888' },
            grid:  { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { color: '#555' },
            grid:  { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });
  }

  function renderLineChart(canvasId, labels, data, opts) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
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
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.parsed.y ?? '—'}%`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: opts.max,
            ticks: { color: '#888', callback: v => v + '%' },
            grid:  { color: 'rgba(0,0,0,0.06)' }
          },
          x: {
            ticks: { color: '#555' },
            grid:  { color: 'rgba(0,0,0,0.06)' }
          }
        }
      }
    });
  }

})();
