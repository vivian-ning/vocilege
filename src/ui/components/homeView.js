// src/ui/components/homeView.js
//
// 首頁角色儀表板（V7）：全域提醒 + 角色選擇列 + 選中角色的相處紀錄。

import {
  clearPendingGreeting,
  deleteHeartVoice,
  deleteJournal,
  deleteLetter,
  generateLifeContent,
  getRelationship,
  markLetterRead,
  pickOldReplay,
  revealHeartVoice,
  selectCharacter,
  setFirstMetAt
} from '../../state/store.js';
import { getStats } from '../../services/statsService.js';
import {
  downloadBackupNow,
  getAutoBackupNotice,
  requestAutoBackupAuthorization,
  runAutoBackupOnBoot
} from '../../services/autoBackupService.js';
import { createAvatarEl } from '../avatar.js';
import { createIcon } from '../icons.js';
import { navigate } from '../router.js';
import { confirmDialog } from '../dialog.js';
import { showToast } from '../toast.js';
import { setSettingsTab } from './settingsPage.js';
import { openCharacterCreator } from './characterEditor.js';
import {
  buildAnniversarySection,
  buildKeepsakeSection,
  buildWishlistSection,
  renderSettingsTab
} from './characterPage.js';
import { openMemoryDrawer } from './chatView.js';
import { dateStamp, parseDateInput } from '../../utils/time.js';

const DAY_MS = 86400000;
const ANNIVERSARY_REMIND_DAYS = 3;

export function renderHomeView(container, state) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'home-page home-dashboard-page';

  const reminder = buildBackupReminder(state);
  if (reminder) page.appendChild(reminder);

  const greeting = buildGreetingCard(state);
  if (greeting) page.appendChild(greeting);

  const letterNotice = buildUnreadLetterNotice(state);
  if (letterNotice) page.appendChild(letterNotice);

  const annivReminders = buildAnniversaryReminders(state);
  if (annivReminders) page.appendChild(annivReminders);

  page.appendChild(buildCharacterRail(state));

  const selected = selectedCharacter(state);
  if (!selected) {
    page.appendChild(buildEmptyState());
  } else {
    page.appendChild(buildDashboard(state, selected));
  }

  container.appendChild(page);
  openPendingHeartVoice(state);
}

function selectedCharacter(state) {
  const chars = state.characters || [];
  return chars.find((c) => c.id === state.currentCharacterId) || chars[0] || null;
}

function openPendingHeartVoice(state) {
  const raw = sessionStorage.getItem('vocilege:openHeartVoice');
  if (!raw) return;
  sessionStorage.removeItem('vocilege:openHeartVoice');
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return;
  }
  const character = (state.characters || []).find((c) => c.id === payload.characterId);
  if (!character) return;
  requestAnimationFrame(() => {
    openCharacterModal('弦外之音', (body) => renderHeartVoiceList(body, state, character));
  });
}

function buildCharacterRail(state) {
  const wrap = document.createElement('section');
  wrap.className = 'character-rail-section';

  const head = document.createElement('div');
  head.className = 'section-head';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '聲庭';
  head.appendChild(title);
  wrap.appendChild(head);

  const rail = document.createElement('div');
  rail.className = 'character-rail';
  const chars = (state.characters || []).slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  for (const char of chars) rail.appendChild(characterRailItem(char, state.currentCharacterId === char.id));

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'character-rail-add';
  add.textContent = '+ 新增角色';
  add.addEventListener('click', () => openCharacterCreator());
  rail.appendChild(add);

  wrap.appendChild(rail);
  return wrap;
}

function characterRailItem(character, active) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'character-rail-item' + (active ? ' active' : '');
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.appendChild(createAvatarEl(character.avatar, 'character-rail-avatar'));
  const name = document.createElement('span');
  name.textContent = character.name || '未命名角色';
  btn.appendChild(name);
  btn.addEventListener('click', () => selectCharacter(character.id));
  return btn;
}

function buildEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'home-empty';
  const title = document.createElement('h2');
  title.textContent = '還沒有角色';
  const text = document.createElement('p');
  text.textContent = '建立第一位角色後，聲痕、拾貝、節拍與約定會集中在這裡。';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = '新增角色';
  btn.addEventListener('click', () => openCharacterCreator());
  empty.appendChild(title);
  empty.appendChild(text);
  empty.appendChild(btn);
  return empty;
}

function buildDashboard(state, character) {
  const wrap = document.createElement('section');
  wrap.className = 'character-dashboard';

  wrap.appendChild(buildRelationshipHero(character));

  const grid = document.createElement('div');
  grid.className = 'character-summary-grid';
  const conv = (state.conversations || []).find((c) => c.type === 'direct' && c.primaryCharacterId === character.id);
  grid.appendChild(buildChatCard(state, character, conv));
  grid.appendChild(summaryCard({
    icon: 'brain',
    title: '聲痕',
    summary: `${countByCharacter(state.memories, character.id)} 筆`,
    onClick: () => openMemoryDrawer(state, character, conv)
  }));
  grid.appendChild(summaryCard({
    icon: 'heart',
    title: '拾貝',
    summary: `${countByCharacter(state.keepsakes, character.id)} 則`,
    onClick: () => openCharacterModal('拾貝', (body) => body.appendChild(buildKeepsakeSection(state, character)))
  }));
  grid.appendChild(summaryCard({
    icon: 'calendar',
    title: '節拍',
    summary: anniversarySummary(state, character.id),
    onClick: () => openCharacterModal('節拍', (body) => body.appendChild(buildAnniversarySection(state, character)))
  }));
  grid.appendChild(summaryCard({
    icon: 'checklist',
    title: '約定',
    summary: wishlistSummary(state, character.id),
    onClick: () => openCharacterModal('約定', (body) => body.appendChild(buildWishlistSection(state, character)))
  }));
  grid.appendChild(lifeSummaryCard({
    icon: 'book',
    title: '私語',
    summary: `${characterJournals(state, character.id).length} 則`,
    onOpen: () => openCharacterModal('私語', (body) => renderJournalList(body, state, character)),
    onGenerate: () => handleGenerateLife(character.id, 'diary')
  }));
  grid.appendChild(lifeSummaryCard({
    icon: 'heart',
    title: '弦外之音',
    summary: `${heartVoices(state, character.id).filter((h) => !h.revealed).length} 則未解鎖`,
    onOpen: () => openCharacterModal('弦外之音', (body) => renderHeartVoiceList(body, state, character)),
    onGenerate: () => handleGenerateLife(character.id, 'heartVoice')
  }));
  const letters = characterLetters(state, character.id);
  const unread = letters.filter((l) => !l.isRead).length;
  grid.appendChild(lifeSummaryCard({
    icon: 'send',
    title: '聲箋',
    summary: `${letters.length} 封・${unread} 未讀`,
    onOpen: () => openCharacterModal('聲箋', (body, close) => renderLetterList(body, state, character, close)),
    onGenerate: () => handleGenerateLife(character.id, 'letter')
  }));
  grid.appendChild(summaryCard({
    icon: 'edit',
    title: '編輯角色',
    summary: '設定、頭貼與刪除',
    onClick: () => openCharacterModal('編輯角色', (body, close) => renderSettingsTab(body, state, character, { onDelete: close }), 'character-edit-modal')
  }));
  appendOldReplay(grid, character.id);
  wrap.appendChild(grid);

  fillChatPreview(wrap, state);
  return wrap;
}

function buildChatCard(state, character, conv) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'summary-card chat-entry-card';
  btn.disabled = !conv;
  btn.addEventListener('click', () => { if (conv) navigate(`/chat/${conv.id}`); });
  const icon = document.createElement('div');
  icon.className = 'summary-card-icon';
  icon.appendChild(createIcon('chat', { size: 23 }));
  btn.appendChild(icon);
  const title = document.createElement('div');
  title.className = 'summary-card-title chat-entry-title';
  title.textContent = '聊天';
  const snippet = document.createElement('div');
  snippet.className = 'summary-card-summary chat-entry-snippet';
  snippet.dataset.convId = conv ? conv.id : '';
  snippet.textContent = '讀取最後一句…';
  const time = document.createElement('div');
  time.className = 'chat-entry-time';
  time.dataset.convTime = conv ? conv.id : '';
  time.textContent = conv && conv.lastMessageAt ? formatRelative(conv.lastMessageAt) : '';
  btn.appendChild(title);
  btn.appendChild(snippet);
  btn.appendChild(time);
  return btn;
}

function appendOldReplay(grid, characterId) {
  const host = document.createElement('div');
  host.className = 'old-replay-host';
  pickOldReplay(characterId)
    .then((item) => {
      if (!item) {
        host.remove();
        return;
      }
      host.textContent = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'summary-card old-replay-card';
      btn.addEventListener('click', () => navigate(`/chat/${item.conversationId}`));
      const icon = document.createElement('div');
      icon.className = 'summary-card-icon';
      icon.appendChild(createIcon('refresh', { size: 23 }));
      const meta = document.createElement('div');
      meta.className = 'summary-card-title old-replay-meta';
      meta.textContent = '舊聲重播';
      const text = document.createElement('div');
      text.className = 'summary-card-summary old-replay-text';
      text.textContent = `${formatDate(item.createdAt)} · ${item.snippet || '（沒有文字內容）'}`;
      btn.appendChild(icon);
      btn.appendChild(meta);
      btn.appendChild(text);
      host.appendChild(btn);
    })
    .catch(() => host.remove());
  grid.appendChild(host);
}

function buildRelationshipHero(character) {
  const rel = getRelationship(character.id);
  const base = rel.firstMetAt || character.createdAt || Date.now();
  const days = Math.max(0, Math.floor((Date.now() - base) / DAY_MS));

  const hero = document.createElement('div');
  hero.className = 'home-hero relationship-hero';

  const title = document.createElement('h2');
  title.className = 'home-hero-title';
  title.textContent = `相識 ${days} 天`;
  hero.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'home-hero-sub relationship-hero-sub';
  sub.appendChild(document.createTextNode(`與 ${character.name || '未命名角色'} 同行 · `));
  const dateBtn = document.createElement('button');
  dateBtn.type = 'button';
  dateBtn.className = 'hero-date-edit';
  dateBtn.textContent = dateStamp(base);
  dateBtn.setAttribute('aria-expanded', 'false');
  sub.appendChild(dateBtn);
  hero.appendChild(sub);

  const panel = document.createElement('form');
  panel.className = 'hero-date-panel';
  panel.hidden = true;
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'form-control';
  input.value = dateStamp(base);
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-primary';
  save.textContent = '儲存';
  panel.appendChild(input);
  panel.appendChild(save);
  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const ts = parseDateInput(input.value);
    if (ts) setFirstMetAt(character.id, ts);
  });
  dateBtn.addEventListener('click', () => {
    const next = panel.hidden;
    panel.hidden = !next;
    dateBtn.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) input.focus();
  });
  hero.appendChild(panel);
  return hero;
}

function summaryCard({ icon, title, summary, onClick }) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'summary-card';
  card.addEventListener('click', onClick);
  const iconEl = document.createElement('div');
  iconEl.className = 'summary-card-icon';
  iconEl.appendChild(createIcon(icon, { size: 23 }));
  const titleEl = document.createElement('div');
  titleEl.className = 'summary-card-title';
  titleEl.textContent = title;
  const summaryEl = document.createElement('div');
  summaryEl.className = 'summary-card-summary';
  summaryEl.textContent = summary;
  card.appendChild(iconEl);
  card.appendChild(titleEl);
  card.appendChild(summaryEl);
  return card;
}

function lifeSummaryCard({ icon, title, summary, onOpen, onGenerate }) {
  const card = document.createElement('div');
  card.className = 'summary-card life-summary-card';

  const iconEl = document.createElement('div');
  iconEl.className = 'summary-card-icon';
  iconEl.appendChild(createIcon(icon, { size: 23 }));
  card.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'summary-card-title';
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const summaryEl = document.createElement('div');
  summaryEl.className = 'summary-card-summary';
  summaryEl.textContent = summary;
  card.appendChild(summaryEl);

  const actions = document.createElement('div');
  actions.className = 'summary-card-actions';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'btn';
  open.textContent = '查看';
  open.addEventListener('click', onOpen);
  const gen = document.createElement('button');
  gen.type = 'button';
  gen.className = 'btn btn-primary';
  gen.textContent = '讓 TA 寫一則';
  gen.addEventListener('click', async () => {
    gen.disabled = true;
    try {
      await onGenerate();
    } finally {
      gen.disabled = false;
    }
  });
  actions.appendChild(open);
  actions.appendChild(gen);
  card.appendChild(actions);
  return card;
}

async function handleGenerateLife(characterId, kind) {
  try {
    await generateLifeContent(characterId, kind, { automatic: false });
  } catch (err) {
    showToast((err && err.userMessage) || (err && err.message) || '產生失敗');
  }
}

function openCharacterModal(titleText, renderBody, extraClass) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeModal = () => overlay.remove();
  const modal = document.createElement('div');
  modal.className = 'modal dashboard-modal' + (extraClass ? ` ${extraClass}` : '');
  const head = document.createElement('div');
  head.className = 'dashboard-modal-head';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = titleText;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', '關閉');
  close.title = '關閉';
  close.textContent = '×';
  close.addEventListener('click', closeModal);
  head.appendChild(title);
  head.appendChild(close);
  modal.appendChild(head);
  const body = document.createElement('div');
  body.className = 'dashboard-modal-body';
  renderBody(body, closeModal);
  modal.appendChild(body);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  const first = modal.querySelector('input, textarea, button');
  if (first) first.focus();
}

function countByCharacter(items, characterId) {
  return (items || []).filter((item) => item.characterId === characterId).length;
}

function anniversarySummary(state, characterId) {
  const items = (state.anniversaries || []).filter((a) => a.characterId === characterId);
  if (!items.length) return '0 個';
  const next = items
    .map((a) => ({ item: a, days: daysUntilAnniversary(a.date, a.repeat) }))
    .filter((x) => x.days != null)
    .sort((a, b) => a.days - b.days)[0];
  if (!next) return `${items.length} 個`;
  return `下一個：${next.item.date || '未定'} ${next.item.title || '節拍'}`;
}

function wishlistSummary(state, characterId) {
  const items = (state.wishlists || []).filter((w) => w.characterId === characterId);
  const undone = items.filter((w) => !w.done).length;
  return `${items.length} 個・${undone} 待辦`;
}

async function fillChatPreview(scope, state) {
  let stats;
  try {
    stats = await getStats(state);
  } catch (e) {
    return;
  }
  scope.querySelectorAll('.chat-entry-snippet[data-conv-id]').forEach((node) => {
    const last = stats.lastByConversation[node.dataset.convId];
    node.textContent = last && last.snippet ? last.snippet : '還沒有對話';
  });
  scope.querySelectorAll('.chat-entry-time[data-conv-time]').forEach((node) => {
    const last = stats.lastByConversation[node.dataset.convTime];
    node.textContent = last && last.createdAt ? formatRelative(last.createdAt) : node.textContent;
  });
}

function characterJournals(state, characterId) {
  return (state.journals || [])
    .filter((j) => j && j.ownerType === 'character' && j.ownerId === characterId)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function heartVoices(state, characterId) {
  return (state.heartVoices || [])
    .filter((h) => h && h.characterId === characterId)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function characterLetters(state, characterId) {
  return (state.letters || [])
    .filter((l) => l && l.characterId === characterId)
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function renderJournalList(container, state, character) {
  const list = document.createElement('div');
  list.className = 'life-list';
  const items = characterJournals(state, character.id);
  if (!items.length) list.appendChild(emptyLifeText('還沒有私語。'));
  for (const item of items) {
    const row = lifeItemShell(formatDate(item.createdAt), item.content);
    row.appendChild(deleteButton('刪除私語', () => deleteJournal(item.id)));
    list.appendChild(row);
  }
  container.appendChild(list);
}

function renderHeartVoiceList(container, state, character) {
  const list = document.createElement('div');
  list.className = 'life-list';
  const items = heartVoices(state, character.id);
  if (!items.length) list.appendChild(emptyLifeText('還沒有弦外之音。'));
  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'life-item heart-voice-item' + (item.revealed ? ' revealed' : '');
    const date = document.createElement('div');
    date.className = 'life-item-date';
    date.textContent = formatDate(item.createdAt);
    row.appendChild(date);
    const content = document.createElement('button');
    content.type = 'button';
    content.className = 'heart-voice-content';
    content.textContent = item.revealed ? item.content : '點一下，聽見沒有說出口的話';
    content.addEventListener('click', async () => {
      if (item.revealed) return;
      await revealHeartVoice(item.id);
      item.revealed = true;
      row.classList.add('revealed');
      content.textContent = item.content;
    });
    row.appendChild(content);
    row.appendChild(deleteButton('刪除弦外之音', () => deleteHeartVoice(item.id)));
    list.appendChild(row);
  }
  container.appendChild(list);
}

function renderLetterList(container, state, character, closeModal) {
  const list = document.createElement('div');
  list.className = 'life-list letter-list';
  const items = characterLetters(state, character.id);
  if (!items.length) list.appendChild(emptyLifeText('還沒有聲箋。'));
  for (const item of items) list.appendChild(letterRow(item, character, closeModal));
  container.appendChild(list);
}

function letterRow(item, character, closeModal) {
  const row = document.createElement('article');
  row.className = 'life-item letter-row' + (item.isRead ? '' : ' unread');
  const date = document.createElement('div');
  date.className = 'life-item-date';
  date.textContent = formatDate(item.createdAt);
  row.appendChild(date);
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'letter-preview';
  preview.textContent = item.content.replace(/\s+/g, ' ').trim().slice(0, 80) || '一封尚未展開的聲箋';
  preview.addEventListener('click', () => openLetterReader(item, character, closeModal));
  row.appendChild(preview);
  const status = document.createElement('span');
  status.className = 'letter-status';
  status.textContent = item.isRead ? '已讀' : '未讀';
  row.appendChild(status);
  row.appendChild(deleteButton('刪除聲箋', () => deleteLetter(item.id)));
  return row;
}

async function openLetterReader(item, character, previousClose) {
  if (previousClose) previousClose();
  await markLetterRead(item.id);
  openCharacterModal('聲箋', (body) => {
    const article = document.createElement('article');
    article.className = 'letter-reader';
    const meta = document.createElement('div');
    meta.className = 'life-item-date';
    meta.textContent = `${character.name || '角色'} · ${formatDate(item.createdAt)}`;
    article.appendChild(meta);
    for (const block of String(item.content || '').split(/\n\s*\n/)) {
      const p = document.createElement('p');
      p.textContent = block.trim();
      if (p.textContent) article.appendChild(p);
    }
    body.appendChild(article);
  }, 'letter-reader-modal');
}

function lifeItemShell(dateText, contentText) {
  const row = document.createElement('article');
  row.className = 'life-item';
  const date = document.createElement('div');
  date.className = 'life-item-date';
  date.textContent = dateText;
  const content = document.createElement('div');
  content.className = 'life-item-content';
  content.textContent = contentText || '';
  row.appendChild(date);
  row.appendChild(content);
  return row;
}

function deleteButton(label, action) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-danger life-delete';
  btn.textContent = '刪除';
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', async () => {
    if (!await confirmDialog({
      title: label,
      message: `${label}？`,
      confirmText: '刪除',
      danger: true
    })) return;
    btn.disabled = true;
    try {
      await action();
      const row = btn.closest('.life-item');
      if (row) row.remove();
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function emptyLifeText(text) {
  const empty = document.createElement('div');
  empty.className = 'list-empty';
  empty.textContent = text;
  return empty;
}

function buildUnreadLetterNotice(state) {
  const letters = (state.letters || []).filter((l) => l && !l.isRead);
  if (!letters.length) return null;
  letters.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const letter = letters[0];
  const character = (state.characters || []).find((c) => c.id === letter.characterId);
  if (!character) return null;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'unread-letter-card';
  card.appendChild(createAvatarEl(character.avatar, 'greeting-avatar'));
  const text = document.createElement('span');
  text.textContent = `${character.name || '角色'} 寄來一封信`;
  card.appendChild(text);
  card.addEventListener('click', async () => {
    await selectCharacter(character.id);
    openLetterReader(letter, character);
  });
  return card;
}

function buildGreetingCard(state) {
  const pending = state.pendingGreeting;
  if (!pending || !pending.characterId || !pending.content) return null;
  const character = (state.characters || []).find((c) => c.id === pending.characterId);
  const conv = (state.conversations || []).find((c) => c.type === 'direct' && c.primaryCharacterId === pending.characterId);
  if (!character || !conv) return null;
  const card = document.createElement('div');
  card.className = 'greeting-card';
  card.appendChild(createAvatarEl(character.avatar, 'greeting-avatar'));
  const body = document.createElement('div');
  body.className = 'greeting-body';
  const label = document.createElement('div');
  label.className = 'greeting-label';
  label.textContent = `喚聲 · ${character.name || '角色'}`;
  body.appendChild(label);
  const text = document.createElement('div');
  text.className = 'greeting-text';
  text.textContent = pending.content;
  body.appendChild(text);
  card.appendChild(body);
  const actions = document.createElement('div');
  actions.className = 'greeting-actions';
  const reply = document.createElement('button');
  reply.type = 'button';
  reply.className = 'btn btn-primary';
  reply.textContent = '回應 TA';
  reply.addEventListener('click', async () => {
    await clearPendingGreeting();
    navigate(`/chat/${conv.id}`);
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = '關閉';
  close.addEventListener('click', () => clearPendingGreeting());
  actions.appendChild(reply);
  actions.appendChild(close);
  card.appendChild(actions);
  return card;
}

function buildBackupReminder(state) {
  const notice = getAutoBackupNotice(state);
  if (!notice) return null;

  const bar = document.createElement('div');
  bar.className = 'backup-reminder';
  const text = document.createElement('span');
  text.textContent = notice.type === 'reauthorize'
    ? '自動備份需要重新授權，點一下就能繼續寫入綁定的資料夾。'
    : '回憶該備份了。本機資料只在這台瀏覽器裡，現在下載一份封聲比較安心。';
  bar.appendChild(text);
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn btn-primary';
  link.textContent = notice.actionText;
  link.addEventListener('click', async () => {
    link.disabled = true;
    try {
      if (notice.type === 'reauthorize') {
        await requestAutoBackupAuthorization();
        await runAutoBackupOnBoot();
      } else {
        await downloadBackupNow();
      }
    } finally {
      link.disabled = false;
    }
  });
  bar.appendChild(link);
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'btn';
  settings.textContent = '備份設定';
  settings.addEventListener('click', () => { setSettingsTab('data'); navigate('/settings'); });
  bar.appendChild(settings);
  return bar;
}

function buildAnniversaryReminders(state) {
  const charById = {};
  for (const c of (state.characters || [])) charById[c.id] = c;

  const hits = [];
  for (const a of (state.anniversaries || [])) {
    const days = daysUntilAnniversary(a.date, a.repeat);
    if (days == null || days > ANNIVERSARY_REMIND_DAYS) continue;
    const char = charById[a.characterId];
    if (!char) continue;
    hits.push({ days, name: char.name || '（角色）', title: a.title || '節拍', charId: char.id });
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
      ? `今天是與${h.name}的「${h.title}」`
      : `${h.days} 天後是與${h.name}的「${h.title}」`;
    bar.title = '前往角色儀表板';
    bar.addEventListener('click', async () => {
      await selectCharacter(h.charId);
      navigate('/home');
    });
    box.appendChild(bar);
  }
  return box;
}

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
  const oneShot = new Date(bd.getFullYear(), bd.getMonth(), bd.getDate());
  const d = Math.round((oneShot - today) / DAY_MS);
  return d < 0 ? null : d;
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '剛剛';
  if (diff < DAY_MS) return `${Math.max(1, Math.floor(diff / 3600000))} 小時前`;
  const days = Math.floor(diff / DAY_MS);
  if (days < 30) return `${days} 天前`;
  return formatDate(ts);
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
