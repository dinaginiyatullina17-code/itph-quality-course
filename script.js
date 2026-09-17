/* ════════════════════════════════════════════════════════════════════════
   E-LEARNING KIT — переиспользуемые интерактивности для курсов-лонгридов
   ────────────────────────────────────────────────────────────────────────
   Чистый ванильный JS, без зависимостей. Парный файл к elearning-kit.css.

   Архитектура:
     • Курс — одна HTML-страница (SPA). «Страницы» — <div class="page">.
     • Глобальные функции вызываются прямо из onclick в разметке
       (navigateTo, checkSortOrder, toggleFaq, …). Это сознательный выбор:
       никакой сборки, всё читается «как есть» и легко переносится.

   СОДЕРЖАНИЕ
     1.  Роутер SPA (navigateTo)
     2.  Появление по скроллу (IntersectionObserver)
     3.  Прогресс + сохранение (SCORM 1.2 + localStorage)
     4.  Последовательная разблокировка глав / разделов
     5.  Галерея / карусель
     6.  Аккордеон FAQ
     7.  Сортировка списка (drag-and-drop + тач)
     8.  Два контейнера drag-and-drop (drag-chip → drop-zone)
     9.  Выбор варианта (matching / викторина)
     10. Пошаговая видеовикторина с кнопкой «Далее»
     11. Модальное окно
     12. Утилиты (перемешивание, set-сравнение)
     13. Инициализация
   ════════════════════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════════════════════
   КОНФИГ — поправь под свой курс
   ════════════════════════════════════════════════════════════════════════ */
// Порядок «страниц» в DOM. Для каждой ожидается элемент с id="page-<name>".
const PAGES = ['home', 'intro', 'meaning', 'prepare', 'control', 'actions', 'mistakes', 'practice', 'summary'];

// Главы для прогресс-бара и последовательной разблокировки (без 'home').
const CHAPTER_ORDER = ['intro', 'meaning', 'prepare', 'control', 'actions', 'mistakes', 'practice', 'summary'];

// Человекочитаемые названия глав для шапки.
const CHAPTER_NAMES = {
  home: '',
  intro: 'Введение',
  meaning: 'Что показывает ITPH',
  prepare: 'Подготовка к смене',
  control: 'Точки контроля',
  actions: 'Решения в моменте',
  mistakes: 'Типичные ошибки',
  practice: 'Практика',
  summary: 'Шпаргалка',
};

let currentPage = 'home';
let unlockedChapters = 1;          // сколько глав открыто (1..N)
const viewedPatterns = new Set();
const openedFlags = new Set();
const viewedActions = new Set();
const openedMistakes = new Set();


/* ════════════════════════════════════════════════════════════════════════
   1. РОУТЕР SPA
   Прячет все .page, показывает целевую, обновляет шапку/прогресс и запускает
   нужные инициализаторы. Вызывается из onclick="navigateTo('section2')".
   ════════════════════════════════════════════════════════════════════════ */
function navigateTo(pageId) {
  const idx = CHAPTER_ORDER.indexOf(pageId);
  if (idx !== -1 && idx >= unlockedChapters) return;

  // 1) переключаем активную страницу
  PAGES.forEach(id => document.getElementById('page-' + id)?.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (!target) return;
  target.classList.add('active');
  currentPage = pageId;
  document.getElementById('nav-back-btn')?.toggleAttribute('hidden', pageId === 'home');
  window.scrollTo({ top: 0, behavior: 'auto' });

  // 2) шапка + прогресс-бар
  document.getElementById('nav-chapter').textContent = CHAPTER_NAMES[pageId] || '';
  if (idx !== -1) {
    document.getElementById('nav-progress').textContent = (idx + 1) + ' / ' + CHAPTER_ORDER.length;
    document.getElementById('progress-bar').style.width =
      Math.round(((idx + 1) / CHAPTER_ORDER.length) * 100) + '%';
  } else {
    document.getElementById('nav-progress').textContent = '';
    document.getElementById('progress-bar').style.width = '0%';
  }

  // 3) анимация появления (после того как страница стала видимой)
  setTimeout(initFadeIn, 50);

  // 4) инициализаторы конкретных страниц — добавляй свои
  if (pageId === 'actions') {
    renderAction('quality');
    viewedActions.add('quality');
  }

}

function goBack() {
  const idx = CHAPTER_ORDER.indexOf(currentPage);
  navigateTo(idx <= 0 ? 'home' : CHAPTER_ORDER[idx - 1]);
}

const PAGE_GATES = {
  meaning: {
    complete: () => completedTests.has('calc') && viewedPatterns.size === 2,
    hint: 'Изучи оба примера и реши тест.',
  },
  control: {
    complete: () => completedTests.has('control') && openedFlags.size === 4,
    hint: 'Изучи все четыре сигнала и реши тест.',
  },
  actions: {
    complete: () => viewedActions.size === 3,
    hint: 'Изучи все три ситуации.',
  },
  mistakes: {
    complete: () => openedMistakes.size === 3,
    hint: 'Изучи решения на всех трёх карточках.',
  },
  practice: {
    complete: () => completedTests.has('practice'),
    hint: 'Изучи и правильно реши все три кейса.',
  },
};

function showGateReminder(pageId) {
  const hint = document.getElementById('gate-reminder-' + pageId);
  if (!hint) return;
  hint.hidden = false;
  hint.textContent = PAGE_GATES[pageId]?.hint || 'Изучи все материалы главы.';
  hint.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* Следующая глава открывается только по кнопке в конце текущей главы. */
function advanceTo(pageId) {
  const idx = CHAPTER_ORDER.indexOf(pageId);
  if (idx === -1) return;
  const gate = PAGE_GATES[currentPage];
  if (gate && !gate.complete()) {
    showGateReminder(currentPage);
    return;
  }
  const required = idx + 1;
  if (required > unlockedChapters) {
    unlockedChapters = required;
    saveProgress();
    applyHomeLocks();
  }
  navigateTo(pageId);
}


/* ════════════════════════════════════════════════════════════════════════
   2. ПОЯВЛЕНИЕ ПО СКРОЛЛУ
   Элементы .fade-in становятся .visible, когда входят во вьюпорт.
   Те, что уже видны на момент вызова, показываем сразу (без ожидания скролла).
   ════════════════════════════════════════════════════════════════════════ */
function initFadeIn() {
  const els = document.querySelectorAll('.page.active .fade-in:not(.visible)');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight) el.classList.add('visible'); // уже на экране
    else io.observe(el);
  });
}


/* ════════════════════════════════════════════════════════════════════════
   3. ПРОГРЕСС + СОХРАНЕНИЕ
   Состояние — крошечный JSON. Пишем в SCORM (cmi.suspend_data), если курс
   запущен в LMS, и дублируем в localStorage (для работы вне LMS).
   ВАЖНО про статус: «Завершён» НЕ ставим автоматически — только по кнопке
   «Завершить» (SCORM.complete()). Прогресс открытия глав хранится отдельно.
   ════════════════════════════════════════════════════════════════════════ */
const PROGRESS_KEY = 'itph_quality_progress_v9';
// Новая версия сбрасывает прогресс из прежних сборок курса.
// Так при первом открытии доступно только «Введение».
const PROGRESS_VERSION = 9;
const completedTests = new Set();
const REQUIRED_TESTS = {
  prepare: 'calc',
  actions: 'control',
  summary: 'practice',
};
const hubDone = [false, false, false];   // флаги пройденных подразделов (если есть)

function collectState() {
  return { version: PROGRESS_VERSION, unlocked: unlockedChapters, hub: hubDone.slice(), tests: Array.from(completedTests) };
}

function saveProgress() {
  const json = JSON.stringify(collectState());
  try { localStorage.setItem(PROGRESS_KEY, json); } catch (e) {}

  if (window.SCORM && typeof SCORM.set === 'function') {
    SCORM.set('cmi.suspend_data', json);
    // Помечаем «попытка начата» один раз и НИКОГДА не понижаем зачтённый статус.
    const status = SCORM.get('cmi.core.lesson_status');
    if (status === '' || status === 'not attempted' || status === 'unknown') {
      SCORM.set('cmi.core.lesson_status', 'incomplete');
    }
    SCORM.commit(); // без commit LMS может не сохранить
  }
}

function loadProgress() {
  // Каждое открытие курса считается новой попыткой: старый прогресс,
  // ответы и итог предыдущего прохождения не восстанавливаем.
  unlockedChapters = 1;
  completedTests.clear();
  for (let i = 0; i < hubDone.length; i++) hubDone[i] = false;
  try {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(PROGRESS_KEY + '_completed');
  } catch (e) {}

  if (window.SCORM && typeof SCORM.set === 'function') {
    SCORM.set('cmi.suspend_data', JSON.stringify(collectState()));
    SCORM.set('cmi.core.lesson_status', 'incomplete');
    SCORM.set('cmi.core.score.raw', '0');
    SCORM.set('cmi.core.score.min', '0');
    SCORM.set('cmi.core.score.max', '100');
    if (typeof SCORM.commit === 'function') SCORM.commit();
  }
  applyHomeLocks();
  updateTestGates();
  // applyHubLocks();
}


/* ════════════════════════════════════════════════════════════════════════
   4. ПОСЛЕДОВАТЕЛЬНАЯ РАЗБЛОКИРОВКА
   На главной для каждой главы ожидается карточка id="home-card-<N>".
   Карточка блокируется (класс .locked), пока её индекс >= unlockedChapters.
   ════════════════════════════════════════════════════════════════════════ */
function applyHomeLocks() {
  CHAPTER_ORDER.forEach((ch, i) => {
    const card = document.getElementById('home-card-' + (i + 1));
    if (card) {
      const locked = i >= unlockedChapters;
      card.classList.toggle('locked', locked);
      card.setAttribute('aria-disabled', String(locked));
    }
  });
}

/* Для хаба с подразделами (если используешь): карточки #hub-card-<N>.
   1-я всегда открыта, N-я открывается после прохождения (N-1)-й. */
function applyHubLocks() {
  const cards = document.querySelectorAll('.hub-card');
  cards.forEach((card, i) => {
    card.classList.toggle('done', !!hubDone[i]);
    card.classList.toggle('locked', i === 0 ? false : !hubDone[i - 1]);
  });
}

/* Вызывается кнопкой «Готово» внутри подраздела */
function completeSection(n) {
  hubDone[n - 1] = true;
  saveProgress();
  applyHubLocks();
}


/* ════════════════════════════════════════════════════════════════════════
   5. ГАЛЕРЕЯ / КАРУСЕЛЬ
   Лента #gallery-track сдвигается через translateX. Точки — .gallery-dot.
   ════════════════════════════════════════════════════════════════════════ */
let galleryIdx = 0;
const GALLERY_COUNT = 5;   // число слайдов

function initGallery() { galleryIdx = 0; renderGallery(); }
function renderGallery() {
  const track = document.getElementById('gallery-track');
  if (!track) return;
  track.style.transform = `translateX(-${galleryIdx * 100}%)`;
  document.querySelectorAll('.gallery-dot').forEach((d, i) => d.classList.toggle('active', i === galleryIdx));
}
function galleryMove(dir) {
  galleryIdx = (galleryIdx + dir + GALLERY_COUNT) % GALLERY_COUNT; // зацикленно
  renderGallery();
}


/* ════════════════════════════════════════════════════════════════════════
   6. АККОРДЕОН FAQ
   Класс .open ставится одновременно на кнопку (.faq-q) и тело (.faq-body).
   Высоту разворачивает CSS (max-height), JS только переключает класс.
   ════════════════════════════════════════════════════════════════════════ */
function toggleFaq(btn) {
  const body = btn.nextElementSibling;
  const isOpen = body.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  body.classList.toggle('open', !isOpen);
}


/* ════════════════════════════════════════════════════════════════════════
   7. СОРТИРОВКА СПИСКА (drag-and-drop по вертикали)
   Поддерживает мышь (HTML5 DnD) и тач (ручной расчёт позиции вставки).
   У каждого .sort-item должен быть data-idx. Контейнер — #sortable-list.
   ════════════════════════════════════════════════════════════════════════ */
const CORRECT_ORDER = [1, 3, 0, 2];   // эталонный порядок data-idx

function initSortable() {
  const list = document.getElementById('sortable-list');
  if (!list) return;
  let dragEl = null;

  list.querySelectorAll('.sort-item').forEach(item => {
    // — мышь —
    item.addEventListener('dragstart', () => { dragEl = item; setTimeout(() => item.classList.add('dragging'), 0); });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
      dragEl = null;
    });
    // — тач —
    item.addEventListener('touchstart', () => { dragEl = item; item.classList.add('dragging'); }, { passive: true });
    item.addEventListener('touchmove', e => { markInsertPoint(list, e.touches[0].clientY); }, { passive: true });
    item.addEventListener('touchend', e => {
      if (!dragEl) return;
      const tgt = insertTarget(list, e.changedTouches[0].clientY);
      if (tgt.el) { tgt.before ? list.insertBefore(dragEl, tgt.el) : tgt.el.insertAdjacentElement('afterend', dragEl); }
      dragEl.classList.remove('dragging');
      list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
      dragEl = null;
    });
  });

  // — зона приёма (мышь) —
  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragEl) return;
    const after = getDragAfterEl(list, e.clientY);
    list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
    if (after) after.classList.add('drag-over-top');
    else { const last = list.querySelector('.sort-item:last-child'); if (last && last !== dragEl) last.classList.add('drag-over-bottom'); }
  });
  list.addEventListener('drop', e => {
    e.preventDefault();
    if (!dragEl) return;
    const after = getDragAfterEl(list, e.clientY);
    after ? list.insertBefore(dragEl, after) : list.appendChild(dragEl);
  });

  // вспомогательные расчёты позиции вставки для тача
  function insertTarget(list, y) {
    const els = [...list.querySelectorAll('.sort-item:not(.dragging)')];
    let target = null, before = true;
    for (const el of els) { const r = el.getBoundingClientRect(); if (y < r.top + r.height / 2) { target = el; before = true; break; } target = el; before = false; }
    return { el: target, before };
  }
  function markInsertPoint(list, y) {
    const t = insertTarget(list, y);
    list.querySelectorAll('.sort-item').forEach(i => i.classList.remove('drag-over-top', 'drag-over-bottom'));
    if (t.el) t.el.classList.add(t.before ? 'drag-over-top' : 'drag-over-bottom');
  }
}

/* Куда вставлять при перетаскивании мышью (ближайший элемент ниже курсора) */
function getDragAfterEl(container, y) {
  const items = [...container.querySelectorAll('.sort-item:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, el: child };
    return closest;
  }, { offset: -Infinity, el: null }).el;
}

/* Проверка порядка: сравниваем текущие data-idx с эталоном */
function checkSortOrder() {
  const items = [...document.querySelectorAll('#sortable-list .sort-item')];
  const indices = items.map(el => parseInt(el.dataset.idx));
  const ok = CORRECT_ORDER.every((v, i) => v === indices[i]);
  const fb = document.getElementById('sort-feedback');
  fb.className = 'feedback-box show ' + (ok ? 'correct' : 'incorrect');
  fb.innerHTML = ok ? '<strong>Верно!</strong>' : '<strong>Неверно.</strong> Попробуй ещё раз.';
}


/* ════════════════════════════════════════════════════════════════════════
   8. ДВА КОНТЕЙНЕРА DRAG-AND-DROP (чипы → зоны)
   initZoneSort связывает пул и две зоны. Поддержка тача — через клон,
   следующий за пальцем. Защита от повторной привязки через data-атрибуты,
   чтобы при повторном входе на страницу обработчики не дублировались.
   ════════════════════════════════════════════════════════════════════════ */
function initZoneSort(poolId, zone1Id, zone2Id) {
  const pool = document.getElementById(poolId);
  const z1 = document.getElementById(zone1Id);
  const z2 = document.getElementById(zone2Id);
  if (!pool || !z1 || !z2) return;

  [pool, z1, z2].forEach(c => c.querySelectorAll('.drag-chip').forEach(chip => {
    if (!chip.dataset.chipBound) { bindChip(chip, pool, z1, z2); chip.dataset.chipBound = '1'; }
  }));
  [pool, z1, z2].forEach(zone => {
    if (zone.dataset.zoneBound) return;
    zone.dataset.zoneBound = '1';
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      const chip = document.getElementById(e.dataTransfer.getData('text/plain'));
      if (chip) zone.appendChild(chip);
    });
  });
}

function bindChip(chip, pool, z1, z2) {
  // — мышь —
  chip.setAttribute('draggable', true);
  chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', chip.id); chip.classList.add('dragging'); });
  chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

  // — тач: создаём клон, который «летит» за пальцем —
  let clone = null;
  chip.addEventListener('touchstart', () => {
    chip.classList.add('dragging');
    clone = chip.cloneNode(true);
    clone.style.cssText = 'position:fixed;pointer-events:none;opacity:0.75;z-index:9999;';
    document.body.appendChild(clone);
  }, { passive: true });
  chip.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (clone) { clone.style.left = (t.clientX - 40) + 'px'; clone.style.top = (t.clientY - 20) + 'px'; }
    [pool, z1, z2].forEach(z => { const r = z.getBoundingClientRect(); z.classList.toggle('drag-over', inRect(t, r)); });
  }, { passive: true });
  chip.addEventListener('touchend', e => {
    chip.classList.remove('dragging');
    if (clone) { clone.remove(); clone = null; }
    const t = e.changedTouches[0];
    [pool, z1, z2].forEach(z => { z.classList.remove('drag-over'); if (inRect(t, z.getBoundingClientRect())) z.appendChild(chip); });
  });
}
function inRect(p, r) { return p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom; }

/* Проверка распределения по зонам через сравнение множеств data-key */
function checkZoneSort(zone1Id, zone2Id, correctZ1, correctZ2, feedbackId) {
  const keys = id => [...document.getElementById(id).querySelectorAll('.drag-chip')].map(c => c.dataset.key);
  const ok = setEq(keys(zone1Id), correctZ1) && setEq(keys(zone2Id), correctZ2);
  const fb = document.getElementById(feedbackId);
  fb.className = 'feedback-box show ' + (ok ? 'correct' : 'incorrect');
  fb.innerHTML = ok ? '<strong>Верно!</strong>' : '<strong>Неверно.</strong> Распредели заново.';
}


/* ════════════════════════════════════════════════════════════════════════
   9. ВЫБОР ВАРИАНТА (matching / викторина из нескольких вопросов)
   У каждого вопроса свой индекс. Правильный — зелёный, неверный — «мигает».
   ════════════════════════════════════════════════════════════════════════ */
const MATCH_ANSWERS = ['a', 'b', 'c'];        // эталонные ответы по вопросам
let matchSolved = [false, false, false];

function pickMatch(btn, qIdx, answer) {
  if (matchSolved[qIdx]) return;
  if (answer === MATCH_ANSWERS[qIdx]) {
    btn.classList.add('correct-pick');
    matchSolved[qIdx] = true;
    const q = btn.closest('.match-question');
    q.classList.add('solved');
    q.querySelectorAll('.match-btn').forEach(b => b.disabled = true);
    if (matchSolved.every(Boolean)) {
      const fb = document.getElementById('match-feedback');
      if (fb) { fb.className = 'feedback-box show correct'; fb.innerHTML = '<strong>Верно!</strong>'; }
    }
  } else {
    btn.classList.add('wrong-pick');
    setTimeout(() => btn.classList.remove('wrong-pick'), 600);
  }
}


/* ════════════════════════════════════════════════════════════════════════
   10. ПОШАГОВАЯ ВИДЕОВИКТОРИНА
   N шагов (.video-quiz-step), показываем по одному. На верный ответ —
   показываем обратную связь и кнопку «Далее» (НЕ автопереход), чтобы
   пользователь успел прочитать фидбэк. Кнопка вызывает nextVideoStep().
   Разметка кнопки: <button id="vq-next-<i>" class="vq-next" onclick="nextVideoStep()">
   ════════════════════════════════════════════════════════════════════════ */
let videoStep = 0;
const VIDEO_ANSWERS = ['b', 'b', 'a'];
const VIDEO_FEEDBACK = [
  'Верно — деталь становится полезной, когда её удаётся заметить и назвать.',
  'Верно — свежий взгляд нужен ещё до того, как черновик станет «идеальным».',
  'Верно — маленькое действие помогает идее перейти из заметки в опыт.',
];

function initVideoQuiz() {
  videoStep = 0;
  document.querySelectorAll('.answer-btn').forEach(b => { b.disabled = false; b.classList.remove('correct', 'wrong'); });
  document.querySelectorAll('.vq-feedback').forEach(f => { f.classList.remove('show'); f.textContent = ''; });
  document.querySelectorAll('.vq-next').forEach(b => b.style.display = 'none');
  showVideoStep(0);
}
function showVideoStep(n) {
  document.querySelectorAll('.video-quiz-step').forEach((el, i) => el.classList.toggle('active', i === n));
  if (n >= VIDEO_ANSWERS.length) document.getElementById('video-quiz-done')?.classList.remove('hidden');
}
function answerVideo(btn, stepIdx, answer) {
  if (btn.classList.contains('correct')) return;
  if (answer === VIDEO_ANSWERS[stepIdx]) {
    btn.classList.add('correct');
    btn.closest('.answer-choices').querySelectorAll('.answer-btn').forEach(b => b.disabled = true);
    const fb = document.getElementById('vq-fb-' + stepIdx);
    if (fb) { fb.textContent = VIDEO_FEEDBACK[stepIdx]; fb.classList.add('show'); }
    document.getElementById('vq-next-' + stepIdx)?.style.setProperty('display', 'inline-flex'); // кнопка «Далее»
  } else {
    btn.classList.add('wrong');
    setTimeout(() => btn.classList.remove('wrong'), 600);
  }
}
function nextVideoStep() {
  videoStep++;
  showVideoStep(videoStep);
  (document.querySelector('.video-quiz-step.active') || document.getElementById('video-quiz-done'))
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ════════════════════════════════════════════════════════════════════════
   11. МОДАЛЬНОЕ ОКНО
   Контент окна задаём данными по ключу. Открытие/закрытие — класс .open.
   Разметка: оверлей #modal-overlay > .modal (с stopPropagation на клике).
   ════════════════════════════════════════════════════════════════════════ */
const MODAL_DATA = {
  spark: { title: 'Случайная мысль', text: 'Случайные идеи любят собираться в маленькие действия: заметить, выбрать, попробовать и обсудить.' },
  compass: { title: 'Точка внимания', text: 'Здесь могла быть важная деталь. Откройте карточку, чтобы увидеть короткий пример и продолжить маршрут.' },
  pulse: { title: 'Небольшой импульс', text: 'Пара фраз, немного воображения и готовность нажать на следующую кнопку — этого достаточно для учебного эксперимента.' },
};
function openModal(key) {
  const d = MODAL_DATA[key]; if (!d) return;
  document.getElementById('modal-title').textContent = d.title;
  document.getElementById('modal-text').textContent = d.text;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay')?.classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); }); // Esc


/* ════════════════════════════════════════════════════════════════════════
   ИНТЕРАКТИВЫ КУРСА ITPH
   ════════════════════════════════════════════════════════════════════════ */
function updateTestGates() {
  document.querySelectorAll('[data-requires-test]').forEach(btn => {
    const passed = completedTests.has(btn.dataset.requiresTest);
    btn.disabled = false;
    btn.setAttribute('aria-disabled', String(!passed));
    btn.title = passed ? '' : 'Сначала выбери вариант ответа в тесте выше';
  });
}

function showTestReminder(testName) {
  const hint = document.getElementById('test-reminder-' + testName);
  if (!hint) return;
  hint.hidden = false;
  hint.textContent = 'Сначала пройди тест выше.';
  hint.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const TEST_BY_FEEDBACK = {
  'calc-feedback': 'calc',
  'control-feedback': 'control',
};

const FIRST_ATTEMPT_HINTS = {
  'calc-feedback': 'Вспомни формулу: количество блюд нужно разделить на часы сотрудников.',
  'control-feedback': 'Сначала определи, на каком этапе замедлился поток Гостей.',
  'case-feedback-1': 'Сравни несколько часов и учти ожидаемый поток Гостей.',
  'case-feedback-2': 'Сначала найди западающую зону, затем выбирай действие.',
  'case-feedback-3': 'Начни с конкретной причины недовольства Гостя.',
};

function completeTest(testName) {
  if (!testName || completedTests.has(testName)) return;
  completedTests.add(testName);
  document.getElementById('test-reminder-' + testName)?.setAttribute('hidden', '');
  updateTestGates();
  saveProgress();
}

function answerChoice(btn, isCorrect, feedbackId) {
  const group = btn.parentElement;
  const feedback = document.getElementById(feedbackId);
  if (!feedback || btn.disabled) return false;
  const attempts = Number(group.dataset.attempts || 0);
  if (isCorrect) {
    completeTest(TEST_BY_FEEDBACK[feedbackId]);
    btn.classList.add('correct-choice');
    group.querySelectorAll('button').forEach(item => { item.disabled = true; });
    feedback.className = 'feedback-box show correct';
    feedback.innerHTML = '<strong>Верно.</strong> ' + (btn.dataset.success || 'Ты выбрал действие, которое связано с причиной отклонения.');
    return true;
  }

  group.dataset.attempts = String(attempts + 1);
  btn.classList.add('wrong-choice');
  if (attempts === 0) {
    feedback.className = 'feedback-box show incorrect';
    feedback.innerHTML = '<strong>Попробуй ещё раз.</strong> ' + (FIRST_ATTEMPT_HINTS[feedbackId] || 'Сопоставь показатель с ситуацией на смене.');
    setTimeout(() => btn.classList.remove('wrong-choice'), 700);
    return false;
  } else {
    const correctBtn = [...group.querySelectorAll('button')].find(item => item.getAttribute('onclick')?.includes(', true,'));
    const correctReason = (correctBtn?.dataset.success || 'Этот вариант помогает устранить причину ситуации.').replace(/^Верно[.:]?\s*/i, '');
    correctBtn?.classList.add('correct-choice');
    group.querySelectorAll('button').forEach(item => { item.disabled = true; });
    completeTest(TEST_BY_FEEDBACK[feedbackId]);
    feedback.className = 'feedback-box show incorrect';
    feedback.innerHTML = '<strong>Разбор ответа.</strong> ' + (btn.dataset.feedback || 'Этот вариант не устраняет причину ситуации.') +
      '<br><strong>Верный ответ: «' + (correctBtn?.textContent.trim() || '') + '».</strong> ' + correctReason;
    return true;
  }
}

function showPattern(btn, type) {
  viewedPatterns.add(type);
  document.getElementById('gate-reminder-meaning')?.setAttribute('hidden', '');
  document.querySelectorAll('.pattern-grid button').forEach(item => item.classList.toggle('active', item === btn));
  const feedback = document.getElementById('pattern-feedback');
  if (!feedback) return;
  feedback.innerHTML = type === 'low'
    ? '<strong>18 мая:</strong> ITPH был ниже цели, но отсутствие негативных отзывов не делает заниженный показатель хорошим результатом: нужно придерживаться цели. Проверь часовую динамику: это первый час или повторяющееся отклонение, которое нужно передать для корректировки расписания.'
    : '<strong>20 мая:</strong> ITPH был выше цели шесть часов подряд и совпал с 16 негативными отзывами. Проверь скорость обслуживания, работу на станциях и конкретные отзывы, чтобы подтвердить причину.';
}

function toggleFlag(btn) {
  const isOpen = btn.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
  const cue = btn.querySelector('.interaction-cue');
  if (cue) cue.textContent = isOpen ? 'Свернуть −' : 'Что проверить +';
  openedFlags.add([...document.querySelectorAll('.flag-grid button')].indexOf(btn));
  if (openedFlags.size === 4) document.getElementById('gate-reminder-control')?.setAttribute('hidden', '');
}


const ACTIONS = {
  high: {
    title: 'Команда перегружена',
    tag: 'Риск скорости и качества',
    steps: [
      'Пойми причину: это резкий наплыв, сместился пик или высокий ITPH держится уже несколько часов.',
      'Возьми 2–5 минут для наблюдения: определи западающую зону по скорости обслуживания и работе сотрудников.',
      'Пересмотри расстановку: усиль западающую зону опытным сотрудником или перераспредели сотрудников по 4Н.',
      'При длительной перегрузке попроси сотрудника выйти раньше, договорись о выходе в выходной или попроси помощь у соседнего ресторана.',
    ],
  },
  low: {
    title: 'Ресурс команды выше потока',
    tag: 'Риск лишних часов сотрудников',
    steps: [
      'Сначала пойми: это первый час ниже цели или сегодня действительно мало Гостей.',
      'Проверь часовую динамику. Если это разовый час, используй время на перерывы по расписанию, подготовку к пику и чистоту.',
      'Если отклонение повторяется, оцени, как скорректировать количество сотрудников без ущерба следующему управляющему сменой.',
      'При повторении отпусти сотрудника домой, выведи кого-то позже или перенаправь сотрудника в другой ресторан — без ущерба следующему управляющему сменой.',
    ],
  },
  quality: {
    title: 'Отзывы падают при нормальном ITPH',
    tag: 'Сначала найди причину',
    steps: [
      'Сначала проанализируй конкретный отзыв: что именно не устроило Гостя.',
      'Понаблюдай за приготовлением, сборкой, выдачей заказа и общением с Гостем.',
      'Найди корневую причину недовольства: действие сотрудника, нарушение стандарта или конкретный этап процесса.',
      'Исправь причину, дай точечную обратную связь сотруднику и проверь, изменился ли результат.',
    ],
  },
};

function renderAction(key) {
  const panel = document.getElementById('action-panel');
  const action = ACTIONS[key];
  if (!panel || !action) return;
  panel.innerHTML = '<div class="action-panel-header"><h2>' + action.title + '</h2><span class="action-panel-tag">' + action.tag + '</span></div>' +
    '<div class="action-steps">' + action.steps.map((step, idx) => '<div><span>' + (idx + 1) + '</span><p>' + step + '</p></div>').join('') + '</div>';
}

function selectAction(btn, key) {
  viewedActions.add(key);
  if (viewedActions.size === 3) document.getElementById('gate-reminder-actions')?.setAttribute('hidden', '');
  document.querySelectorAll('.action-tabs button').forEach(item => {
    const active = item === btn;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  renderAction(key);
}

function flipMistake(btn) {
  const isFlipped = btn.classList.toggle('flipped');
  btn.setAttribute('aria-expanded', String(isFlipped));
  openedMistakes.add([...document.querySelectorAll('.flip-card')].indexOf(btn));
  if (openedMistakes.size === 3) document.getElementById('gate-reminder-mistakes')?.setAttribute('hidden', '');
}

const practiceSolved = new Set();

function answerCase(btn, isCorrect, feedbackId) {
  const completed = answerChoice(btn, isCorrect, feedbackId);
  if (!completed) return;
  practiceSolved.add(feedbackId);
  const result = document.getElementById('practice-result');
  if (!result) return;
  const done = practiceSolved.size;
  const message = done === 3
    ? 'Готово: ты различаешь перегрузку, недогрузку и проблему процесса.'
    : 'Осталось разобрать кейсов: ' + (3 - done) + '.';
  result.innerHTML = '<span>' + done + ' / 3</span><p>' + message + '</p>';
  if (done === 3) completeTest('practice');
}

function openScreenshot(button) {
  const source = button.querySelector('img');
  const dialog = document.getElementById('screenshot-dialog');
  const image = document.getElementById('screenshot-dialog-image');
  if (!source || !dialog || !image) return;
  image.src = source.currentSrc || source.src;
  image.alt = source.alt;
  dialog.showModal();
}

function closeScreenshot(event) {
  const dialog = document.getElementById('screenshot-dialog');
  if (!dialog) return;
  if (event && event.target !== dialog) return;
  dialog.close();
}


/* ════════════════════════════════════════════════════════════════════════
   12. УТИЛИТЫ
   ════════════════════════════════════════════════════════════════════════ */
// Сравнение двух массивов как множеств (порядок не важен)
function setEq(a, b) { return a.length === b.length && a.every(v => b.includes(v)); }

// Перемешать детей контейнера (напр. чтобы чипы не шли заранее сгруппированы)
function shuffleChildren(el) {
  if (!el) return;
  const kids = [...el.children];
  for (let i = kids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kids[i], kids[j]] = [kids[j], kids[i]]; }
  kids.forEach(k => el.appendChild(k));
}

// Вернуть все чипы из зон обратно в пул и перемешать (сброс drag-упражнения)
function resetZonePool(poolId, ...zoneIds) {
  const pool = document.getElementById(poolId);
  if (!pool) return;
  zoneIds.forEach(z => { const el = document.getElementById(z); if (el) [...el.querySelectorAll('.drag-chip')].forEach(c => pool.appendChild(c)); });
  shuffleChildren(pool);
}

/* Финальный шаг курса. Явно отправляем SCORM 1.2-статус passed и сохраняем
   локальный флаг, чтобы результат был виден и при локальном открытии. */
function completeCourse() {
  try { localStorage.setItem(PROGRESS_KEY + '_completed', 'passed'); } catch (e) {}
  unlockedChapters = CHAPTER_ORDER.length;
  saveProgress();
  applyHomeLocks();
  if (window.SCORM && typeof SCORM.complete === 'function') {
    SCORM.complete();
  } else if (window.SCORM && typeof SCORM.set === 'function') {
    SCORM.set('cmi.core.lesson_status', 'passed');
    if (typeof SCORM.commit === 'function') SCORM.commit();
  }
  document.getElementById('completion-panel')?.classList.add('show');
  // В LMS курс обычно открыт отдельным окном. Статус уже отправлен выше,
  // поэтому после завершения закрываем это окно. Если браузер запрещает
  // закрытие (например, при локальном открытии), остаётся сообщение о завершении.
  setTimeout(() => {
    try { window.close(); } catch (e) {}
  }, 150);
}


/* ════════════════════════════════════════════════════════════════════════
   13. ИНИЦИАЛИЗАЦИЯ
   navigateTo('home') — на DOMContentLoaded (DOM готов).
   loadProgress()     — на 'load', потому что SCORM API LMS инициализируется
                        именно тогда (см. scorm_api.js из scorm_pack.py).
   ════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  navigateTo('home');
  applyHomeLocks();
  updateTestGates();
  renderAction('quality');
});
window.addEventListener('load', loadProgress);

// Visible action labels supplement hover states on touch screens.
document.querySelectorAll('.flag-grid button, .pattern-grid button').forEach(btn => {
  const cue = document.createElement('span');
  cue.className = 'interaction-cue';
  cue.textContent = btn.closest('.flag-grid') ? 'Что проверить +' : 'Открыть разбор →';
  btn.appendChild(cue);
});
