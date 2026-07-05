// src/ui/toggle.js
//
// Accessible switch helper. It keeps native checkbox behavior while exposing a
// switch role and a consistent visual structure for settings controls.

export function createToggle({
  checked = false,
  label = '',
  description = '',
  className = '',
  onChange
} = {}) {
  const wrap = document.createElement('label');
  wrap.className = `toggle-field${className ? ` ${className}` : ''}`;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'toggle-input';
  input.checked = !!checked;
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-checked', input.checked ? 'true' : 'false');

  const switchEl = document.createElement('span');
  switchEl.className = 'toggle-switch';
  switchEl.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'toggle-text';
  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'toggle-label';
    labelEl.textContent = label;
    text.appendChild(labelEl);
  }
  if (description) {
    const descEl = document.createElement('span');
    descEl.className = 'toggle-description';
    descEl.textContent = description;
    text.appendChild(descEl);
  }

  input.addEventListener('change', () => {
    input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
    if (typeof onChange === 'function') onChange(input.checked, input);
  });

  wrap.appendChild(input);
  wrap.appendChild(switchEl);
  wrap.appendChild(text);

  return { el: wrap, input };
}
