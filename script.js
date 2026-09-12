const menuButton = document.getElementById('menu');
const nav = document.getElementById('nav');
const statusEl = document.getElementById('storeStatus');
const statusTextEl = document.getElementById('storeStatusText');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    nav.classList.toggle('open');
  });

  document.querySelectorAll('.nav a').forEach((link) => {
    link.addEventListener('click', () => nav.classList.remove('open'));
  });
}

function updateStoreStatus() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  let label = 'Cerrado';
  let cssClass = 'status-closed';

  if (totalMinutes >= 19 * 60 && totalMinutes < 19 * 60 + 30) {
    label = 'Abrirá pronto';
    cssClass = 'status-soon';
  } else if (totalMinutes >= 19 * 60 + 30 && totalMinutes < 23 * 60) {
    label = 'Abierto';
    cssClass = 'status-open';
  } else if (totalMinutes >= 23 * 60 && totalMinutes < 23 * 60 + 30) {
    label = 'Pronto cerramos';
    cssClass = 'status-closing';
  } else if (totalMinutes >= 23 * 60 + 30) {
    label = 'Cerrado';
    cssClass = 'status-closed';
  }

  if (statusTextEl) {
    statusTextEl.textContent = label;
  }

  if (statusEl) {
    statusEl.className = `store-status ${cssClass}`;
  }
}

updateStoreStatus();
setInterval(updateStoreStatus, 60000);
