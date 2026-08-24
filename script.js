/* ============================================
   DADOS DOS TREINOS
   Fonte única da verdade: mude aqui pra adicionar,
   remover ou renomear exercícios/dias.
   ============================================ */
const WORKOUTS = [
  {
    id: 'a',
    letter: 'A',
    title: 'Peito e Ombro',
    exercises: ['Supino inclinado', 'Supino reto', 'Cross na polia alta', 'Elevação lateral', 'Abdômen']
  },
  {
    id: 'b',
    letter: 'B',
    title: 'Perna Quadríceps',
    exercises: ['Agachamento', 'Leg press 45°', 'Cadeira extensora', 'Cadeira abdutora', 'Panturrilha em pé']
  },
  {
    id: 'c',
    letter: 'C',
    title: 'Costas',
    exercises: ['Puxada alta aberta', 'Puxada fechada', 'Remada cavalinho', 'Remada baixa', 'Crucifixo inverso / deltoide posterior']
  },
  {
    id: 'd',
    letter: 'D',
    title: 'Braço',
    exercises: ['Rosca Scott', 'Tríceps francês', 'Rosca inclinada', 'Tríceps corda', 'Rosca martelo', 'Abdômen']
  },
  {
    id: 'e',
    letter: 'E',
    title: 'Perna Posterior',
    exercises: ['Stiff', 'Cadeira flexora', 'Cadeira adutora', 'Panturrilha sentado']
  }
];

const STORAGE_KEY = 'forge_treino_log_v1';
const LAST_TAB_KEY = 'forge_last_tab';
const LOCAL_MIGRATION_PREFIX = 'ironlab_cloud_migrated_';
let cloudLog = {};
let currentUser = null;
let currentFriend = null;
let authMode = 'login';

let currentChart = null;
let currentExerciseId = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================
   HELPERS
   ============================================ */

// transforma "Cross na polia alta" em "cross-na-polia-alta"
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function exerciseId(dayId, name) {
  return dayId + '-' + slugify(name);
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return d + '/' + m;
}

function formatDateFull(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return d + '/' + m + '/' + y;
}

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function friendlyError(error, fallback = 'Algo deu errado. Tente novamente.') {
  const message = error?.message || '';
  if (/duplicate key|unique constraint/i.test(message)) return 'Esse usuário já está em uso.';
  if (/invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.';
  if (/password should be at least/i.test(message)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/network|fetch failed|failed to fetch/i.test(message)) return 'Sem conexão com a internet. Verifique sua rede.';
  return message || fallback;
}

/* ============================================
   PERSISTÊNCIA — SUPABASE
   O localStorage continua sendo usado apenas como
   cache temporário/migração do histórico antigo.
   ============================================ */
function getLog() { return cloudLog || {}; }

function saveLog(log) { cloudLog = log || {}; }

function getEntries(exId) {
  return (getLog()[exId] || []).slice().sort((a, b) => {
    const ta = a.ts || new Date(a.created_at || a.date).getTime();
    const tb = b.ts || new Date(b.created_at || b.date).getTime();
    return ta - tb;
  });
}

async function loadCloudLog() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from('workout_entries')
    .select('id, exercise_id, exercise_name, workout_day, date, carga, reps, created_at')
    .eq('user_id', currentUser.id)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  cloudLog = {};
  (data || []).forEach(row => {
    if (!cloudLog[row.exercise_id]) cloudLog[row.exercise_id] = [];
    cloudLog[row.exercise_id].push({
      id: row.id,
      date: row.date,
      carga: Number(row.carga),
      reps: Number(row.reps),
      ts: new Date(row.created_at).getTime(),
      created_at: row.created_at
    });
  });
}

async function addEntry(exId, carga, reps) {
  if (!currentUser) throw new Error('Você precisa estar conectado.');
  const day = WORKOUTS.find(d => exId.startsWith(d.id + '-'));
  const exerciseName = day ? day.exercises.find(name => exerciseId(day.id, name) === exId) : exId;
  const { data, error } = await supabaseClient.from('workout_entries').insert({
    user_id: currentUser.id,
    exercise_id: exId,
    exercise_name: exerciseName || exId,
    workout_day: day ? day.id : '',
    date: todayISO(),
    carga,
    reps
  }).select('id, date, carga, reps, created_at').single();
  if (error) throw error;
  if (!cloudLog[exId]) cloudLog[exId] = [];
  cloudLog[exId].push({ id: data.id, date: data.date, carga: Number(data.carga), reps: Number(data.reps), ts: new Date(data.created_at).getTime(), created_at: data.created_at });
}

function getLastEntry(exId) {
  const entries = getEntries(exId);
  return entries.length ? entries[entries.length - 1] : null;
}

function getDayLastTrained(day) {
  let latest = null;
  day.exercises.forEach(name => {
    const entry = getLastEntry(exerciseId(day.id, name));
    if (entry && (!latest || entry.date > latest)) latest = entry.date;
  });
  return latest;
}

async function deleteEntry(exId, id) {
  if (!confirm('Tem certeza que deseja excluir este registro?')) return;
  const { error } = await supabaseClient.from('workout_entries').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) { showToast(friendlyError(error, 'Não foi possível excluir o registro.'), 'error'); return; }
  if (cloudLog[exId]) cloudLog[exId] = cloudLog[exId].filter(e => String(e.id) !== String(id));
  refreshCard(exId);
  const card = document.querySelector(`[data-exercise-id="${exId}"]`);
  if (card) {
    const dayPanel = card.closest('.day-panel');
    const day = WORKOUTS.find(d => dayPanel.dataset.dayPanel === d.id);
    if (day) refreshDayMeta(day);
  }
}

async function migrateLocalLog() {
  if (!currentUser) return;
  const key = LOCAL_MIGRATION_PREFIX + currentUser.id;
  if (localStorage.getItem(key)) return;
  let oldLog = {};
  try { oldLog = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (_) {}
  const rows = [];
  Object.entries(oldLog).forEach(([exId, entries]) => {
    const day = WORKOUTS.find(d => exId.startsWith(d.id + '-'));
    const exerciseName = day ? day.exercises.find(name => exerciseId(day.id, name) === exId) : exId;
    (entries || []).forEach(e => {
      if (e && Number(e.carga) > 0 && Number(e.reps) > 0) rows.push({
        user_id: currentUser.id, exercise_id: exId, exercise_name: exerciseName || exId,
        workout_day: day ? day.id : '', date: e.date || todayISO(), carga: Number(e.carga), reps: Number(e.reps),
        created_at: e.ts ? new Date(e.ts).toISOString() : new Date().toISOString()
      });
    });
  });
  if (rows.length) {
    const { error } = await supabaseClient.from('workout_entries').insert(rows);
    if (error) throw error;
  }
  localStorage.setItem(key, '1');
}

/* ============================================
   RENDERIZAÇÃO — TABS
   ============================================ */
function renderTabs() {
  const tabsList = document.getElementById('tabsList');
  tabsList.innerHTML = WORKOUTS.map((day, i) => `
    <button class="tab-btn" role="tab" id="tab-${day.id}" data-day="${day.id}"
      aria-selected="${i === 0 ? 'true' : 'false'}" aria-controls="panel-${day.id}">
      <span class="tab-letter">${day.letter}</span>
      <span class="tab-label">${day.title}</span>
    </button>
  `).join('');
}

function switchTab(dayId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.setAttribute('aria-selected', btn.dataset.day === dayId ? 'true' : 'false');
  });
  document.querySelectorAll('.day-panel').forEach(panel => {
    panel.hidden = panel.dataset.dayPanel !== dayId;
  });
  localStorage.setItem(LAST_TAB_KEY, dayId);
}

function attachTabEvents() {
  const tabsList = document.getElementById('tabsList');
  tabsList.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.dataset.day);
  });
  // navegação por setas do teclado entre as abas (padrão de acessibilidade)
  tabsList.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const tabs = Array.from(tabsList.querySelectorAll('.tab-btn'));
    const currentIndex = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    const nextIndex = e.key === 'ArrowRight'
      ? (currentIndex + 1) % tabs.length
      : (currentIndex - 1 + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    switchTab(tabs[nextIndex].dataset.day);
  });
}

/* ============================================
   RENDERIZAÇÃO — PAINÉIS E CARDS DE EXERCÍCIO
   ============================================ */
function exerciseCardHTML(day, name) {
  const exId = exerciseId(day.id, name);
  return `
    <article class="exercise-card" data-exercise-id="${exId}">
      <div class="exercise-head">
        <h3 class="exercise-name">${name}</h3>
        <button class="history-toggle" type="button" aria-expanded="false" aria-label="Ver histórico de ${name}">
          <svg viewBox="0 0 12 8" fill="none"><path d="M1 1L6 6L11 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <p class="last-record" data-role="last-record"></p>

      <div class="history-panel" data-role="history-panel">
        <ul class="history-list" data-role="history-list"></ul>
      </div>

      <div class="log-form">
        <div class="field">
          <label for="carga-${exId}">Carga (kg)</label>
          <input type="number" id="carga-${exId}" inputmode="decimal" step="0.5" min="0" placeholder="Ex: 40">
        </div>
        <div class="field">
          <label for="reps-${exId}">Repetições</label>
          <input type="number" id="reps-${exId}" inputmode="numeric" step="1" min="0" placeholder="Ex: 12">
        </div>
        <p class="error-msg" data-role="error-msg"></p>
        <div class="card-actions">
          <button class="btn btn-save" type="button" data-action="save">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 8.5L6 12.5L14 3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Salvar
          </button>
          <button class="btn btn-evolution" type="button" data-action="evolution">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 13V9M6 13V5M10 13V7M14 13V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Ver evolução
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderPanels() {
  const panels = document.getElementById('panels');
  panels.innerHTML = WORKOUTS.map((day, i) => `
    <section class="day-panel" id="panel-${day.id}" data-day-panel="${day.id}" role="tabpanel" aria-labelledby="tab-${day.id}" ${i === 0 ? '' : 'hidden'}>
      <div class="day-meta">
        <h2>Treino ${day.letter} — ${day.title}</h2>
        <div class="day-meta-row">
          <span class="day-last-trained" data-role="day-last-trained"></span>
          <span class="day-count">${day.exercises.length} exercícios</span>
        </div>
      </div>
      <div class="exercise-list">
        ${day.exercises.map(name => exerciseCardHTML(day, name)).join('')}
      </div>
    </section>
  `).join('');

  WORKOUTS.forEach(refreshDayMeta);
  document.querySelectorAll('.exercise-card').forEach(card => refreshCard(card.dataset.exerciseId));
}

function refreshDayMeta(day) {
  const panel = document.querySelector(`[data-day-panel="${day.id}"]`);
  if (!panel) return;
  const lastTrainedEl = panel.querySelector('[data-role="day-last-trained"]');
  const lastDate = getDayLastTrained(day);
  lastTrainedEl.textContent = lastDate
    ? 'Último treino: ' + formatDateFull(lastDate)
    : 'Ainda sem registros';
}

function refreshCard(exId) {
  const card = document.querySelector(`[data-exercise-id="${exId}"]`);
  if (!card) return;

  const entries = getEntries(exId);
  const lastRecordEl = card.querySelector('[data-role="last-record"]');
  const historyListEl = card.querySelector('[data-role="history-list"]');

  if (entries.length) {
    const last = entries[entries.length - 1];
    lastRecordEl.classList.remove('is-empty');
    lastRecordEl.innerHTML = `Último registro: <strong>${last.carga}kg × ${last.reps}</strong> — ${formatDateFull(last.date)}`;
  } else {
    lastRecordEl.classList.add('is-empty');
    lastRecordEl.textContent = 'Nenhum registro ainda';
  }

  if (entries.length) {
    historyListEl.innerHTML = entries.slice().reverse().slice(0, 12).map(e => `
      <li>
        <div class="history-info">
          <span>${formatDateFull(e.date)}</span>
          <span>${e.carga}kg × ${e.reps}</span>
        </div>
        <button class="btn-delete" type="button" data-action="delete" data-entry-id="${e.id}" aria-label="Excluir registro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </button>
      </li>
    `).join('');
  } else {
    historyListEl.innerHTML = '<li class="history-empty">Você ainda não registrou nenhuma série. Salve seu primeiro treino acima!</li>';
  }
}

/* ============================================
   AÇÕES DOS CARDS (salvar / histórico / evolução)
   delegação de evento no container principal
   ============================================ */
function attachPanelEvents() {
  const panels = document.getElementById('panels');

  panels.addEventListener('click', e => {
    // Expandir Histórico
    const historyBtn = e.target.closest('.history-toggle');
    if (historyBtn) {
      const card = historyBtn.closest('.exercise-card');
      const panel = card.querySelector('[data-role="history-panel"]');
      const isOpen = panel.classList.toggle('open');
      historyBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      return;
    }

    // Salvar Registro
    const saveBtn = e.target.closest('[data-action="save"]');
    if (saveBtn) {
      handleSave(saveBtn.closest('.exercise-card'));
      return;
    }

    // Ver Evolução
    const evoBtn = e.target.closest('[data-action="evolution"]');
    if (evoBtn) {
      const card = evoBtn.closest('.exercise-card');
      const exId = card.dataset.exerciseId;
      const name = card.querySelector('.exercise-name').textContent;
      openEvolutionModal(exId, name);
      return;
    }

    // Deletar Registro (Lixeira)
    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) {
      const card = delBtn.closest('.exercise-card');
      const exId = card.dataset.exerciseId;
      const entryId = delBtn.dataset.entryId;
      deleteEntry(exId, entryId);
      return;
    }
  });
}

async function saveBtnState(card, saving) {
  const btn = card.querySelector('[data-action="save"]');
  if (!btn) return;
  btn.disabled = saving;
  btn.style.opacity = saving ? '0.6' : '';
}

async function handleSave(card) {
  const exId = card.dataset.exerciseId;
  const cargaInput = card.querySelector(`#carga-${exId}`);
  const repsInput = card.querySelector(`#reps-${exId}`);
  const errorEl = card.querySelector('[data-role="error-msg"]');

  const carga = parseFloat(cargaInput.value);
  const reps = parseInt(repsInput.value, 10);

  if (!cargaInput.value || !repsInput.value || isNaN(carga) || isNaN(reps) || carga <= 0 || reps <= 0) {
    errorEl.textContent = 'Preencha carga e repetições com valores válidos.';
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 2600);
    return;
  }

  try {
    saveBtnState(card, true);
    await addEntry(exId, carga, reps);
    refreshCard(exId);
  } catch (err) {
    errorEl.textContent = 'Não foi possível salvar: ' + (err.message || 'erro desconhecido');
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 3500);
    return;
  } finally {
    saveBtnState(card, false);
  }

  const day = WORKOUTS.find(d => card.closest('.day-panel').dataset.dayPanel === d.id);
  if (day) refreshDayMeta(day);

  cargaInput.value = '';
  repsInput.value = '';
  errorEl.classList.remove('show');

  card.classList.add('just-saved');
  setTimeout(() => card.classList.remove('just-saved'), 900);
  showToast('Treino salvo na nuvem ✓');
}

/* ============================================
   MODAL — GRÁFICO DE EVOLUÇÃO (Chart.js)
   ============================================ */
function openEvolutionModal(exId, name) {
  currentExerciseId = exId;
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const badge = document.getElementById('modalBadge');
  const emptyMsg = document.getElementById('modalEmpty');
  const chartWrap = document.getElementById('chartWrap');

  title.textContent = name;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));

  const entries = getEntries(exId);

  document.getElementById('compareSwitch').hidden = !currentFriend;
  document.getElementById('comparisonModes').hidden = true;
  document.getElementById('comparisonSummary').hidden = true;

  if (entries.length < 2) {
    emptyMsg.hidden = entries.length !== 0;
    emptyMsg.textContent = entries.length
      ? 'Você tem apenas 1 registro deste exercício. Ainda dá para comparar com seu amigo.'
      : 'Registre pelo menos 1 treino deste exercício para começar a acompanhar sua evolução.';
    chartWrap.style.display = entries.length ? 'block' : 'none';
    badge.hidden = entries.length === 0;

    if (entries.length === 1) {
      badge.classList.remove('negative');
      badge.textContent = '1 registro';
      renderChart(entries);
    } else if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }

    document.getElementById('compareSwitch').hidden = !currentFriend;
    document.getElementById('modalClose').focus();
    return;
  }

  emptyMsg.hidden = true;
  chartWrap.style.display = 'block';

  // badge com variação percentual entre o primeiro e o último registro
  const first = entries[0].carga;
  const last = entries[entries.length - 1].carga;
  const change = first !== 0 ? ((last - first) / first) * 100 : 0;
  badge.hidden = false;
  badge.classList.toggle('negative', change < 0);
  const sign = change > 0 ? '+' : '';
  badge.textContent = `${sign}${change.toFixed(1)}% de carga desde o início`;

  renderChart(entries);
  document.getElementById('compareSwitch').hidden = !currentFriend;
  document.getElementById('modalClose').focus();
}

function renderChart(entries) {
  const ctx = document.getElementById('evolutionChart').getContext('2d');
  if (currentChart) { currentChart.destroy(); }

  const labels = entries.map(e => formatDateBR(e.date));
  const cargas = entries.map(e => e.carga);
  const reps = entries.map(e => e.reps);

  const gradientFill = ctx.createLinearGradient(0, 0, 0, 260);
  gradientFill.addColorStop(0, 'rgba(124,58,237,0.35)');
  gradientFill.addColorStop(1, 'rgba(124,58,237,0)');

  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Carga (kg)',
        data: cargas,
        borderColor: '#C026D3',
        backgroundColor: gradientFill,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#7C3AED',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion ? false : { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1929',
          borderColor: 'rgba(255,255,255,0.12)',
          borderWidth: 1,
          padding: 10,
          titleColor: '#F3F1F7',
          bodyColor: '#9891A6',
          callbacks: {
            label: (item) => `${item.parsed.y} kg`,
            afterLabel: (item) => `${reps[item.dataIndex]} repetições`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#6B6479', font: { family: 'Plus Jakarta Sans', size: 11 } }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: '#6B6479', font: { family: 'Plus Jakarta Sans', size: 11 } },
          title: { display: true, text: 'kg', color: '#6B6479' }
        }
      }
    }
  });
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('open');
  setTimeout(() => { overlay.hidden = true; }, 250);
  if (currentChart) { currentChart.destroy(); currentChart = null; }
  currentExerciseId = null;
}

function attachModalEvents() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  document.getElementById('btnCompare').addEventListener('click', async () => {
    if (!currentExerciseId) return;
    const card = document.querySelector(`[data-exercise-id="${currentExerciseId}"]`);
    const name = card ? card.querySelector('.exercise-name').textContent : document.getElementById('modalTitle').textContent;
    try { await renderComparison(currentExerciseId, name); } catch (err) { alert('Não foi possível carregar a comparação: ' + err.message); }
  });
  document.getElementById('compareModeEvolution').addEventListener('click', () => {
    setComparisonMode('evolution');
  });
  document.getElementById('compareModeLoad').addEventListener('click', () => {
    setComparisonMode('load');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('modalOverlay').hidden) closeModal();
  });
}

/* ============================================
   INICIALIZAÇÃO
   ============================================ */
function restoreLastTab() {
  const saved = localStorage.getItem(LAST_TAB_KEY);
  if (saved && WORKOUTS.some(d => d.id === saved)) {
    switchTab(saved);
  }
}

async function init() {
  renderHomeView();
  attachHomeEvents();
  renderTabs();
  renderPanels();
  attachTabEvents();
  attachPanelEvents();
  attachModalEvents();
  attachAuthEvents();
  attachFriendEvents();

  const { data } = await supabaseClient.auth.getSession();
  if (data.session) await onSignedIn(data.session);
  else showAuth(true);

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) await onSignedIn(session);
    if (event === 'SIGNED_OUT') {
      currentUser = null; currentFriend = null; cloudLog = {};
      showAuth(true);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

/* ============================================
   LÓGICA DA TELA INICIAL — IDEIA 1
   ============================================ */

// Descobre qual treino deve ser recomendado
function getSuggestedWorkout() {
  let lastTrainedDayIndex = -1;
  let latestDate = null;

  // Procura qual foi o último dia treinado entre A, B, C, D, E
  WORKOUTS.forEach((day, index) => {
    const dayLastDate = getDayLastTrained(day);
    if (dayLastDate && (!latestDate || dayLastDate > latestDate)) {
      latestDate = dayLastDate;
      lastTrainedDayIndex = index;
    }
  });

  // Se nenhum foi treinado ainda, recomenda o A (índice 0).
  // Se treinou o C, o próximo recomendado é o D (index + 1), e assim por diante.
  const nextIndex = (lastTrainedDayIndex + 1) % WORKOUTS.length;
  return {
    workout: WORKOUTS[nextIndex],
    lastDate: latestDate
  };
}

function renderHomeView() {
  const suggestedCard = document.getElementById('suggestedCard');
  const quickGrid = document.getElementById('quickGrid');

  const { workout: sug, lastDate } = getSuggestedWorkout();

  // Renderiza o Card Principal (Recomendado)
  suggestedCard.innerHTML = `
    <span class="suggested-tag">RECOMENDADO PARA HOJE</span>
    <div class="suggested-body">
      <span class="suggested-letter">${sug.letter}</span>
      <div class="suggested-info">
        <h3>${sug.title}</h3>
        <p class="suggested-meta">${sug.exercises.length} exercícios • ${lastDate ? 'Último treino em ' + formatDateBR(lastDate) : 'Sua primeira vez neste treino'}</p>
      </div>
    </div>
    <button class="btn-suggested-cta" data-day="${sug.id}">
      Iniciar Treino ${sug.letter}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>
  `;

  // Renderiza a lista secundária com os outros treinos
  quickGrid.innerHTML = WORKOUTS.map(day => `
    <div class="quick-card" data-day="${day.id}">
      <div class="quick-card-left">
        <span class="quick-letter">${day.letter}</span>
        <div>
          <div class="quick-title">${day.title}</div>
          <div class="quick-count">${day.exercises.length} ex.</div>
        </div>
      </div>
      <svg class="quick-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  `).join('');
}

function selectWorkout(dayId) {
  const homeView = document.getElementById('homeView');
  const workoutView = document.getElementById('workoutView');
  const btnHome = document.getElementById('btnHome');

  switchTab(dayId);

  homeView.hidden = true;
  workoutView.hidden = false;
  btnHome.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showHomeView() {
  const homeView = document.getElementById('homeView');
  const workoutView = document.getElementById('workoutView');
  const btnHome = document.getElementById('btnHome');

  renderHomeView(); // Recalcula a recomendação ao voltar para a home
  homeView.hidden = false;
  workoutView.hidden = true;
  btnHome.hidden = true;
}

function attachHomeEvents() {
  const homeView = document.getElementById('homeView');
  const btnHome = document.getElementById('btnHome');

  homeView.addEventListener('click', e => {
    const card = e.target.closest('[data-day]');
    if (card) {
      selectWorkout(card.dataset.day);
    }
  });

  btnHome.addEventListener('click', showHomeView);
}

/* ============================================
   AUTENTICAÇÃO + PERFIL
   ============================================ */
function showAuth(forceVisible = true) {
  const overlay = document.getElementById('authOverlay');
  if (forceVisible) overlay.hidden = false;
  const isSignup = authMode === 'signup';
  document.getElementById('authTitle').textContent = isSignup ? 'Criar conta' : 'Entrar no IRON LAB';
  document.getElementById('authSubtitle').textContent = isSignup ? 'Crie sua conta para sincronizar seus treinos.' : 'Entre para salvar seus treinos na nuvem.';
  document.getElementById('authSubmit').textContent = isSignup ? 'Criar conta' : 'Entrar';
  document.getElementById('authSwitch').textContent = isSignup ? 'Já tenho uma conta' : 'Ainda não tenho uma conta';
  document.getElementById('authNameField').hidden = !isSignup;
  document.getElementById('authUsernameField').hidden = !isSignup;
}

function hideAuth() { document.getElementById('authOverlay').hidden = true; }

function showAuthError(message) {
  const el = document.getElementById('authError');
  el.textContent = message || '';
  el.classList.toggle('show', !!message);
}

async function ensureProfile() {
  const name = (document.getElementById('authName').value || '').trim();
  const username = (document.getElementById('authUsername').value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!currentUser) return;
  const { data: existing, error: readError } = await supabaseClient.from('profiles').select('id, username, display_name').eq('id', currentUser.id).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    document.getElementById('accountName').textContent = existing.display_name || existing.username || 'Conta';
    return existing;
  }
  const displayName = name || currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Usuário';
  const finalUsername = username || ('user_' + currentUser.id.slice(0, 8));
  const { data, error } = await supabaseClient.from('profiles').insert({ id: currentUser.id, username: finalUsername, display_name: displayName }).select().single();
  if (error) throw error;
  document.getElementById('accountName').textContent = data.display_name;
  return data;
}

async function onSignedIn(session) {
  currentUser = session.user;
  try {
    await migrateLocalLog();
    await loadCloudLog();
    await ensureProfile();
    hideAuth();
    document.getElementById('accountName').textContent = document.getElementById('accountName').textContent || currentUser.email;
    renderHomeView();
    renderPanels();
    await loadFriendState();
  } catch (err) {
    console.error(err);
    showAuthError('Não foi possível carregar sua conta: ' + friendlyError(err));
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  showAuthError('');
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submit = document.getElementById('authSubmit');
  submit.disabled = true;
  try {
    if (authMode === 'signup') {
      const name = document.getElementById('authName').value.trim();
      const username = document.getElementById('authUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (!name || username.length < 3) throw new Error('Informe seu nome e um usuário com pelo menos 3 caracteres.');
      const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { display_name: name, username } } });
      if (error) throw error;
      if (!data.session) {
        showAuthError('Conta criada. Verifique seu e-mail para confirmar a conta e depois entre novamente.');
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    showAuthError(friendlyError(err, 'Não foi possível autenticar.'));
  } finally { submit.disabled = false; }
}

function attachAuthEvents() {
  document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
  document.getElementById('authSwitch').addEventListener('click', () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    document.getElementById('authForm').reset();
    showAuth(false);
    showAuthError('');
  });
  document.getElementById('btnAccount').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });
}

/* ============================================
   AMIZADES / COMPARAÇÃO
   ============================================ */

let friendshipRows = [];

async function loadFriendState() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  friendshipRows = data || [];

  const accepted = friendshipRows.find(f => f.status === 'accepted');
  currentFriend = accepted
    ? (accepted.requester_id === currentUser.id ? accepted.addressee_id : accepted.requester_id)
    : null;

  updateCompetitionCard(friendshipRows);
}

function updateCompetitionCard(friendships) {
  const status = document.getElementById('competitionStatus');
  if (!status) return;

  const acceptedCount = (friendships || []).filter(f => f.status === 'accepted').length;
  const incoming = (friendships || []).filter(
    f => f.status === 'pending' && f.addressee_id === currentUser.id
  ).length;

  if (acceptedCount) {
    status.textContent = acceptedCount === 1
      ? 'Você já tem 1 amigo. Abra para ver e comparar a evolução.'
      : `Você já tem ${acceptedCount} amigos. Escolha com quem comparar.`;
  } else if (incoming) {
    status.textContent = incoming === 1
      ? 'Você recebeu 1 solicitação de amizade.'
      : `Você recebeu ${incoming} solicitações de amizade.`;
  } else {
    status.textContent = 'Adicione um amigo para comparar suas evoluções.';
  }
}

async function openFriendModal() {
  const overlay = document.getElementById('friendModalOverlay');
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('open'));
  document.getElementById('friendError').textContent = '';
  document.getElementById('friendError').classList.remove('show');
  document.getElementById('friendUsername').focus();
  await renderFriendList();
}

function closeFriendModal() {
  const overlay = document.getElementById('friendModalOverlay');
  overlay.classList.remove('open');
  setTimeout(() => { overlay.hidden = true; }, 220);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

async function getProfilesByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, username, display_name')
    .in('id', ids);

  if (error) throw error;
  return data || [];
}

async function renderFriendList() {
  const list = document.getElementById('friendList');

  const { data, error } = await supabaseClient
    .from('friendships')
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`)
    .order('updated_at', { ascending: false });

  if (error) {
    list.innerHTML = `<p class="friend-empty">${escapeHTML(error.message)}</p>`;
    return;
  }

  friendshipRows = data || [];

  const ids = [...new Set(
    friendshipRows
      .flatMap(f => [f.requester_id, f.addressee_id])
      .filter(id => id !== currentUser.id)
  )];

  let profiles = [];
  try {
    profiles = await getProfilesByIds(ids);
  } catch (err) {
    list.innerHTML = `<p class="friend-empty">Não foi possível carregar os perfis.</p>`;
    return;
  }

  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));

  if (!friendshipRows.length) {
    list.innerHTML = '<p class="friend-empty">Nenhuma amizade ainda. Adicione seu amigo pelo @usuário acima.</p>';
    updateCompetitionCard(friendshipRows);
    return;
  }

  list.innerHTML = friendshipRows.map(f => {
    const otherId = f.requester_id === currentUser.id ? f.addressee_id : f.requester_id;
    const profile = profileById[otherId] || {};
    const incoming = f.addressee_id === currentUser.id && f.status === 'pending';
    const outgoing = f.requester_id === currentUser.id && f.status === 'pending';

    const displayName = escapeHTML(profile.display_name || 'Usuário');
    const username = escapeHTML(profile.username || 'sem_usuario');

    let actions = '';

    if (f.status === 'accepted') {
      actions = `
        <button class="btn btn-competition friend-compare-btn"
                type="button"
                data-friend-action="compare"
                data-user-id="${escapeHTML(otherId)}">
          Comparar
        </button>
      `;
    } else if (incoming) {
      actions = `
        <button class="btn btn-save" type="button"
                data-friend-action="accept" data-id="${escapeHTML(f.id)}">Aceitar</button>
        <button class="btn btn-delete-text" type="button"
                data-friend-action="decline" data-id="${escapeHTML(f.id)}">Recusar</button>
      `;
    } else if (outgoing) {
      actions = `
        <span class="friend-status">Solicitação enviada</span>
        <button class="btn btn-delete-text" type="button"
                data-friend-action="remove" data-id="${escapeHTML(f.id)}">Cancelar</button>
      `;
    } else {
      actions = `<span class="friend-status">Pendente</span>`;
    }

    return `
      <div class="friend-row">
        <div>
          <strong>${displayName}</strong>
          <span>@${username}</span>
        </div>
        <div class="friend-actions">${actions}</div>
      </div>
    `;
  }).join('');

  updateCompetitionCard(friendshipRows);
}

async function addFriend() {
  const input = document.getElementById('friendUsername');
  const username = input.value.trim().replace(/^@/, '').toLowerCase();
  const err = document.getElementById('friendError');

  err.textContent = '';
  err.classList.remove('show');

  if (!username) {
    err.textContent = 'Digite o usuário do seu amigo.';
    err.classList.add('show');
    return;
  }

  const { data: profile, error: pErr } = await supabaseClient
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', username)
    .maybeSingle();

  if (pErr) {
    err.textContent = friendlyError(pErr);
    err.classList.add('show');
    return;
  }

  if (!profile) {
    err.textContent = 'Usuário não encontrado. Confira o @usuário.';
    err.classList.add('show');
    return;
  }

  if (profile.id === currentUser.id) {
    err.textContent = 'Você não pode adicionar a si mesmo.';
    err.classList.add('show');
    return;
  }

  const existing = friendshipRows.find(f =>
    (f.requester_id === currentUser.id && f.addressee_id === profile.id) ||
    (f.requester_id === profile.id && f.addressee_id === currentUser.id)
  );

  if (existing) {
    err.textContent = existing.status === 'accepted'
      ? 'Vocês já são amigos.'
      : existing.status === 'pending'
        ? (existing.addressee_id === currentUser.id
          ? 'Essa pessoa já enviou uma solicitação para você. Aceite-a abaixo.'
          : 'Você já enviou uma solicitação para essa pessoa.')
        : 'Já existe um registro de amizade entre vocês.';
    err.classList.add('show');
    return;
  }

  const button = document.getElementById('btnAddFriend');
  button.disabled = true;

  const { error } = await supabaseClient
    .from('friendships')
    .insert({
      requester_id: currentUser.id,
      addressee_id: profile.id
    });

  button.disabled = false;

  if (error) {
    err.textContent = error.code === '23505'
      ? 'Essa amizade já existe ou já foi solicitada.'
      : friendlyError(error, 'Não foi possível enviar a solicitação.');
    err.classList.add('show');
    return;
  }

  input.value = '';
  err.textContent = 'Solicitação enviada!';
  err.classList.add('show');
  showToast('Solicitação de amizade enviada ✓');

  await loadFriendState();
  await renderFriendList();
}

async function handleFriendAction(action, id, userId) {
  if (action === 'compare') {
    currentFriend = userId;
    closeFriendModal();

    if (currentExerciseId) {
      const card = document.querySelector(`[data-exercise-id="${currentExerciseId}"]`);
      const name = card
        ? card.querySelector('.exercise-name').textContent
        : document.getElementById('modalTitle').textContent;

      try {
        await renderComparison(currentExerciseId, name);
      } catch (err) {
        showToast(friendlyError(err, 'Não foi possível carregar a comparação.'), 'error');
      }
    } else {
      showToast('Amigo selecionado. Abra um exercício para comparar.');
    }
    return;
  }

  if (!id) return;

  if (action === 'remove') {
    const { error } = await supabaseClient
      .from('friendships')
      .delete()
      .eq('id', id);

    if (error) {
      document.getElementById('friendError').textContent = friendlyError(error);
      document.getElementById('friendError').classList.add('show');
      return;
    }

    await loadFriendState();
    await renderFriendList();
    return;
  }

  const status = action === 'accept' ? 'accepted' : 'declined';

  const { error } = await supabaseClient
    .from('friendships')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    document.getElementById('friendError').textContent = friendlyError(error);
    document.getElementById('friendError').classList.add('show');
    return;
  }

  await loadFriendState();
  await renderFriendList();
}

function attachFriendEvents() {
  document.getElementById('btnCompetition').addEventListener('click', openFriendModal);
  document.getElementById('friendModalClose').addEventListener('click', closeFriendModal);

  document.getElementById('friendModalOverlay').addEventListener('click', e => {
    if (e.target.id === 'friendModalOverlay') closeFriendModal();
  });

  document.getElementById('btnAddFriend').addEventListener('click', addFriend);

  document.getElementById('friendUsername').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addFriend();
    }
  });

  document.getElementById('friendList').addEventListener('click', e => {
    const btn = e.target.closest('[data-friend-action]');
    if (!btn) return;

    handleFriendAction(
      btn.dataset.friendAction,
      btn.dataset.id,
      btn.dataset.userId
    );
  });
}

async function getFriendEntries(exId) {
  if (!currentFriend) return [];

  const { data, error } = await supabaseClient
    .from('workout_entries')
    .select('id, date, carga, reps, created_at')
    .eq('user_id', currentFriend)
    .eq('exercise_id', exId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(e => ({
    ...e,
    carga: Number(e.carga),
    reps: Number(e.reps),
    ts: new Date(e.created_at).getTime()
  }));
}

let comparisonMode = 'evolution';

function getEvolutionPercent(entries) {
  if (!entries.length || entries[0].carga === 0) return null;
  const first = Number(entries[0].carga);
  return entries.map(entry => ((Number(entry.carga) - first) / first) * 100);
}

function getComparisonWinner(ownEntries, friendEntries, ownName, friendName) {
  const ownFirst = ownEntries.length ? Number(ownEntries[0].carga) : null;
  const ownLast = ownEntries.length ? Number(ownEntries[ownEntries.length - 1].carga) : null;
  const friendFirst = friendEntries.length ? Number(friendEntries[0].carga) : null;
  const friendLast = friendEntries.length ? Number(friendEntries[friendEntries.length - 1].carga) : null;

  const ownPct = ownFirst && ownLast !== null ? ((ownLast - ownFirst) / ownFirst) * 100 : null;
  const friendPct = friendFirst && friendLast !== null ? ((friendLast - friendFirst) / friendFirst) * 100 : null;

  if (ownPct === null && friendPct === null) return { ownPct, friendPct, winner: null };
  if (friendPct === null) return { ownPct, friendPct, winner: ownName };
  if (ownPct === null) return { ownPct, friendPct, winner: friendName };

  if (Math.abs(ownPct - friendPct) < 0.05) {
    return { ownPct, friendPct, winner: 'empate' };
  }

  return {
    ownPct,
    friendPct,
    winner: ownPct > friendPct ? ownName : friendName
  };
}

function comparisonNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(1).replace('.', ',');
}

function setComparisonMode(mode) {
  comparisonMode = mode;

  const loadButton = document.getElementById('compareModeLoad');
  const evolutionButton = document.getElementById('compareModeEvolution');

  if (loadButton) {
    loadButton.classList.toggle('active', mode === 'load');
    loadButton.setAttribute('aria-pressed', mode === 'load' ? 'true' : 'false');
  }

  if (evolutionButton) {
    evolutionButton.classList.toggle('active', mode === 'evolution');
    evolutionButton.setAttribute('aria-pressed', mode === 'evolution' ? 'true' : 'false');
  }

  if (currentFriend && currentExerciseId) {
    const card = document.querySelector(`[data-exercise-id="${currentExerciseId}"]`);
    const name = card
      ? card.querySelector('.exercise-name')?.textContent || currentExerciseId
      : document.getElementById('modalTitle').textContent.split(' — ')[0];

    renderComparison(currentExerciseId, name);
  }
}

function renderComparisonSummary(ownEntries, friendEntries, ownName, friendName) {
  const result = getComparisonWinner(ownEntries, friendEntries, ownName, friendName);
  const summary = document.getElementById('comparisonSummary');
  if (!summary) return;

  const formatPct = pct => pct === null
    ? '—'
    : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

  let winnerText = 'Sem dados suficientes para decidir quem está na frente.';

  if (result.winner === 'empate') {
    winnerText = '🤝 Empate na evolução';
  } else if (result.winner) {
    winnerText = `🏆 ${result.winner} está na frente na evolução`;
  }

  summary.innerHTML = `
    <div class="comparison-person">
      <strong>${escapeHTML(ownName)}</strong>
      <span class="${result.ownPct !== null && result.ownPct < 0 ? 'negative' : ''}">${formatPct(result.ownPct)}</span>
    </div>
    <div class="comparison-vs">VS</div>
    <div class="comparison-person">
      <strong>${escapeHTML(friendName)}</strong>
      <span class="${result.friendPct !== null && result.friendPct < 0 ? 'negative' : ''}">${formatPct(result.friendPct)}</span>
    </div>
    <div class="comparison-winner">${escapeHTML(winnerText)}</div>
  `;
  summary.hidden = false;
}

async function renderComparison(exId, name) {
  if (!currentFriend) {
    await openFriendModal();
    return;
  }

  const [friendEntries, ownEntries] = await Promise.all([
    getFriendEntries(exId),
    Promise.resolve(getEntries(exId))
  ]);

  if (!friendEntries.length && !ownEntries.length) {
    document.getElementById('modalTitle').textContent = name + ' — batalha';
    document.getElementById('modalBadge').hidden = true;
    document.getElementById('modalEmpty').hidden = false;
    document.getElementById('modalEmpty').textContent = 'Nenhum dos dois possui registros deste exercício ainda.';
    document.getElementById('chartWrap').style.display = 'none';
    const summary = document.getElementById('comparisonSummary');
    if (summary) summary.hidden = true;
    return;
  }

  const friendProfile = await supabaseClient
    .from('profiles')
    .select('display_name, username')
    .eq('id', currentFriend)
    .maybeSingle();

  const friendName = friendProfile.data?.display_name ||
    friendProfile.data?.username ||
    'Amigo';

  const ownName = document.getElementById('accountName').textContent || 'Você';

  document.getElementById('modalTitle').textContent = `${name} — batalha`;
  document.getElementById('modalBadge').hidden = true;
  document.getElementById('comparisonModes').hidden = false;
  document.getElementById('compareSwitch').hidden = false;
  document.getElementById('modalEmpty').hidden = true;
  document.getElementById('chartWrap').style.display = 'block';

  renderComparisonSummary(ownEntries, friendEntries, ownName, friendName);

  const ctx = document.getElementById('evolutionChart').getContext('2d');
  if (currentChart) currentChart.destroy();

  const maxLength = Math.max(ownEntries.length, friendEntries.length);
  const labels = Array.from({ length: maxLength }, (_, index) => `Treino ${index + 1}`);

  const ownLoadData = ownEntries.map(e => Number(e.carga));
  const friendLoadData = friendEntries.map(e => Number(e.carga));

  const ownEvolutionData = getEvolutionPercent(ownEntries);
  const friendEvolutionData = getEvolutionPercent(friendEntries);

  const isEvolution = comparisonMode === 'evolution';
  const ownData = isEvolution ? (ownEvolutionData || []) : ownLoadData;
  const friendData = isEvolution ? (friendEvolutionData || []) : friendLoadData;

  const allValues = [...ownData, ...friendData].filter(v => Number.isFinite(v));

  let yMin;
  let yMax;

  if (isEvolution) {
    const minValue = allValues.length ? Math.min(...allValues) : 0;
    const maxValue = allValues.length ? Math.max(...allValues) : 0;
    const range = Math.max(maxValue - minValue, 10);
    const padding = Math.max(range * 0.18, 3);

    yMin = minValue >= 0
      ? 0
      : Math.floor((minValue - padding) / 5) * 5;
    yMax = Math.ceil((maxValue + padding) / 5) * 5;

    if (yMax <= yMin) yMax = yMin + 10;
  } else {
    const minValue = allValues.length ? Math.min(...allValues) : 0;
    const maxValue = allValues.length ? Math.max(...allValues) : 0;
    const range = Math.max(maxValue - minValue, 5);
    const padding = Math.max(range * 0.18, 1);

    yMin = Math.max(0, Math.floor((minValue - padding) / 2) * 2);
    yMax = Math.ceil((maxValue + padding) / 2) * 2;

    if (yMax <= yMin) yMax = yMin + 10;
  }

  currentChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: ownName,
          data: ownData,
          borderColor: '#C026D3',
          backgroundColor: 'rgba(192,38,211,.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: .35,
          spanGaps: false
        },
        {
          label: friendName,
          data: friendData,
          borderColor: '#22C55E',
          backgroundColor: 'rgba(34,197,94,.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: .35,
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion ? false : { duration: 650, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#F3F1F7',
            usePointStyle: true,
            padding: 16
          }
        },
        tooltip: {
          backgroundColor: '#1e1929',
          borderColor: 'rgba(255,255,255,.12)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: item => {
              if (item.parsed.y === null || item.parsed.y === undefined) return `${item.dataset.label}: —`;
              return isEvolution
                ? `${item.dataset.label}: ${item.parsed.y >= 0 ? '+' : ''}${item.parsed.y.toFixed(1)}%`
                : `${item.dataset.label}: ${comparisonNumber(item.parsed.y)} kg`;
            },
            afterBody: items => {
              const index = items[0]?.dataIndex;
              if (index === undefined) return '';

              const repsLines = [];
              if (ownEntries[index]) repsLines.push(`${ownName}: ${ownEntries[index].reps} reps`);
              if (friendEntries[index]) repsLines.push(`${friendName}: ${friendEntries[index].reps} reps`);
              return repsLines;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,.06)' },
          ticks: {
            color: '#6B6479',
            font: { family: 'Plus Jakarta Sans', size: 11 },
            maxRotation: 0
          },
          title: {
            display: true,
            text: 'Nº do treino',
            color: '#6B6479'
          }
        },
        y: {
          min: yMin,
          max: yMax,
          grid: { color: 'rgba(255,255,255,.06)' },
          ticks: {
            color: '#6B6479',
            font: { family: 'Plus Jakarta Sans', size: 11 },
            callback: value => isEvolution
              ? `${value >= 0 ? '+' : ''}${value}%`
              : `${value} kg`
          },
          title: {
            display: true,
            text: isEvolution ? 'Evolução (%)' : 'Carga (kg)',
            color: '#6B6479'
          }
        }
      }
    }
  });
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker registrado com sucesso!'))
    .catch(err => console.error('Erro ao registrar SW:', err));
}