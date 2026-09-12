const SESSION_KEY = 'taz_admin_session';
const STORAGE_KEY = 'taz_admin_records';
const EMPLOYEES_KEY = 'taz_employees';
const ADMIN_USERS = [{ username: 'admin', password: 'tazadmin123', name: 'Administrador' }];
const BRANCHES = ['Centro', 'Ciudad de Nieva', 'Alto Comedero', 'Hattogu'];

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
    notes: row.notes || ''
  };
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
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : { message: await response.text() };

  if (!response.ok) {
    throw new Error(data.message || 'Error de API');
  }

  return data;
}

function setDefaultDate() {
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('incomeDate');
  const dayFilter = document.getElementById('dayFilter');
  const chartStart = document.getElementById('chartStart');
  const chartEnd = document.getElementById('chartEnd');

  if (dateInput) dateInput.value = today;
  if (dayFilter) dayFilter.value = today;
  if (chartStart) chartStart.value = today;
  if (chartEnd) chartEnd.value = today;
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
    const filtered = dayRecords.filter((record) => record.sucursal === branch);
    return {
      branch,
      efectivo: filtered.reduce((sum, item) => sum + Number(item.efectivo || 0), 0),
      transferencias: filtered.reduce((sum, item) => sum + Number(item.transferencias || 0), 0),
      qr: filtered.reduce((sum, item) => sum + Number(item.qr || 0), 0),
      total: filtered.reduce((sum, item) => sum + Number(item.total || 0), 0)
    };
  });

  rows.innerHTML = totals.map((item) => `
    <tr>
      <td>${item.branch}</td>
      <td>${money(item.efectivo)}</td>
      <td>${money(item.transferencias)}</td>
      <td>${money(item.qr)}</td>
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
        <td colspan="9">No hay ingresos cargados para esta fecha.</td>
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
      <td>${money(record.total)}</td>
      <td>${record.notas || '—'}</td>
    </tr>
  `).join('');
}

function drawChart() {
  const canvas = document.getElementById('incomeChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const startDate = document.getElementById('chartStart');
  const endDate = document.getElementById('chartEnd');

  const records = getStoredRecords();
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
    return records.filter((record) => record.fecha === iso).reduce((sum, record) => sum + Number(record.total || 0), 0);
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
    return;
  }

  const stepX = (width - padding * 2) / Math.max(amounts.length - 1, 1);
  ctx.beginPath();
  ctx.strokeStyle = '#f20d16';
  ctx.lineWidth = 2;

  amounts.forEach((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();

  amounts.forEach((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    ctx.beginPath();
    ctx.fillStyle = '#f20d16';
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function loadRecords() {
  try {
    const sessionState = sessionStorage.getItem(SESSION_KEY);
    if (!sessionState) return getStoredRecords();

    const data = await fetchJson('/api/records');
    if (Array.isArray(data) && data.length) {
      return data.map((record) => ({
        id: record.id,
        fecha: record.fecha,
        hora: record.created_at ? new Date(record.created_at).toLocaleTimeString('es-AR', { hour12: false }) : '00:00:00',
        usuario: record.usuario,
        sucursal: record.sucursal,
        efectivo: Number(record.efectivo || 0),
        transferencias: Number(record.transferencias || 0),
        qr: Number(record.qr || 0),
        notas: record.notas || '',
        total: Number(record.total || 0)
      }));
    }
  } catch (error) {
    return getStoredRecords();
  }

  return getStoredRecords();
}

async function renderDashboard() {
  const records = await loadRecords();
  renderBranchSummary(records);
  renderRecords(records);
  drawChart();
}

function toggleSection(sectionName) {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionName);
  });

  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('active-section', section.id === sectionName);
  });
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

      const confirmed = window.confirm('¿Quieres eliminar este empleado?');
      if (!confirmed) return;

      try {
        const sessionState = sessionStorage.getItem(SESSION_KEY);
        if (sessionState) {
          await fetchJson(`/api/employees/${id}`, { method: 'DELETE' });
        } else {
          const employeesBackup = getStoredEmployees().filter((employee) => String(employee.id) !== String(id));
          saveStoredEmployees(employeesBackup);
        }

        await renderEmployees();
      } catch (error) {
        alert(error.message || 'No se pudo eliminar el empleado.');
      }
    });
  });
}

function initEmployeeForm() {
  const form = document.getElementById('employeeForm');
  if (!form) return;

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

    if (!payload.name || !payload.lastName || !payload.phone) {
      alert('Completá nombre, apellido y contacto.');
      return;
    }

    try {
      const sessionState = sessionStorage.getItem(SESSION_KEY);
      if (sessionState) {
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
      alert('Empleado guardado correctamente.');
    } catch (error) {
      alert(error.message || 'No se pudo guardar el empleado.');
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
        sessionStorage.setItem(SESSION_KEY, data.user.username);
        window.location.href = '/admin/employee-dashboard.html';
      }
    } catch (error) {
      if (message) {
        message.textContent = error.message || 'Usuario o contraseña incorrectos.';
      }
    }
  });
}

async function initDashboardPage() {
  const sessionUser = sessionStorage.getItem(SESSION_KEY);
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
    button.addEventListener('click', () => toggleSection(button.dataset.section));
  });

  setDefaultDate();

  const dateToggle = document.getElementById('datePickerToggle');
  const dateInput = document.getElementById('incomeDate');
  if (dateToggle && dateInput) {
    dateToggle.addEventListener('click', () => {
      dateInput.classList.toggle('hidden');
      dateInput.focus();
    });

    dateInput.addEventListener('change', () => {
      dateInput.classList.add('hidden');
      dateToggle.textContent = `Fecha: ${dateInput.value || 'Seleccionar fecha'}`;
    });
  }

  const cashInput = document.getElementById('cashInput');
  const transferInput = document.getElementById('transferInput');
  const qrInput = document.getElementById('qrInput');
  [cashInput, transferInput, qrInput].forEach((input) => {
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

  const form = document.getElementById('incomeForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const branch = document.getElementById('branchSelect').value;
    const fecha = document.getElementById('incomeDate').value || new Date().toISOString().slice(0, 10);
    const efectivo = Number(sanitizeNumber(document.getElementById('cashInput').value));
    const transferencias = Number(sanitizeNumber(document.getElementById('transferInput').value));
    const qr = Number(sanitizeNumber(document.getElementById('qrInput').value));
    const notas = document.getElementById('notesInput').value.trim();

    try {
      const sessionState = sessionStorage.getItem(SESSION_KEY);
      if (sessionState) {
        await fetchJson('/api/records', {
          method: 'POST',
          body: JSON.stringify({ fecha, sucursal: branch, efectivo, transferencias, qr, notas })
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
          notas,
          total: efectivo + transferencias + qr
        });
        saveStoredRecords(allRecords);
      }

      form.reset();
      setDefaultDate();
      if (dateToggle) dateToggle.textContent = 'Seleccionar fecha';
      await renderDashboard();
      alert('Ingreso cargado correctamente.');
    } catch (error) {
      alert(error.message || 'No se pudo guardar el ingreso.');
    }
  });

  initEmployeeForm();
  await renderEmployees();
  await renderDashboard();
}

if (document.getElementById('loginForm')) {
  initLoginPage();
}

if (document.getElementById('incomeForm') || document.getElementById('employeeForm')) {
  initDashboardPage();
}
