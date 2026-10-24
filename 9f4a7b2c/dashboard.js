/* Employee Dashboard (solo Admin). El servidor es la única fuente de datos. */
(async () => {
  const T = TAZ;
  const $ = (id) => document.getElementById(id);
  if (!(await T.session('Admin'))) return;

  let records = [];
  let employees = [];
  let editing = null;
  let scope = 'Negocio';
  let days = 30; // 0 = rango personalizado

  const todayIso = () => T.iso(new Date());
  const live = (list) => list.filter((r) => r.countable !== false); // estado Z queda afuera
  const sum = (list, key = 'total') => list.reduce((s, r) => s + Number(r[key] || 0), 0);
  const inRange = (r, a, b) => r.fecha >= a && r.fecha <= b;
  const ordered = (a, b) => b.fecha.localeCompare(a.fecha)
    || String(b.hora || '').localeCompare(String(a.hora || '')) || Number(b.id) - Number(a.id);
  const span = (a, b) => (a <= b ? [a, b] : [b, a]);
  const kpis = (host, items) => {
    host.innerHTML = items.map(([l, v, s]) => `<div class="kpi"><span>${l}</span><b class="num">${T.money(v)}</b><small>${s}</small></div>`).join('');
  };

  /* ---------- carga ---------- */
  async function load() {
    try {
      const data = await T.api('/api/records');
      records = data.map((r) => ({ ...r, sucursal: T.branch(r.sucursal) }));
    } catch (e) {
      if (e.status === 401) return T.logout();
      T.toast(`No se pudieron cargar los registros: ${e.message}`, 'error');
    }
    render();
  }

  function render() {
    renderKpis(); renderBranches(); renderTrend(); renderList(); renderStats();
  }

  /* ---------- inicio ---------- */
  function renderKpis() {
    const t = todayIso(), ws = T.weekStart(t), we = T.addDays(ws, 6), ok = live(records);
    const day = ok.filter((r) => r.fecha === t), week = ok.filter((r) => inRange(r, ws, we));
    const mon = ok.filter((r) => r.fecha.startsWith(t.slice(0, 7)));
    const nb = new Set(mon.map((r) => r.sucursal)).size || 1;
    kpis($('kpis'), [
      ['Hoy', sum(day), T.plural(day.length, 'registro', 'registros')],
      ['Esta semana', sum(week), `${T.dmy(ws)} al ${T.dmy(we)}`],
      ['Este mes', sum(mon), T.plural(mon.length, 'registro', 'registros')],
      ['Promedio diario del mes', sum(mon) / Number(t.slice(8)), 'sobre los días transcurridos'],
      ['Promedio por sucursal del mes', sum(mon) / nb, `${T.plural(nb, 'sucursal', 'sucursales')} con ventas`]
    ]);
  }

  function renderBranches() {
    const list = live(records).filter((r) => r.fecha === $('dayPick').value);
    const names = [...new Set([...T.BRANCHES, ...list.map((r) => r.sucursal)])];
    const rows = names.map((b) => {
      const l = list.filter((r) => r.sucursal === b);
      return [b, ...T.FIELDS.map(([k]) => sum(l, k)), sum(l)];
    });
    const total = ['Total', ...rows[0].slice(1).map((_, i) => rows.reduce((s, r) => s + r[i + 1], 0))];
    $('branchTbl').innerHTML = `<table><thead><tr><th>Sucursal</th>${T.FIELDS.map(([, l]) => `<th class="n">${l}</th>`).join('')}<th class="n">Total</th></tr></thead><tbody>${
      [...rows, total].map((r, i, a) => `<tr class="${i === a.length - 1 ? 'sum' : ''}"><td>${T.esc(r[0])}</td>${r.slice(1).map((v) => `<td class="n">${T.money(v)}</td>`).join('')}</tr>`).join('')
    }</tbody></table>`;
  }

  function series(list, from, to) {
    const by = {};
    list.forEach((r) => { by[r.fecha] = (by[r.fecha] || 0) + Number(r.total || 0); });
    const labels = [];
    for (let d = from; d <= to && labels.length < 800; d = T.addDays(d, 1)) labels.push(d);
    return { labels, values: labels.map((d) => by[d] || 0) };
  }

  function renderTrend() {
    const [a, b] = span($('trFrom').value, $('trTo').value);
    const s = series(live(records), a, b);
    chart($('trendChart'), s.labels, s.values);
  }

  function renderList() {
    const [a, b] = span($('recFrom').value, $('recTo').value), br = $('recBranch').value;
    const list = records.filter((r) => inRange(r, a, b) && (!br || r.sucursal === br)).sort(ordered);
    recTable($('recTbl'), list);
    $('recSum').textContent = summary(list);
  }

  function summary(list) {
    const ok = live(list), out = list.length - ok.length;
    return `Total contabilizado: ${T.money(sum(ok))} en ${T.plural(ok.length, 'registro', 'registros')}`
      + (out ? ` (${out} fuera de los totales por estado Z)` : '');
  }

  function recTable(host, list) {
    if (!list.length) { host.innerHTML = '<p class="empty">No hay registros en este período.</p>'; return; }
    host.innerHTML = `<table><thead><tr><th>Fecha</th><th>Hora</th><th>Sucursal</th><th>Usuario</th>${
      T.FIELDS.map(([, l]) => `<th class="n">${l}</th>`).join('')
    }<th class="n">Total</th><th>Notas y stock</th><th></th></tr></thead><tbody>${
      list.map((r) => {
        const z = r.countable === false;
        const note = [r.notas && `<b>Notas:</b> ${T.esc(r.notas)}`, r.stock && `<b>Stock:</b> ${T.esc(r.stock)}`].filter(Boolean).join('<br>') || '—';
        return `<tr class="${z ? 'z' : ''}"><td>${T.dmy(r.fecha)}</td><td>${T.esc(String(r.hora || '').slice(0, 5))}</td>`
          + `<td>${T.esc(r.sucursal)}${z ? '<span class="tag" title="No suma a los totales">Z</span>' : ''}</td><td>${T.esc(r.usuario)}</td>`
          + T.FIELDS.map(([k]) => `<td class="n">${T.money(r[k])}</td>`).join('')
          + `<td class="n">${T.money(r.total)}</td><td class="note">${note}</td>`
          + `<td><div class="acts"><button class="btn sm" data-act="edit" data-id="${r.id}">Editar</button><button class="btn sm" data-act="del" data-id="${r.id}">Eliminar</button></div></td></tr>`;
      }).join('')
    }</tbody></table>`;
  }

  /* ---------- estadísticas ---------- */
  function renderStats() {
    if (!$('stats').classList.contains('on')) return;
    let from, to;
    if (days) {
      to = todayIso(); from = T.addDays(to, -(days - 1));
      $('stFrom').value = from; $('stTo').value = to;
    } else {
      [from, to] = span($('stFrom').value || todayIso(), $('stTo').value || todayIso());
    }
    const all = records.filter((r) => scope === 'Negocio' || r.sucursal === scope);
    const list = all.filter((r) => inRange(r, from, to)).sort(ordered), ok = live(list), total = sum(ok);
    const nDays = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 864e5) + 1;
    const t = todayIso(), ws = T.weekStart(t), liveAll = live(all);

    kpis($('stKpis'), [
      ['Total del período', total, `${T.dmy(from)} al ${T.dmy(to)}`],
      ['Promedio por día', total / nDays, T.plural(nDays, 'día', 'días')],
      ['Promedio por registro', ok.length ? total / ok.length : 0, T.plural(ok.length, 'registro', 'registros')],
      ['Semana actual', sum(liveAll.filter((r) => inRange(r, ws, T.addDays(ws, 6)))), `desde el ${T.dmy(ws)}`],
      ['Mes actual', sum(liveAll.filter((r) => r.fecha.startsWith(t.slice(0, 7)))), 'registros contabilizados']
    ]);

    $('stTitle').textContent = `${scope}: ingresos por día`;
    const s = series(ok, from, to);
    chart($('statsChart'), s.labels, s.values);

    $('mixList').innerHTML = T.FIELDS.map((f) => {
      const [k, l] = f, v = sum(ok, k), p = total ? Math.round((v / total) * 100) : 0;
      // El Z se informa aparte: no forma parte del total ni de los porcentajes.
      return T.counts(f)
        ? `<li><span>${l}</span><span>${T.money(v)} (${p}%)</span><i style="--p:${p}%"></i></li>`
        : `<li><span>${l}</span><span>${T.money(v)}</span></li>`;
    }).join('');

    const weeks = {};
    ok.forEach((r) => { const w = T.weekStart(r.fecha); weeks[w] = weeks[w] || { v: 0, n: 0 }; weeks[w].v += Number(r.total || 0); weeks[w].n += 1; });
    const keys = Object.keys(weeks).sort().reverse();
    $('weekTbl').innerHTML = keys.length
      ? `<table><thead><tr><th>Semana del</th><th class="n">Registros</th><th class="n">Total</th></tr></thead><tbody>${keys.map((w) => `<tr><td>${T.dmy(w)}</td><td class="n">${weeks[w].n}</td><td class="n">${T.money(weeks[w].v)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Sin ingresos en el período.</p>';

    recTable($('stTbl'), list);
    $('stSum').textContent = summary(list);
  }

  /* ---------- gráfico ---------- */
  function chart(canvas, labels, values) {
    const cs = getComputedStyle(document.documentElement), col = (n) => cs.getPropertyValue(n).trim();
    const w = canvas.clientWidth || 600, h = 240, dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const L = 58, R = 14, P = 14, B = 28, max = Math.max(...values, 1);
    const X = (i) => L + (values.length > 1 ? (i * (w - L - R)) / (values.length - 1) : (w - L - R) / 2);
    const Y = (v) => h - B - (v / max) * (h - P - B);
    c.font = '14px "Barlow Condensed", sans-serif'; c.textBaseline = 'middle'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = Y((max * i) / 4);
      c.strokeStyle = col('--line'); c.beginPath(); c.moveTo(L, y); c.lineTo(w - R, y); c.stroke();
      c.fillStyle = col('--muted'); c.textAlign = 'right'; c.fillText(T.short((max * i) / 4), L - 8, y);
    }
    const step = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor((w - L) / 70))));
    c.textAlign = 'center';
    labels.forEach((d, i) => { if (i % step === 0) c.fillText(`${d.slice(8)}/${d.slice(5, 7)}`, X(i), h - 10); });
    c.beginPath();
    values.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
    c.strokeStyle = col('--red'); c.lineWidth = 2.5; c.lineJoin = 'round'; c.stroke();
    if (values.length <= 45) { c.fillStyle = col('--red'); values.forEach((v, i) => { c.beginPath(); c.arc(X(i), Y(v), 3.5, 0, 7); c.fill(); }); }
    if (!values.some(Boolean)) { c.fillStyle = col('--muted'); c.textAlign = 'center'; c.fillText('Sin ingresos en este período', w / 2, h / 2); }
    const tip = $('tip');
    canvas.onpointermove = (e) => {
      const x = e.clientX - canvas.getBoundingClientRect().left;
      let k = 0;
      values.forEach((_, i) => { if (Math.abs(X(i) - x) < Math.abs(X(k) - x)) k = i; });
      tip.hidden = false; tip.textContent = `${T.dmy(labels[k])}: ${T.money(values[k])}`;
      tip.style.left = `${Math.min(e.clientX + 12, innerWidth - 190)}px`; tip.style.top = `${e.clientY - 36}px`;
    };
    canvas.onpointerleave = () => { tip.hidden = true; };
  }

  /* ---------- hoja de registro (crear y editar) ---------- */
  const sheet = $('sheet');
  $('moneyFields').innerHTML = T.FIELDS.map(([k, l]) => `<label>${l}<input id="f_${k}" inputmode="decimal" placeholder="0"${k === 'qr' ? ' required' : ''}></label>`).join('');
  const typed = () => T.FIELDS.filter(T.counts).reduce((s, [k]) => s + T.amount($(`f_${k}`).value), 0);

  function paintTotal() {
    $('fTotal').textContent = T.money(typed());
  }

  function openSheet(rec) {
    editing = rec || null;
    const now = new Date();
    $('sheetTitle').textContent = rec ? 'Editar registro' : 'Nuevo registro';
    $('sheetWho').textContent = rec ? `Cargado por ${rec.usuario}` : '';
    $('sheetSave').textContent = rec ? 'Guardar cambios' : 'Guardar registro';
    $('fFecha').value = rec ? rec.fecha : todayIso();
    $('fHora').value = rec ? String(rec.hora || '').slice(0, 5) : now.toTimeString().slice(0, 5);
    const suc = rec ? rec.sucursal : T.BRANCHES[0];
    if (![...$('fSuc').options].some((o) => o.value === suc)) $('fSuc').add(new Option(suc, suc));
    $('fSuc').value = suc;
    T.FIELDS.forEach(([k]) => { $(`f_${k}`).value = rec ? String(Number(rec[k]) || 0) : ''; });
    $('fNotas').value = rec ? rec.notas || '' : '';
    $('fStock').value = rec ? rec.stock || '' : '';
    paintTotal();
    sheet.classList.add('open'); $('veil').classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
    $('fFecha').focus();
  }

  function closeSheet() {
    sheet.classList.remove('open'); $('veil').classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
    editing = null;
  }

  async function saveRecord(e) {
    e.preventDefault();
    const hora = $('fHora').value;
    const body = { fecha: $('fFecha').value, sucursal: $('fSuc').value, notas: $('fNotas').value.trim(), stock: $('fStock').value.trim() };
    T.FIELDS.forEach(([k]) => { body[k] = T.amount($(`f_${k}`).value); });
    // La hora solo se envía si cambió: no pisa la que ya estaba guardada.
    if (!editing || hora !== String(editing.hora || '').slice(0, 5)) body.hora = hora;

    const btn = $('sheetSave');
    btn.disabled = true;
    try {
      const res = editing
        ? await T.api(`/api/records/${editing.id}`, { method: 'PUT', body })
        : await T.api('/api/records', { method: 'POST', body });
      closeSheet();
      await load();
      if (res.warning) T.toast(res.warning, 'warn');
      else if (res.duplicate) T.toast(res.message, 'warn');
      else T.toast(res.changed === false ? 'Sin cambios: el registro ya tenía esos datos.' : res.message || 'Guardado.');
    } catch (err) {
      T.toast(`No se pudo guardar: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function removeRecord(rec) {
    if (!(await T.ask(`¿Eliminar el registro de ${rec.sucursal} del ${T.dmy(rec.fecha)} (${T.money(rec.total)})? No se puede deshacer.`))) return;
    try {
      const res = await T.api(`/api/records/${rec.id}`, { method: 'DELETE' });
      await load();
      T.toast(res.warning || 'Registro eliminado.', res.warning ? 'warn' : 'ok');
    } catch (err) {
      T.toast(`No se pudo eliminar: ${err.message}`, 'error');
    }
  }

  /* ---------- empleados ---------- */
  async function loadTeam() {
    try { employees = await T.api('/api/employees'); } catch (e) { T.toast(`No se pudo cargar el personal: ${e.message}`, 'error'); }
    $('empList').innerHTML = employees.length ? employees.map((p) => `
      <div class="person"><div><b>${T.esc(p.name)} ${T.esc(p.last_name)}</b>
        <small>${T.esc(p.role)} en ${T.esc(T.branch(p.branch))}, ${T.esc(p.phone)}, ${T.money(p.hourly_rate)} por hora</small>
        ${p.notes ? `<small>${T.esc(p.notes)}</small>` : ''}</div>
        <div class="acts"><button class="btn sm" data-act="emp-edit" data-id="${p.id}">Editar</button><button class="btn sm" data-act="emp-del" data-id="${p.id}">Eliminar</button></div></div>`).join('')
      : '<p class="empty">Todavía no hay empleados cargados.</p>';
  }

  function paintRole() {
    const enc = $('eRole').value === 'Encargado';
    $('ePassWrap').hidden = !enc;
    $('ePassLabel').textContent = $('eId').value ? 'Contraseña nueva (vacío = mantener la actual)' : 'Contraseña del encargado';
  }

  function resetEmp() {
    $('empForm').reset(); $('eId').value = ''; $('eBranch').value = T.BRANCHES[0];
    $('empTitle').textContent = 'Agregar empleado'; paintRole();
  }

  async function saveEmp(e) {
    e.preventDefault();
    const id = $('eId').value, enc = $('eRole').value === 'Encargado', pass = $('ePass').value.trim();
    if (enc && !id && !pass) return T.toast('Para crear un encargado hay que asignarle una contraseña.', 'error');
    const body = {
      name: $('eName').value.trim(), lastName: $('eLast').value.trim(), role: $('eRole').value,
      hourlyRate: Number($('eRate').value) || 0, phone: $('ePhone').value.trim(), branch: $('eBranch').value, notes: $('eNotes').value.trim()
    };
    if (enc && pass) body.password = pass;
    try {
      await T.api(id ? `/api/employees/${id}` : '/api/employees', { method: id ? 'PUT' : 'POST', body });
      resetEmp(); await loadTeam(); T.toast('Empleado guardado.');
    } catch (err) {
      T.toast(`No se pudo guardar el empleado: ${err.message}`, 'error');
    }
  }

  /* ---------- eventos ---------- */
  const fillBranches = (sel, withAll) => {
    sel.innerHTML = (withAll ? '<option value="">Todas</option>' : '') + T.BRANCHES.map((b) => `<option>${T.esc(b)}</option>`).join('');
  };
  fillBranches($('recBranch'), true); fillBranches($('fSuc')); fillBranches($('eBranch'));
  $('scopeChips').innerHTML = ['Negocio', ...T.BRANCHES].map((s) => `<button data-scope="${T.esc(s)}" class="${s === scope ? 'on' : ''}">${T.esc(s)}</button>`).join('');

  const t0 = todayIso();
  $('dayPick').value = t0;
  $('trFrom').value = T.addDays(t0, -29); $('trTo').value = t0;
  $('recFrom').value = T.addDays(t0, -6); $('recTo').value = t0;

  ['dayPick'].forEach((id) => $(id).addEventListener('input', renderBranches));
  ['trFrom', 'trTo'].forEach((id) => $(id).addEventListener('input', renderTrend));
  ['recFrom', 'recTo', 'recBranch'].forEach((id) => $(id).addEventListener('input', renderList));
  ['stFrom', 'stTo'].forEach((id) => $(id).addEventListener('input', () => {
    days = 0; document.querySelectorAll('#rangeChips button').forEach((b) => b.classList.remove('on')); renderStats();
  }));

  document.querySelectorAll('.rail [data-view]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.rail [data-view]').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === b.dataset.view));
    if (b.dataset.view === 'stats') renderStats();
    if (b.dataset.view === 'team') loadTeam();
    if (b.dataset.view === 'inicio') render();
  }));
  $('scopeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]'); if (!b) return;
    scope = b.dataset.scope;
    document.querySelectorAll('#scopeChips button').forEach((x) => x.classList.toggle('on', x === b));
    renderStats();
  });
  $('rangeChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]'); if (!b) return;
    days = Number(b.dataset.days);
    document.querySelectorAll('#rangeChips button').forEach((x) => x.classList.toggle('on', x === b));
    renderStats();
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = String(b.dataset.id);
    if (b.dataset.act === 'edit') openSheet(records.find((r) => String(r.id) === id));
    if (b.dataset.act === 'del') removeRecord(records.find((r) => String(r.id) === id));
    if (b.dataset.act === 'emp-edit') {
      const p = employees.find((x) => String(x.id) === id); if (!p) return;
      $('eId').value = p.id; $('eName').value = p.name; $('eLast').value = p.last_name; $('eRole').value = p.role;
      $('eRate').value = Number(p.hourly_rate) || 0; $('ePhone').value = p.phone; $('eBranch').value = T.branch(p.branch);
      $('eNotes').value = p.notes || ''; $('ePass').value = ''; $('empTitle').textContent = 'Editar empleado'; paintRole();
      $('eName').focus();
    }
    if (b.dataset.act === 'emp-del') {
      const p = employees.find((x) => String(x.id) === id); if (!p) return;
      T.ask(`¿Eliminar a ${p.name} ${p.last_name}?`).then(async (ok) => {
        if (!ok) return;
        try { await T.api(`/api/employees/${id}`, { method: 'DELETE' }); await loadTeam(); T.toast('Empleado eliminado.'); }
        catch (err) { T.toast(`No se pudo eliminar: ${err.message}`, 'error'); }
      });
    }
  });

  $('newRec').addEventListener('click', () => openSheet(null));
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheetCancel').addEventListener('click', closeSheet);
  $('veil').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('open')) closeSheet(); });
  $('recForm').addEventListener('submit', saveRecord);
  $('recForm').addEventListener('input', paintTotal);
  $('eRole').addEventListener('change', paintRole);
  $('empForm').addEventListener('submit', saveEmp);
  $('eCancel').addEventListener('click', resetEmp);
  $('logout').addEventListener('click', T.logout);
  window.addEventListener('resize', () => { renderTrend(); renderStats(); });

  paintRole();
  await load();
})();
