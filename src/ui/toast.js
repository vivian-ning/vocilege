export function showToast(message, action = null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('vocilege:toast', { detail: { message, action } }));
}
