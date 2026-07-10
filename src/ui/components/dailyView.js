import {
  addDailyJournal,
  updateDailyJournal,
  deleteDailyJournal,
  shareDailyJournalToFeed,
  addHabit,
  updateHabit,
  setHabitArchived,
  moveHabit,
  toggleHabitLog,
  triggerWeeklyReviewNow,
  getState
} from '../../state/store.js';
import { createIcon } from '../icons.js';
import { confirmDialog } from '../dialog.js';
import { showToast } from '../toast.js';
import { buildAnniversarySection, buildWishlistSection } from './characterPage.js';

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
  const actions = document.createElement('div');
  actions.className = 'daily-head-actions';
  const reviewBtn = buildWeeklyReviewButton(state);
  if (reviewBtn) actions.appendChild(reviewBtn);
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'btn btn-primary';
  action.textContent = '寫一則拾日';
  action.addEventListener('click', () => openDailyEditor({ entryDate: selectedDate }));
  actions.appendChild(action);
  head.appendChild(title);
  head.appendChild(actions);
  page.appendChild(head);

  page.appendChild(buildCalendar(state));
  page.appendChild(buildDayPanel(state));
  container.appendChild(page);
}

// 手動鈕「讓 TA 現在回顧這週」：僅 weeklyReviewEnabled 且已選角色時顯示。
function buildWeeklyReviewButton(state) {
  if (!state.settings || state.settings.weeklyReviewEnabled !== true) return null;
  if (!state.settings.weeklyReviewCharacterId) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = '讓 TA 現在回顧這週';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const item = await triggerWeeklyReviewNow();
      if (item) showToast('週回顧聲箋已送達');
    } catch (err) {
      showToast((err && err.userMessage) || (err && err.message) || '產生失敗');
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
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
  const habitDates = habitCheckedDates(state);
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
    if (habitDates.has(key)) {
      const habitDot = document.createElement('i');
      habitDot.className = 'daily-habit-dot';
      habitDot.title = '日課';
      marks.appendChild(habitDot);
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

  panel.appendChild(buildHabitBar(state));

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
  panel.appendChild(buildDayAgenda(state));
  panel.appendChild(buildUpcomingTimeline(state));
  return panel;
}

function buildDayAgenda(state) {
  const section = document.createElement('section');
  section.className = 'daily-agenda';
  const title = document.createElement('h3');
  title.className = 'daily-section-title';
  title.textContent = '當天內容';
  section.appendChild(title);

  const list = document.createElement('div');
  list.className = 'washi-list daily-agenda-list';
  const rows = timelineItems(state)
    .filter((item) => item.date === selectedDate)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'daily-inline-empty';
    empty.textContent = '這一天沒有節拍或約定。';
    list.appendChild(empty);
  } else {
    rows.forEach((item, index) => list.appendChild(timelineRow(item, index, selectedDate)));
  }
  section.appendChild(list);
  return section;
}

function buildUpcomingTimeline(state) {
  const section = document.createElement('section');
  section.className = 'daily-timeline';
  const title = document.createElement('h3');
  title.className = 'daily-section-title';
  title.textContent = '接下來';
  section.appendChild(title);

  const groups = groupTimeline(timelineItems(state));
  let hasAny = false;
  for (const group of groups) {
    if (!group.items.length) continue;
    hasAny = true;
    const groupTitle = document.createElement('div');
    groupTitle.className = 'washi-eyebrow daily-timeline-group';
    groupTitle.textContent = group.label;
    section.appendChild(groupTitle);
    const list = document.createElement('div');
    list.className = 'washi-list daily-timeline-list';
    group.items.forEach((item, index) => list.appendChild(timelineRow(item, index, group.label)));
    section.appendChild(list);
  }
  if (!hasAny) {
    const empty = document.createElement('div');
    empty.className = 'daily-inline-empty';
    empty.textContent = '目前沒有接下來的節拍或約定。';
    section.appendChild(empty);
  }
  return section;
}

function timelineItems(state) {
  const characters = state.characters || [];
  const items = [];
  for (const beat of state.anniversaries || []) {
    if (!beat || !beat.date) continue;
    const character = characters.find((c) => c.id === beat.characterId);
    if (!character) continue;
    const date = nextBeatDateKey(beat, localDateKey(Date.now()));
    if (!date) continue;
    items.push({
      type: 'beat',
      title: beat.title || '節拍',
      date,
      character,
      item: beat
    });
  }
  for (const wish of state.wishlists || []) {
    if (!wish || wish.done) continue;
    const character = characters.find((c) => c.id === wish.characterId);
    if (!character) continue;
    items.push({
      type: 'wish',
      title: wish.title || '未命名約定',
      date: wish.date || null,
      character,
      item: wish
    });
  }
  return items;
}

function groupTimeline(items) {
  const today = localDateKey(Date.now());
  const tomorrow = addDays(today, 1);
  const seven = addDays(today, 7);
  const groups = [
    { key: 'today', label: '今天', items: [] },
    { key: 'tomorrow', label: '明天', items: [] },
    { key: 'week', label: '七天內', items: [] },
    { key: 'later', label: '之後', items: [] },
    { key: 'unset', label: '未定', items: [] }
  ];
  for (const item of items) {
    if (!item.date) groups[4].items.push(item);
    else if (item.date === today) groups[0].items.push(item);
    else if (item.date === tomorrow) groups[1].items.push(item);
    else if (item.date > today && item.date <= seven) groups[2].items.push(item);
    else if (item.date > seven) groups[3].items.push(item);
  }
  groups.forEach((group) => {
    group.items.sort((a, b) => String(a.date || '9999-99-99').localeCompare(String(b.date || '9999-99-99')) || a.title.localeCompare(b.title));
  });
  return groups;
}

function timelineRow(item, index, groupLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'washi-row daily-timeline-row';
  btn.style.setProperty('--i', String(index));
  btn.addEventListener('click', () => openTimelineEditor(item));
  const body = document.createElement('span');
  body.className = 'washi-row-body';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'washi-eyebrow';
  const kind = item.type === 'beat' ? '節拍' : '約定';
  eyebrow.textContent = `${groupLabel} · ${item.date || '未定'} · ${kind}`;
  const title = document.createElement('span');
  title.className = 'washi-row-main';
  title.textContent = item.title;
  const sub = document.createElement('span');
  sub.className = 'washi-row-sub';
  sub.textContent = item.character.name || '未命名角色';
  body.appendChild(eyebrow);
  body.appendChild(title);
  body.appendChild(sub);
  btn.appendChild(body);
  return btn;
}

function openTimelineEditor(row) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal dashboard-modal';
  const head = document.createElement('div');
  head.className = 'dashboard-modal-head';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = row.type === 'beat' ? '節拍' : '約定';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', '關閉');
  close.title = '關閉';
  close.textContent = '×';
  close.addEventListener('click', () => overlay.remove());
  head.appendChild(title);
  head.appendChild(close);
  modal.appendChild(head);
  const body = document.createElement('div');
  body.className = 'dashboard-modal-body';
  body.appendChild(row.type === 'beat'
    ? buildAnniversarySection(getState(), row.character)
    : buildWishlistSection(getState(), row.character));
  modal.appendChild(body);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ---- 日課打卡列（當日面板頂部）----

function activeHabits(state) {
  return (state.habits || [])
    .filter((h) => h && !h.archived)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function isHabitCheckedOn(state, habitId, dateKey) {
  return (state.habitLogs || []).some((l) => l && l.habitId === habitId && l.entryDate === dateKey);
}

function buildHabitBar(state) {
  const wrap = document.createElement('div');
  wrap.className = 'daily-habit-bar';

  const habits = activeHabits(state);
  const isFuture = selectedDate > localDateKey(Date.now());

  const chips = document.createElement('div');
  chips.className = 'daily-habit-chips';
  if (!habits.length) {
    const empty = document.createElement('span');
    empty.className = 'daily-habit-empty-hint';
    empty.textContent = '還沒有日課，點「管理日課」新增。';
    chips.appendChild(empty);
  }
  for (const habit of habits) {
    const checked = isHabitCheckedOn(state, habit.id, selectedDate);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'daily-habit-chip' + (checked ? ' checked' : '');
    chip.setAttribute('aria-pressed', checked ? 'true' : 'false');
    chip.title = isFuture ? `${habit.name}（未來日期不可打卡）` : habit.name;
    chip.textContent = habit.emoji;
    chip.disabled = isFuture;
    chip.addEventListener('click', () => toggleHabitLog(habit.id, selectedDate));
    chips.appendChild(chip);
  }
  wrap.appendChild(chips);

  const manageBtn = document.createElement('button');
  manageBtn.type = 'button';
  manageBtn.className = 'btn daily-habit-manage-btn';
  manageBtn.textContent = '管理日課';
  manageBtn.addEventListener('click', () => openHabitManager());
  wrap.appendChild(manageBtn);

  return wrap;
}

// 管理日課 modal 是獨立 overlay（掛在 document.body，不在 renderDailyView 的容器內），
// 因此不會隨全域 render 自動更新——每個動作完成後手動 refresh() 重繪 list／新增表單。
function openHabitManager() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal habit-manage-modal';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = '管理日課';
  modal.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'form-hint';
  hint.textContent = '最多 8 個（含封存）；封存不會刪除歷史打卡紀錄。';
  modal.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'habit-manage-list';
  modal.appendChild(list);

  const formHost = document.createElement('div');
  modal.appendChild(formHost);

  function refresh() {
    const habits = (getState().habits || []);
    renderHabitManageList(list, habits, refresh);
    formHost.textContent = '';
    if (habits.length < 8) formHost.appendChild(buildHabitAddForm(refresh));
  }
  refresh();

  const close = document.createElement('div');
  close.className = 'form-actions';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-primary';
  closeBtn.textContent = '完成';
  closeBtn.addEventListener('click', () => overlay.remove());
  close.appendChild(closeBtn);
  modal.appendChild(close);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function renderHabitManageList(list, habits, refresh) {
  list.textContent = '';
  const sorted = habits.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = '還沒有日課。';
    list.appendChild(empty);
    return;
  }
  sorted.forEach((habit, idx) => {
    list.appendChild(buildHabitManageRow(habit, idx, sorted.length, refresh));
  });
}

function buildHabitManageRow(habit, idx, total, refresh) {
  const row = document.createElement('div');
  row.className = 'habit-manage-row' + (habit.archived ? ' archived' : '');

  const emoji = document.createElement('span');
  emoji.className = 'habit-manage-emoji';
  emoji.textContent = habit.emoji;
  row.appendChild(emoji);

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-control habit-manage-name-input';
  nameInput.maxLength = 6;
  nameInput.value = habit.name || '';
  nameInput.addEventListener('change', async () => {
    const value = nameInput.value.trim();
    if (!value) {
      nameInput.value = habit.name || '';
      return;
    }
    await updateHabit(habit.id, { name: value });
    refresh();
  });
  row.appendChild(nameInput);

  const upBtn = habitIconBtn('▲', '上移', idx === 0, async () => { await moveHabit(habit.id, -1); refresh(); });
  const downBtn = habitIconBtn('▼', '下移', idx === total - 1, async () => { await moveHabit(habit.id, 1); refresh(); });
  row.appendChild(upBtn);
  row.appendChild(downBtn);

  const archiveBtn = document.createElement('button');
  archiveBtn.type = 'button';
  archiveBtn.className = 'btn';
  archiveBtn.textContent = habit.archived ? '取消封存' : '封存';
  archiveBtn.addEventListener('click', async () => { await setHabitArchived(habit.id, !habit.archived); refresh(); });
  row.appendChild(archiveBtn);

  return row;
}

function habitIconBtn(text, title, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gp-icon-btn';
  b.textContent = text;
  b.title = title;
  b.disabled = disabled;
  if (!disabled) b.addEventListener('click', onClick);
  return b;
}

function buildHabitAddForm(refresh) {
  const form = document.createElement('form');
  form.className = 'habit-manage-form';

  const emojiInput = document.createElement('input');
  emojiInput.type = 'text';
  emojiInput.className = 'form-control habit-emoji-input';
  emojiInput.placeholder = '🙂';
  emojiInput.maxLength = 4;
  form.appendChild(wrapField('emoji', emojiInput));

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-control habit-manage-name-input';
  nameInput.placeholder = '名字（最多 6 字）';
  nameInput.maxLength = 6;
  form.appendChild(wrapField('名字', nameInput));

  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '新增日課';
  form.appendChild(addBtn);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const habit = await addHabit({ emoji: emojiInput.value, name: nameInput.value });
    if (habit) refresh();
  });

  return form;
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

// 有日課打卡（任一習慣、完成數 ≥1）的日期集合，供月曆低調記號使用。
function habitCheckedDates(state) {
  const set = new Set();
  for (const log of state.habitLogs || []) {
    if (log && log.entryDate) set.add(log.entryDate);
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

function addDays(key, days) {
  const d = parseLocalDate(key);
  d.setDate(d.getDate() + days);
  return localDateKey(d.getTime());
}

function nextBeatDateKey(beat, fromKey) {
  const base = parseLocalDate(beat.date);
  if (!Number.isFinite(base.getTime())) return null;
  const from = parseLocalDate(fromKey);
  if (beat.repeat === 'yearly') {
    let next = new Date(from.getFullYear(), base.getMonth(), base.getDate());
    if (next < from) next = new Date(from.getFullYear() + 1, base.getMonth(), base.getDate());
    return localDateKey(next.getTime());
  }
  if (beat.repeat === 'monthly') {
    let next = new Date(from.getFullYear(), from.getMonth(), base.getDate());
    if (next < from) next = new Date(from.getFullYear(), from.getMonth() + 1, base.getDate());
    return localDateKey(next.getTime());
  }
  const once = localDateKey(base.getTime());
  return once >= fromKey ? once : null;
}
