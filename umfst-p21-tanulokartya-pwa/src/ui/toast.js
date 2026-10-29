// src/ui/toast.js – Segédfüggvények és visszajelző üzenetek (toast)

/**
 * Biztonságos HTML szöveg-escape XSS elkerülésére.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Lebegő értesítés megjelenítése a képernyő jobb alsó sarkában.
 * @param {string} uzenet
 * @param {'info'|'success'|'error'} [tipus='info']
 */
export function mutasdUzenetet(uzenet, tipus = 'info') {
  const kontener = document.getElementById('toast-container');
  if (!kontener) return;

  const elem = document.createElement('div');
  elem.className = `toast toast-${tipus}`;
  elem.setAttribute('role', 'status');
  elem.textContent = uzenet;

  kontener.appendChild(elem);

  setTimeout(() => {
    elem.classList.add('toast-hide');
    setTimeout(() => elem.remove(), 300);
  }, 3600);
}
