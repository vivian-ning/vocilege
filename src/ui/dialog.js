export function confirmDialog({
  title = '確認',
  message = '',
  confirmText = '確定',
  cancelText = '取消',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal confirm-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;

    const titleEl = document.createElement('h2');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    dialog.appendChild(titleEl);

    if (message) {
      const messageEl = document.createElement('p');
      messageEl.className = 'confirm-message';
      messageEl.textContent = message;
      dialog.appendChild(messageEl);
    }

    const actions = document.createElement('div');
    actions.className = 'form-actions confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = cancelText;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = danger ? 'btn btn-danger' : 'btn btn-primary';
    confirm.textContent = confirmText;
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (previous && typeof previous.focus === 'function') previous.focus();
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      }
    };
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false);
    });
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => dialog.focus());
  });
}
