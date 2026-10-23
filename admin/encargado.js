const SESSION_KEY = 'taz_admin_session';
const STORAGE_KEY = 'taz_admin_records';
const EMPLOYEES_KEY = 'taz_employees';
const BRANCHES = ['Centro', 'Ciudad de Nieva', 'Alto Comedero', 'Hattogu'];

function setupModal() {
  let modal = document.getElementById('appModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'appModal';
    modal.className = 'app-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
        <div class="modal-header">
          <h3 id="appModalTitle">Mensaje</h3>
          <button type="button" class="modal-close" data-modal-close="true" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body" id="appModalBody"></div>
        <div class="modal-actions">
          <button type="button" class="secondary-btn" data-modal-action="cancel">Cancelar</button>
          <button type="button" class="primary-btn" data-modal-action="confirm">Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const closeBtn = modal.querySelector('[data-modal-close="true"]');
  const cancelBtn = modal.querySelector('[data-modal-action="cancel"]');
  const confirmBtn = modal.querySelector('[data-modal-action="confirm"]');

  const hide = () => {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.querySelector('#appModalBody').innerHTML = '';
    modal.querySelector('#appModalTitle').textContent = 'Mensaje';
    cancelBtn.style.display = 'inline-flex';
    confirmBtn.textContent = 'Aceptar';
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
    modal.onclick = null;
  };

  const show = ({ title, body, confirmText = 'Aceptar', cancelText = 'Cancelar', showCancel = true, onConfirm = null, onCancel = null, allowBackdropClose = true }) => {
    modal.querySelector('#appModalTitle').textContent = title || 'Mensaje';
    modal.querySelector('#appModalBody').innerHTML = body || '';
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
    confirmBtn.textContent = confirmText;

    cancelBtn.onclick = () => {
      hide();
      if (onCancel) onCancel();
    };

    confirmBtn.onclick = () => {
      hide();
      if (onConfirm) onConfirm();
    };

    closeBtn.onclick = () => {
      hide();
      if (onCancel) onCancel();
    };

    if (allowBackdropClose) {
      modal.onclick = (event) => {
        if (event.target === modal) {
          hide();
          if (onCancel) onCancel();
        }
      };
    } else {
      modal.onclick = null;
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  };

  hide();
  return { show, hide };
}

function showNotice(title, message, type = 'info') {
  const modal = setupModal();
  if (!modal) return;

  const accent = type === 'error' ? 'rgba(242, 13, 22, 0.7)' : type === 'success' ? 'rgba(123, 247, 169, 0.7)' : 'rgba(255, 255, 255, 0.1)';
  const card = document.querySelector('#appModal .modal-card');
  if (card) {
    card.style.borderColor = accent;
  }

  modal.show({
    title,
    body: `<p>${message}</p>`,
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    showCancel: false,
    onConfirm: null,
    onCancel: null,
    allowBackdropClose: true
  });
}

function getStoredEmployees() {
  try {
    return JSON.parse(localStorage.getItem(EMPLOYEES_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function getStoredRecords() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveStoredRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function sanitizeNumber(value) {
  return String(value ?? '').replace(/[^\d]/g, '') || '0';
}

function money(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value||0));
}

async function getSessionEncargado() {
  try {
    const data = await fetch('/api/session', { credentials: 'include' });
    if (!data.ok) return null;
    const payload = await data.json();
    if (payload && payload.user && payload.user.role === 'Encargado') {
      sessionStorage.setItem(SESSION_KEY, `encargado:${payload.user.username}`);
      return payload.user.username;
    }
  } catch (error) {
    // fallback to sessionStorage when server session is unavailable
  }

  const session = sessionStorage.getItem(SESSION_KEY) || '';
  if (session.startsWith('encargado:')) return session.split(':')[1];
  return null;
}

async function initPage() {
  const phone = await getSessionEncargado();
  const sessionValue = sessionStorage.getItem(SESSION_KEY) || '';
  if (!phone) { window.location.href = '/admin/index.html'; return; }

  const employees = getStoredEmployees();
  const emp = employees.find((e) => e.phone === phone);
  const nameEl = document.getElementById('encargadoName');
  const userEl = document.getElementById('encUser');
  const branchSelect = document.getElementById('encBranch');

  BRANCHES.forEach((b) => {
    const opt = document.createElement('option'); opt.value = b; opt.textContent = b; branchSelect.appendChild(opt);
  });

  if (emp) {
    const fullName = `${emp.name || ''} ${emp.lastName || ''}`.trim() || emp.phone;
    if (nameEl) nameEl.textContent = `Encargado — ${fullName}`;
    if (userEl) userEl.textContent = fullName;
    if (branchSelect) branchSelect.value = emp.branch || BRANCHES[0];
  } else {
    const fallbackUser = sessionValue.startsWith('encargado:') ? sessionValue.split(':')[1] : 'Encargado';
    if (nameEl) nameEl.textContent = `Encargado — ${fallbackUser}`;
    if (userEl) userEl.textContent = fallbackUser;
  }

  const dateInput = document.getElementById('encDate');
  const timeInput = document.getElementById('encTime');
  const cash = document.getElementById('encCash');
  const transfer = document.getElementById('encTransfer');
  const qr = document.getElementById('encQR');
  const pedidos = document.getElementById('encPedidosYa');
  const totalEl = document.getElementById('encTotal');

  const setDefault = () => {
    const today = new Date();
    dateInput.value = today.toISOString().slice(0,10);
    timeInput.value = today.toLocaleTimeString('es-AR', { hour12:false }).slice(0,5);
  };
  setDefault();

  function updateTotal() {
    const c = Number(sanitizeNumber(cash.value));
    const t = Number(sanitizeNumber(transfer.value));
    const q = Number(sanitizeNumber(qr.value));
    const p = Number(sanitizeNumber(pedidos.value));
    const sum = c + t + q + p;
    totalEl.textContent = money(sum);
    return sum;
  }

  [cash, transfer, qr, pedidos].forEach((el) => el?.addEventListener('input', updateTotal));
  updateTotal();

  const form = document.getElementById('encForm');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fecha = dateInput.value;
    const hora = timeInput.value + ':00';
    const sucursal = branchSelect.value;
    const efectivo = Number(sanitizeNumber(cash.value));
    const transferencias = Number(sanitizeNumber(transfer.value));
    const qrVal = Number(sanitizeNumber(qr.value));
    const pedidosYa = Number(sanitizeNumber(pedidos.value));
    const notas = document.getElementById('encNotes').value.trim();
    const stock = document.getElementById('encStock').value.trim();
    const usuario = emp ? `${emp.name || ''} ${emp.lastName || ''}`.trim() || emp.phone : phone;
    const total = efectivo + transferencias + qrVal + pedidosYa;
    const sessionState = sessionStorage.getItem(SESSION_KEY);
    if (sessionState) {
      try {
        const resp = await fetch('/api/records', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha, sucursal, efectivo, transferencias, qr: qrVal, pedidosYa, notas, stock })
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || 'Error en servidor');
        }
        showNotice('Registro enviado', 'El ingreso fue enviado correctamente.', 'success');
        form.reset();
        setDefault();
        updateTotal();
      } catch (err) {
        showNotice('No se pudo enviar', err.message || 'No se pudo enviar el registro al servidor.', 'error');
      }
    } else {
      const records = getStoredRecords();
      records.push({
        id: `${Date.now()}-${sucursal}`,
        fecha,
        hora,
        usuario,
        sucursal,
        efectivo,
        transferencias,
        qr: qrVal,
        pedidosYa,
        notas: notas || '',
        stock: stock || '',
        total
      });

      saveStoredRecords(records);
      showNotice('Registro enviado', 'El ingreso fue enviado correctamente.', 'success');
      form.reset();
      setDefault();
      updateTotal();
    }
  });

  const logout = document.getElementById('logoutBtn');
  logout?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = '/admin/index.html';
  });
}

document.addEventListener('DOMContentLoaded', initPage);
