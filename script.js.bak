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

/* ============================================
   PERSISTÊNCIA (localStorage)
   estrutura: { [exerciseId]: [{date, carga, reps, ts}, ...] }
   ============================================ */
function getLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('Não foi possível ler o histórico salvo:', e);
    return {};
  }
}

function saveLog(log) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch (e) {
    console.warn('Não foi possível salvar o histórico:', e);
  }
}

function getEntries(exId) {
  const log = getLog();
  return (log[exId] || []).slice().sort((a, b) => a.ts - b.ts);
}

function addEntry(exId, carga, reps) {
  const log = getLog();
  if (!log[exId]) log[exId] = [];
  log[exId].push({ date: todayISO(), carga, reps, ts: Date.now() });
  saveLog(log);
}

function getLastEntry(exId) {
  const entries = getEntries(exId);
  return entries.length ? entries[entries.length - 1] : null;
}

// data do treino mais recente entre todos os exercícios de um dia
function getDayLastTrained(day) {
  let latest = null;
  day.exercises.forEach(name => {
    const entry = getLastEntry(exerciseId(day.id, name));
    if (entry && (!latest || entry.date > latest)) latest = entry.date;
  });
  return latest;
}

// Função para deletar um registro específico
function deleteEntry(exId, ts) {
  if (!confirm('Tem certeza que deseja excluir este registro?')) return;

  const log = getLog();
  if (log[exId]) {
    // Filtra removendo o registro que tem o Timestamp exato
    log[exId] = log[exId].filter(e => e.ts !== ts);
    saveLog(log);

    // Atualiza a tela do card
    refreshCard(exId);

    // Atualiza a meta-data do dia (último treino)
    const card = document.querySelector(`[data-exercise-id="${exId}"]`);
    if (card) {
      const dayPanel = card.closest('.day-panel');
      const day = WORKOUTS.find(d => dayPanel.dataset.dayPanel === d.id);
      if (day) refreshDayMeta(day);
    }
  }
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
        <button class="btn-delete" type="button" data-action="delete" data-ts="${e.ts}" aria-label="Excluir registro">
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
      const ts = parseInt(delBtn.dataset.ts, 10);
      deleteEntry(exId, ts);
      return;
    }
  });
}

function handleSave(card) {
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

  addEntry(exId, carga, reps);
  refreshCard(exId);

  const day = WORKOUTS.find(d => card.closest('.day-panel').dataset.dayPanel === d.id);
  if (day) refreshDayMeta(day);

  cargaInput.value = '';
  repsInput.value = '';
  errorEl.classList.remove('show');

  card.classList.add('just-saved');
  setTimeout(() => card.classList.remove('just-saved'), 900);
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

  if (entries.length < 2) {
    emptyMsg.hidden = false;
    chartWrap.style.display = 'none';
    badge.hidden = true;
    if (currentChart) { currentChart.destroy(); currentChart = null; }
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

function init() {
  renderHomeView();
  attachHomeEvents();
  renderTabs();
  renderPanels();
  attachTabEvents();
  attachPanelEvents();
  attachModalEvents();
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => console.log('Service Worker registrado com sucesso!'))
    .catch(err => console.error('Erro ao registrar SW:', err));
}