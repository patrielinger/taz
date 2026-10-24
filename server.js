const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_ROOT = __dirname;
const ADMIN_DIR_NAME = '9f4a7b2c';
const ADMIN_PUBLIC_PREFIX = `/${ADMIN_DIR_NAME}`;
const ADMIN_ROOT = path.join(__dirname, ADMIN_DIR_NAME);
const PUBLIC_HOSTS = new Set(['tazjujuy.com', 'www.tazjujuy.com', 'localhost']);
const ADMIN_HOSTS = new Set(['admin.tazjujuy.com', 'www.admin.tazjujuy.com', 'admin.localhost']);
const SESSION_COOKIE_SECURE = process.env.SESSION_SECURE === 'true' || process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

/* =========================================================
   MIDDLEWARES GENERALES
   ========================================================= */

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const allowed = [
      'https://tazjujuy.com',
      'https://www.tazjujuy.com',
      'https://admin.tazjujuy.com',
      'https://www.admin.tazjujuy.com',
      'http://localhost',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1'
    ];

    if (allowed.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  const isAdminHost = ADMIN_HOSTS.has(host);
  const isPublicHost = PUBLIC_HOSTS.has(host) || host.endsWith('.local');

  if (isAdminHost) {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return next();
    }

    if (req.path === ADMIN_PUBLIC_PREFIX || req.path.startsWith(`${ADMIN_PUBLIC_PREFIX}/`)) {
      req.url = req.path.replace(ADMIN_PUBLIC_PREFIX, '') || '/';
    }

    const adminPath = req.path === '/' || req.path === '' ? 'index.html' : req.path.replace(/^\/+/, '');
    const safePath = adminPath === ADMIN_DIR_NAME ? 'index.html' : adminPath;
    const candidate = path.join(ADMIN_ROOT, safePath);

    if (safePath && safePath !== 'index.html' && !safePath.startsWith('api/') && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return res.sendFile(candidate);
    }

    return res.sendFile(path.join(ADMIN_ROOT, 'index.html'));
  }

  if (isPublicHost && (req.path === ADMIN_PUBLIC_PREFIX || req.path.startsWith(`${ADMIN_PUBLIC_PREFIX}/`))) {
    const targetPath = req.path === ADMIN_PUBLIC_PREFIX ? '/' : req.path.replace(ADMIN_PUBLIC_PREFIX, '') || '/';
    const target = `https://admin.tazjujuy.com${targetPath}`;
    return res.redirect(301, target);
  }

  if (host && !isPublicHost && !isAdminHost) {
    return next();
  }

  next();
});

/* =========================================================
   ARCHIVOS ESTÁTICOS
   ========================================================= */

// Los JSON de persistencia (data/) son internos: nunca se sirven como estáticos.
app.use('/data', (req, res) => res.status(404).json({ message: 'No encontrado' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(PUBLIC_ROOT, { index: false }));

/* =========================================================
   SESIONES
   ========================================================= */

app.use(session({
  secret: process.env.SESSION_SECRET || 'taz-secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax'
  }
}));


/* =========================================================
   DIRECTORIOS
   ========================================================= */

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


// Directory for JSON storage
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}


/* =========================================================
   FUNCIONES JSON
   ========================================================= */

async function readJsonFile(name) {
  const p = path.join(dataDir, name);

  try {
    const txt = await fs.promises.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch (err) {
    return [];
  }
}


async function writeJsonFile(name, data) {
  const p = path.join(dataDir, name);
  const txt = JSON.stringify(data, null, 2);

  const existing = await fs.promises
    .readFile(p, 'utf8')
    .catch(() => null);

  if (existing === txt) return false;

  // Escritura atómica: se escribe un archivo temporal en el mismo directorio
  // y recién cuando está completo y sincronizado se reemplaza el original.
  // Si algo falla, el archivo anterior queda intacto.
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  let handle = null;

  try {
    handle = await fs.promises.open(tmp, 'w');
    await handle.writeFile(txt, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(tmp, p);
    return true;
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }
}


/* =========================================================
   MULTER / UPLOADS
   ========================================================= */

const storage = multer.diskStorage({

  destination: (_, __, cb) =>
    cb(null, uploadDir),

  filename: (_, file, cb) => {

    const safeName =
      `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;

    cb(null, safeName);
  }

});


const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});


/* =========================================================
   MYSQL
   ========================================================= */

const dbConfig = {
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'taz_admin'
};


async function initDatabase() {

  let lastError;

  for (let attempt = 1; attempt <= 20; attempt += 1) {

    try {

      const connection = await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        connectTimeout: 5000
      });


      await connection.execute(
        `CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``
      );

      await connection.end();


      const pool = mysql.createPool(dbConfig);


      await pool.execute(`
        CREATE TABLE IF NOT EXISTS admins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(120) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);


      await pool.execute(`
        CREATE TABLE IF NOT EXISTS records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          fecha DATE NOT NULL,
          sucursal VARCHAR(120) NOT NULL,
          efectivo DECIMAL(12,2) NOT NULL DEFAULT 0,
          transferencias DECIMAL(12,2) NOT NULL DEFAULT 0,
          qr DECIMAL(12,2) NOT NULL DEFAULT 0,
          pedidos_ya DECIMAL(12,2) NOT NULL DEFAULT 0,
          tiraxy DECIMAL(12,2) NOT NULL DEFAULT 0,
          total DECIMAL(12,2) NOT NULL DEFAULT 0,
          notas TEXT,
          stock TEXT,
          usuario VARCHAR(120) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);


      await pool.execute(`
        CREATE TABLE IF NOT EXISTS uploaded_files (
          id INT AUTO_INCREMENT PRIMARY KEY,
          original_name VARCHAR(255) NOT NULL,
          stored_name VARCHAR(255) NOT NULL,
          mimetype VARCHAR(120),
          size INT,
          uploaded_by VARCHAR(120) NOT NULL,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          file_path VARCHAR(255) NOT NULL
        )
      `);


      await pool.execute(`
        CREATE TABLE IF NOT EXISTS employees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL,
          last_name VARCHAR(120) NOT NULL,
          role VARCHAR(50) NOT NULL,
          password_hash VARCHAR(255) NOT NULL DEFAULT '',
          hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
          phone VARCHAR(50) NOT NULL,
          branch VARCHAR(120) NOT NULL,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);


      // Ensure password_hash column exists for older databases
      try {

        const [colRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'employees'
           AND COLUMN_NAME = 'password_hash'`,
          [dbConfig.database]
        );


        if (
          !colRows ||
          !colRows[0] ||
          Number(colRows[0].cnt) === 0
        ) {

          await pool.execute(
            `ALTER TABLE employees
             ADD COLUMN password_hash VARCHAR(255)
             NOT NULL DEFAULT ''`
          );
        }

      } catch (err) {

        console.warn(
          'Could not ensure password_hash column exists:',
          err.message || err
        );
      }


      // Ensure records table has pedidos_ya, tiraxy, and stock
      try {

        const [pedRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'records'
           AND COLUMN_NAME = 'pedidos_ya'`,
          [dbConfig.database]
        );


        if (
          !pedRows ||
          !pedRows[0] ||
          Number(pedRows[0].cnt) === 0
        ) {

          await pool.execute(
            `ALTER TABLE records
             ADD COLUMN pedidos_ya DECIMAL(12,2)
             NOT NULL DEFAULT 0`
          );
        }


        const [tiraxyRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'records'
           AND COLUMN_NAME = 'tiraxy'`,
          [dbConfig.database]
        );


        if (
          !tiraxyRows ||
          !tiraxyRows[0] ||
          Number(tiraxyRows[0].cnt) === 0
        ) {

          await pool.execute(
            `ALTER TABLE records
             ADD COLUMN tiraxy DECIMAL(12,2)
             NOT NULL DEFAULT 0`
          );
        }


        const [stockRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'records'
           AND COLUMN_NAME = 'stock'`,
          [dbConfig.database]
        );


        if (
          !stockRows ||
          !stockRows[0] ||
          Number(stockRows[0].cnt) === 0
        ) {

          await pool.execute(
            `ALTER TABLE records
             ADD COLUMN stock TEXT`
          );
        }

      } catch (err) {

        console.warn(
          'Could not ensure records columns exist:',
          err.message || err
        );
      }


      // Columna `estado` (aditiva): los registros existentes quedan con ''
      // (estado normal, se contabiliza). No se modifica ningún otro campo.
      try {

        const [estadoRows] = await pool.execute(
          `SELECT COUNT(*) AS cnt
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'records'
           AND COLUMN_NAME = 'estado'`,
          [dbConfig.database]
        );

        if (
          !estadoRows ||
          !estadoRows[0] ||
          Number(estadoRows[0].cnt) === 0
        ) {

          await pool.execute(
            `ALTER TABLE records
             ADD COLUMN estado VARCHAR(40)
             NOT NULL DEFAULT ''`
          );
        }

        recordsHasEstado = true;

      } catch (err) {

        recordsHasEstado = false;
        console.error(
          'No se pudo asegurar la columna records.estado. ' +
          'Los estados no se podrán guardar en la base de datos:',
          err.message || err
        );
      }


      const [adminRows] =
        await pool.execute(
          'SELECT * FROM admins WHERE username = ?',
          ['admin']
        );


      if (!adminRows.length) {

        const hash =
          await bcrypt.hash('tazadmin123', 10);


        const [resAdmin] =
          await pool.execute(
            'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
            ['admin', hash]
          );


        // persist admin to JSON
        try {

          const adminsJson =
            await readJsonFile('admins.json');

          adminsJson.push({
            id: resAdmin.insertId || Date.now(),
            username: 'admin',
            created_at: new Date().toISOString()
          });

          await writeJsonFile(
            'admins.json',
            adminsJson
          );

        } catch (err) {

          console.warn(
            'Could not write admins.json:',
            err.message || err
          );
        }
      }


      // Sync employees table to JSON
      try {

        const [empRows] =
          await pool.execute(
            `SELECT id, name, last_name, role,
                    password_hash, hourly_rate, phone,
                    branch, notes, created_at
             FROM employees
             ORDER BY created_at DESC`
          );


        const empsToWrite =
          (empRows || []).map((r) => ({

            id: r.id,
            name: r.name,
            last_name: r.last_name,
            role: r.role,
            password_hash: r.password_hash || '',
            hourly_rate: Number(r.hourly_rate || 0),
            phone: r.phone,
            branch: r.branch,
            notes: r.notes || '',
            created_at: r.created_at

          }));


        // Nunca se pisa un employees.json con datos por una lista vacía
        // (p. ej. BD recién creada en un despliegue nuevo).
        const existingEmps = await readJsonFile('employees.json');
        if (
          empsToWrite.length ||
          !Array.isArray(existingEmps) ||
          !existingEmps.length
        ) {
          await writeJsonFile(
            'employees.json',
            empsToWrite
          );
        }

      } catch (err) {

        console.warn(
          'Could not sync employees to JSON:',
          err.message || err
        );
      }


      return pool;

    } catch (error) {

      lastError = error;

      if (attempt === 20) {
        throw error;
      }

      await new Promise(
        (resolve) => setTimeout(resolve, 3000)
      );
    }
  }


  throw lastError;
}


let pool;

/* =========================================================
   REGISTROS: REGLAS CENTRALIZADAS
   ---------------------------------------------------------
   Regla de contabilización (única fuente de verdad):
     total contabilizado = registros cuyo estado sea distinto de Z
   El estado Z se carga, guarda y muestra normalmente; solo se
   excluye del cálculo de totales.
   ========================================================= */

const RECORD_STATE_Z = 'Z (encQR)';
const RECORD_Z_STATES = ['Z', RECORD_STATE_Z];
const RECORD_STATE_MAX_LENGTH = 40;
const RECORD_AMOUNT_LIMIT = 1e10; // DECIMAL(12,2)
const DUPLICATE_WINDOW_SECONDS = 60;

// Se vuelve true cuando initDatabase() confirma que existe records.estado.
let recordsHasEstado = false;

class RecordsError extends Error {
  constructor(code, message, status = 500, cause = null) {
    super(message);
    this.name = 'RecordsError';
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

function normalizeRecordDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const adjusted = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return adjusted.toISOString().slice(0, 10);
}

function normalizeRecordState(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const compact = raw
    .toUpperCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[()]/g, '');

  if (compact === 'Z' || compact === 'ZENCQR') {
    return RECORD_STATE_Z;
  }

  return raw;
}

function getRecordTotal(record = {}) {
  return Number(
    record.total ?? (
      Number(record.efectivo || 0) +
      Number(record.transferencias || 0) +
      Number(record.qr || 0) +
      Number(record.pedidosYa ?? record.pedidos_ya ?? 0) +
      Number(record.tiraxy || 0)
    )
  );
}

function computeRecordTotal({ efectivo = 0, transferencias = 0, qr = 0, pedidosYa = 0, tiraxy = 0 } = {}) {
  return Number((
    Number(efectivo || 0) +
    Number(transferencias || 0) +
    Number(qr || 0) +
    Number(pedidosYa || 0) +
    Number(tiraxy || 0)
  ).toFixed(2));
}

function isCountableRecord(record = {}) {
  const state = normalizeRecordState(record.estado ?? record.status ?? record.state ?? '');
  return !RECORD_Z_STATES.includes(state);
}

// Condición SQL equivalente a isCountableRecord (solo constantes, sin input de usuario).
function sqlCountableCondition(column = 'estado') {
  if (!recordsHasEstado) return '1=1';
  const list = RECORD_Z_STATES.map((state) => `'${state}'`).join(', ');
  return `(${column} IS NULL OR ${column} NOT IN (${list}))`;
}

function normalizeRecordRow(record = {}) {
  return {
    id: record.id ?? record.record_id ?? record.recordId,
    fecha: normalizeRecordDate(record.fecha_iso || record.fecha || ''),
    hora: record.hora || (
      record.created_at
        ? new Date(record.created_at).toLocaleTimeString('es-AR', { hour12: false })
        : '00:00:00'
    ),
    usuario: record.usuario || record.user || 'Sin usuario',
    sucursal: record.sucursal || 'Centro',
    efectivo: Number(record.efectivo || 0),
    transferencias: Number(record.transferencias || 0),
    qr: Number(record.qr || 0),
    pedidosYa: Number(record.pedidosYa ?? record.pedidos_ya ?? 0),
    tiraxy: Number(record.tiraxy || 0),
    notas: record.notas || '',
    stock: record.stock || '',
    total: getRecordTotal(record),
    created_at: record.created_at || new Date().toISOString(),
    estado: normalizeRecordState(record.estado ?? record.status ?? record.state ?? '')
  };
}

// Versión para respuestas de la API: agrega `countable` (derivado, no se persiste en el JSON).
function toApiRecord(record) {
  const normalized = normalizeRecordRow(record);
  return { ...normalized, countable: isCountableRecord(normalized) };
}

/* ---------- Validación ---------- */

function parseAmount(value, label) {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || Math.abs(num) >= RECORD_AMOUNT_LIMIT) {
    throw new RecordsError('INVALID_DATA', `Dato inválido: ${label}.`, 400);
  }
  return Number(num.toFixed(2));
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// `estado` solo se incluye en el resultado si vino en el body (undefined = "no tocar").
function validateRecordPayload(body = {}, { allowEstado = true } = {}) {
  const fecha = normalizeRecordDate(body.fecha);
  const sucursal = String(body.sucursal ?? '').trim();

  if (!fecha || !sucursal) {
    throw new RecordsError('INVALID_DATA', 'Falta fecha o sucursal.', 400);
  }
  if (!isValidIsoDate(fecha)) {
    throw new RecordsError('INVALID_DATA', 'La fecha no es válida.', 400);
  }
  if (sucursal.length > 120) {
    throw new RecordsError('INVALID_DATA', 'El nombre de la sucursal es demasiado largo.', 400);
  }

  const clean = {
    fecha,
    sucursal,
    efectivo: parseAmount(body.efectivo, 'efectivo'),
    transferencias: parseAmount(body.transferencias, 'transferencias'),
    qr: parseAmount(body.qr, 'QR'),
    pedidosYa: parseAmount(body.pedidosYa ?? body.pedidos_ya, 'PedidosYa'),
    tiraxy: parseAmount(body.tiraxy, 'Tiraxy'),
    notas: String(body.notas ?? ''),
    stock: String(body.stock ?? '')
  };

  clean.total = computeRecordTotal(clean);

  if (allowEstado && body.estado !== undefined) {
    const estado = normalizeRecordState(body.estado);
    if (estado.length > RECORD_STATE_MAX_LENGTH) {
      throw new RecordsError('INVALID_DATA', 'El estado es demasiado largo.', 400);
    }
    clean.estado = estado;
  }

  return clean;
}

/* =========================================================
   SINCRONIZACIÓN BD -> JSON
   ---------------------------------------------------------
   - La base de datos es la fuente principal; el JSON es complementario.
   - Un solo sync a la vez (lock en memoria).
   - El JSON solo se escribe si la consulta a la BD tuvo éxito.
   - Escritura atómica; si el JSON existente es ilegible se respalda
     (nunca se pisa a ciegas).
   - Los registros que están solo en el JSON se conservan (no se pierden).
   ========================================================= */

const recordsSyncStatus = {
  state: 'idle', // idle | running | ok | error
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastStats: null
};

// Ids eliminados en la BD cuyo borrado en el JSON falló: se reintentan en el próximo sync.
const pendingJsonRemovals = new Set();

let recordsSyncChain = Promise.resolve();

function withRecordsLock(task) {
  const run = recordsSyncChain.then(task);
  recordsSyncChain = run.catch(() => {});
  return run;
}

async function readRecordsJsonSafely() {
  const filePath = path.join(dataDir, 'records.json');
  let text;

  try {
    text = await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new RecordsError('JSON_SYNC', 'No se pudo leer data/records.json.', 500, err);
  }

  if (!text.trim()) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('El contenido no es un arreglo.');
    return parsed;
  } catch (err) {
    // Contenido ilegible: se respalda antes de continuar. Si el respaldo falla, se aborta.
    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      await fs.promises.copyFile(filePath, backupPath);
    } catch (copyErr) {
      throw new RecordsError('JSON_SYNC', 'records.json es ilegible y no se pudo respaldar.', 500, copyErr);
    }
    console.warn(`records.json ilegible (${err.message}). Respaldo en ${backupPath}`);
    return [];
  }
}

function sortRecords(list) {
  return list.sort((a, b) => {
    const byDate = String(b.fecha || '').localeCompare(String(a.fecha || ''));
    if (byDate !== 0) return byDate;
    const byCreated = String(b.created_at || '').localeCompare(String(a.created_at || ''));
    if (byCreated !== 0) return byCreated;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}

async function runRecordsSync({ removeIds = [], backfillState = false } = {}) {
  if (!pool) {
    throw new RecordsError('DB_UNAVAILABLE', 'Base de datos no disponible.', 503);
  }

  let rows;
  try {
    [rows] = await pool.execute(`
      SELECT r.*, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha_iso
      FROM records r
      ORDER BY r.fecha DESC, r.created_at DESC, r.id DESC
    `);
  } catch (err) {
    // La consulta falló: el JSON NO se toca.
    throw new RecordsError('DB_QUERY', 'Error al consultar la base de datos.', 503, err);
  }

  if (!Array.isArray(rows)) {
    throw new RecordsError('DB_QUERY', 'La base de datos devolvió una respuesta inválida.', 503);
  }

  const existing = await readRecordsJsonSafely();

  // Migración única al arrancar: estados que solo existían en el JSON se copian a la BD
  // (solo donde la BD tiene estado vacío; nunca se pisa un estado ya guardado).
  let backfilled = 0;
  if (backfillState && recordsHasEstado) {
    const jsonById = new Map();
    existing.forEach((rec) => {
      if (rec && rec.id != null) jsonById.set(String(rec.id), rec);
    });

    for (const row of rows) {
      const dbState = normalizeRecordState(row.estado);
      const jsonState = normalizeRecordState(jsonById.get(String(row.id))?.estado);
      if (!dbState && jsonState && jsonState.length <= RECORD_STATE_MAX_LENGTH) {
        const [result] = await pool.execute(
          `UPDATE records SET estado = ? WHERE id = ? AND (estado IS NULL OR estado = '')`,
          [jsonState, row.id]
        );
        if (result.affectedRows) {
          row.estado = jsonState;
          backfilled += 1;
        }
      }
    }
  }

  const removed = new Set([...pendingJsonRemovals, ...removeIds].map(String));
  const merged = new Map();
  const before = new Map();
  let duplicatesInJson = 0;

  existing.forEach((rec) => {
    if (!rec || rec.id == null) return;
    const key = String(rec.id);
    if (removed.has(key)) return;
    if (before.has(key)) duplicatesInJson += 1;
    const normalized = normalizeRecordRow(rec);
    merged.set(key, { ...merged.get(key), ...normalized });
    before.set(key, JSON.stringify(merged.get(key)));
  });

  const stats = { added: 0, updated: 0, unchanged: 0, orphansKept: 0, duplicatesInJson, backfilledEstado: backfilled };
  const dbKeys = new Set();

  rows.forEach((row) => {
    if (row.id == null) return;
    const key = String(row.id);
    dbKeys.add(key);
    const next = { ...merged.get(key), ...normalizeRecordRow(row) };

    if (!before.has(key)) {
      stats.added += 1;
    } else if (before.get(key) !== JSON.stringify(next)) {
      stats.updated += 1;
    } else {
      stats.unchanged += 1;
    }
    merged.set(key, next);
  });

  merged.forEach((_, key) => {
    if (!dbKeys.has(key)) stats.orphansKept += 1;
  });

  const nextRecords = sortRecords(Array.from(merged.values()).filter((rec) => rec && rec.id != null));

  try {
    stats.written = await writeJsonFile('records.json', nextRecords);
  } catch (err) {
    throw new RecordsError('JSON_SYNC', 'No se pudo escribir data/records.json.', 500, err);
  }

  removed.forEach((id) => pendingJsonRemovals.delete(id));

  stats.total = nextRecords.length;
  stats.countable = nextRecords.filter(isCountableRecord).length;
  stats.excludedZ = stats.total - stats.countable;

  return { records: nextRecords, stats };
}

function syncRecordsJsonFromDatabase(options = {}) {
  return withRecordsLock(async () => {
    recordsSyncStatus.state = 'running';
    recordsSyncStatus.lastAttemptAt = new Date().toISOString();

    try {
      const result = await runRecordsSync(options);
      recordsSyncStatus.state = 'ok';
      recordsSyncStatus.lastSuccessAt = new Date().toISOString();
      recordsSyncStatus.lastError = null;
      recordsSyncStatus.lastStats = result.stats;
      return result;
    } catch (err) {
      recordsSyncStatus.state = 'error';
      recordsSyncStatus.lastError = {
        code: err.code || 'JSON_SYNC',
        message: err.message,
        at: new Date().toISOString()
      };
      throw err;
    }
  });
}

// Sync "best effort" posterior a una escritura que YA se guardó en la BD.
// Nunca lanza: devuelve el resultado para informarlo al cliente.
async function trySyncAfterWrite(options = {}) {
  try {
    const { stats } = await syncRecordsJsonFromDatabase(options);
    return { ok: true, stats };
  } catch (err) {
    console.error('Error al sincronizar records.json:', err.cause || err);
    (options.removeIds || []).forEach((id) => pendingJsonRemovals.add(String(id)));
    return { ok: false, code: err.code || 'JSON_SYNC', message: err.message };
  }
}

// Si MySQL no responde tras los reintentos de initDatabase(), el servidor NO se cae:
// sigue arriba, las rutas de registros responden 503 (ensureDb) y se vuelve a intentar.
(async () => {

  for (;;) {
    try {
      pool = await initDatabase();
      break;
    } catch (error) {
      console.error(
        'No se pudo inicializar MySQL. Se reintenta en 30 s:',
        error.message || error
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }

  try {
    const { stats } = await syncRecordsJsonFromDatabase({ backfillState: true });
    console.log('MySQL ready.', JSON.stringify(stats));
  } catch (error) {
    console.warn('MySQL ready, JSON sync skipped:', error.message || error);
  }

})();


/* =========================================================
   AUTENTICACIÓN
   ========================================================= */

function ensureAuth(req, res, next) {

  if (!req.session || !req.session.user) {

    return res
      .status(401)
      .json({
        message: 'No autorizado'
      });
  }

  next();
}


function ensureAdmin(req, res, next) {

  if (
    !req.session ||
    !req.session.user ||
    req.session.user.role !== 'Admin'
  ) {

    return res
      .status(403)
      .json({
        message:
          'Acceso denegado. Solo administradores.'
      });
  }

  next();
}


/* =========================================================
   API
   ========================================================= */

app.get('/api/health', (_, res) => {

  res.json({
    ok: true,
    message: 'TAZ admin API online'
  });

});


app.post('/api/login', async (req, res) => {

  const {
    username,
    password
  } = req.body;


  if (!username || !password) {

    return res
      .status(400)
      .json({
        message:
          'Usuario y contraseña requeridos.'
      });
  }


  try {

    if (!pool) {

      return res
        .status(500)
        .json({
          message:
            'Base de datos no inicializada.'
        });
    }


    const [adminRows] =
      await pool.execute(
        'SELECT * FROM admins WHERE username = ?',
        [username]
      );


    const adminUser = adminRows[0];


    if (adminUser) {

      const validAdmin =
        await bcrypt.compare(
          password,
          adminUser.password_hash || ''
        );


      if (!validAdmin) {

        return res
          .status(401)
          .json({
            message:
              'Credenciales inválidas.'
          });
      }


      req.session.user = {
        id: adminUser.id,
        username: adminUser.username,
        role: 'Admin',
        name: 'Administrador',
        lastName: ''
      };


      return res.json({
        ok: true,
        user: req.session.user,
        redirect: 'employee-dashboard.html'
      });
    }


    const [empRows] =
      await pool.execute(
        'SELECT * FROM employees WHERE phone = ? AND role = ?',
        [username, 'Encargado']
      );


    const emp = empRows[0];


    if (!emp) {

      return res
        .status(401)
        .json({
          message:
            'Credenciales inválidas.'
        });
    }


    const validEmp =
      await bcrypt.compare(
        password,
        emp.password_hash || ''
      );


    if (!validEmp) {

      return res
        .status(401)
        .json({
          message:
            'Credenciales inválidas.'
        });
    }


    req.session.user = {

      id: emp.id,
      username: emp.phone,
      role: 'Encargado',
      name: emp.name || '',
      lastName: emp.last_name || '',
      phone: emp.phone,
      branch: emp.branch || 'Centro'

    };


    return res.json({
      ok: true,
      user: req.session.user,
      redirect: 'encargado.html'
    });


  } catch (err) {

    console.error(
      'Login error:',
      err
    );


    return res
      .status(500)
      .json({
        message:
          'Error interno en autenticación.'
      });
  }

});


app.post('/api/logout', (req, res) => {

  req.session.destroy(() => {

    res.json({
      ok: true
    });

  });

});


app.get('/api/session', (req, res) => {

  res.json({

    loggedIn:
      !!(
        req.session &&
        req.session.user
      ),

    user:
      req.session?.user || null

  });

});


/* =========================================================
   RECORDS
   ========================================================= */

function ensureDb(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      ok: false,
      code: 'DB_UNAVAILABLE',
      message: 'Base de datos no disponible. Intentá de nuevo en unos segundos.'
    });
  }
  next();
}

function sendRecordsError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof RecordsError) {
    return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ ok: false, code: fallbackCode, message: fallbackMessage });
}

function jsonSyncPayload(sync) {
  return sync.ok
    ? { ok: true }
    : { ok: false, code: sync.code, message: sync.message };
}

function syncWarning(sync, savedMessage) {
  return sync.ok
    ? undefined
    : `${savedMessage}, pero no se pudo actualizar el archivo JSON de respaldo (${sync.message}). Los datos están a salvo en la base de datos.`;
}

async function fetchRecordRow(id) {
  const [rows] = await pool.execute(
    `SELECT r.*, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha_iso FROM records r WHERE r.id = ?`,
    [id]
  );
  return rows && rows[0] ? rows[0] : null;
}

function parseRecordId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RecordsError('INVALID_DATA', 'Identificador de registro inválido.', 400);
  }
  return id;
}

/* ---------- Alta ---------- */

app.post(
  '/api/records',
  ensureAuth,
  ensureDb,
  async (req, res) => {

    let clean;
    try {
      // Solo un Admin puede fijar el estado al crear (el encargado no lo envía).
      const isAdmin = req.session.user?.role === 'Admin';
      clean = validateRecordPayload(req.body, { allowEstado: isAdmin });
    } catch (error) {
      return sendRecordsError(res, error, 'INVALID_DATA', 'Datos incompletos o inválidos.');
    }

    const fullName = [req.session.user?.name, req.session.user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const usuario = fullName || req.session.user?.username || 'Sin usuario';

    let insertId;
    let duplicate = false;

    try {
      // Protección ante reintentos: el mismo registro (mismo usuario, fecha, sucursal,
      // montos y textos) cargado hace instantes no se vuelve a insertar.
      const [dups] = await pool.execute(
        `SELECT id FROM records
         WHERE fecha = ? AND sucursal = ? AND usuario = ?
           AND efectivo = ? AND transferencias = ? AND qr = ?
           AND pedidos_ya = ? AND tiraxy = ?
           AND notas = ? AND stock = ?
           AND created_at >= (NOW() - INTERVAL ${DUPLICATE_WINDOW_SECONDS} SECOND)
         ORDER BY id DESC LIMIT 1`,
        [
          clean.fecha, clean.sucursal, usuario,
          clean.efectivo, clean.transferencias, clean.qr,
          clean.pedidosYa, clean.tiraxy,
          clean.notas, clean.stock
        ]
      );

      if (dups && dups[0]) {
        duplicate = true;
        insertId = dups[0].id;
      } else {
        const columns = [
          'fecha', 'sucursal', 'efectivo', 'transferencias', 'qr',
          'pedidos_ya', 'tiraxy', 'total', 'notas', 'stock', 'usuario'
        ];
        const values = [
          clean.fecha, clean.sucursal, clean.efectivo, clean.transferencias, clean.qr,
          clean.pedidosYa, clean.tiraxy, clean.total, clean.notas, clean.stock, usuario
        ];

        if (recordsHasEstado && clean.estado !== undefined) {
          columns.push('estado');
          values.push(clean.estado);
        }

        const [result] = await pool.execute(
          `INSERT INTO records (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})`,
          values
        );
        insertId = result.insertId;
      }
    } catch (error) {
      console.error('Error creating record:', error);
      return res.status(500).json({
        ok: false,
        code: 'DB_SAVE',
        message: 'Error al guardar el registro en la base de datos. No se guardó nada; podés reintentar.'
      });
    }

    // El registro ya está en la BD: un fallo del JSON no debe presentarse como fallo de guardado
    // (el reintento del cliente generaría un duplicado).
    const sync = await trySyncAfterWrite();

    return res.status(duplicate ? 200 : 201).json({
      ok: true,
      changed: !duplicate,
      duplicate,
      message: duplicate
        ? 'Este registro ya había sido cargado. No se generó un duplicado.'
        : 'Registro guardado correctamente.',
      id: insertId,
      jsonSync: jsonSyncPayload(sync),
      warning: syncWarning(sync, duplicate ? 'El registro ya existía' : 'Registro guardado')
    });
  }
);


/* ---------- Consulta ---------- */

app.get(
  '/api/records',
  ensureAuth,
  ensureDb,
  async (req, res) => {

    let rows;
    try {
      [rows] = await pool.execute(`
        SELECT r.*, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha_iso
        FROM records r
        ORDER BY r.fecha DESC, r.created_at DESC, r.id DESC
      `);
    } catch (error) {
      console.error('Error reading records:', error);
      const fallbackRecords = await readJsonFile('records.json');
      return res.status(503).json({
        ok: false,
        code: 'DB_QUERY',
        message: 'Base de datos no disponible. No se pudo completar la consulta.',
        records: Array.isArray(fallbackRecords) ? fallbackRecords : []
      });
    }

    const records = rows.map((row) => toApiRecord(row));

    // La lectura ya fue exitosa; un fallo del JSON se informa por header, no rompe la consulta.
    const sync = await trySyncAfterWrite();
    res.set('X-Records-Json-Sync', sync.ok ? 'ok' : 'error');

    return res.json(records);
  }
);


app.get(
  '/api/records/json',
  ensureAuth,
  async (req, res) => {

    try {
      const records = await readRecordsJsonSafely();
      return res.json(records);
    } catch (error) {
      return sendRecordsError(res, error, 'JSON_SYNC', 'No se pudo leer el archivo JSON.');
    }

  }
);


/* ---------- Sincronización manual / estado ---------- */

app.get(
  '/api/records/sync',
  ensureAuth,
  ensureAdmin,
  (req, res) => {
    res.json({ ok: true, hasEstadoColumn: recordsHasEstado, sync: recordsSyncStatus });
  }
);

app.post(
  '/api/records/sync',
  ensureAuth,
  ensureAdmin,
  ensureDb,
  async (req, res) => {

    try {
      const { stats } = await syncRecordsJsonFromDatabase();
      return res.json({
        ok: true,
        changed: stats.added > 0 || stats.updated > 0,
        message: (stats.added || stats.updated)
          ? 'Sincronización completada.'
          : 'Sincronización completada sin cambios.',
        stats
      });
    } catch (error) {
      return sendRecordsError(res, error, 'JSON_SYNC', 'No se pudo sincronizar el JSON.');
    }

  }
);


/* ---------- Modificación ---------- */

app.put(
  '/api/records/:id',
  ensureAuth,
  ensureAdmin,
  ensureDb,
  async (req, res) => {

    let id;
    let clean;
    try {
      id = parseRecordId(req.params.id);
      clean = validateRecordPayload(req.body);
    } catch (error) {
      return sendRecordsError(res, error, 'INVALID_DATA', 'Datos incompletos o inválidos.');
    }

    if (clean.estado !== undefined && !recordsHasEstado) {
      return res.status(500).json({
        ok: false,
        code: 'DB_UPDATE',
        message: 'La base de datos no tiene la columna de estado; no se puede guardar el estado.'
      });
    }

    let current;
    try {
      current = await fetchRecordRow(id);
    } catch (error) {
      console.error('Error reading record before update:', error);
      return res.status(503).json({
        ok: false,
        code: 'DB_QUERY',
        message: 'Error al consultar la base de datos.'
      });
    }

    if (!current) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        message: 'Registro no encontrado.'
      });
    }

    const currentNorm = normalizeRecordRow(current);
    // Si el body no trae `estado`, el estado actual se conserva tal cual.
    const nextEstado = clean.estado !== undefined ? clean.estado : currentNorm.estado;

    const unchanged =
      currentNorm.fecha === clean.fecha &&
      currentNorm.sucursal === clean.sucursal &&
      currentNorm.efectivo === clean.efectivo &&
      currentNorm.transferencias === clean.transferencias &&
      currentNorm.qr === clean.qr &&
      currentNorm.pedidosYa === clean.pedidosYa &&
      currentNorm.tiraxy === clean.tiraxy &&
      currentNorm.notas === clean.notas &&
      currentNorm.stock === clean.stock &&
      currentNorm.estado === nextEstado;

    if (!unchanged) {
      try {
        const sets = [
          'fecha = ?', 'sucursal = ?', 'efectivo = ?', 'transferencias = ?', 'qr = ?',
          'pedidos_ya = ?', 'tiraxy = ?', 'total = ?', 'notas = ?', 'stock = ?'
        ];
        const values = [
          clean.fecha, clean.sucursal, clean.efectivo, clean.transferencias, clean.qr,
          clean.pedidosYa, clean.tiraxy, clean.total, clean.notas, clean.stock
        ];

        if (recordsHasEstado) {
          sets.push('estado = ?');
          values.push(nextEstado);
        }

        values.push(id);
        const [result] = await pool.execute(
          `UPDATE records SET ${sets.join(', ')} WHERE id = ?`,
          values
        );

        if (!result.affectedRows) {
          return res.status(404).json({
            ok: false,
            code: 'NOT_FOUND',
            message: 'Registro no encontrado.'
          });
        }
      } catch (error) {
        console.error('Error updating record:', error);
        return res.status(500).json({
          ok: false,
          code: 'DB_UPDATE',
          message: 'No se pudo actualizar el registro en la base de datos. No se modificó nada.'
        });
      }
    }

    // Se sincroniza siempre (también "sin cambios") para sanear un JSON desfasado.
    const sync = await trySyncAfterWrite();

    let saved = current;
    try {
      saved = (await fetchRecordRow(id)) || current;
    } catch (error) {
      console.warn('No se pudo releer el registro actualizado:', error.message || error);
    }

    return res.json({
      ok: true,
      changed: !unchanged,
      message: unchanged
        ? 'Sin cambios: el registro ya tenía esos datos.'
        : 'Registro actualizado correctamente.',
      estado: normalizeRecordRow(saved).estado,
      record: toApiRecord(saved),
      jsonSync: jsonSyncPayload(sync),
      warning: syncWarning(sync, 'Registro actualizado')
    });

  }
);


/* ---------- Baja ---------- */

app.delete(
  '/api/records/:id',
  ensureAuth,
  ensureAdmin,
  ensureDb,
  async (req, res) => {

    let id;
    try {
      id = parseRecordId(req.params.id);
    } catch (error) {
      return sendRecordsError(res, error, 'INVALID_DATA', 'Identificador de registro inválido.');
    }

    try {
      const [result] = await pool.execute(
        'DELETE FROM records WHERE id = ?',
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          ok: false,
          code: 'NOT_FOUND',
          message: 'Registro no encontrado.'
        });
      }
    } catch (error) {
      console.error('Error deleting record:', error);
      return res.status(500).json({
        ok: false,
        code: 'DB_UPDATE',
        message: 'No se pudo eliminar el registro en la base de datos.'
      });
    }

    const sync = await trySyncAfterWrite({ removeIds: [id] });

    return res.json({
      ok: true,
      changed: true,
      message: 'Registro eliminado correctamente.',
      jsonSync: jsonSyncPayload(sync),
      warning: syncWarning(sync, 'Registro eliminado')
    });
  }
);


/* ---------- Totales (excluyen estado Z) ---------- */

app.get(
  '/api/records/summary',
  ensureAuth,
  ensureDb,
  async (req, res) => {

    try {
      const [rows] = await pool.execute(
        `SELECT
          sucursal,
          SUM(efectivo) AS efectivo,
          SUM(transferencias) AS transferencias,
          SUM(qr) AS qr,
          SUM(total) AS total,
          COUNT(*) AS registros
         FROM records
         WHERE fecha = CURDATE()
           AND ${sqlCountableCondition()}
         GROUP BY sucursal`
      );

      return res.json(rows);
    } catch (error) {
      return sendRecordsError(res, error, 'DB_QUERY', 'Error al consultar los totales.');
    }

  }
);


app.get(
  '/api/records/month',
  ensureAuth,
  ensureDb,
  async (req, res) => {

    try {
      const [rows] = await pool.execute(
        `SELECT
          DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
          SUM(total) AS total,
          COUNT(*) AS registros
         FROM records
         WHERE fecha >= DATE_FORMAT(
           CURDATE(),
           '%Y-%m-01'
         )
           AND ${sqlCountableCondition()}
         GROUP BY DATE_FORMAT(
           fecha,
           '%Y-%m-%d'
         )
         ORDER BY fecha ASC`
      );

      return res.json(rows);
    } catch (error) {
      return sendRecordsError(res, error, 'DB_QUERY', 'Error al consultar los totales del mes.');
    }

  }
);


/* =========================================================
   UPLOAD
   ========================================================= */

app.post(
  '/api/upload',
  ensureAuth,
  upload.single('file'),
  async (req, res) => {

    if (!req.file) {

      return res
        .status(400)
        .json({
          message:
            'Debe adjuntar un archivo.'
        });
    }


    const fileRecord = {

      original_name:
        req.file.originalname,

      stored_name:
        req.file.filename,

      mimetype:
        req.file.mimetype,

      size:
        req.file.size,

      uploaded_by:
        req.session.user.username,

      file_path:
        `/uploads/${req.file.filename}`

    };


    const [result] =
      await pool.execute(
        `INSERT INTO uploaded_files
        (
          original_name,
          stored_name,
          mimetype,
          size,
          uploaded_by,
          file_path
        )
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          fileRecord.original_name,
          fileRecord.stored_name,
          fileRecord.mimetype,
          fileRecord.size,
          fileRecord.uploaded_by,
          fileRecord.file_path
        ]
      );


    try {

      const insertId =
        (
          result &&
          result.insertId
        )
          ? result.insertId
          : Date.now();


      const filesJson =
        await readJsonFile(
          'uploaded_files.json'
        );


      filesJson.unshift({

        id: insertId,
        ...fileRecord,
        uploaded_at:
          new Date().toISOString()

      });


      await writeJsonFile(
        'uploaded_files.json',
        filesJson
      );


    } catch (err) {

      console.warn(
        'Could not write uploaded_files.json:',
        err.message || err
      );
    }


    res
      .status(201)
      .json({
        ok: true,
        file: fileRecord
      });

  }
);


/* =========================================================
   EMPLOYEES
   ========================================================= */

app.get(
  '/api/employees',
  ensureAuth,
  async (req, res) => {

    const [rows] =
      await pool.execute(
        `SELECT
          id,
          name,
          last_name,
          role,
          hourly_rate,
          phone,
          branch,
          notes,
          created_at
         FROM employees
         ORDER BY created_at DESC`
      );


    res.json(rows);

  }
);


app.post(
  '/api/employees',
  ensureAuth,
  async (req, res) => {

    const {
      name,
      lastName,
      role,
      hourlyRate,
      phone,
      branch,
      notes,
      password
    } = req.body;


    if (
      !name ||
      !lastName ||
      !role ||
      !phone ||
      !branch
    ) {

      return res
        .status(400)
        .json({
          message:
            'Faltan datos del empleado.'
        });
    }


    if (
      role === 'Encargado' &&
      !password
    ) {

      return res
        .status(400)
        .json({
          message:
            'Contraseña requerida para empleados con rol Encargado.'
        });
    }


    const passHash =
      (
        role === 'Encargado' &&
        password
      )
        ? await bcrypt.hash(
            password,
            10
          )
        : '';


    const [result] =
      await pool.execute(
        `INSERT INTO employees
        (
          name,
          last_name,
          role,
          password_hash,
          hourly_rate,
          phone,
          branch,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          lastName,
          role,
          passHash,
          Number(hourlyRate || 0),
          phone,
          branch,
          notes || ''
        ]
      );


    try {

      const insertId =
        (
          result &&
          result.insertId
        )
          ? result.insertId
          : Date.now();


      const emps =
        await readJsonFile(
          'employees.json'
        );


      emps.unshift({

        id: insertId,
        name,
        last_name: lastName,
        role,
        password_hash:
          passHash || '',
        hourly_rate:
          Number(hourlyRate || 0),
        phone,
        branch,
        notes:
          notes || '',
        created_at:
          new Date().toISOString()

      });


      await writeJsonFile(
        'employees.json',
        emps
      );


    } catch (err) {

      console.warn(
        'Could not write employees.json:',
        err.message || err
      );
    }


    res
      .status(201)
      .json({
        ok: true,
        message:
          'Empleado guardado correctamente.'
      });

  }
);


app.put(
  '/api/employees/:id',
  ensureAuth,
  async (req, res) => {

    const {
      name,
      lastName,
      role,
      hourlyRate,
      phone,
      branch,
      notes,
      password
    } = req.body;


    if (
      role === 'Encargado' &&
      password
    ) {

      const passHash =
        await bcrypt.hash(
          password,
          10
        );


      await pool.execute(
        `UPDATE employees
         SET name = ?,
             last_name = ?,
             role = ?,
             password_hash = ?,
             hourly_rate = ?,
             phone = ?,
             branch = ?,
             notes = ?
         WHERE id = ?`,
        [
          name,
          lastName,
          role,
          passHash,
          Number(hourlyRate || 0),
          phone,
          branch,
          notes || '',
          req.params.id
        ]
      );


      try {

        const [rows] =
          await pool.execute(
            `SELECT
              id,
              name,
              last_name,
              role,
              password_hash,
              hourly_rate,
              phone,
              branch,
              notes,
              created_at
             FROM employees
             WHERE id = ?`,
            [req.params.id]
          );


        const row =
          rows && rows[0]
            ? rows[0]
            : null;


        if (row) {

          const emps =
            await readJsonFile(
              'employees.json'
            );


          const idx =
            emps.findIndex(
              (e) =>
                String(e.id) ===
                String(req.params.id)
            );


          const updated = {

            id: row.id,
            name: row.name,
            last_name:
              row.last_name,
            role: row.role,
            password_hash:
              row.password_hash || '',
            hourly_rate:
              Number(
                row.hourly_rate || 0
              ),
            phone: row.phone,
            branch: row.branch,
            notes: row.notes || '',
            created_at:
              row.created_at

          };


          if (idx !== -1) {

            emps[idx] =
              updated;

          } else {

            emps.unshift(
              updated
            );
          }


          await writeJsonFile(
            'employees.json',
            emps
          );
        }


      } catch (err) {

        console.warn(
          'Could not update employees.json:',
          err.message || err
        );
      }


    } else {

      await pool.execute(
        `UPDATE employees
         SET name = ?,
             last_name = ?,
             role = ?,
             hourly_rate = ?,
             phone = ?,
             branch = ?,
             notes = ?
         WHERE id = ?`,
        [
          name,
          lastName,
          role,
          Number(hourlyRate || 0),
          phone,
          branch,
          notes || '',
          req.params.id
        ]
      );


      try {

        const [rows] =
          await pool.execute(
            `SELECT
              id,
              name,
              last_name,
              role,
              password_hash,
              hourly_rate,
              phone,
              branch,
              notes,
              created_at
             FROM employees
             WHERE id = ?`,
            [req.params.id]
          );


        const row =
          rows && rows[0]
            ? rows[0]
            : null;


        if (row) {

          const emps =
            await readJsonFile(
              'employees.json'
            );


          const idx =
            emps.findIndex(
              (e) =>
                String(e.id) ===
                String(req.params.id)
            );


          const updated = {

            id: row.id,
            name: row.name,
            last_name:
              row.last_name,
            role: row.role,
            password_hash:
              row.password_hash || '',
            hourly_rate:
              Number(
                row.hourly_rate || 0
              ),
            phone: row.phone,
            branch: row.branch,
            notes: row.notes || '',
            created_at:
              row.created_at

          };


          if (idx !== -1) {

            emps[idx] =
              updated;

          } else {

            emps.unshift(
              updated
            );
          }


          await writeJsonFile(
            'employees.json',
            emps
          );
        }


      } catch (err) {

        console.warn(
          'Could not update employees.json:',
          err.message || err
        );
      }
    }


    res.json({

      ok: true,

      message:
        'Empleado actualizado correctamente.'

    });

  }
);


app.delete(
  '/api/employees/:id',
  ensureAuth,
  async (req, res) => {

    await pool.execute(
      'DELETE FROM employees WHERE id = ?',
      [req.params.id]
    );


    try {

      const emps =
        await readJsonFile(
          'employees.json'
        );


      const next =
        emps.filter(
          (e) =>
            String(e.id) !==
            String(req.params.id)
        );


      await writeJsonFile(
        'employees.json',
        next
      );


    } catch (err) {

      console.warn(
        'Could not update employees.json after delete:',
        err.message || err
      );
    }


    res.json({

      ok: true,

      message:
        'Empleado eliminado correctamente.'

    });

  }
);


/* =========================================================
   ARCHIVOS
   ========================================================= */

app.get(
  '/api/files',
  ensureAuth,
  async (req, res) => {

    const [rows] =
      await pool.execute(
        `SELECT *
         FROM uploaded_files
         ORDER BY uploaded_at DESC`
      );


    res.json(rows);

  }
);


app.get(
  '/api/files/:id/download',
  ensureAuth,
  async (req, res) => {

    const [rows] =
      await pool.execute(
        'SELECT * FROM uploaded_files WHERE id = ?',
        [req.params.id]
      );


    const file = rows[0];


    if (!file) {

      return res
        .status(404)
        .json({
          message:
            'Archivo no encontrado.'
        });
    }


    const filePath =
      path.join(
        __dirname,
        'uploads',
        file.stored_name
      );


    if (!fs.existsSync(filePath)) {

      return res
        .status(404)
        .json({
          message:
            'Archivo no disponible en el servidor.'
        });
    }


    res.download(
      filePath,
      file.original_name
    );

  }
);


/* =========================================================
   RUTAS FINALES
   ========================================================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_ROOT, 'index.html'));
});

app.get(ADMIN_PUBLIC_PREFIX, (req, res) => {
  return res.redirect(301, 'https://admin.tazjujuy.com/');
});

app.get(`${ADMIN_PUBLIC_PREFIX}/*`, (req, res) => {
  const target = `https://admin.tazjujuy.com${req.path.replace(ADMIN_PUBLIC_PREFIX, '') || '/'}`;
  return res.redirect(301, target);
});

app.get('*', (req, res) => {
  if (req.path === ADMIN_PUBLIC_PREFIX || req.path.startsWith(`${ADMIN_PUBLIC_PREFIX}/`)) {
    return res.redirect(301, `https://admin.tazjujuy.com${req.path.replace(ADMIN_PUBLIC_PREFIX, '') || '/'}`);
  }

  const requested = req.path.replace(/^\/+/, '');
  const candidate = path.join(PUBLIC_ROOT, requested);

  if (requested && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return res.sendFile(candidate);
  }

  res.sendFile(path.join(PUBLIC_ROOT, 'index.html'));
});


/* =========================================================
   SERVIDOR
   ========================================================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en http://0.0.0.0:${PORT}`);
});
