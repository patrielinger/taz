const SESSION_KEY = 'taz_admin_session';
const STORAGE_KEY = 'taz_admin_records';
const EMPLOYEES_KEY = 'taz_employees';
const ADMIN_USERS = [{ username: 'admin', password: 'tazadmin123', name: 'Administrador' }];
const BRANCHES = ['Centro', 'Ciudad de Nieva', 'Alto Comedero', 'Hattogu'];
const ANALYTICS_OPTIONS = ['Negocio', ...BRANCHES];

function normalizeBranchName(branch) {
  const value = String(branch || '').trim();
  if (!value) return 'Centro';
  const map = {
    Nieva: 'Ciudad de Nieva',
    'Ciudad de Nieva': 'Ciudad de Nieva',
    Hattogu: 'Hattogu',
    'Jatobú': 'Hattogu',
    Centro: 'Centro',
    'Alto Comedero': 'Alto Comedero'
  };
  return map[value] || value;
}

function ensureDemoData() {
  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (records && records.length) return records;

  const today = new Date();
  const demoRecords = [];

  for (let i = 0; i < 12; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const fecha = date.toISOString().slice(0, 10);

    BRANCHES.forEach((branch, index) => {
      const efectivo = 3000 + (i * 150) + index * 400;
      const transferencias = 2000 + (i * 100) + index * 280;
      const qr = 1500 + (i * 110) + index * 300;

      demoRecords.push({
        id: `${fecha}-${branch}`,
        fecha,
        hora: '19:30:00',
        usuario: 'admin',
        sucursal: branch,
        efectivo,
        transferencias,
        qr,
        notas: 'Registro demo inicial',
        total: efectivo + transferencias + qr
      });
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(demoRecords));
  return demoRecords;
}

function getStoredRecords() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return ensureDemoData();

  try {
    return JSON.parse(stored);
  } catch (error) {
    return ensureDemoData();
  }
}

function saveStoredRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getStoredEmployees() {
  const stored = localStorage.getItem(EMPLOYEES_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (error) {
    return [];
  }
}

function saveStoredEmployees(employees) {
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
}

function normalizeEmployee(row) {
  return {
    id: row.id,
    name: row.name || '',
    lastName: row.last_name || row.lastName || '',
    role: row.role || 'Empleado',
    hourlyRate: Number(row.hourly_rate ?? row.hourlyRate ?? 0),
    phone: row.phone || '',
    branch: row.branch || 'Centro',
    notes: row.notes || '',
    password: row.password || ''
  };
}

async function syncSessionFromServer() {
  try {
    const data = await fetchJson('/api/session');
    if (data && data.user) {
      const sessionValue = data.user.role === 'Encargado' ? `encargado:${data.user.username}` : data.user.username;
      sessionStorage.setItem(SESSION_KEY, sessionValue);
      return data.user;
    }
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  } catch (error) {
    return null;
  }
}

function sanitizeNumber(value) {
  return String(value || '').replace(/[^\d]/g, '') || '0';
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : { message: await response.text() };

  if (!response.ok) {
    throw new Error(data.message || 'Error de API');
  }

  return data;
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setDefaultDate() {
  const today = new Date();
  const todayStr = formatDateInput(today);

  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 30);
  const startDateStr = formatDateInput(startDate);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = formatDateInput(tomorrow);

  const dateInput = document.getElementById('incomeDate');
  const dayFilter = document.getElementById('dayFilter');
  const chartStart = document.getElementById('chartStart');
  const chartEnd = document.getElementById('chartEnd');

  if (dateInput) dateInput.value = todayStr;
  if (dayFilter) dayFilter.value = todayStr;
  if (chartStart) chartStart.value = startDateStr;
  if (chartEnd) chartEnd.value = tomorrowStr;
}

function getSelectedDayRecords(records, date) {
  return records.filter((record) => record.fecha === date);
}

function renderBranchSummary(records) {
  const dayFilterInput = document.getElementById('dayFilter');
  const day = dayFilterInput ? dayFilterInput.value : new Date().toISOString().slice(0, 10);
  const rows = document.getElementById('branchSummaryTable');

  if (!rows) return;

  const dayRecords = getSelectedDayRecords(records, day);
  const totals = BRANCHES.map((branch) => {
    const filtered = dayRecords.filter((record) => normalizeBranchName(record.sucursal) === branch);
    return {
      branch,
      efectivo: filtered.reduce((sum, item) => sum + Number(item.efectivo || 0), 0),
      transferencias: filtered.reduce((sum, item) => sum + Number(item.transferencias || 0), 0),
      qr: filtered.reduce((sum, item) => sum + Number(item.qr || 0), 0),
      pedidosYa: filtered.reduce((sum, item) => sum + Number(item.pedidosYa || 0), 0),
      total: filtered.reduce((sum, item) => sum + Number(item.total || 0), 0)
    };
  });

  rows.innerHTML = totals.map((item) => `
    <tr>
      <td>${item.branch}</td>
      <td>${money(item.efectivo)}</td>
      <td>${money(item.transferencias)}</td>
      <td>${money(item.qr)}</td>
      <td>${money(item.pedidosYa)}</td>
      <td>${money(item.total)}</td>
    </tr>
  `).join('');

  const todayTotal = totals.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const dayTotalEl = document.getElementById('dayTotal');
  if (dayTotalEl) dayTotalEl.textContent = money(todayTotal);

  const monthTotalEl = document.getElementById('monthTotal');
  if (monthTotalEl) {
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthKey = monthStart.toISOString().slice(0, 7);
    const monthSum = records
      .filter((record) => record.fecha.startsWith(monthKey))
      .reduce((sum, record) => sum + Number(record.total || 0), 0);
    monthTotalEl.textContent = money(monthSum);
  }

  const branchAverageEl = document.getElementById('branchAverage');
  if (branchAverageEl) {
    const avg = totals.length ? todayTotal / totals.length : 0;
    branchAverageEl.textContent = money(avg);
  }
}

function renderRecords(records) {
  const dayFilterInput = document.getElementById('dayFilter');
  const day = dayFilterInput ? dayFilterInput.value : new Date().toISOString().slice(0, 10);
  const table = document.getElementById('dailyRecordsTable');

  if (!table) return;

  const filteredRecords = getSelectedDayRecords(records, day).sort((a, b) => String(b.id).localeCompare(String(a.id)));

  if (!filteredRecords.length) {
    table.innerHTML = `
        <tr>
          <td colspan="11">No hay ingresos cargados para esta fecha.</td>
        </tr>
    `;
    return;
  }

  table.innerHTML = filteredRecords.map((record) => `
    <tr>
      <td>${record.sucursal}</td>
      <td>${record.fecha}</td>
      <td>${record.hora}</td>
      <td>${record.usuario}</td>
      <td>${money(record.efectivo)}</td>
      <td>${money(record.transferencias)}</td>
      <td>${money(record.qr)}</td>
      <td>${money(record.pedidosYa || 0)}</td>
      <td>${money(record.total)}</td>
      <td>${record.notas || '—'}</td>
      <td>${record.stock || '—'}</td>
    </tr>
  `).join('');
}

function renderLastRecord(records) {
  const panel = document.getElementById('lastRecordPanel');
  const content = document.getElementById('lastRecordContent');
  if (!panel || !content) return;

  // Find latest record by fecha+hora (or use timestamp if available)
  let latest = null;
  let latestTs = 0;
  records.forEach((r) => {
    let ts = 0;
    if (r.created_at) {
      ts = Date.parse(r.created_at);
    } else if (r.fecha && r.hora) {
      ts = Date.parse(`${r.fecha}T${r.hora}`);
    } else if (r.fecha) {
      ts = Date.parse(r.fecha);
    }
    if (ts && ts > latestTs) { latestTs = ts; latest = r; }
  });

  if (!latest) { panel.style.display = 'none'; return; }

  const now = Date.now();
  if (latestTs < now - 24 * 60 * 60 * 1000) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  content.innerHTML = `
    <div><strong>${latest.sucursal}</strong> — ${latest.usuario} — ${latest.fecha} ${latest.hora}</div>
    <div>Efectivo: ${money(latest.efectivo)} — Transferencias: ${money(latest.transferencias)} — QR: ${money(latest.qr)} — PedidosYa: ${money(latest.pedidosYa || 0)}</div>
    <div>Total: ${money(latest.total)}</div>
    <div>Notas: ${latest.notas || '—'}</div>
    <div>Stock: ${latest.stock || '—'}</div>
  `;
}

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
    modal.dataset.mode = 'info';
    modal.querySelector('#appModalBody').innerHTML = '';
    modal.querySelector('#appModalTitle').textContent = 'Mensaje';
    cancelBtn.style.display = 'inline-flex';
    confirmBtn.textContent = 'Aceptar';
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
    modal.onclick = null;
  };

  const show = ({ title, body, onConfirm, onCancel, confirmText = 'Aceptar', cancelText = 'Cancelar', showCancel = true, allowBackdropClose = true }) => {
    const titleEl = modal.querySelector('#appModalTitle');
    const bodyEl = modal.querySelector('#appModalBody');
    titleEl.textContent = title || 'Mensaje';
    bodyEl.innerHTML = body || '';

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

  const body = `<p>${message}</p>`;
  modal.show({
    title,
    body,
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    showCancel: false,
    onConfirm: null,
    onCancel: null,
    allowBackdropClose: true
  });

  const card = document.querySelector('#appModal .modal-card');
  if (card) {
    card.style.borderColor = type === 'error' ? 'rgba(242, 13, 22, 0.7)' : type === 'success' ? 'rgba(123, 247, 169, 0.7)' : 'rgba(255, 255, 255, 0.1)';
  }
}

function openRecordEditor(record, onSave) {
  const modal = setupModal();
  if (!modal) return;

  const body = `
    <form id="recordEditForm" class="modal-form admin-form">
      <div class="field-row two-cols">
        <div class="field-group">
          <label for="editRecordDate">Fecha</label>
          <input id="editRecordDate" type="date" value="${record.fecha || ''}" required>
        </div>
        <div class="field-group">
          <label for="editRecordBranch">Sucursal</label>
          <select id="editRecordBranch">
            ${BRANCHES.map((branch) => `<option value="${branch}" ${branch === record.sucursal ? 'selected' : ''}>${branch}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field-row payment-grid">
        <div class="field-group">
          <label for="editRecordCash">Efectivo</label>
          <input id="editRecordCash" type="text" inputmode="numeric" value="${Number(record.efectivo || 0)}">
        </div>
        <div class="field-group">
          <label for="editRecordTransfer">Transferencias</label>
          <input id="editRecordTransfer" type="text" inputmode="numeric" value="${Number(record.transferencias || 0)}">
        </div>
        <div class="field-group">
          <label for="editRecordQr">QR</label>
          <input id="editRecordQr" type="text" inputmode="numeric" value="${Number(record.qr || 0)}">
        </div>
        <div class="field-group">
          <label for="editRecordPedidosYa">PedidosYa</label>
          <input id="editRecordPedidosYa" type="text" inputmode="numeric" value="${Number(record.pedidosYa ?? record.pedidos_ya ?? 0)}">
        </div>
      </div>
      <div class="field-row notes-stock-grid">
        <div class="field-group">
          <label for="editRecordNotes">Notas</label>
          <textarea id="editRecordNotes" rows="4">${(record.notas || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        <div class="field-group">
          <label for="editRecordStock">Stock</label>
          <textarea id="editRecordStock" rows="4">${(record.stock || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
      </div>
    </form>
  `;

  modal.show({
    title: 'Editar ingreso',
    body,
    confirmText: 'Guardar',
    cancelText: 'Cancelar',
    showCancel: true,
    allowBackdropClose: true,
    onConfirm: () => {
      const form = document.getElementById('recordEditForm');
      if (!form) return;
      const payload = {
        fecha: document.getElementById('editRecordDate').value,
        sucursal: document.getElementById('editRecordBranch').value,
        efectivo: Number(sanitizeNumber(document.getElementById('editRecordCash').value)),
        transferencias: Number(sanitizeNumber(document.getElementById('editRecordTransfer').value)),
        qr: Number(sanitizeNumber(document.getElementById('editRecordQr').value)),
        pedidosYa: Number(sanitizeNumber(document.getElementById('editRecordPedidosYa').value)),
        notas: document.getElementById('editRecordNotes').value.trim(),
        stock: document.getElementById('editRecordStock').value.trim(),
      };
      onSave(payload);
    }
  });
}

async function renderRecordsByDate(date) {
  const table = document.getElementById('recordsByDateTable');
  if (!table) return;

  const records = await loadRecords();
  const filtered = records.filter((r) => r.fecha === date).sort((a, b) => String(a.hora).localeCompare(b.hora));

  if (!filtered.length) {
    table.innerHTML = '<tr><td colspan="11">No hay registros para la fecha seleccionada.</td></tr>';
    return;
  }

  const isAdmin = !(sessionStorage.getItem(SESSION_KEY) || '').startsWith('encargado:');

  table.innerHTML = filtered.map((record) => `
    <tr data-id="${record.id}">
      <td>${record.hora || ''}</td>
      <td>${record.sucursal}</td>
      <td>${record.usuario}</td>
      <td>${money(record.efectivo)}</td>
      <td>${money(record.transferencias)}</td>
      <td>${money(record.qr)}</td>
      <td>${money(record.pedidosYa || record.pedidos_ya || 0)}</td>
      <td>${money(record.total)}</td>
      <td>${record.notas || '—'}</td>
      <td>${record.stock || '—'}</td>
      <td>${isAdmin ? `<button class="secondary-btn edit-record" data-id="${record.id}">Editar</button> <button class="secondary-btn delete-record" data-id="${record.id}">Eliminar</button>` : '—'}</td>
    </tr>
  `).join('');

  if (isAdmin) {
    document.querySelectorAll('.edit-record').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const r = filtered.find((x) => String(x.id) === String(id));
      if (!r) return;

      openRecordEditor(r, async (payload) => {
        try {
          await fetchJson(`/api/records/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ fecha: payload.fecha || r.fecha, sucursal: payload.sucursal || r.sucursal, efectivo: payload.efectivo, transferencias: payload.transferencias, qr: payload.qr, pedidosYa: payload.pedidosYa, notas: payload.notas, stock: payload.stock })
          });
          await renderRecordsByDate(date);
          await renderDashboard();
          showNotice('Registro actualizado', 'El ingreso fue actualizado correctamente.', 'success');
        } catch (err) {
          showNotice('No se pudo actualizar', err.message || 'No se pudo actualizar el registro.', 'error');
        }
      });
    }));

    document.querySelectorAll('.delete-record').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const r = filtered.find((x) => String(x.id) === String(id));
      if (!r) return;

      setupModal().show({
        title: 'Eliminar ingreso',
        body: `<p>¿Eliminar el registro de ${r.sucursal} del ${r.fecha}?</p>`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        showCancel: true,
        onConfirm: async () => {
          try {
            await fetchJson(`/api/records/${id}`, { method: 'DELETE' });
            await renderRecordsByDate(date);
            await renderDashboard();
            showNotice('Registro eliminado', 'El ingreso fue eliminado correctamente.', 'success');
          } catch (err) {
            showNotice('No se pudo eliminar', err.message || 'No se pudo eliminar el registro.', 'error');
          }
        }
      });
    }));
  }
}

function createChartTooltip() {
  let tooltip = document.getElementById('chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.className = 'chart-tooltip';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function setupChartHover(canvas, points) {
  if (!canvas) return;

  const tooltip = createChartTooltip();
  const radius = 10;

  if (!canvas.dataset.chartHoverBound) {
    canvas.dataset.chartHoverBound = 'true';
    canvas.addEventListener('mousemove', (event) => {
      const list = canvas.__chartPoints || [];
      if (!list.length) {
        tooltip.style.opacity = '0';
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      let closest = null;
      list.forEach((point) => {
        const dx = mouseX - point.x;
        const dy = mouseY - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius && (!closest || distance < closest.distance)) {
          closest = { point, distance };
        }
      });

      if (!closest) {
        tooltip.style.opacity = '0';
        return;
      }

      const { point } = closest;
      tooltip.innerHTML = `<strong>${point.date}</strong><span>${money(point.total)}</span>`;
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY - 20}px`;
      tooltip.style.opacity = '1';
    });

    canvas.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
    });

    canvas.addEventListener('click', (event) => {
      const list = canvas.__chartPoints || [];
      if (!list.length) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      let closest = null;
      list.forEach((point) => {
        const dx = mouseX - point.x;
        const dy = mouseY - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius && (!closest || distance < closest.distance)) {
          closest = { point, distance };
        }
      });

      if (!closest) return;
      const { point } = closest;
      tooltip.innerHTML = `<strong>${point.date}</strong><span>${money(point.total)}</span>`;
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY - 20}px`;
      tooltip.style.opacity = '1';
    });
  }

  canvas.__chartPoints = points;
  tooltip.style.opacity = '0';
}

function drawChart(records) {
  const canvas = document.getElementById('incomeChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const startDate = document.getElementById('chartStart');
  const endDate = document.getElementById('chartEnd');

  const sourceRecords = Array.isArray(records) ? records : getStoredRecords();
  const start = startDate && startDate.value ? new Date(startDate.value + 'T00:00:00') : new Date();
  const end = endDate && endDate.value ? new Date(endDate.value + 'T00:00:00') : new Date();

  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const amounts = dates.map((date) => {
    const iso = date.toISOString().slice(0, 10);
    return sourceRecords.filter((record) => record.fecha === iso).reduce((sum, record) => sum + Number(record.total || 0), 0);
  });

  const width = canvas.width;
  const height = canvas.height;
  const padding = 30;
  const maxValue = Math.max(...amounts, 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + ((height - padding * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();

  if (!amounts.length) {
    ctx.fillStyle = '#b5b5b5';
    ctx.font = '18px Barlow Condensed';
    ctx.fillText('Sin datos para el rango seleccionado', padding, height / 2);
    setupChartHover(canvas, []);
    return;
  }

  const stepX = (width - padding * 2) / Math.max(amounts.length - 1, 1);
  const points = [];

  ctx.beginPath();
  ctx.strokeStyle = '#f20d16';
  ctx.lineWidth = 2;

  amounts.forEach((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    points.push({ x, y, date: dates[index].toISOString().slice(0, 10), total: value });
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.fillStyle = '#f20d16';
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  setupChartHover(canvas, points);
}

async function loadRecords() {
  try {
    const sessionState = sessionStorage.getItem(SESSION_KEY);
    if (!sessionState) return getStoredRecords();

    const data = await fetchJson('/api/records');
    if (Array.isArray(data)) {
      return data.map((record) => ({
        id: record.id,
        fecha: record.fecha,
        hora: record.hora || (record.created_at ? new Date(record.created_at).toLocaleTimeString('es-AR', { hour12: false }) : '00:00:00'),
        usuario: record.usuario,
        sucursal: record.sucursal,
        efectivo: Number(record.efectivo || 0),
        transferencias: Number(record.transferencias || 0),
        qr: Number(record.qr || 0),
        pedidosYa: Number(record.pedidosYa ?? record.pedidos_ya ?? 0),
        notas: record.notas || '',
        stock: record.stock || '',
        total: Number(record.total || 0),
        created_at: record.created_at || null
      }));
    }
  } catch (error) {
    return getStoredRecords();
  }

  return getStoredRecords();
}

function getRecordsForAnalytics(scope, records) {
  if (scope === 'Negocio') return records;
  return records.filter((record) => normalizeBranchName(record.sucursal) === scope);
}

function getActiveAnalyticsRange() {
  const today = new Date();
  const rangeButton = document.querySelector('.analytics-range-btn.active');
  const fromDate = document.getElementById('analyticsFromDate');
  const toDate = document.getElementById('analyticsToDate');

  if (rangeButton) {
    const days = Number(rangeButton.dataset.days || 7);
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));
    const end = new Date(today);
    if (fromDate) fromDate.value = formatDateInput(start);
    if (toDate) toDate.value = formatDateInput(end);
    return { start, end, label: `últimos ${days} días`, days };
  }

  const startValue = fromDate && fromDate.value ? new Date(`${fromDate.value}T00:00:00`) : new Date(today);
  const endValue = toDate && toDate.value ? new Date(`${toDate.value}T00:00:00`) : new Date(today);
  const safeStart = startValue <= endValue ? startValue : endValue;
  const safeEnd = startValue <= endValue ? endValue : startValue;

  if (fromDate) fromDate.value = formatDateInput(safeStart);
  if (toDate) toDate.value = formatDateInput(safeEnd);

  return { start: safeStart, end: safeEnd, label: 'rango personalizado', days: Math.max(1, Math.round((safeEnd - safeStart) / 86400000) + 1) };
}

async function renderAnalytics() {
  const analyticsScope = document.querySelector('.analytics-tab.active')?.dataset.analytics || 'Negocio';
  const records = await loadRecords();
  const source = getRecordsForAnalytics(analyticsScope, records);
  const chartTitle = document.getElementById('analyticsChartTitle');
  const tableTitle = document.getElementById('analyticsTableTitle');
  const thirtyTotal = document.getElementById('analyticsThirtyTotal');
  const monthTotal = document.getElementById('analyticsMonthTotal');
  const dailyAverage = document.getElementById('analyticsDailyAverage');
  const table = document.getElementById('analyticsRecordsTable');
  const canvas = document.getElementById('analyticsChart');

  if (!canvas || !table || !thirtyTotal || !monthTotal || !dailyAverage) return;

  const today = new Date();
  const { start, end, label } = getActiveAnalyticsRange();
  const rangeRecords = source.filter((record) => {
    const dateValue = new Date(`${record.fecha}T00:00:00`);
    return dateValue >= start && dateValue <= end;
  });

  const monthRecords = source.filter((record) => record.fecha && record.fecha.startsWith(today.toISOString().slice(0, 7)));
  const selectedRecords = [...rangeRecords].sort((a, b) => String(b.id).localeCompare(String(a.id)));

  const rangeTotalValue = rangeRecords.reduce((sum, record) => sum + Number(record.total || 0), 0);
  const monthTotalValue = monthRecords.reduce((sum, record) => sum + Number(record.total || 0), 0);
  const avgValue = rangeRecords.length ? rangeTotalValue / Math.max(rangeRecords.length, 1) : 0;

  chartTitle.textContent = `${analyticsScope} · ${label}`;
  tableTitle.textContent = analyticsScope === 'Negocio' ? 'Historial general' : `Historial · ${analyticsScope}`;
  thirtyTotal.textContent = money(rangeTotalValue);
  monthTotal.textContent = money(monthTotalValue);
  dailyAverage.textContent = money(avgValue);

  const ctx = canvas.getContext('2d');
  const days = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const values = days.map((date) => {
    const iso = formatDateInput(date);
    return source.filter((record) => record.fecha === iso).reduce((sum, item) => sum + Number(item.total || 0), 0);
  });

  const width = canvas.width;
  const height = canvas.height;
  const padding = 30;
  const maxValue = Math.max(...values, 1);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + ((height - padding * 2) / 4) * i;
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.stroke();

  const chartPoints = [];
  if (values.length) {
    const stepX = (width - padding * 2) / Math.max(values.length - 1, 1);
    ctx.beginPath();
    ctx.strokeStyle = '#f20d16';
    ctx.lineWidth = 2;
    values.forEach((value, index) => {
      const x = padding + index * stepX;
      const y = height - padding - (value / maxValue) * (height - padding * 2);
      chartPoints.push({ x, y, date: days[index].toISOString().slice(0, 10), total: value });
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    chartPoints.forEach((point) => {
      ctx.beginPath();
      ctx.fillStyle = '#f20d16';
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  setupChartHover(canvas, chartPoints);

  if (!selectedRecords.length) {
    table.innerHTML = '<tr><td colspan="11">No hay registros para el rango seleccionado.</td></tr>';
    return;
  }

  table.innerHTML = selectedRecords.map((record) => `
    <tr>
      <td>${record.fecha}</td>
      <td>${record.hora || '—'}</td>
      <td>${normalizeBranchName(record.sucursal)}</td>
      <td>${record.usuario}</td>
      <td>${money(record.efectivo)}</td>
      <td>${money(record.transferencias)}</td>
      <td>${money(record.qr)}</td>
      <td>${money(record.pedidosYa || 0)}</td>
      <td>${money(record.total)}</td>
      <td>${record.notas || '—'}</td>
      <td>${record.stock || '—'}</td>
    </tr>
  `).join('');
}

async function renderDashboard() {
  const records = await loadRecords();
  renderBranchSummary(records);
  renderRecords(records);
  renderLastRecord(records);
  drawChart(records);
  await renderAnalytics();
}

function toggleSection(sectionName) {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionName);
  });

  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('active-section', section.id === sectionName);
  });

  if (sectionName === 'statistics') {
    renderAnalytics();
  }
}

async function getEmployees() {
  try {
    const sessionState = sessionStorage.getItem(SESSION_KEY);
    if (!sessionState) return getStoredEmployees();

    const data = await fetchJson('/api/employees');
    if (Array.isArray(data)) {
      return data.map(normalizeEmployee);
    }
  } catch (error) {
    return getStoredEmployees();
  }

  return getStoredEmployees();
}

async function renderEmployees() {
  const list = document.getElementById('employeeList');
  if (!list) return;

  const employees = await getEmployees();

  if (!employees.length) {
    list.innerHTML = '<div class="empty-state">No hay empleados cargados.</div>';
    return;
  }

  list.innerHTML = employees.map((employee) => `
    <article class="employee-card panel">
      <div class="employee-card-header">
        <div>
          <span class="employee-role">${employee.role}</span>
          <h3>${employee.name} ${employee.lastName}</h3>
        </div>
        <div class="form-actions">
          <button class="secondary-btn edit-employee" data-id="${employee.id}" type="button">Editar</button>
          <button class="secondary-btn delete-employee" data-id="${employee.id}" type="button">Eliminar</button>
        </div>
      </div>

      <div class="employee-meta">
        <p><strong>Sucursal:</strong> ${employee.branch}</p>
        <p><strong>Contacto:</strong> ${employee.phone}</p>
        <p><strong>Cobro por hora:</strong> ${money(employee.hourlyRate)}</p>
      </div>

      <div class="employee-notes">
        <strong>Notas del día:</strong>
        <p>${employee.notes || 'Sin notas.'}</p>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.edit-employee').forEach((button) => {
    button.addEventListener('click', () => {
      const employee = employees.find((item) => String(item.id) === String(button.dataset.id));
      if (!employee) return;

      const idField = document.getElementById('employeeId');
      const nameField = document.getElementById('employeeName');
      const lastNameField = document.getElementById('employeeLastName');
      const roleField = document.getElementById('employeeRole');
      const hourlyRateField = document.getElementById('employeeHourlyRate');
      const phoneField = document.getElementById('employeePhone');
      const notesField = document.getElementById('employeeNotes');
      const formTitle = document.getElementById('employeeFormTitle');
      const notesWrap = document.querySelector('.employee-notes-field');

      if (idField) idField.value = employee.id;
      if (nameField) nameField.value = employee.name;
      if (lastNameField) lastNameField.value = employee.lastName;
      if (roleField) roleField.value = employee.role;
      if (hourlyRateField) hourlyRateField.value = employee.hourlyRate;
      if (phoneField) phoneField.value = employee.phone;
      const passField = document.getElementById('employeePassword');
      if (passField) passField.value = '';
      if (notesField) notesField.value = employee.notes || '';
      if (notesWrap) notesWrap.classList.remove('hidden');
      if (formTitle) formTitle.textContent = 'Editar empleado';

      toggleSection('employees');
      if (nameField) nameField.focus();
    });
  });

  document.querySelectorAll('.delete-employee').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;

      setupModal().show({
        title: 'Eliminar empleado',
        body: '<p>¿Quieres eliminar este empleado?</p>',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
        onConfirm: async () => {
          try {
            const sessionState = sessionStorage.getItem(SESSION_KEY);
            if (sessionState) {
              await fetchJson(`/api/employees/${id}`, { method: 'DELETE' });
            } else {
              const employeesBackup = getStoredEmployees().filter((employee) => String(employee.id) !== String(id));
              saveStoredEmployees(employeesBackup);
            }

            await renderEmployees();
            showNotice('Empleado eliminado', 'El empleado fue eliminado correctamente.', 'success');
          } catch (error) {
            showNotice('No se pudo eliminar', error.message || 'No se pudo eliminar el empleado.', 'error');
          }
        }
      });
    });
  });
}

function initEmployeeForm() {
  const form = document.getElementById('employeeForm');
  if (!form) return;

  const roleFieldWatcher = document.getElementById('employeeRole');
  const passWrap = document.querySelector('.employee-password-field');
  if (roleFieldWatcher) {
    const togglePasswordField = () => {
      if (roleFieldWatcher.value === 'Encargado') {
        passWrap?.classList.remove('hidden');
      } else {
        passWrap?.classList.add('hidden');
      }
    };
    roleFieldWatcher.addEventListener('change', togglePasswordField);
    // inicializar visibilidad
    togglePasswordField();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const idField = document.getElementById('employeeId');
    const existingEmployee = getStoredEmployees().find((item) => String(item.id) === String(idField?.value || ''));
    const payload = {
      name: document.getElementById('employeeName').value.trim(),
      lastName: document.getElementById('employeeLastName').value.trim(),
      role: document.getElementById('employeeRole').value,
      hourlyRate: Number(document.getElementById('employeeHourlyRate').value || 0),
      phone: document.getElementById('employeePhone').value.trim(),
      branch: existingEmployee?.branch || 'Centro',
      notes: document.getElementById('employeeNotes')?.value.trim() || existingEmployee?.notes || ''
    };

    // Manejar contraseña para encargados: si es nuevo o se ingresó una nueva contraseña,
    // guardarla en el registro; si se está editando y no se ingresa contraseña, mantener la anterior.
    const passInput = document.getElementById('employeePassword');
    const sessionState = sessionStorage.getItem(SESSION_KEY);
    if (payload.role === 'Encargado') {
      const newPass = passInput?.value?.trim() || '';
      if (sessionState) {
        // Server mode: include password only if provided (creation is validated later)
        if (newPass) payload.password = newPass;
      } else {
        // Local mode: keep previous behavior (store password locally)
        payload.password = newPass || existingEmployee?.password || '';
      }
    } else {
      payload.password = '';
    }

    if (!payload.name || !payload.lastName || !payload.phone) {
      showNotice('Faltan datos', 'Completá nombre, apellido y contacto.', 'error');
      return;
    }

    try {
      const sessionState = sessionStorage.getItem(SESSION_KEY);
      if (sessionState) {
        // If creating a new Encargado while connected to server, require a password
        if (payload.role === 'Encargado' && !(idField && idField.value) && (!passInput || !passInput.value.trim())) {
          showNotice('Contraseña requerida', 'Debés asignar una contraseña al crear un Encargado.', 'error');
          return;
        }
        const url = idField && idField.value ? `/api/employees/${idField.value}` : '/api/employees';
        const method = idField && idField.value ? 'PUT' : 'POST';
        await fetchJson(url, {
          method,
          body: JSON.stringify(payload)
        });
      } else {
        const existing = getStoredEmployees();
        const employee = {
          id: Number(idField?.value) || Date.now(),
          ...payload
        };
        const next = existing.filter((item) => String(item.id) !== String(employee.id));
        next.push(employee);
        saveStoredEmployees(next);
      }

      form.reset();
      if (idField) idField.value = '';
      await renderEmployees();
      showNotice('Empleado guardado', 'El empleado fue guardado correctamente.', 'success');
    } catch (error) {
      showNotice('No se pudo guardar', error.message || 'No se pudo guardar el empleado.', 'error');
    }
  });

  const resetBtn = document.getElementById('resetEmployeeForm');
  resetBtn?.addEventListener('click', () => {
    form.reset();
    const idField = document.getElementById('employeeId');
    const notesWrap = document.querySelector('.employee-notes-field');
    const formTitle = document.getElementById('employeeFormTitle');
    if (idField) idField.value = '';
    if (notesWrap) notesWrap.classList.add('hidden');
    if (formTitle) formTitle.textContent = 'Agregar empleado';
  });
}

function initLoginPage() {
  const form = document.getElementById('loginForm');
  const message = document.getElementById('loginMessage');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const data = await fetchJson('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (data.ok) {
        const user = data.user || {};
        if (user.role === 'Encargado') {
          sessionStorage.setItem(SESSION_KEY, `encargado:${user.username}`);
        } else {
          sessionStorage.setItem(SESSION_KEY, user.username || 'admin');
        }
        window.location.href = data.redirect || '/admin/employee-dashboard.html';
      }
    } catch (error) {
      const adminMatch = ADMIN_USERS.find((u) => u.username === username && u.password === password);
      if (adminMatch) {
        sessionStorage.setItem(SESSION_KEY, adminMatch.username);
        window.location.href = '/admin/employee-dashboard.html';
        return;
      }

      const employees = getStoredEmployees();
      const encargado = employees.find((e) => e.phone === username && e.password === password && e.role === 'Encargado');
      if (encargado) {
        sessionStorage.setItem(SESSION_KEY, `encargado:${encargado.phone}`);
        window.location.href = '/admin/encargado.html';
        return;
      }

      if (message) {
        message.textContent = error.message || 'Usuario o contraseña incorrectos.';
      }
    }
  });
}

async function initDashboardPage() {
  const sessionUser = await syncSessionFromServer();
  if (!sessionUser) {
    window.location.href = '/admin/index.html';
    return;
  }

  const logout = document.getElementById('logoutBtn');
  logout?.addEventListener('click', async () => {
    try {
      await fetchJson('/api/logout', { method: 'POST' });
    } catch (error) {
      // Ignored for local-only fallback.
    }

    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = '/admin/index.html';
  });

  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      toggleSection(button.dataset.section);
      if (button.dataset.section === 'statistics') {
        renderAnalytics();
      }
    });
  });

  setDefaultDate();

  const dateInput = document.getElementById('incomeDate');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      dateInput.value = dateInput.value || new Date().toISOString().slice(0, 10);
    });
  }

  const cashInput = document.getElementById('cashInput');
  const transferInput = document.getElementById('transferInput');
  const qrInput = document.getElementById('qrInput');
  const pedidosInput = document.getElementById('pedidosYaInput');
  [cashInput, transferInput, qrInput, pedidosInput].forEach((input) => {
    input?.addEventListener('input', () => {
      const sanitized = sanitizeNumber(input.value);
      input.value = sanitized;
    });
  });

  const dayFilter = document.getElementById('dayFilter');
  const chartStart = document.getElementById('chartStart');
  const chartEnd = document.getElementById('chartEnd');

  [dayFilter, chartStart, chartEnd].forEach((input) => {
    input?.addEventListener('input', renderDashboard);
  });

  const analyticsTabs = document.querySelectorAll('.analytics-tab');
  analyticsTabs.forEach((button) => {
    button.addEventListener('click', () => {
      analyticsTabs.forEach((item) => item.classList.toggle('active', item === button));
      renderAnalytics();
    });
  });

  const analyticsRangeButtons = document.querySelectorAll('.analytics-range-btn');
  analyticsRangeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      analyticsRangeButtons.forEach((item) => item.classList.toggle('active', item === button));
      renderAnalytics();
    });
  });

  const analyticsFromDate = document.getElementById('analyticsFromDate');
  const analyticsToDate = document.getElementById('analyticsToDate');

  const today = new Date();
  const initialStart = new Date(today);
  initialStart.setDate(today.getDate() - 29);
  if (analyticsFromDate) analyticsFromDate.value = formatDateInput(initialStart);
  if (analyticsToDate) analyticsToDate.value = formatDateInput(today);

  const refreshAnalyticsCustomRange = () => {
    document.querySelectorAll('.analytics-range-btn').forEach((item) => item.classList.remove('active'));
    renderAnalytics();
  };

  analyticsFromDate?.addEventListener('change', refreshAnalyticsCustomRange);
  analyticsToDate?.addEventListener('change', refreshAnalyticsCustomRange);

  const form = document.getElementById('incomeForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const branch = document.getElementById('branchSelect').value;
    const fecha = document.getElementById('incomeDate').value || new Date().toISOString().slice(0, 10);
    const efectivo = Number(sanitizeNumber(document.getElementById('cashInput').value));
    const transferencias = Number(sanitizeNumber(document.getElementById('transferInput').value));
    const qr = Number(sanitizeNumber(document.getElementById('qrInput').value));
    const pedidosYa = Number(sanitizeNumber(document.getElementById('pedidosYaInput')?.value || 0));
    const stock = (document.getElementById('stockInput')?.value || '').trim();
    const notas = document.getElementById('notesInput').value.trim();

    try {
      const sessionState = sessionStorage.getItem(SESSION_KEY);
      if (sessionState) {
        await fetchJson('/api/records', {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ fecha, sucursal: branch, efectivo, transferencias, qr, pedidosYa, notas, stock })
        });
      } else {
        const allRecords = getStoredRecords();
        allRecords.push({
          id: `${Date.now()}-${branch}`,
          fecha,
          hora: new Date().toLocaleTimeString('es-AR', { hour12: false }),
          usuario: 'admin',
          sucursal: branch,
          efectivo,
          transferencias,
          qr,
          pedidosYa,
          notas,
          stock,
          total: efectivo + transferencias + qr + pedidosYa
        });
        saveStoredRecords(allRecords);
      }

      form.reset();
      setDefaultDate();
      await renderDashboard();
      showNotice('Ingreso cargado', 'El ingreso fue cargado correctamente.', 'success');
    } catch (error) {
      showNotice('No se pudo guardar', error.message || 'No se pudo guardar el ingreso.', 'error');
    }
  });

  initEmployeeForm();
  await renderEmployees();
  await renderDashboard();
  // init records-by-date viewer
  const recordsDate = document.getElementById('recordsDate');
  if (recordsDate) {
    const today = new Date().toISOString().slice(0,10);
    recordsDate.value = today;
    recordsDate.addEventListener('change', () => renderRecordsByDate(recordsDate.value));
    await renderRecordsByDate(recordsDate.value);
  }
}

if (document.getElementById('loginForm')) {
  initLoginPage();
}

if (document.getElementById('incomeForm') || document.getElementById('employeeForm')) {
  initDashboardPage();
}
