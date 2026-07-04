// src/ui/components/homeView.js
//
// 首頁主控台（#/home，V2 任務二）：
//   2.1 角色卡片牆（頭貼 / 名字 / 簡介 / 相識天數 / 最後對話時間 / 最後一句摘要）
//   2.2 Token 消耗統計（今日 / 本月 / 累計 + 每角色）
//   2.3 個人日記（快速輸入 + 最近 5 篇，可編輯 / 刪除）
//   2.4 備份提醒（從未備份或距上次超過 14 天）

import { addJournal, updateJournal, deleteJournal } from '../../state/store.js';
import { getStats } from '../../services/statsService.js';
import { createAvatarEl } from '../avatar.js';
import { navigate } from '../router.js';
import { setSettingsTab } from './settingsPage.js';
import { openCharacterCreator } from './characterEditor.js';
import { parseDateInput } from '../../utils/time.js';

const DAY_MS = 86400000;
const BACKUP_REMIND_DAYS = 14;
const ANNIVERSARY_REMIND_DAYS = 3;

export function renderHomeView(container, state) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'home-page';

  // 2.4 備份提醒條（置頂）
  const reminder = buildBackupReminder(state);
  if (reminder) page.appendChild(reminder);

  // V3：紀念日提醒（3 天內含當天）
  const annivReminders = buildAnniversaryReminders(state);
  if (annivReminders) page.appendChild(annivReminders);

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '主控台';
  page.appendChild(title);

  // 2.1 角色卡片牆
  page.appendChild(sectionTitle('角色'));
  page.appendChild(buildCharacterWall(state));

  // 2.2 Token 統計
  page.appendChild(sectionTitle('Token 消耗統計'));
  const statsBox = document.createElement('div');
  statsBox.className = 'stats-box';
  statsBox.textContent = '載入中…';
  page.appendChild(statsBox);
  fillStats(statsBox, state);

  // 2.3 個人日記
  page.appendChild(sectionTitle('個人日記'));
  page.appendChild(buildJournal(state));

  container.appendChild(page);
}

// ---- 2.4 備份提醒 ----
function buildBackupReminder(state) {
  const last = state.lastBackupAt || 0;
  const never = !last;
  const stale = last && (Date.now() - last > BACKUP_REMIND_DAYS * DAY_MS);
  if (!never && !stale) return null;

  const bar = document.createElement('div');
  bar.className = 'backup-reminder';

  const text = document.createElement('span');
  text.textContent = never
    ? '你還沒有備份過資料。本機資料存在瀏覽器中，清除瀏覽器資料就會消失，建議定期備份。'
    : `距離上次備份已超過 ${BACKUP_REMIND_DAYS} 天，建議再備份一次。`;
  bar.appendChild(text);

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn btn-primary';
  link.textContent = '前往備份';
  link.addEventListener('click', () => { setSettingsTab('data'); navigate('/settings'); });
  bar.appendChild(link);

  return bar;
}

// ---- V3 紀念日提醒 ----
// 對每個紀念日計算「距離下一次發生的天數」，落在 0..3（含當天）時顯示提醒條。
function buildAnniversaryReminders(state) {
  const charById = {};
  for (const c of (state.characters || [])) charById[c.id] = c;

  const hits = [];
  for (const a of (state.anniversaries || [])) {
    const days = daysUntilAnniversary(a.date, a.repeat);
    if (days == null || days > ANNIVERSARY_REMIND_DAYS) continue;
    const char = charById[a.characterId];
    if (!char) continue;
    hits.push({ days, name: char.name || '（角色）', title: a.title || '紀念日', charId: char.id });
  }
  if (hits.length === 0) return null;
  hits.sort((x, y) => x.days - y.days);

  const box = document.createElement('div');
  box.className = 'anniv-reminders';
  for (const h of hits) {
    const bar = document.createElement('button');
    bar.type = 'button';
    bar.className = 'anniv-reminder';
    bar.textContent = h.days === 0
      ? `🎂 今天是與${h.name}的「${h.title}」`
      : `🎂 ${h.days} 天後是與${h.name}的「${h.title}」`;
    bar.title = '前往角色相處頁';
    bar.addEventListener('click', () => navigate(`/character/${h.charId}`));
    box.appendChild(bar);
  }
  return box;
}

// 距離下一次紀念日的天數（本地時區，以「天」為單位）。過去的單次紀念日回傳 null。
function daysUntilAnniversary(dateStr, repeat) {
  const base = parseDateInput(dateStr);
  if (!base) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bd = new Date(base);

  if (repeat === 'yearly') {
    let next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
    if (next < today) next = new Date(today.getFullYear() + 1, bd.getMonth(), bd.getDate());
    return Math.round((next - today) / DAY_MS);
  }
  if (repeat === 'monthly') {
    let next = new Date(today.getFullYear(), today.getMonth(), bd.getDate());
    if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, bd.getDate());
    return Math.round((next - today) / DAY_MS);
  }
  // 單次：只在未來（含今天）時提醒。
  const oneShot = new Date(bd.getFullYear(), bd.getMonth(), bd.getDate());
  const d = Math.round((oneShot - today) / DAY_MS);
  return d < 0 ? null : d;
}

// ---- 2.1 角色卡片牆 ----
function buildCharacterWall(state) {
  const wall = document.createElement('div');
  wall.className = 'card-wall';

  const directConvs = (state.conversations || []).filter((c) => c.type === 'direct');
  // 依角色 createdAt 排序（新到舊）。
  const chars = (state.characters || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  for (const char of chars) {
    const conv = directConvs.find((c) => c.primaryCharacterId === char.id);
    wall.appendChild(buildCharacterCard(char, conv));
  }

  // 「+ 新增角色」卡片
  const addCard = document.createElement('button');
  addCard.type = 'button';
  addCard.className = 'char-card add-card';
  addCard.textContent = '＋ 新增角色';
  addCard.addEventListener('click', () => openCharacterCreator());
  wall.appendChild(addCard);

  return wall;
}

function buildCharacterCard(char, conv) {
  const card = document.createElement('div');
  card.className = 'char-card';

  // 主體：點擊進入聊天
  const main = document.createElement('div');
  main.className = 'char-card-main';
  main.addEventListener('click', () => {
    if (conv) navigate(`/chat/${conv.id}`);
  });

  const avatar = createAvatarEl(char.avatar, 'card-avatar');
  main.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'char-card-info';

  const name = document.createElement('div');
  name.className = 'char-card-name';
  name.textContent = char.name || '未命名角色';
  info.appendChild(name);

  const desc = document.createElement('div');
  desc.className = 'char-card-desc';
  desc.textContent = char.description || '';
  info.appendChild(desc);

  // 相識天數
  const days = Math.max(0, Math.floor((Date.now() - (char.createdAt || Date.now())) / DAY_MS));
  const meta = document.createElement('div');
  meta.className = 'char-card-meta';
  meta.textContent = `相識 ${days} 天`;
  if (conv && conv.lastMessageAt) {
    meta.textContent += `　·　最後對話 ${formatRelative(conv.lastMessageAt)}`;
  }
  info.appendChild(meta);

  // 最後一句摘要（單行截斷，由 stats 非同步填入）
  const snippet = document.createElement('div');
  snippet.className = 'char-card-snippet';
  snippet.dataset.convId = conv ? conv.id : '';
  info.appendChild(snippet);

  main.appendChild(info);
  card.appendChild(main);

  // 「相處紀錄」入口（V3 啟用）→ 角色相處頁。
  const recordBtn = document.createElement('button');
  recordBtn.type = 'button';
  recordBtn.className = 'char-card-record';
  recordBtn.textContent = '相處紀錄 ›';
  recordBtn.title = '相處紀錄與角色設定';
  recordBtn.addEventListener('click', () => navigate(`/character/${char.id}`));
  card.appendChild(recordBtn);

  return card;
}

// ---- 2.2 Token 統計 ----
async function fillStats(box, state) {
  let stats;
  try {
    stats = await getStats(state);
  } catch (e) {
    box.textContent = 'Token 統計讀取失敗';
    return;
  }
  box.textContent = '';

  // 先把角色卡片的「最後一句摘要」補上（同一份 stats）。
  fillCardSnippets(stats);

  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.appendChild(statCard('今日', stats.today));
  grid.appendChild(statCard('本月', stats.month));
  grid.appendChild(statCard('累計', stats.total));
  box.appendChild(grid);

  const note = document.createElement('div');
  note.className = 'form-hint';
  note.textContent = '僅統計真 API 回覆（mock 模擬回覆不計入）。';
  box.appendChild(note);

  // 每角色累計
  const perTitle = document.createElement('div');
  perTitle.className = 'stats-subtitle';
  perTitle.textContent = '每角色累計用量';
  box.appendChild(perTitle);

  const perList = document.createElement('div');
  perList.className = 'stats-per-character';
  const entries = Object.keys(stats.perCharacter || {});
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '尚無真 API 回覆的用量紀錄。';
    perList.appendChild(empty);
  } else {
    for (const charId of entries) {
      const char = (state.characters || []).find((c) => c.id === charId);
      const u = stats.perCharacter[charId];
      const row = document.createElement('div');
      row.className = 'stats-per-row';
      const nm = document.createElement('span');
      nm.className = 'stats-per-name';
      nm.textContent = char ? (char.name || '未命名') : '（已刪除角色）';
      const val = document.createElement('span');
      val.className = 'stats-per-val';
      val.textContent = `↑${u.prompt.toLocaleString()} ↓${u.completion.toLocaleString()}（合計 ${(u.prompt + u.completion).toLocaleString()}）`;
      row.appendChild(nm);
      row.appendChild(val);
      perList.appendChild(row);
    }
  }
  box.appendChild(perList);
}

function fillCardSnippets(stats) {
  const nodes = document.querySelectorAll('.char-card-snippet[data-conv-id]');
  nodes.forEach((node) => {
    const convId = node.dataset.convId;
    const last = convId && stats.lastByConversation ? stats.lastByConversation[convId] : null;
    node.textContent = last && last.snippet ? last.snippet : '還沒有對話';
  });
}

function statCard(label, usage) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const l = document.createElement('div');
  l.className = 'stat-label';
  l.textContent = label;
  const total = (usage.prompt || 0) + (usage.completion || 0);
  const v = document.createElement('div');
  v.className = 'stat-value';
  v.textContent = total.toLocaleString();
  const detail = document.createElement('div');
  detail.className = 'stat-detail';
  detail.textContent = `↑${(usage.prompt || 0).toLocaleString()} ↓${(usage.completion || 0).toLocaleString()}`;
  card.appendChild(l);
  card.appendChild(v);
  card.appendChild(detail);
  return card;
}

// ---- 2.3 個人日記 ----
function buildJournal(state) {
  const box = document.createElement('div');
  box.className = 'journal-box';

  // 快速輸入
  const form = document.createElement('form');
  form.className = 'journal-form';

  const contentInput = document.createElement('textarea');
  contentInput.className = 'form-control';
  contentInput.rows = 2;
  contentInput.placeholder = '今天想記點什麼？';

  const row = document.createElement('div');
  row.className = 'journal-input-row';

  const moodInput = document.createElement('input');
  moodInput.type = 'text';
  moodInput.className = 'form-control journal-mood';
  moodInput.placeholder = '心情（選填，一個 emoji）';
  moodInput.maxLength = 4;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = '記下';

  row.appendChild(moodInput);
  row.appendChild(submit);

  form.appendChild(contentInput);
  form.appendChild(row);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = contentInput.value.trim();
    if (!content) return;
    addJournal({ content, mood: moodInput.value.trim() });
    // notify 會重繪整頁；此處清空即可。
    contentInput.value = '';
    moodInput.value = '';
  });

  box.appendChild(form);

  // 最近 5 篇
  const list = document.createElement('div');
  list.className = 'journal-list';
  const recent = (state.journals || [])
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  if (recent.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '還沒有日記。';
    list.appendChild(empty);
  } else {
    for (const j of recent) list.appendChild(buildJournalEntry(j));
  }
  box.appendChild(list);

  return box;
}

function buildJournalEntry(j) {
  const entry = document.createElement('div');
  entry.className = 'journal-entry';

  const head = document.createElement('div');
  head.className = 'journal-entry-head';

  const date = document.createElement('span');
  date.className = 'journal-date';
  date.textContent = formatDateTime(j.createdAt) + (j.mood ? `　${j.mood}` : '');
  head.appendChild(date);

  const actions = document.createElement('span');
  actions.className = 'journal-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'gp-icon-btn';
  editBtn.textContent = '✎';
  editBtn.title = '編輯';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'gp-icon-btn';
  delBtn.textContent = '🗑';
  delBtn.title = '刪除';
  delBtn.addEventListener('click', () => {
    if (window.confirm('確定要刪除這篇日記嗎？此動作無法復原。')) {
      deleteJournal(j.id);
    }
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  head.appendChild(actions);
  entry.appendChild(head);

  const content = document.createElement('div');
  content.className = 'journal-content';
  content.textContent = j.content || '';
  entry.appendChild(content);

  // 行內編輯
  editBtn.addEventListener('click', () => {
    entry.textContent = '';
    const ta = document.createElement('textarea');
    ta.className = 'form-control';
    ta.rows = 3;
    ta.value = j.content || '';
    const moodEdit = document.createElement('input');
    moodEdit.type = 'text';
    moodEdit.className = 'form-control journal-mood';
    moodEdit.value = j.mood || '';
    moodEdit.placeholder = '心情 emoji';
    moodEdit.maxLength = 4;

    const btnRow = document.createElement('div');
    btnRow.className = 'form-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = '儲存';
    saveBtn.addEventListener('click', () => {
      updateJournal(j.id, { content: ta.value, mood: moodEdit.value });
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      // 重繪由整頁 render 負責；這裡直接還原顯示。
      entry.replaceWith(buildJournalEntry(j));
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);

    entry.appendChild(ta);
    entry.appendChild(moodEdit);
    entry.appendChild(btnRow);
    ta.focus();
  });

  return entry;
}

// ---- 小工具 ----
function sectionTitle(text) {
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = text;
  return h;
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '剛剛';
  if (diff < DAY_MS) return `${Math.floor(diff / 3600000)} 小時前`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `${days} 天前`;
  return formatDate(ts);
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
