// src/ui/components/characterEditor.js
//
// 角色編輯：
//   - openCharacterCreator()：新增角色的彈出表單（首頁 / 左欄「+ 新增角色」使用）
//   - renderCharacterEditor(container, state)：聊天頁右欄「角色設定」分頁，編輯目前角色
//
// 兩者共用同一組欄位定義與頭貼上傳控制項（第八節 + V2 任務 4.2）。

import { createCharacter, updateCharacter } from '../../state/store.js';
import { normalizeVigil } from '../../state/schema.js';
import { buildAvatarInput } from '../avatarInput.js';
import { createIcon } from '../icons.js';

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

const EDIT_SECTIONS = [
  {
    key: 'basic',
    title: '基本資料',
    hint: '名稱、頭貼與一句話簡介。',
    fields: ['avatar', 'name', 'description']
  },
  {
    key: 'persona',
    title: '人設',
    hint: '角色個性、情境、語氣與開場。',
    fields: ['personality', 'scenario', 'speechStyle', 'firstMessage']
  },
  {
    key: 'prompt',
    title: 'Prompt',
    hint: '進階系統指示。',
    fields: ['systemPrompt']
  },
  {
    key: 'vigil',
    title: '駐守',
    hint: '電腦駐守服務使用的推播設定。',
    fields: ['vigil']
  }
];

const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((field) => [field.key, field]));

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

function collect(getters, avatarInput, vigilGetter) {
  const data = {};
  for (const key in getters) {
    data[key] = getters[key]();
  }
  data.avatar = avatarInput.getValue();
  if (typeof vigilGetter === 'function') data.vigil = vigilGetter();
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
export function renderCharacterEditor(container, state, characterId, options = {}) {
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

  const getters = {};
  const fieldEls = { avatar: avatarInput.el };
  for (const field of FIELDS) {
    const { fieldEl, getValue } = buildField(field, readValue(character, field.key));
    getters[field.key] = getValue;
    fieldEls[field.key] = fieldEl;
  }

  const vigilEditor = buildVigilEditor(character.vigil);
  fieldEls.vigil = vigilEditor.el;

  if (options.collapsible) {
    for (const section of EDIT_SECTIONS) {
      form.appendChild(buildEditorSection(section, fieldEls));
    }
  } else {
    form.appendChild(avatarInput.el);
    for (const field of FIELDS) form.appendChild(fieldEls[field.key]);
    form.appendChild(vigilEditor.el);
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
    const data = collect(getters, avatarInput, vigilEditor.getValue);
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

function buildEditorSection(section, fieldEls) {
  const wrap = document.createElement('section');
  wrap.className = 'character-editor-section';
  wrap.dataset.characterEditorSection = section.key;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'settings-section-title character-editor-section-title';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', `character-editor-panel-${section.key}`);

  const text = document.createElement('span');
  text.className = 'character-editor-section-text';
  const title = document.createElement('span');
  title.textContent = section.title;
  text.appendChild(title);
  if (section.hint) {
    const hint = document.createElement('span');
    hint.className = 'character-editor-section-hint';
    hint.textContent = section.hint;
    text.appendChild(hint);
  }
  button.appendChild(text);

  const icon = createIcon('chevron', { size: 18 });
  icon.classList.add('settings-chevron');
  button.appendChild(icon);
  wrap.appendChild(button);

  const panel = document.createElement('div');
  panel.className = 'settings-card settings-collapsible-card character-editor-section-card';
  panel.id = `character-editor-panel-${section.key}`;
  panel.hidden = true;
  for (const key of section.fields) {
    const el = fieldEls[key];
    if (el) panel.appendChild(el);
  }
  button.addEventListener('click', () => {
    const next = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', next ? 'true' : 'false');
    panel.hidden = !next;
  });
  wrap.appendChild(panel);
  return wrap;
}

function buildVigilEditor(vigilSource) {
  const vigil = normalizeVigil(vigilSource);
  const wrap = document.createElement('div');
  wrap.className = 'vigil-character-editor';

  const note = document.createElement('p');
  note.className = 'form-hint';
  note.textContent = '推播需在電腦執行駐守服務，見設定頁駐守區塊';
  wrap.appendChild(note);

  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'form-field form-check';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabled.checked = vigil.enabled;
  const enabledText = document.createElement('span');
  enabledText.className = 'form-check-label';
  enabledText.textContent = '開啟駐守推播';
  enabledLabel.appendChild(enabled);
  enabledLabel.appendChild(enabledText);
  wrap.appendChild(enabledLabel);

  const dailyLimit = document.createElement('input');
  dailyLimit.type = 'number';
  dailyLimit.min = '0';
  dailyLimit.max = '200';
  dailyLimit.step = '1';
  dailyLimit.className = 'form-control';
  dailyLimit.value = String(vigil.dailyLimit);
  wrap.appendChild(wrapField('每日最多推幾則', dailyLimit));

  const nickname = document.createElement('input');
  nickname.type = 'text';
  nickname.className = 'form-control';
  nickname.value = vigil.nickname;
  nickname.placeholder = '空白則使用玩家名';
  wrap.appendChild(wrapField('推播中對玩家的稱呼', nickname));

  const pushPersona = document.createElement('textarea');
  pushPersona.className = 'form-control';
  pushPersona.rows = 2;
  pushPersona.value = vigil.pushPersona;
  pushPersona.placeholder = '空白則自動取角色人設前 100 字';
  wrap.appendChild(wrapField('一句話推播人設', pushPersona));

  const fallbackLines = document.createElement('textarea');
  fallbackLines.className = 'form-control';
  fallbackLines.rows = 4;
  fallbackLines.value = vigil.fallbackLines.join('\n');
  fallbackLines.placeholder = '一行一句';
  wrap.appendChild(wrapField('橋不通時的預備句', fallbackLines));

  return {
    el: wrap,
    getValue: () => ({
      enabled: enabled.checked,
      dailyLimit: Math.max(0, Math.floor(Number(dailyLimit.value) || 0)),
      nickname: nickname.value,
      pushPersona: pushPersona.value,
      fallbackLines: fallbackLines.value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    })
  };
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

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = original;
    btn.disabled = false;
  }, 1200);
}
