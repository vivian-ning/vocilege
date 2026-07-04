// src/ui/components/globalPromptsEditor.js
//
// 設定頁「Prompt 存放區」區塊（V2 任務三）。
//
// 讓使用者在一個地方編輯「套用到全部角色的基本回覆設定」。每塊可：
//   - 編輯 title / content 並儲存
//   - 獨立開關 enabled（立即生效）
//   - 上移 / 下移調整 order（決定注入順序）
//   - 刪除（需 confirm）
// 另有「新增區塊」。

import {
  addGlobalPrompt,
  updateGlobalPrompt,
  deleteGlobalPrompt,
  moveGlobalPrompt
} from '../../state/store.js';

export function renderGlobalPromptsEditor(container, state) {
  container.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'gp-editor';

  // 說明文字
  const desc = document.createElement('p');
  desc.className = 'gp-desc';
  desc.textContent = '這裡的內容會依序加在所有角色的 System Prompt 之前，對全部角色生效。全域管通則、角色管個性——角色設定可以覆蓋語氣，但不必重複這些通則。';
  wrap.appendChild(desc);

  // 新增按鈕
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+ 新增 Prompt 區塊';
  addBtn.addEventListener('click', () => {
    addGlobalPrompt({ title: '新的 Prompt', content: '', enabled: true });
  });
  wrap.appendChild(addBtn);

  const list = document.createElement('div');
  list.className = 'gp-list';

  const sorted = (state.globalPrompts || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.textContent = '還沒有全域 Prompt。點上方「+ 新增 Prompt 區塊」開始。';
    list.appendChild(empty);
  } else {
    sorted.forEach((gp, idx) => {
      list.appendChild(renderBlock(gp, idx, sorted.length));
    });
  }

  wrap.appendChild(list);
  container.appendChild(wrap);
}

function renderBlock(gp, idx, total) {
  const block = document.createElement('div');
  block.className = 'gp-block' + (gp.enabled ? '' : ' gp-disabled');

  // 頭列：enabled 開關 + 排序 + 刪除
  const head = document.createElement('div');
  head.className = 'gp-block-head';

  const toggle = document.createElement('label');
  toggle.className = 'gp-toggle';
  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.checked = !!gp.enabled;
  toggleInput.addEventListener('change', () => {
    updateGlobalPrompt(gp.id, { enabled: toggleInput.checked });
  });
  const toggleText = document.createElement('span');
  toggleText.textContent = gp.enabled ? '生效中' : '已停用';
  toggle.appendChild(toggleInput);
  toggle.appendChild(toggleText);
  head.appendChild(toggle);

  const spacer = document.createElement('div');
  spacer.className = 'gp-spacer';
  head.appendChild(spacer);

  const upBtn = iconBtn('▲', '上移', idx === 0, () => moveGlobalPrompt(gp.id, -1));
  const downBtn = iconBtn('▼', '下移', idx === total - 1, () => moveGlobalPrompt(gp.id, 1));
  const delBtn = iconBtn('🗑', '刪除', false, () => {
    if (window.confirm(`確定要刪除全域 Prompt「${gp.title || '未命名'}」嗎？此動作無法復原。`)) {
      deleteGlobalPrompt(gp.id);
    }
  });
  head.appendChild(upBtn);
  head.appendChild(downBtn);
  head.appendChild(delBtn);
  block.appendChild(head);

  // title
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'form-control gp-title';
  titleInput.value = gp.title || '';
  titleInput.placeholder = '區塊標題';
  block.appendChild(titleInput);

  // content
  const contentArea = document.createElement('textarea');
  contentArea.className = 'form-control gp-content';
  contentArea.rows = 4;
  contentArea.value = gp.content || '';
  contentArea.placeholder = '例如：回覆長度偏好、旁白格式習慣、禁止事項、通用世界觀…';
  block.appendChild(contentArea);

  // 儲存
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn';
  saveBtn.textContent = '儲存此區塊';
  saveBtn.addEventListener('click', () => {
    updateGlobalPrompt(gp.id, { title: titleInput.value, content: contentArea.value });
    const orig = saveBtn.textContent;
    saveBtn.textContent = '已儲存 ✓';
    saveBtn.disabled = true;
    setTimeout(() => { saveBtn.textContent = orig; saveBtn.disabled = false; }, 1000);
  });
  block.appendChild(saveBtn);

  return block;
}

function iconBtn(text, title, disabled, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gp-icon-btn';
  b.textContent = text;
  b.title = title;
  b.disabled = disabled;
  if (!disabled) b.addEventListener('click', onClick);
  return b;
}
