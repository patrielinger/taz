/* Utilidades compartidas por employee-dashboard.html y encargado.html */
const TAZ = (() => {
  const BRANCHES = ['Centro', 'Ciudad de Nieva', 'Alto Comedero', 'Hattogu'];
  const ALIAS = { Alvear: 'Centro', Nieva: 'Ciudad de Nieva', 'Jatobú': 'Hattogu' };
  // Campos de dinero de un registro. En pantalla, "Z" es la columna `qr`.
  const counts = (f) => f[2] !== false; // ¿este campo suma al total?
  const FIELDS = [
    ['efectivo', 'Efectivo'],
    ['transferencias', 'Transferencias / Tarjeta'],
    ['qr', 'Z (no suma)', false], // se carga siempre, pero nunca entra en un total
    ['pedidosYa', 'PedidosYa'],
    ['tiraxy', 'Tiraxy']
  ];

  const branch = (v) => {
    const s = String(v || '').trim();
    return ALIAS[s] || s || 'Centro';
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const money = (v) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
  }).format(Number(v) || 0);
  const short = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // "1.500" -> 1500, "1.500,50" -> 1500.5, "1234.5" -> 1234.5 (no pierde decimales ya cargados)
  const amount = (v) => {
    let s = String(v ?? '').replace(/[^\d.,]/g, '');
    s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  };

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
  const weekStart = (s) => addDays(s, -((new Date(`${s}T00:00:00`).getDay() + 6) % 7)); // lunes
  const dmy = (s) => (s ? s.split('-').reverse().join('/') : '—');

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `show ${type}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = ''; }, type === 'ok' ? 3500 : 7000);
  }

  function ask(message, okText = 'Eliminar') {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.innerHTML = `<p>${esc(message)}</p><div class="row"><button class="btn" value="no">Cancelar</button><button class="btn red" value="ok">${esc(okText)}</button></div>`;
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => done(b.value === 'ok')));
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      document.body.append(d);
      d.showModal();
    });
  }

  // Devuelve el usuario de la sesión si tiene el rol esperado; si no, redirige.
  async function session(role) {
    let user = null;
    try { user = (await api('/api/session')).user; } catch (e) { /* sin sesión */ }
    if (!user) { location.href = 'index.html'; return null; }
    if (user.role !== role) { location.href = user.role === 'Admin' ? 'employee-dashboard.html' : 'encargado.html'; return null; }
    return user;
  }

  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* ignorado */ }
    sessionStorage.removeItem('taz_admin_session');
    location.href = 'index.html';
  }

  return { BRANCHES, FIELDS, counts, branch, esc, money, short, plural, amount, iso, addDays, weekStart, dmy, api, toast, ask, session, logout };
})();
