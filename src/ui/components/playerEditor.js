// src/ui/components/playerEditor.js
//
// 右欄「玩家設定」分頁（第八節）。playerName、playerDescription、avatar emoji。
// 儲存後更新 state.player。

import { updatePlayer } from '../../state/store.js';

export function renderPlayerEditor(container, state) {
  container.textContent = '';

  const player = state.player || {};

  const form = document.createElement('form');
  form.className = 'char-form';

  const nameField = field('玩家名稱', 'input', player.playerName || '', '你的稱呼');
  const descField = field('玩家描述', 'textarea', player.playerDescription || '', '一句話描述你自己（會提供給角色）');
  const avatarField = field('頭像 emoji', 'input', player.avatar ? player.avatar.value : '🙂', '🙂');

  form.appendChild(nameField.el);
  form.appendChild(descField.el);
  form.appendChild(avatarField.el);

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-primary';
  save.textContent = '儲存玩家設定';
  actions.appendChild(save);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updatePlayer({
      playerName: nameField.getValue(),
      playerDescription: descField.getValue(),
      avatar: { type: 'emoji', value: avatarField.getValue().trim() || '🙂' }
    });
    const original = save.textContent;
    save.textContent = '已儲存 ✓';
    save.disabled = true;
    setTimeout(() => { save.textContent = original; save.disabled = false; }, 1200);
  });

  container.appendChild(form);
}

function field(label, type, value, placeholder) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'form-label';
  labelEl.textContent = label;
  el.appendChild(labelEl);

  let control;
  if (type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = 2;
  } else {
    control = document.createElement('input');
    control.type = 'text';
  }
  control.className = 'form-control';
  control.value = value;
  control.placeholder = placeholder || '';
  el.appendChild(control);

  return { el, getValue: () => control.value };
}
