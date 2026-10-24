/*
 * Pruebas del módulo de registros (escenarios A–G).
 *
 * Uso:  node test/records.test.js
 *
 * No necesita MySQL: reemplaza `mysql2/promise` por una base en memoria que
 * responde a las consultas que ejecuta server.js. Trabaja sobre una COPIA
 * temporal del proyecto, así que nunca toca data/ ni uploads/ reales.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'taz-test-'));
const PORT = 38000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

/* ---------- copia temporal del proyecto ---------- */
fs.mkdirSync(path.join(TMP, 'data'));
fs.mkdirSync(path.join(TMP, 'uploads'));
for (const f of ['server.js', 'package.json', 'index.html']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(TMP, f));
}
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(TMP, 'node_modules'), 'dir');
fs.cpSync(path.join(ROOT, '9f4a7b2c'), path.join(TMP, '9f4a7b2c'), { recursive: true });
const DATA = path.join(TMP, 'data');
const recordsJsonPath = path.join(DATA, 'records.json');
const readJson = () => JSON.parse(fs.readFileSync(recordsJsonPath, 'utf8'));

/* ---------- MySQL simulado ---------- */
const today = (() => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
})();

const db = {
  down: false,
  nextId: 1,
  records: [],
  admins: [],
  employees: [],
  log: []
};

function dec(n) { return Number(n).toFixed(2); }

function fakeExecute(sqlRaw, params = []) {
  if (db.down) {
    const err = new Error('connect ECONNREFUSED');
    err.code = 'ECONNREFUSED';
    return Promise.reject(err);
  }
  const sql = sqlRaw.replace(/\s+/g, ' ').trim();
  db.log.push(sql);

  const rowOut = (r) => ({ ...r, fecha: r.fecha, fecha_iso: r.fecha });
  const sorted = () => [...db.records].sort((a, b) =>
    b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at) || b.id - a.id);

  if (/^(CREATE|ALTER)/.test(sql)) return Promise.resolve([{}, []]);
  if (/information_schema\.COLUMNS/.test(sql)) return Promise.resolve([[{ cnt: 1 }], []]);
  if (/^SELECT \* FROM admins WHERE username/.test(sql)) {
    return Promise.resolve([db.admins.filter((a) => a.username === params[0]), []]);
  }
  if (/^INSERT INTO admins/.test(sql)) {
    const id = db.admins.length + 1;
    db.admins.push({ id, username: params[0], password_hash: params[1] });
    return Promise.resolve([{ insertId: id, affectedRows: 1 }, []]);
  }
  if (/FROM employees/.test(sql)) return Promise.resolve([db.employees, []]);

  if (/^SELECT r\.\*.* FROM records r WHERE r\.id = \?/.test(sql)) {
    return Promise.resolve([db.records.filter((r) => r.id === Number(params[0])).map(rowOut), []]);
  }
  if (/^SELECT r\.\*.* FROM records r ORDER BY/.test(sql)) {
    return Promise.resolve([sorted().map(rowOut), []]);
  }
  if (/^SELECT id FROM records WHERE fecha = \?/.test(sql)) {
    const [fecha, sucursal, usuario, ef, tr, qr, py, tx, notas, stock] = params;
    const hit = db.records.filter((r) =>
      r.fecha === fecha && r.sucursal === sucursal && r.usuario === usuario &&
      Number(r.efectivo) === Number(ef) && Number(r.transferencias) === Number(tr) &&
      Number(r.qr) === Number(qr) && Number(r.pedidos_ya) === Number(py) &&
      Number(r.tiraxy) === Number(tx) && r.notas === notas && r.stock === stock &&
      Date.now() - new Date(r.created_at).getTime() <= 60000);
    return Promise.resolve([hit.map((r) => ({ id: r.id })).reverse(), []]);
  }
  if (/^INSERT INTO records/.test(sql)) {
    const cols = sql.match(/INSERT INTO records \(([^)]+)\)/)[1].split(', ');
    const row = { id: db.nextId++, estado: '', created_at: new Date().toISOString() };
    cols.forEach((c, i) => {
      row[c] = ['efectivo', 'transferencias', 'qr', 'pedidos_ya', 'tiraxy', 'total'].includes(c)
        ? dec(params[i]) : params[i];
    });
    db.records.push(row);
    return Promise.resolve([{ insertId: row.id, affectedRows: 1 }, []]);
  }
  if (/^UPDATE records SET total = efectivo/.test(sql)) {
    let n = 0;
    db.records.forEach((r) => {
      const t = dec(Number(r.efectivo) + Number(r.transferencias) + Number(r.pedidos_ya) + Number(r.tiraxy));
      if (Number(r.total) !== Number(t)) { r.total = t; n += 1; }
    });
    return Promise.resolve([{ affectedRows: n }, []]);
  }
  if (/^UPDATE records SET estado = \? WHERE id = \? AND/.test(sql)) {
    const r = db.records.find((x) => x.id === Number(params[1]));
    if (r && (!r.estado)) { r.estado = params[0]; return Promise.resolve([{ affectedRows: 1 }, []]); }
    return Promise.resolve([{ affectedRows: 0 }, []]);
  }
  if (/^UPDATE records SET .* WHERE id = \?/.test(sql)) {
    const sets = sql.match(/SET (.*) WHERE id = \?/)[1].split(', ').map((s) => s.replace(' = ?', ''));
    const r = db.records.find((x) => x.id === Number(params[params.length - 1]));
    if (!r) return Promise.resolve([{ affectedRows: 0 }, []]);
    sets.forEach((c, i) => {
      r[c] = ['efectivo', 'transferencias', 'qr', 'pedidos_ya', 'tiraxy', 'total'].includes(c)
        ? dec(params[i]) : params[i];
    });
    return Promise.resolve([{ affectedRows: 1 }, []]);
  }
  if (/^DELETE FROM records/.test(sql)) {
    const before = db.records.length;
    db.records = db.records.filter((r) => r.id !== Number(params[0]));
    return Promise.resolve([{ affectedRows: before - db.records.length }, []]);
  }

  // Totales: se interpreta la condición NOT IN (...) que arma el servidor.
  if (/FROM records WHERE fecha = CURDATE\(\)/.test(sql) || /FROM records WHERE fecha >=/.test(sql)) {
    const m = sql.match(/NOT IN \((.*)\)\)/);
    const excluded = m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) : [];
    const month = today.slice(0, 7);
    const rows = db.records.filter((r) =>
      (sql.includes('CURDATE()') && sql.includes('fecha = CURDATE()') ? r.fecha === today : r.fecha.startsWith(month)) &&
      !excluded.includes(r.estado || ''));
    const byKey = new Map();
    rows.forEach((r) => {
      const k = sql.includes('GROUP BY sucursal') ? r.sucursal : r.fecha;
      const acc = byKey.get(k) || { efectivo: 0, transferencias: 0, qr: 0, total: 0, registros: 0 };
      acc.efectivo += Number(r.efectivo); acc.transferencias += Number(r.transferencias);
      acc.qr += Number(r.qr); acc.total += Number(r.total); acc.registros += 1;
      byKey.set(k, acc);
    });
    const out = [...byKey.entries()].map(([k, v]) =>
      (sql.includes('GROUP BY sucursal') ? { sucursal: k, ...v } : { fecha: k, total: v.total, registros: v.registros }));
    return Promise.resolve([out, []]);
  }

  return Promise.reject(new Error(`Consulta no soportada por el simulador: ${sql.slice(0, 80)}`));
}

const fakeMysql = {
  createConnection: async () => ({
    execute: (...a) => fakeExecute(...a),
    end: async () => {}
  }),
  createPool: () => ({ execute: (...a) => fakeExecute(...a) })
};

// Estado previo (Escenario A): registros ya cargados en la BD y JSON inexistente.
// Se siembra ANTES de arrancar el servidor, como en un despliegue con datos existentes.
const seed = (id, fecha, estado, total) => db.records.push({
  id, fecha, sucursal: 'Hattogu', efectivo: dec(total), transferencias: '0.00', qr: '0.00',
  pedidos_ya: '0.00', tiraxy: '0.00', total: dec(total), notas: 'x', stock: '', usuario: 'Seed',
  estado, created_at: new Date(Date.now() - 3600e3 + id).toISOString()
});
db.nextId = 100;
seed(1, today, '', 1000);
seed(2, today, 'Z (encQR)', 5000);
seed(3, today, 'Observado', 700);
try { fs.unlinkSync(recordsJsonPath); } catch (_) { /* ya no existe */ }


/* ---------- carga de server.js con el simulador ---------- */
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'mysql2/promise') return fakeMysql;
  return origLoad.call(this, request, ...rest);
};
process.on('unhandledRejection', (e) => { console.error('unhandledRejection:', e); });
require(path.join(TMP, 'server.js'));
Module._load = origLoad;

/* ---------- utilidades de prueba ---------- */
let cookie = '';
async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  let json = null;
  try { json = await res.json(); } catch (_) { /* sin cuerpo */ }
  return { status: res.status, json, headers: res.headers };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = (o = {}) => ({
  fecha: today, sucursal: 'Centro', efectivo: 100, transferencias: 50, qr: 25, pedidosYa: 0, tiraxy: 0,
  notas: '', stock: '', ...o
});
const totalSummary = async () => {
  const r = await api('GET', '/api/records/summary');
  return (r.json || []).reduce((s, x) => s + Number(x.registros), 0);
};

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([true, name]); console.log('  ✔', name); }
  catch (e) { results.push([false, name]); console.log('  ✘', name, '\n     ', e.message); }
}

(async () => {
  // Esperar a que el servidor y el "MySQL" estén listos
  for (let i = 0; i < 50; i += 1) {
    try { await fetch(`${BASE}/api/health`); if (db.admins.length) break; } catch (_) { /* aún no */ }
    await sleep(100);
  }

  // El pool se asigna cuando termina initDatabase(); se reintenta hasta que responda.
  let login;
  for (let i = 0; i < 50; i += 1) {
    login = await api('POST', '/api/login', { username: 'admin', password: 'tazadmin123' });
    if (login.status === 200) break;
    await sleep(100);
  }
  assert.strictEqual(login.status, 200, `login admin (${JSON.stringify(login.json)})`);

  console.log('\nEscenario A: primera carga');
  await test('al arrancar, el JSON se genera solo con los 3 registros (incluido Z) y conserva campos', async () => {
    const j = readJson();
    assert.strictEqual(j.length, 3);
    assert(j.find((x) => x.id === 2 && x.estado === 'Z (encQR)'), 'Z conservado');
    ['id', 'fecha', 'hora', 'usuario', 'sucursal', 'efectivo', 'transferencias', 'qr', 'pedidosYa',
      'tiraxy', 'notas', 'stock', 'total', 'created_at', 'estado'].forEach((k) =>
      assert(k in j[0], `campo ${k}`));
  });

  console.log('\nEscenario B: carga repetida');
  await test('sincronizar de nuevo no duplica ni modifica', async () => {
    const r = await api('POST', '/api/records/sync');
    assert.strictEqual(r.json.stats.added, 0);
    assert.strictEqual(r.json.stats.updated, 0);
    assert.strictEqual(r.json.stats.unchanged, 3);
    assert.strictEqual(r.json.changed, false);
    assert.strictEqual(readJson().length, 3);
  });

  console.log('\nEscenario C: nuevo registro');
  let newId;
  await test('POST crea en BD y en JSON', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 300, notas: 'nuevo' }));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.ok, true);
    newId = r.json.id;
    assert(db.records.find((x) => x.id === newId), 'está en BD');
    assert(readJson().find((x) => x.id === newId), 'está en JSON');
    assert.strictEqual(readJson().length, 4);
  });
  await test('reintento inmediato idéntico no genera duplicado', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 300, notas: 'nuevo' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.duplicate, true);
    assert.strictEqual(db.records.length, 4);
    assert.strictEqual(readJson().length, 4);
  });
  await test('datos inválidos devuelven 400 y no guardan nada', async () => {
    const r1 = await api('POST', '/api/records', { fecha: today });
    assert.strictEqual(r1.status, 400);
    const r2 = await api('POST', '/api/records', base({ efectivo: 'abc' }));
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(db.records.length, 4);
  });

  console.log('\nEscenario D: modificación');
  await test('PUT actualiza BD y JSON sin duplicar', async () => {
    const r = await api('PUT', `/api/records/${newId}`, base({ efectivo: 450, notas: 'editado' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.changed, true);
    const j = readJson().filter((x) => x.id === newId);
    assert.strictEqual(j.length, 1);
    assert.strictEqual(j[0].efectivo, 450);
    assert.strictEqual(j[0].notas, 'editado');
    assert.strictEqual(readJson().length, 4);
  });
  await test('PUT idéntico responde "sin cambios"', async () => {
    const r = await api('PUT', `/api/records/${newId}`, base({ efectivo: 450, notas: 'editado' }));
    assert.strictEqual(r.json.changed, false);
  });
  await test('PUT a un id inexistente devuelve 404', async () => {
    const r = await api('PUT', '/api/records/99999', base());
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.json.code, 'NOT_FOUND');
  });

  console.log('\nEscenario E: contabilización de estados');
  await test('el total de hoy excluye solo Z (registros 1, 3 y el nuevo = 3)', async () => {
    assert.strictEqual(await totalSummary(), 3);
    const list = (await api('GET', '/api/records')).json;
    assert.strictEqual(list.length, 4, 'Z se sigue listando');
    assert.strictEqual(list.filter((x) => x.countable).length, 3);
  });
  await test('cambiar a Z baja el total en 1 (y el registro se conserva)', async () => {
    const r = await api('PUT', `/api/records/${newId}`, base({ efectivo: 450, notas: 'editado', estado: 'Z' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.estado, 'Z (encQR)');
    assert.strictEqual(await totalSummary(), 2);
    assert.strictEqual(readJson().find((x) => x.id === newId).estado, 'Z (encQR)');
    assert.strictEqual(readJson().length, 4);
  });
  await test('cambiar de Z a otro estado sube el total en 1', async () => {
    const r = await api('PUT', `/api/records/${newId}`, base({ efectivo: 450, notas: 'editado', estado: 'Revisado' }));
    assert.strictEqual(r.json.estado, 'Revisado');
    assert.strictEqual(await totalSummary(), 3);
  });
  await test('editar sin enviar estado conserva el estado actual', async () => {
    await api('PUT', `/api/records/${newId}`, base({ efectivo: 451, notas: 'editado', estado: 'Revisado' }));
    const r = await api('PUT', `/api/records/${newId}`, base({ efectivo: 452, notas: 'editado' }));
    assert.strictEqual(r.json.estado, 'Revisado');
  });
  await test('el resumen mensual también excluye Z', async () => {
    const m = (await api('GET', '/api/records/month')).json;
    assert.strictEqual(m.reduce((s, x) => s + Number(x.registros), 0), 3);
  });

  console.log('\nEscenario F: error de conexión');
  await test('con la BD caída nada se presenta como exitoso y el JSON no cambia', async () => {
    const before = fs.readFileSync(recordsJsonPath, 'utf8');
    db.down = true;
    const post = await api('POST', '/api/records', base({ efectivo: 999 }));
    assert.strictEqual(post.status, 500);
    assert.notStrictEqual(post.json.ok, true);
    const sync = await api('POST', '/api/records/sync');
    assert.strictEqual(sync.status, 503);
    assert.strictEqual(sync.json.code, 'DB_QUERY');
    const get = await api('GET', '/api/records');
    assert.strictEqual(get.status, 503);
    const put = await api('PUT', `/api/records/${newId}`, base({ efectivo: 1 }));
    assert.strictEqual(put.status, 503);
    assert.strictEqual(fs.readFileSync(recordsJsonPath, 'utf8'), before, 'JSON intacto');
    db.down = false;
    const status = (await api('GET', '/api/records/sync')).json.sync;
    assert.strictEqual(status.state, 'error');
  });
  await test('al volver la BD se puede reintentar y se recupera', async () => {
    const r = await api('POST', '/api/records/sync');
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await api('GET', '/api/records/sync')).json.sync.state, 'ok');
  });
  await test('si falla la escritura del JSON, el dato queda en la BD y se avisa', async () => {
    const before = fs.readFileSync(recordsJsonPath, 'utf8');
    const origRename = fs.promises.rename;
    fs.promises.rename = async () => { throw new Error('disco lleno'); };
    const r = await api('POST', '/api/records', base({ efectivo: 777, notas: 'json-falla' }));
    fs.promises.rename = origRename;
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.json.jsonSync.ok, false);
    assert(r.json.warning, 'incluye aviso');
    assert.strictEqual(fs.readFileSync(recordsJsonPath, 'utf8'), before, 'JSON anterior intacto');
    assert.strictEqual(fs.readdirSync(DATA).filter((f) => f.endsWith('.tmp')).length, 0, 'sin temporales');
    // El siguiente sync lo incorpora sin duplicar
    await api('POST', '/api/records/sync');
    assert.strictEqual(readJson().filter((x) => x.notas === 'json-falla').length, 1);
  });
  await test('un records.json corrupto se respalda y se reconstruye desde la BD', async () => {
    fs.writeFileSync(recordsJsonPath, '{ esto no es json');
    const r = await api('POST', '/api/records/sync');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(readJson().length, db.records.length);
    assert(fs.readdirSync(DATA).some((f) => f.startsWith('records.json.corrupt-')), 'respaldo creado');
  });

  console.log('\nEscenario G: integridad tras operaciones sucesivas');
  await test('BD y JSON coinciden en ids, estados y totales', async () => {
    const a = await api('POST', '/api/records', base({ efectivo: 11, notas: 'g1', estado: 'Z' }));
    const b = await api('POST', '/api/records', base({ efectivo: 22, notas: 'g2' }));
    await api('PUT', `/api/records/${b.json.id}`, base({ efectivo: 23, notas: 'g2', estado: 'Z (encQR)' }));
    await api('PUT', `/api/records/${a.json.id}`, base({ efectivo: 12, notas: 'g1', estado: '' }));
    await api('DELETE', `/api/records/${seedDeleteId()}`);
    await api('POST', '/api/records/sync');
    await api('POST', '/api/records/sync');

    const j = readJson();
    const ids = j.map((x) => x.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'sin ids repetidos');
    assert.deepStrictEqual([...ids].sort((x, y) => x - y), db.records.map((r) => r.id).sort((x, y) => x - y));
    db.records.forEach((r) => {
      const x = j.find((y) => y.id === r.id);
      assert.strictEqual(x.estado, r.estado === 'Z' ? 'Z (encQR)' : (r.estado || ''), `estado id ${r.id}`);
      assert.strictEqual(x.total, Number(r.total), `total id ${r.id}`);
    });
    const countableDb = db.records.filter((r) => !['Z', 'Z (encQR)'].includes(r.estado || '') && r.fecha === today).length;
    assert.strictEqual(await totalSummary(), countableDb);
    assert.strictEqual(j.filter((x) => x.estado === 'Z (encQR)').length,
      db.records.filter((r) => ['Z', 'Z (encQR)'].includes(r.estado)).length, 'los Z siguen en el JSON');
  });
  await test('DELETE quita el registro de la BD y del JSON', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 5, notas: 'borrar' }));
    const del = await api('DELETE', `/api/records/${r.json.id}`);
    assert.strictEqual(del.status, 200);
    assert(!readJson().find((x) => x.id === r.json.id));
    assert.strictEqual((await api('DELETE', `/api/records/${r.json.id}`)).status, 404);
  });
  await test('sin sesión no se puede editar ni sincronizar', async () => {
    const saved = cookie;
    cookie = '';
    assert.strictEqual((await api('PUT', `/api/records/${newId}`, base())).status, 401);
    assert.strictEqual((await api('POST', '/api/records/sync')).status, 401);
    cookie = saved;
  });

  console.log('\nEscenario H: hora editable');
  const dbRow = (id) => db.records.find((r) => r.id === id);
  await test('al crear con hora, se guarda en la BD y en el JSON como HH:MM:SS', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 301, notas: 'h-alta', hora: '08:30' }));
    assert.strictEqual(r.status, 201);
    assert.strictEqual(dbRow(r.json.id).hora, '08:30:00');
    assert.strictEqual(readJson().find((x) => x.id === r.json.id).hora, '08:30:00');
  });
  await test('al crear sin hora, se asigna la hora actual', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 302, notas: 'h-sin-hora' }));
    assert.match(dbRow(r.json.id).hora, /^\d{2}:\d{2}:\d{2}$/);
  });
  await test('editar fecha, hora, sucursal y montos se guarda en la BD y en el JSON', async () => {
    const c = await api('POST', '/api/records', base({ efectivo: 303, notas: 'h-edit' }));
    const put = await api('PUT', `/api/records/${c.json.id}`, {
      fecha: '2020-01-15', hora: '21:45', sucursal: 'Hattogu', efectivo: 1000, transferencias: 200,
      qr: 30, pedidosYa: 4, tiraxy: 5, notas: 'h-edit', stock: ''
    });
    assert.strictEqual(put.status, 200);
    assert.strictEqual(put.json.changed, true);
    assert.strictEqual(put.json.record.hora, '21:45:00');
    const row = dbRow(c.json.id);
    assert.strictEqual(row.hora, '21:45:00');
    assert.strictEqual(row.fecha, '2020-01-15');
    assert.strictEqual(row.sucursal, 'Hattogu');
    assert.strictEqual(Number(row.total), 1209, 'el Z no suma');
    const j = readJson().find((x) => x.id === c.json.id);
    assert.deepStrictEqual(
      [j.fecha, j.hora, j.sucursal, j.efectivo, j.transferencias, j.qr, j.pedidosYa, j.tiraxy, j.total],
      ['2020-01-15', '21:45:00', 'Hattogu', 1000, 200, 30, 4, 5, 1209]
    );
  });
  await test('editar sin enviar hora ni estado no los modifica', async () => {
    const c = await api('POST', '/api/records', base({ efectivo: 304, notas: 'h-conserva', hora: '10:15', estado: 'Z' }));
    const put = await api('PUT', `/api/records/${c.json.id}`, base({ efectivo: 305, notas: 'h-conserva' }));
    assert.strictEqual(put.status, 200);
    assert.strictEqual(dbRow(c.json.id).hora, '10:15:00');
    assert.strictEqual(dbRow(c.json.id).estado, 'Z (encQR)');
    assert.strictEqual(put.json.record.countable, false);
  });
  await test('una hora inválida se rechaza y no cambia nada', async () => {
    const c = await api('POST', '/api/records', base({ efectivo: 306, notas: 'h-invalida', hora: '11:00' }));
    const put = await api('PUT', `/api/records/${c.json.id}`, base({ efectivo: 999, notas: 'h-invalida', hora: '25:99' }));
    assert.strictEqual(put.status, 400);
    assert.strictEqual(dbRow(c.json.id).hora, '11:00:00');
    assert.strictEqual(Number(dbRow(c.json.id).efectivo), 306);
  });

  console.log('\nEscenario I: el Z se carga pero nunca suma');
  await test('al crear, el Z se guarda en la BD y en el JSON pero no entra en el total', async () => {
    const r = await api('POST', '/api/records', base({ efectivo: 100, transferencias: 50, qr: 500, pedidosYa: 10, tiraxy: 5, notas: 'i-alta' }));
    assert.strictEqual(r.status, 201);
    const row = dbRow(r.json.id);
    assert.strictEqual(Number(row.qr), 500);
    assert.strictEqual(Number(row.total), 165);
    const j = readJson().find((x) => x.id === r.json.id);
    assert.deepStrictEqual([j.qr, j.total], [500, 165]);
  });
  await test('cambiar solo el Z no cambia el total', async () => {
    const c = await api('POST', '/api/records', base({ efectivo: 80, qr: 10, notas: 'i-solo-z' }));
    const put = await api('PUT', `/api/records/${c.json.id}`, base({ efectivo: 80, qr: 9999, notas: 'i-solo-z' }));
    assert.strictEqual(put.status, 200);
    assert.strictEqual(Number(dbRow(c.json.id).qr), 9999);
    assert.strictEqual(Number(dbRow(c.json.id).total), 80);
    assert.strictEqual(put.json.record.total, 80);
  });
  await test('un registro anterior cuyo total incluía el Z se corrige al sincronizar', async () => {
    db.records.push({
      id: db.nextId++, fecha: '2020-02-02', sucursal: 'Centro', efectivo: '100.00', transferencias: '0.00',
      qr: '250.00', pedidos_ya: '0.00', tiraxy: '0.00', total: '350.00', notas: 'i-viejo', stock: '',
      usuario: 'Seed', estado: '', created_at: new Date(Date.now() - 864e5).toISOString()
    });
    const id = db.records[db.records.length - 1].id;
    assert.strictEqual((await api('POST', '/api/records/sync')).status, 200);
    const j = readJson().find((x) => x.id === id);
    assert.deepStrictEqual([j.qr, j.total], [250, 100]);
    assert.strictEqual((await api('GET', '/api/records')).json.find((x) => x.id === id).total, 100);
  });

  const failed = results.filter(([ok]) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} pruebas correctas`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function seedDeleteId() { return 1; }
