// src/ui/components/characterPage.js
//
// 角色相處頁（#/character/:characterId，V3 任務二 + 任務三）。以分頁呈現：
//   - 相處紀錄：相識天數 / 相處統計 / 記憶 / 紀念日 / 想一起做的事
//   - 角色設定：既有 characterEditor（含頭貼上傳）＋ 刪除角色入口
//
// 全程 createElement + textContent，不使用 innerHTML。任何 store action 完成後由
// store 統一 notify → render → 本頁整頁重繪（與 home / settings 一致的模式）。

import {
  setFirstMetAt,
  refreshRelationshipStats,
  getRelationship,
  addAnniversary,
  updateAnniversary,
  deleteAnniversary,
  addWishlist,
  updateWishlist,
  deleteWishlist,
  addMemory,
  updateMemory,
  deleteMemory,
  deleteCharacter
} from '../../state/store.js';
import { selectInjectedMemories } from '../../services/promptBuilder.js';
import { renderCharacterEditor } from './characterEditor.js';
import { createAvatarEl } from '../avatar.js';
import { navigate } from '../router.js';
import { dateStamp, parseDateInput } from '../../utils/time.js';

const DAY_MS = 86400000;
const TABS = [
  { key: 'record', label: '相處紀錄' },
  { key: 'settings', label: '角色設定' }
];

let activeTab = 'record';

export function renderCharacterPage(container, state, characterId) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'character-page';

  const character = (state.characters || []).find((c) => c.id === characterId);
  if (!character) {
    page.appendChild(backButton());
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.textContent = '找不到這個角色（可能已被刪除）。';
    page.appendChild(empty);
    container.appendChild(page);
    return;
  }

  page.appendChild(buildHead(character));

  // 分頁列
  const header = document.createElement('div');
  header.className = 'tab-header';
  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn' + (tab.key === activeTab ? ' active' : '');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      activeTab = tab.key;
      renderCharacterPage(container, state, characterId);
    });
    header.appendChild(btn);
  }
  page.appendChild(header);

  const body = document.createElement('div');
  body.className = 'tab-body character-page-body';
  page.appendChild(body);

  if (activeTab === 'settings') {
    renderSettingsTab(body, state, character);
  } else {
    renderRecordTab(body, state, character);
  }

  container.appendChild(page);
}

// ---- 頁首 ----
function buildHead(character) {
  const head = document.createElement('div');
  head.className = 'character-page-head';

  head.appendChild(backButton());

  const avatar = createAvatarEl(character.avatar, 'character-page-avatar');
  head.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'character-page-headinfo';
  const name = document.createElement('div');
  name.className = 'character-page-name';
  name.textContent = character.name || '未命名角色';
  info.appendChild(name);
  if (character.description) {
    const desc = document.createElement('div');
    desc.className = 'character-page-desc';
    desc.textContent = character.description;
    info.appendChild(desc);
  }
  head.appendChild(info);

  return head;
}

function backButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn character-back';
  b.textContent = '‹ 返回首頁';
  b.addEventListener('click', () => navigate('/home'));
  return b;
}

// ---- 角色設定分頁 ----
function renderSettingsTab(container, state, character) {
  container.textContent = '';

  const editorWrap = document.createElement('div');
  renderCharacterEditor(editorWrap, state, character.id);
  container.appendChild(editorWrap);

  // 刪除角色入口（沿用連鎖刪除規則；一併刪除 memories/anniversaries/wishlists/relationshipData）。
  const danger = document.createElement('div');
  danger.className = 'char-danger';
  const dtitle = document.createElement('h3');
  dtitle.className = 'char-danger-title';
  dtitle.textContent = '危險區';
  danger.appendChild(dtitle);

  const dhint = document.createElement('p');
  dhint.className = 'form-hint';
  dhint.textContent = '刪除角色會一併刪除該角色的所有對話、聊天紀錄、記憶、紀念日、想一起做的事與相處統計，此動作無法復原。';
  danger.appendChild(dhint);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn btn-danger';
  delBtn.textContent = '刪除這個角色';
  delBtn.addEventListener('click', async () => {
    const ok = window.confirm(
      `確定要刪除角色「${character.name}」嗎？\n\n將同時刪除該角色的所有對話、聊天紀錄、記憶、紀念日、想一起做的事，此動作無法復原。`
    );
    if (!ok) return;
    await deleteCharacter(character.id);
    navigate('/home');
  });
  danger.appendChild(delBtn);

  container.appendChild(danger);
}

// ---- 相處紀錄分頁 ----
function renderRecordTab(container, state, character) {
  container.textContent = '';
  const conv = (state.conversations || []).find(
    (c) => c.type === 'direct' && c.primaryCharacterId === character.id
  );
  container.appendChild(buildRelationshipSection(state, character, conv));
  container.appendChild(buildMemorySection(state, character));
  container.appendChild(buildAnniversarySection(state, character));
  container.appendChild(buildWishlistSection(state, character));
}

// 相識天數 + 相遇日 + 相處統計
function buildRelationshipSection(state, character, conv) {
  const rel = getRelationship(character.id);
  const base = rel.firstMetAt || character.createdAt || Date.now();
  const days = Math.max(0, Math.floor((Date.now() - base) / DAY_MS));

  const sec = sectionEl('相識');
  const box = document.createElement('div');
  box.className = 'rel-box';

  const daysRow = document.createElement('div');
  daysRow.className = 'rel-days';
  daysRow.textContent = `相識 ${days} 天`;
  box.appendChild(daysRow);

  // 相遇日（可編輯 → firstMetAt；修改後天數即時重算）
  const metField = document.createElement('label');
  metField.className = 'form-field rel-metfield';
  const metLabel = document.createElement('span');
  metLabel.className = 'form-label';
  metLabel.textContent = '相遇日';
  metField.appendChild(metLabel);
  const metInput = document.createElement('input');
  metInput.type = 'date';
  metInput.className = 'form-control';
  metInput.value = dateStamp(base);
  metInput.addEventListener('change', () => {
    const ts = parseDateInput(metInput.value);
    if (ts) setFirstMetAt(character.id, ts);
  });
  metField.appendChild(metInput);
  const metHint = document.createElement('div');
  metHint.className = 'form-hint';
  metHint.textContent = '預設以建立角色的日期起算；可改成你們實際相遇的日子。';
  metField.appendChild(metHint);
  box.appendChild(metField);

  // 相處統計（系統維護）：訊息總數，非同步計算後填入。
  const statRow = document.createElement('div');
  statRow.className = 'rel-stat';
  statRow.textContent = '對話訊息總數：計算中…';
  box.appendChild(statRow);
  refreshRelationshipStats(character.id, conv ? conv.id : '')
    .then((count) => {
      statRow.textContent = `對話訊息總數：${count.toLocaleString()} 則（雙方合計）`;
    })
    .catch(() => {
      statRow.textContent = '對話訊息總數：讀取失敗';
    });

  sec.appendChild(box);
  return sec;
}

// ---- 記憶 ----
function buildMemorySection(state, character) {
  const sec = sectionEl('記憶');

  // 注入估算（與 buildPrompt 用同一份選取邏輯）。
  const limit = state.settings.memoryInjectionLimit;
  const { locked, general } = selectInjectedMemories(state.memories, character.id, limit);
  const chars = locked.concat(general).reduce(
    (n, m) => n + (m.content ? String(m.content).length : 0),
    0
  );
  const est = document.createElement('div');
  est.className = 'mem-estimate';
  est.textContent =
    `目前將注入 locked ${locked.length} 筆＋一般 ${general.length} 筆，約 ${chars} 字。` +
    `（一般記憶上限 ${limit} 筆，可在「設定 → API 設定」調整；locked 不占名額。）`;
  sec.appendChild(est);

  // 新增記憶表單
  sec.appendChild(
    buildMemoryForm({
      submitLabel: '新增記憶',
      onSubmit: (data) => addMemory(character.id, data)
    })
  );

  // 列表（依 updatedAt 新到舊）
  const list = document.createElement('div');
  list.className = 'mem-list';
  const mems = (state.memories || [])
    .filter((m) => m.characterId === character.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (mems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '還沒有記憶。新增一些關於你們的重要設定或事件吧。';
    list.appendChild(empty);
  } else {
    for (const m of mems) list.appendChild(buildMemoryItem(m));
  }
  sec.appendChild(list);
  return sec;
}

function buildMemoryItem(m) {
  const item = document.createElement('div');
  item.className = 'mem-item' + (m.locked ? ' mem-locked' : '');

  // 頭列：星等 / 情感 / locked 徽章 + 動作
  const head = document.createElement('div');
  head.className = 'mem-item-head';

  const badges = document.createElement('div');
  badges.className = 'mem-badges';
  badges.appendChild(badge(`重要 ${stars(m.importance)}`));
  badges.appendChild(badge(`情感 ${m.emotionWeight || 0}`));
  if (m.locked) badges.appendChild(badge('🔒 鎖定', 'mem-badge-lock'));
  head.appendChild(badges);

  const actions = document.createElement('div');
  actions.className = 'mem-actions';
  const editBtn = iconBtn('✎', '編輯');
  const delBtn = iconBtn('🗑', '刪除');
  delBtn.addEventListener('click', () => {
    if (window.confirm('確定要刪除這筆記憶嗎？此動作無法復原。')) deleteMemory(m.id);
  });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  head.appendChild(actions);
  item.appendChild(head);

  const content = document.createElement('div');
  content.className = 'mem-content';
  content.textContent = m.content || '';
  item.appendChild(content);

  if (m.summary) {
    const summary = document.createElement('div');
    summary.className = 'mem-summary';
    summary.textContent = `摘要：${m.summary}`;
    item.appendChild(summary);
  }

  const recall = document.createElement('div');
  recall.className = 'mem-recall';
  recall.textContent = recallText(m);
  item.appendChild(recall);

  editBtn.addEventListener('click', () => {
    const form = buildMemoryForm({
      submitLabel: '儲存記憶',
      initial: m,
      onSubmit: (data) => updateMemory(m.id, data),
      onCancel: () => item.replaceWith(buildMemoryItem(m))
    });
    item.replaceWith(form);
  });

  return item;
}

// 記憶表單（新增 / 編輯共用）。initial 省略時為新增（空白）。
function buildMemoryForm({ submitLabel, onSubmit, initial, onCancel }) {
  const form = document.createElement('form');
  form.className = 'mem-form';

  const contentField = fieldLabel('內容（必填）');
  const content = document.createElement('textarea');
  content.className = 'form-control';
  content.rows = 2;
  content.placeholder = '例如：玩家怕黑，睡前需要有人陪。';
  content.value = initial ? initial.content || '' : '';
  contentField.appendChild(content);
  form.appendChild(contentField);

  const summaryField = fieldLabel('摘要（選填，一句話短版）');
  const summary = document.createElement('input');
  summary.type = 'text';
  summary.className = 'form-control';
  summary.value = initial ? initial.summary || '' : '';
  summaryField.appendChild(summary);
  form.appendChild(summaryField);

  const row = document.createElement('div');
  row.className = 'mem-form-row';

  const impField = fieldLabel('重要程度');
  const importance = starSelect(initial ? initial.importance : 3, 5);
  impField.appendChild(importance);
  row.appendChild(impField);

  const emoField = fieldLabel('情感濃度');
  const emotion = numSelect(initial ? initial.emotionWeight : 3, 5);
  emoField.appendChild(emotion);
  row.appendChild(emoField);

  form.appendChild(row);

  const lockField = document.createElement('label');
  lockField.className = 'form-field form-check';
  const lock = document.createElement('input');
  lock.type = 'checkbox';
  lock.checked = initial ? !!initial.locked : false;
  const lockText = document.createElement('span');
  lockText.className = 'form-check-label';
  lockText.textContent = '鎖定：永遠注入，適合最核心的設定。';
  lockField.appendChild(lock);
  lockField.appendChild(lockText);
  form.appendChild(lockField);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = submitLabel;
  actions.appendChild(submit);
  if (onCancel) {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', onCancel);
    actions.appendChild(cancel);
  }
  form.appendChild(actions);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!content.value.trim()) {
      window.alert('請輸入記憶內容');
      return;
    }
    onSubmit({
      content: content.value,
      summary: summary.value,
      importance: Number(importance.value),
      emotionWeight: Number(emotion.value),
      locked: lock.checked
    });
    // 新增模式：notify 會整頁重繪、表單重建；此處清空以防重繪前殘留。
    if (!initial) {
      content.value = '';
      summary.value = '';
    }
  });

  return form;
}

function recallText(m) {
  const count = Number(m.recallCount) || 0;
  if (!count || !m.lastRecalledAt) return '尚未被想起';
  const days = Math.floor((Date.now() - m.lastRecalledAt) / DAY_MS);
  const when = days <= 0 ? '今天' : `${days} 天前`;
  return `上次想起：${when} · 共 ${count} 次`;
}

// ---- 紀念日 ----
function buildAnniversarySection(state, character) {
  const sec = sectionEl('紀念日');

  const form = document.createElement('form');
  form.className = 'anniv-form';

  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'form-control';
  title.placeholder = '紀念日名稱（例如：相遇紀念日）';

  const date = document.createElement('input');
  date.type = 'date';
  date.className = 'form-control anniv-date';

  const repeat = repeatSelect('none');

  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '新增';

  form.appendChild(title);
  form.appendChild(date);
  form.appendChild(repeat);
  form.appendChild(addBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) {
      window.alert('請輸入紀念日名稱');
      return;
    }
    if (!date.value) {
      window.alert('請選擇日期');
      return;
    }
    addAnniversary(character.id, {
      title: title.value,
      date: date.value,
      repeat: repeat.value
    });
  });
  sec.appendChild(form);

  const list = document.createElement('div');
  list.className = 'anniv-list';
  const items = (state.anniversaries || [])
    .filter((a) => a.characterId === character.id)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '還沒有紀念日。';
    list.appendChild(empty);
  } else {
    for (const a of items) list.appendChild(buildAnniversaryItem(a));
  }
  sec.appendChild(list);
  return sec;
}

function buildAnniversaryItem(a) {
  const item = document.createElement('div');
  item.className = 'anniv-item';

  const info = document.createElement('div');
  info.className = 'anniv-info';
  const t = document.createElement('span');
  t.className = 'anniv-title';
  t.textContent = a.title || '未命名紀念日';
  const meta = document.createElement('span');
  meta.className = 'anniv-meta';
  meta.textContent = `${a.date || '—'}　${repeatLabel(a.repeat)}`;
  info.appendChild(t);
  info.appendChild(meta);
  item.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'anniv-actions';
  const editBtn = iconBtn('✎', '編輯');
  const delBtn = iconBtn('🗑', '刪除');
  delBtn.addEventListener('click', () => {
    if (window.confirm(`確定要刪除紀念日「${a.title || '未命名'}」嗎？`)) deleteAnniversary(a.id);
  });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  item.appendChild(actions);

  editBtn.addEventListener('click', () => {
    const editForm = document.createElement('form');
    editForm.className = 'anniv-form';
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'form-control';
    title.value = a.title || '';
    const date = document.createElement('input');
    date.type = 'date';
    date.className = 'form-control anniv-date';
    date.value = a.date || '';
    const repeat = repeatSelect(a.repeat);
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary';
    save.textContent = '儲存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => item.replaceWith(buildAnniversaryItem(a)));
    editForm.appendChild(title);
    editForm.appendChild(date);
    editForm.appendChild(repeat);
    editForm.appendChild(save);
    editForm.appendChild(cancel);
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!title.value.trim() || !date.value) {
        window.alert('請輸入名稱與日期');
        return;
      }
      updateAnniversary(a.id, { title: title.value, date: date.value, repeat: repeat.value });
    });
    item.replaceWith(editForm);
  });

  return item;
}

// ---- 想一起做的事 ----
function buildWishlistSection(state, character) {
  const sec = sectionEl('想一起做的事');

  const form = document.createElement('form');
  form.className = 'wish-form';
  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'form-control';
  title.placeholder = '想一起做的事（例如：一起看日出）';
  const note = document.createElement('input');
  note.type = 'text';
  note.className = 'form-control wish-note';
  note.placeholder = '備註（選填）';
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '新增';
  form.appendChild(title);
  form.appendChild(note);
  form.appendChild(addBtn);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!title.value.trim()) {
      window.alert('請輸入項目名稱');
      return;
    }
    addWishlist(character.id, { title: title.value, note: note.value });
  });
  sec.appendChild(form);

  const items = (state.wishlists || []).filter((w) => w.characterId === character.id);
  // 未完成在前（依 createdAt 新到舊），已完成在後（以刪除線顯示）。
  const undone = items.filter((w) => !w.done).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const done = items.filter((w) => w.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

  const list = document.createElement('div');
  list.className = 'wish-list';
  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'form-hint';
    empty.textContent = '還沒有想一起做的事。';
    list.appendChild(empty);
  } else {
    for (const w of undone) list.appendChild(buildWishlistItem(w));
    for (const w of done) list.appendChild(buildWishlistItem(w));
  }
  sec.appendChild(list);
  return sec;
}

function buildWishlistItem(w) {
  const item = document.createElement('div');
  item.className = 'wish-item' + (w.done ? ' wish-done' : '');

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'wish-check';
  check.checked = !!w.done;
  check.addEventListener('change', () => updateWishlist(w.id, { done: check.checked }));
  item.appendChild(check);

  const info = document.createElement('div');
  info.className = 'wish-info';
  const t = document.createElement('div');
  t.className = 'wish-title';
  t.textContent = w.title || '未命名';
  info.appendChild(t);
  if (w.note) {
    const n = document.createElement('div');
    n.className = 'wish-note-text';
    n.textContent = w.note;
    info.appendChild(n);
  }
  item.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'wish-actions';
  const editBtn = iconBtn('✎', '編輯');
  const delBtn = iconBtn('🗑', '刪除');
  delBtn.addEventListener('click', () => {
    if (window.confirm(`確定要刪除「${w.title || '未命名'}」嗎？`)) deleteWishlist(w.id);
  });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  item.appendChild(actions);

  editBtn.addEventListener('click', () => {
    const editForm = document.createElement('form');
    editForm.className = 'wish-form';
    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'form-control';
    title.value = w.title || '';
    const note = document.createElement('input');
    note.type = 'text';
    note.className = 'form-control wish-note';
    note.value = w.note || '';
    note.placeholder = '備註（選填）';
    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'btn btn-primary';
    save.textContent = '儲存';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => item.replaceWith(buildWishlistItem(w)));
    editForm.appendChild(title);
    editForm.appendChild(note);
    editForm.appendChild(save);
    editForm.appendChild(cancel);
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!title.value.trim()) {
        window.alert('請輸入項目名稱');
        return;
      }
      updateWishlist(w.id, { title: title.value, note: note.value });
    });
    item.replaceWith(editForm);
  });

  return item;
}

// ---- 小工具 ----
function sectionEl(titleText) {
  const wrap = document.createElement('section');
  wrap.className = 'char-section';
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = titleText;
  wrap.appendChild(h);
  return wrap;
}

function fieldLabel(text) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const span = document.createElement('span');
  span.className = 'form-label';
  span.textContent = text;
  el.appendChild(span);
  return el;
}

function badge(text, extraClass) {
  const b = document.createElement('span');
  b.className = 'mem-badge' + (extraClass ? ' ' + extraClass : '');
  b.textContent = text;
  return b;
}

function iconBtn(text, title) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gp-icon-btn';
  b.textContent = text;
  b.title = title;
  return b;
}

function stars(n) {
  const v = Math.min(5, Math.max(1, Number(n) || 1));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
}

function starSelect(value, max) {
  const sel = document.createElement('select');
  sel.className = 'form-control';
  const v = Math.min(max, Math.max(1, Number(value) || 3));
  for (let i = 1; i <= max; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${'★'.repeat(i)}${'☆'.repeat(max - i)}  ${i}`;
    if (i === v) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function numSelect(value, max) {
  const sel = document.createElement('select');
  sel.className = 'form-control';
  const v = Math.min(max, Math.max(1, Number(value) || 3));
  for (let i = 1; i <= max; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = String(i);
    if (i === v) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function repeatSelect(value) {
  const sel = document.createElement('select');
  sel.className = 'form-control anniv-repeat';
  const opts = [
    { v: 'none', label: '單次' },
    { v: 'yearly', label: '每年' },
    { v: 'monthly', label: '每月' }
  ];
  for (const o of opts) {
    const el = document.createElement('option');
    el.value = o.v;
    el.textContent = o.label;
    if (o.v === value) el.selected = true;
    sel.appendChild(el);
  }
  return sel;
}

function repeatLabel(repeat) {
  if (repeat === 'yearly') return '每年';
  if (repeat === 'monthly') return '每月';
  return '單次';
}
