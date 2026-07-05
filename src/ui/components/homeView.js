// src/ui/components/homeView.js
//
// 首頁角色儀表板（V7）：全域提醒 + 角色選擇列 + 選中角色的相處紀錄。

import {
  clearPendingGreeting,
  getRelationship,
  pickOldReplay,
  selectCharacter,
  setFirstMetAt
} from '../../state/store.js';
import { getStats } from '../../services/statsService.js';
import { createAvatarEl } from '../avatar.js';
import { createIcon } from '../icons.js';
import { navigate } from '../router.js';
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
const BACKUP_REMIND_DAYS = 14;
const ANNIVERSARY_REMIND_DAYS = 3;

export function renderHomeView(container, state) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'home-page home-dashboard-page';

  const reminder = buildBackupReminder(state);
  if (reminder) page.appendChild(reminder);

  const greeting = buildGreetingCard(state);
  if (greeting) page.appendChild(greeting);

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
}

function selectedCharacter(state) {
  const chars = state.characters || [];
  return chars.find((c) => c.id === state.currentCharacterId) || chars[0] || null;
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
