import {
  addDailyJournal,
  updateDailyJournal,
  deleteDailyJournal,
  shareDailyJournalToFeed
} from '../../state/store.js';
import { createIcon } from '../icons.js';
import { confirmDialog } from '../dialog.js';

let visibleMonth = null;
let selectedDate = localDateKey(Date.now());

const MOOD_LABELS = {
  1: '很低落',
  2: '有點沉',
  3: '普通',
  4: '還不錯',
  5: '很好'
};

export function renderDailyView(container, state) {
  container.textContent = '';
  if (!visibleMonth) {
    const d = parseLocalDate(selectedDate);
    visibleMonth = { year: d.getFullYear(), month: d.getMonth() };
  }

  const page = document.createElement('main');
  page.className = 'daily-page';

  const head = document.createElement('div');
  head.className = 'daily-head';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '日常';
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'btn btn-primary';
  action.textContent = '寫一則拾日';
  action.addEventListener('click', () => openDailyEditor({ entryDate: selectedDate }));
  head.appendChild(title);
  head.appendChild(action);
  page.appendChild(head);

  page.appendChild(buildCalendar(state));
  page.appendChild(buildDayPanel(state));
  container.appendChild(page);
}

function buildCalendar(state) {
  const wrap = document.createElement('section');
  wrap.className = 'daily-calendar';

  const nav = document.createElement('div');
  nav.className = 'daily-month-nav';
  const prev = monthButton('left', '上一個月', () => shiftMonth(-1));
  const next = monthButton('right', '下一個月', () => shiftMonth(1));
  const label = document.createElement('div');
  label.className = 'daily-month-label';
  label.textContent = `${visibleMonth.year}年${visibleMonth.month + 1}月`;
  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);
  wrap.appendChild(nav);

  const grid = document.createElement('div');
  grid.className = 'daily-calendar-grid';
  for (const weekday of ['日', '一', '二', '三', '四', '五', '六']) {
    const cell = document.createElement('div');
    cell.className = 'daily-weekday';
    cell.textContent = weekday;
    grid.appendChild(cell);
  }

  const first = new Date(visibleMonth.year, visibleMonth.month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const today = localDateKey(Date.now());
  const journalsByDate = groupPlayerJournals(state);
  const beatDates = monthBeatDates(state);
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = localDateKey(date.getTime());
    const inMonth = date.getMonth() === visibleMonth.month;
    const entries = journalsByDate.get(key) || [];
    const latest = entries[0] || null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [
      'daily-day',
      inMonth ? '' : 'muted',
      key === today ? 'today' : '',
      key === selectedDate ? 'selected' : ''
    ].filter(Boolean).join(' ');
    btn.addEventListener('click', () => {
      selectedDate = key;
      visibleMonth = { year: date.getFullYear(), month: date.getMonth() };
      window.dispatchEvent(new Event('resize'));
    });
    const num = document.createElement('span');
    num.className = 'daily-day-number';
    num.textContent = String(date.getDate());
    btn.appendChild(num);
    const marks = document.createElement('span');
    marks.className = 'daily-day-marks';
    if (entries.length) {
      const dot = document.createElement('i');
      dot.className = `daily-mood-dot mood-${latest && latest.moodLevel ? latest.moodLevel : 'none'}`;
      dot.title = latest && latest.moodLevel ? MOOD_LABELS[latest.moodLevel] : '拾日';
      marks.appendChild(dot);
    }
    if (beatDates.has(key)) {
      const beat = document.createElement('i');
      beat.className = 'daily-beat-dot';
      beat.title = '節拍';
      marks.appendChild(beat);
    }
    btn.appendChild(marks);
    grid.appendChild(btn);
  }
  wrap.appendChild(grid);
  return wrap;
}

function buildDayPanel(state) {
  const panel = document.createElement('section');
  panel.className = 'daily-panel';
  const head = document.createElement('div');
  head.className = 'daily-panel-head';
  const title = document.createElement('h2');
  title.textContent = formatDayTitle(selectedDate);
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.textContent = '寫一則拾日';
  add.addEventListener('click', () => openDailyEditor({ entryDate: selectedDate }));
  head.appendChild(title);
  head.appendChild(add);
  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'daily-entry-list';
  const entries = playerJournals(state).filter((j) => j.entryDate === selectedDate);
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'daily-empty';
    empty.textContent = '這一天還沒有拾日。';
    list.appendChild(empty);
  }
  for (const item of entries) list.appendChild(buildEntry(item));
  panel.appendChild(list);
  return panel;
}

function buildEntry(item) {
  const article = document.createElement('article');
  article.className = 'daily-entry';
  const meta = document.createElement('div');
  meta.className = 'daily-entry-meta';
  const mood = document.createElement('span');
  mood.className = `daily-entry-mood mood-${item.moodLevel || 'none'}`;
  mood.textContent = item.moodLevel ? `${item.moodLevel}/5 ${item.mood || MOOD_LABELS[item.moodLevel]}` : (item.mood || '未選心情');
  const share = document.createElement('span');
  share.textContent = item.share === 'aware' ? '讓 TA 們知道' : '私密';
  meta.appendChild(mood);
  meta.appendChild(share);
  article.appendChild(meta);

  const content = document.createElement('div');
  content.className = 'daily-entry-content';
  content.textContent = item.content || '';
  article.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'daily-entry-actions';
  const edit = button('編輯', () => openDailyEditor({ item }));
  const shareBtn = button(item.sharedPostId ? '已分享' : '分享到迴聲', async () => {
    if (item.sharedPostId) return;
    shareBtn.disabled = true;
    await shareDailyJournalToFeed(item.id);
  });
  shareBtn.disabled = !!item.sharedPostId;
  const del = button('刪除', async () => {
    const ok = await confirmDialog({
      title: '刪除拾日',
      message: '要刪除這則拾日嗎？已分享到迴聲的貼文會保留。',
      confirmText: '刪除',
      danger: true
    });
    if (ok) await deleteDailyJournal(item.id);
  }, 'btn btn-danger');
  actions.appendChild(edit);
  actions.appendChild(shareBtn);
  actions.appendChild(del);
  article.appendChild(actions);
  return article;
}

function openDailyEditor({ item = null, entryDate = selectedDate } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal daily-modal';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = item ? '編輯拾日' : '寫一則拾日';
  modal.appendChild(title);

  const form = document.createElement('form');
  form.className = 'daily-form';
  const date = document.createElement('input');
  date.type = 'date';
  date.className = 'form-control';
  date.value = item ? item.entryDate : entryDate;
  form.appendChild(wrapField('日期', date));

  const content = document.createElement('textarea');
  content.className = 'form-control';
  content.rows = 7;
  content.required = true;
  content.value = item ? item.content || '' : '';
  form.appendChild(wrapField('內容', content));

  const moodLevel = document.createElement('div');
  moodLevel.className = 'daily-mood-picker';
  let selectedMood = item && item.moodLevel ? item.moodLevel : null;
  for (const level of [1, 2, 3, 4, 5]) {
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'daily-mood-choice';
    pick.textContent = `${level}`;
    pick.title = MOOD_LABELS[level];
    pick.setAttribute('aria-pressed', selectedMood === level ? 'true' : 'false');
    pick.addEventListener('click', () => {
      selectedMood = selectedMood === level ? null : level;
      moodLevel.querySelectorAll('.daily-mood-choice').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn === pick && selectedMood === level ? 'true' : 'false');
      });
    });
    moodLevel.appendChild(pick);
  }
  form.appendChild(wrapField('心情刻度', moodLevel));

  const mood = document.createElement('input');
  mood.type = 'text';
  mood.className = 'form-control';
  mood.maxLength = 8;
  mood.placeholder = '最多 8 字';
  mood.value = item ? item.mood || '' : '';
  form.appendChild(wrapField('心情短語', mood));

  const aware = document.createElement('label');
  aware.className = 'form-field form-check';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = item ? item.share === 'aware' : false;
  const toggleText = document.createElement('span');
  toggleText.className = 'form-check-label';
  toggleText.textContent = '讓 TA 們知道';
  aware.appendChild(toggle);
  aware.appendChild(toggleText);
  form.appendChild(aware);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => overlay.remove());
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-primary';
  save.textContent = '儲存';
  actions.appendChild(cancel);
  actions.appendChild(save);
  form.appendChild(actions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      entryDate: date.value,
      content: content.value,
      moodLevel: selectedMood,
      mood: mood.value,
      share: toggle.checked ? 'aware' : 'private'
    };
    if (item) await updateDailyJournal(item.id, payload);
    else await addDailyJournal(payload);
    selectedDate = payload.entryDate || selectedDate;
    overlay.remove();
  });
  modal.appendChild(form);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  content.focus();
}

function groupPlayerJournals(state) {
  const map = new Map();
  for (const item of playerJournals(state)) {
    const key = item.entryDate || localDateKey(item.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function playerJournals(state) {
  return (state.journals || [])
    .filter((j) => j && j.ownerType === 'player')
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

function monthBeatDates(state) {
  const set = new Set();
  const start = new Date(visibleMonth.year, visibleMonth.month, 1);
  const end = new Date(visibleMonth.year, visibleMonth.month + 1, 0);
  for (const beat of state.anniversaries || []) {
    if (!beat || !beat.date) continue;
    for (let day = 1; day <= end.getDate(); day += 1) {
      const d = new Date(visibleMonth.year, visibleMonth.month, day);
      if (isBeatOnDate(beat, d, start, end)) set.add(localDateKey(d.getTime()));
    }
  }
  return set;
}

function isBeatOnDate(beat, date) {
  const parts = String(beat.date || '').split('-').map((x) => Number(x));
  if (parts.length !== 3) return false;
  if (beat.repeat === 'yearly') return date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
  if (beat.repeat === 'monthly') return date.getDate() === parts[2];
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}

function monthButton(icon, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.appendChild(createIcon(icon, { size: 20 }));
  btn.addEventListener('click', onClick);
  return btn;
}

function shiftMonth(delta) {
  const next = new Date(visibleMonth.year, visibleMonth.month + delta, 1);
  visibleMonth = { year: next.getFullYear(), month: next.getMonth() };
  window.dispatchEvent(new Event('resize'));
}

function button(label, onClick, className = 'btn') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function wrapField(label, control) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const span = document.createElement('span');
  span.className = 'form-label';
  span.textContent = label;
  el.appendChild(span);
  el.appendChild(control);
  return el;
}

function formatDayTitle(key) {
  const d = parseLocalDate(key);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
}

function parseLocalDate(value) {
  const parts = String(value || '').split('-').map((x) => Number(x));
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function localDateKey(ts) {
  const d = new Date(ts || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
