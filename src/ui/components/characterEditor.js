// src/ui/components/characterEditor.js
//
// 角色編輯：
//   - openCharacterCreator()：新增角色的彈出表單（首頁 / 左欄「+ 新增角色」使用）
//   - renderCharacterEditor(container, state)：聊天頁右欄「角色設定」分頁，編輯目前角色
//
// 兩者共用同一組欄位定義與頭貼上傳控制項（第八節 + V2 任務 4.2）。

import { createCharacter, updateCharacter } from '../../state/store.js';
import { buildAvatarInput } from '../avatarInput.js';

// 文字欄位定義（頭貼改用 buildAvatarInput，不在此列）。
const FIELDS = [
  { key: 'name', label: '名稱', type: 'input', placeholder: '角色名稱' },
  { key: 'description', label: '簡介', type: 'textarea', placeholder: '一句話描述' },
  { key: 'personality', label: '個性', type: 'textarea', placeholder: '個性設定' },
  { key: 'scenario', label: '情境', type: 'textarea', placeholder: '故事 / 場景背景' },
  { key: 'systemPrompt', label: 'System Prompt', type: 'textarea', placeholder: '給 AI 的系統指示' },
  { key: 'firstMessage', label: '開場白 (First Message)', type: 'textarea', placeholder: '建立角色時自動送出一次' },
  { key: 'speechStyle', label: '說話風格', type: 'textarea', placeholder: '語氣 / 口吻' }
];

function readValue(source, key) {
  if (!source) return '';
  return source[key] != null ? source[key] : '';
}

// 建立欄位控制項，回傳 { fieldEl, getValue }。
function buildField(field, initial) {
  const fieldEl = document.createElement('label');
  fieldEl.className = 'form-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'form-label';
  labelEl.textContent = field.label;
  fieldEl.appendChild(labelEl);

  let control;
  if (field.type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = field.key === 'firstMessage' || field.key === 'systemPrompt' ? 3 : 2;
  } else {
    control = document.createElement('input');
    control.type = 'text';
  }
  control.className = 'form-control';
  control.placeholder = field.placeholder || '';
  control.value = initial != null ? initial : '';
  fieldEl.appendChild(control);

  return { fieldEl, getValue: () => control.value };
}

function collect(getters, avatarInput) {
  const data = {};
  for (const key in getters) {
    data[key] = getters[key]();
  }
  data.avatar = avatarInput.getValue();
  return data;
}

// ---- 新增角色的彈出表單 ----
export function openCharacterCreator() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = '新增角色';
  modal.appendChild(title);

  const form = document.createElement('form');
  form.className = 'char-form';

  const avatarInput = buildAvatarInput({ type: 'emoji', value: '🙂' });
  form.appendChild(avatarInput.el);

  const getters = {};
  for (const field of FIELDS) {
    const { fieldEl, getValue } = buildField(field, '');
    getters[field.key] = getValue;
    form.appendChild(fieldEl);
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => close({ discard: true }));

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = '建立';

  actions.appendChild(cancel);
  actions.appendChild(submit);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collect(getters, avatarInput);
    if (!data.name || !data.name.trim()) {
      window.alert('請輸入角色名稱');
      return;
    }
    submit.disabled = true;
    await createCharacter(data);
    avatarInput.commit(); // 頭貼已提交，勿刪。
    close({ discard: false });
  });

  function close({ discard }) {
    if (discard) avatarInput.discard(); // 清掉未提交的上傳。
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close({ discard: true });
  });

  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const first = form.querySelector('.avatar-emoji-input');
  if (first) first.focus();
}

// ---- 角色設定表單：編輯指定角色（characterId 省略時用目前角色）----
// V3：角色相處頁的「角色設定」分頁使用（傳入該頁的 characterId）。
export function renderCharacterEditor(container, state, characterId) {
  container.textContent = '';

  const targetId = characterId || state.currentCharacterId;
  const character = state.characters.find((c) => c.id === targetId);
  if (!character) {
    const empty = document.createElement('div');
    empty.className = 'tab-empty';
    empty.textContent = '尚未選取角色。';
    container.appendChild(empty);
    return;
  }

  const form = document.createElement('form');
  form.className = 'char-form';

  const avatarInput = buildAvatarInput(character.avatar);
  form.appendChild(avatarInput.el);

  const getters = {};
  for (const field of FIELDS) {
    const { fieldEl, getValue } = buildField(field, readValue(character, field.key));
    getters[field.key] = getValue;
    form.appendChild(fieldEl);
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';

  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-primary';
  save.textContent = '儲存角色';
  actions.appendChild(save);
  form.appendChild(actions);

  const hint = document.createElement('div');
  hint.className = 'form-hint';
  hint.textContent = '註：開場白只在建立角色時送出一次，此處編輯不會重新送出。';
  form.appendChild(hint);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = collect(getters, avatarInput);
    if (!data.name || !data.name.trim()) {
      window.alert('請輸入角色名稱');
      return;
    }
    await updateCharacter(character.id, data);
    avatarInput.commit();
    flash(save, '已儲存 ✓');
  });

  container.appendChild(form);
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1200);
}
