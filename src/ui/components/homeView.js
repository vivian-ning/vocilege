// src/ui/components/homeView.js
//
// 首頁主控台（#/home，V2 任務二）：
//   2.1 角色卡片牆（頭貼 / 名字 / 簡介 / 相識天數 / 最後對話時間 / 最後一句摘要）
//   2.2 Token 消耗統計（今日 / 本月 / 累計 + 每角色）
//   2.3 迴聲摘要（最新 2 則貼文 + 入口；V4 起獨白併入迴聲牆）
//   2.4 備份提醒（從未備份或距上次超過 14 天）

import { clearPendingGreeting, pickOldReplay } from '../../state/store.js';
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

  const greeting = buildGreetingCard(state);
  if (greeting) page.appendChild(greeting);

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

  page.appendChild(buildOldReplaySection());

  // 2.2 Token 統計
  page.appendChild(sectionTitle('Token 消耗統計'));
  const statsBox = document.createElement('div');
  statsBox.className = 'stats-box';
  statsBox.textContent = '載入中…';
  page.appendChild(statsBox);
  fillStats(statsBox, state);

  // 2.3 迴聲摘要（V4：獨白已併入迴聲牆）
  page.appendChild(sectionTitle('迴聲'));
  page.appendChild(buildFeedSummary(state));

  container.appendChild(page);
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

function buildOldReplaySection() {
  const wrap = document.createElement('div');
  wrap.className = 'old-replay-host';
  pickOldReplay()
    .then((item) => {
      if (!item) {
        wrap.remove();
        return;
      }
      wrap.textContent = '';
      const title = sectionTitle('舊聲重播');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'old-replay-card';
      btn.addEventListener('click', () => navigate(`/chat/${item.conversationId}`));
      const meta = document.createElement('div');
      meta.className = 'old-replay-meta';
      meta.textContent = `${item.characterName} · ${formatDate(item.createdAt)}`;
      const text = document.createElement('div');
      text.className = 'old-replay-text';
      text.textContent = item.snippet || '（沒有文字內容）';
      btn.appendChild(meta);
      btn.appendChild(text);
      wrap.appendChild(title);
      wrap.appendChild(btn);
    })
    .catch(() => wrap.remove());
  return wrap;
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

  const split = document.createElement('div');
  split.className = 'stats-split';
  split.appendChild(statCard('聊天', stats.chatTotal || { prompt: 0, completion: 0 }));
  split.appendChild(statCard('背景', stats.backgroundTotal || { prompt: 0, completion: 0 }));
  box.appendChild(split);

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

// ---- 2.3 迴聲摘要（V4：獨白已併入迴聲牆）----
function buildFeedSummary(state) {
  const box = document.createElement('div');
  box.className = 'journal-box';

  const recent = (state.posts || [])
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 2);

  if (recent.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '迴聲牆還很安靜。去說點什麼吧。';
    box.appendChild(empty);
  } else {
    for (const p of recent) {
      const entry = document.createElement('div');
      entry.className = 'journal-entry';

      const head = document.createElement('div');
      head.className = 'journal-entry-head';
      const date = document.createElement('span');
      date.className = 'journal-date';
      date.textContent = `${feedAuthorName(state, p)}　${formatDateTime(p.createdAt)}${p.mood ? `　${p.mood}` : ''}`;
      head.appendChild(date);
      entry.appendChild(head);

      const content = document.createElement('div');
      content.className = 'journal-content';
      content.textContent = p.content || '';
      entry.appendChild(content);
      box.appendChild(entry);
    }
  }

  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn';
  go.textContent = '前往迴聲牆 ›';
  go.addEventListener('click', () => navigate('#/feed'));
  box.appendChild(go);

  return box;
}

function feedAuthorName(state, post) {
  if (post.authorType === 'player') return (state.player && state.player.playerName) || '你';
  const character = (state.characters || []).find((c) => c.id === post.authorId);
  return character ? character.name || '角色' : '角色';
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
