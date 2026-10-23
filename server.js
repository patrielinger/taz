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
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'taz-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax'
  }
}));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Directory for JSON storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

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
  try {
    const existing = await fs.promises.readFile(p, 'utf8').catch(() => null);
    if (existing === txt) return;
    await fs.promises.writeFile(p, txt, 'utf8');
  } catch (err) {
    // bubble up for caller to log if needed
    throw err;
  }
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }
});

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
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

      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
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
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'password_hash'`,
      [dbConfig.database]
    );
    if (!colRows || !colRows[0] || Number(colRows[0].cnt) === 0) {
      await pool.execute(`ALTER TABLE employees ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''`);
    }
  } catch (err) {
    // If this fails, log and continue; insertion will surface a clearer error
    console.warn('Could not ensure password_hash column exists:', err.message || err);
  }

  // Ensure records table has pedidos_ya and stock columns for older DBs
  try {
    const [pedRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'records' AND COLUMN_NAME = 'pedidos_ya'`,
      [dbConfig.database]
    );
    if (!pedRows || !pedRows[0] || Number(pedRows[0].cnt) === 0) {
      await pool.execute(`ALTER TABLE records ADD COLUMN pedidos_ya DECIMAL(12,2) NOT NULL DEFAULT 0`);
    }

    const [stockRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'records' AND COLUMN_NAME = 'stock'`,
      [dbConfig.database]
    );
    if (!stockRows || !stockRows[0] || Number(stockRows[0].cnt) === 0) {
      await pool.execute(`ALTER TABLE records ADD COLUMN stock TEXT`);
    }
  } catch (err) {
    console.warn('Could not ensure records columns exist:', err.message || err);
  }

  const [adminRows] = await pool.execute('SELECT * FROM admins WHERE username = ?', ['admin']);

      if (!adminRows.length) {
        const hash = await bcrypt.hash('tazadmin123', 10);
        const [resAdmin] = await pool.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
        // persist admin to JSON
        try {
          const adminsJson = await readJsonFile('admins.json');
          adminsJson.push({ id: resAdmin.insertId || Date.now(), username: 'admin', created_at: new Date().toISOString() });
          await writeJsonFile('admins.json', adminsJson);
        } catch (err) {
          console.warn('Could not write admins.json:', err.message || err);
        }
      }

      // Sync employees table to JSON (include password_hash as requested)
      try {
        const [empRows] = await pool.execute(`SELECT id, name, last_name, role, password_hash, hourly_rate, phone, branch, notes, created_at FROM employees ORDER BY created_at DESC`);
        const empsToWrite = (empRows || []).map((r) => ({
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
        await writeJsonFile('employees.json', empsToWrite);
      } catch (err) {
        console.warn('Could not sync employees to JSON:', err.message || err);
      }

      return pool;
    } catch (error) {
      lastError = error;
      if (attempt === 20) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  throw lastError;
}

let pool;
(async () => {
  pool = await initDatabase();
  console.log('MySQL ready.');
})();

function ensureAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ message: 'No autorizado' });
  }
  next();
}

function ensureAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'Admin') {
    return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
  }
  next();
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, message: 'TAZ admin API online' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos.' });
  }

  try {
    if (!pool) return res.status(500).json({ message: 'Base de datos no inicializada.' });

    const [adminRows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [username]);
    const adminUser = adminRows[0];

    if (adminUser) {
      const validAdmin = await bcrypt.compare(password, adminUser.password_hash || '');
      if (!validAdmin) {
        return res.status(401).json({ message: 'Credenciales inválidas.' });
      }

      req.session.user = { id: adminUser.id, username: adminUser.username, role: 'Admin', name: 'Administrador', lastName: '' };
      return res.json({ ok: true, user: req.session.user, redirect: '/admin/employee-dashboard.html' });
    }

    const [empRows] = await pool.execute('SELECT * FROM employees WHERE phone = ? AND role = ?', [username, 'Encargado']);
    const emp = empRows[0];

    if (!emp) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
    }

    const validEmp = await bcrypt.compare(password, emp.password_hash || '');
    if (!validEmp) {
      return res.status(401).json({ message: 'Credenciales inválidas.' });
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

    return res.json({ ok: true, user: req.session.user, redirect: '/admin/encargado.html' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Error interno en autenticación.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/session', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.user), user: req.session?.user || null });
});

app.post('/api/records', ensureAuth, async (req, res) => {
  const { fecha, sucursal, efectivo, transferencias, qr, notas } = req.body;

  if (!fecha || !sucursal) {
    return res.status(400).json({ message: 'Falta fecha o sucursal.' });
  }

  const cleanAmounts = {
    efectivo: Number(efectivo || 0),
    transferencias: Number(transferencias || 0),
    qr: Number(qr || 0),
    pedidosYa: Number(req.body.pedidosYa || req.body.pedidos_ya || 0),
    stock: req.body.stock || ''
  };

  const total = cleanAmounts.efectivo + cleanAmounts.transferencias + cleanAmounts.qr + cleanAmounts.pedidosYa;
  const fullName = [req.session.user?.name, req.session.user?.lastName].filter(Boolean).join(' ').trim();
  const usuario = fullName || req.session.user?.username || 'Sin usuario';
  const now = new Date();
  const hora = now.toLocaleTimeString('es-AR', { hour12: false });

  const [result] = await pool.execute(
    `INSERT INTO records (fecha, sucursal, efectivo, transferencias, qr, pedidos_ya, total, notas, stock, usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fecha, sucursal, cleanAmounts.efectivo, cleanAmounts.transferencias, cleanAmounts.qr, cleanAmounts.pedidosYa, total, notas || '', cleanAmounts.stock, usuario]
  );

  try {
    const insertId = (result && result.insertId) ? result.insertId : Date.now();
    const recordsJson = await readJsonFile('records.json');
    recordsJson.unshift({
      id: insertId,
      fecha,
      hora,
      usuario,
      sucursal,
      efectivo: cleanAmounts.efectivo,
      transferencias: cleanAmounts.transferencias,
      qr: cleanAmounts.qr,
      pedidosYa: cleanAmounts.pedidosYa,
      notas: notas || '',
      stock: cleanAmounts.stock || '',
      total,
      created_at: now.toISOString()
    });
    await writeJsonFile('records.json', recordsJson);
  } catch (err) {
    console.warn('Could not write records.json:', err.message || err);
  }

  res.status(201).json({ ok: true, message: 'Registro guardado correctamente.' });
});

app.get('/api/records', ensureAuth, async (req, res) => {
  const records = await readJsonFile('records.json');
  res.json(records);
});

app.get('/api/records/json', ensureAuth, async (req, res) => {
  const records = await readJsonFile('records.json');
  res.json(records);
});

app.put('/api/records/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const { fecha, sucursal, efectivo, transferencias, qr, pedidosYa, notas, stock } = req.body;

  await pool.execute(
    `UPDATE records SET fecha = ?, sucursal = ?, efectivo = ?, transferencias = ?, qr = ?, pedidos_ya = ?, total = ?, notas = ?, stock = ? WHERE id = ?`,
    [fecha, sucursal, Number(efectivo || 0), Number(transferencias || 0), Number(qr || 0), Number(pedidosYa || 0), Number((Number(efectivo || 0) + Number(transferencias || 0) + Number(qr || 0) + Number(pedidosYa || 0))).toFixed(2), notas || '', stock || '', id]
  );

  // update JSON copy
  try {
    const recs = await readJsonFile('records.json');
    const idx = recs.findIndex((r) => String(r.id) === String(id));
    const total = Number(efectivo || 0) + Number(transferencias || 0) + Number(qr || 0) + Number(pedidosYa || 0);
    if (idx !== -1) {
      recs[idx] = { ...recs[idx], fecha, sucursal, efectivo: Number(efectivo || 0), transferencias: Number(transferencias || 0), qr: Number(qr || 0), pedidosYa: Number(pedidosYa || 0), total, notas: notas || '', stock: stock || '' };
      await writeJsonFile('records.json', recs);
    }
  } catch (err) {
    console.warn('Could not update records.json:', err.message || err);
  }

  res.json({ ok: true, message: 'Registro actualizado correctamente.' });
});

app.delete('/api/records/:id', ensureAuth, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  await pool.execute('DELETE FROM records WHERE id = ?', [id]);
  try {
    const recs = await readJsonFile('records.json');
    const next = recs.filter((r) => String(r.id) !== String(id));
    await writeJsonFile('records.json', next);
  } catch (err) {
    console.warn('Could not update records.json after delete:', err.message || err);
  }
  res.json({ ok: true, message: 'Registro eliminado correctamente.' });
});

app.get('/api/records/summary', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT sucursal,
      SUM(efectivo) AS efectivo,
      SUM(transferencias) AS transferencias,
      SUM(qr) AS qr,
      SUM(total) AS total
     FROM records
     WHERE fecha = CURDATE()
     GROUP BY sucursal`
  );

  res.json(rows);
});

app.get('/api/records/month', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, SUM(total) AS total
     FROM records
     WHERE fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
     GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d')
     ORDER BY fecha ASC`
  );

  res.json(rows);
});

app.post('/api/upload', ensureAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Debe adjuntar un archivo.' });
  }

  const fileRecord = {
    original_name: req.file.originalname,
    stored_name: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    uploaded_by: req.session.user.username,
    file_path: `/uploads/${req.file.filename}`
  };

  const [result] = await pool.execute(
    'INSERT INTO uploaded_files (original_name, stored_name, mimetype, size, uploaded_by, file_path) VALUES (?, ?, ?, ?, ?, ?)',
    [fileRecord.original_name, fileRecord.stored_name, fileRecord.mimetype, fileRecord.size, fileRecord.uploaded_by, fileRecord.file_path]
  );

  try {
    const insertId = (result && result.insertId) ? result.insertId : Date.now();
    const filesJson = await readJsonFile('uploaded_files.json');
    filesJson.unshift({ id: insertId, ...fileRecord, uploaded_at: new Date().toISOString() });
    await writeJsonFile('uploaded_files.json', filesJson);
  } catch (err) {
    console.warn('Could not write uploaded_files.json:', err.message || err);
  }

  res.status(201).json({ ok: true, file: fileRecord });
});

app.get('/api/employees', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT id, name, last_name, role, hourly_rate, phone, branch, notes, created_at FROM employees ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/employees', ensureAuth, async (req, res) => {
  const { name, lastName, role, hourlyRate, phone, branch, notes, password } = req.body;

  if (!name || !lastName || !role || !phone || !branch) {
    return res.status(400).json({ message: 'Faltan datos del empleado.' });
  }

  // For encargados, require a password on creation
  if (role === 'Encargado' && !password) {
    return res.status(400).json({ message: 'Contraseña requerida para empleados con rol Encargado.' });
  }

  const passHash = (role === 'Encargado' && password) ? await bcrypt.hash(password, 10) : '';

  const [result] = await pool.execute(
    `INSERT INTO employees (name, last_name, role, password_hash, hourly_rate, phone, branch, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, lastName, role, passHash, Number(hourlyRate || 0), phone, branch, notes || '']
  );

  // persist to JSON
  try {
    const insertId = (result && result.insertId) ? result.insertId : Date.now();
    const emps = await readJsonFile('employees.json');
    emps.unshift({ id: insertId, name, last_name: lastName, role, password_hash: passHash || '', hourly_rate: Number(hourlyRate || 0), phone, branch, notes: notes || '', created_at: new Date().toISOString() });
    await writeJsonFile('employees.json', emps);
  } catch (err) {
    console.warn('Could not write employees.json:', err.message || err);
  }

  res.status(201).json({ ok: true, message: 'Empleado guardado correctamente.' });
});

app.put('/api/employees/:id', ensureAuth, async (req, res) => {
  const { name, lastName, role, hourlyRate, phone, branch, notes, password } = req.body;

  if (role === 'Encargado' && password) {
    const passHash = await bcrypt.hash(password, 10);
    await pool.execute(
      `UPDATE employees
       SET name = ?, last_name = ?, role = ?, password_hash = ?, hourly_rate = ?, phone = ?, branch = ?, notes = ?
       WHERE id = ?`,
      [name, lastName, role, passHash, Number(hourlyRate || 0), phone, branch, notes || '', req.params.id]
    );
    // update JSON: fetch the latest row (including password_hash) and replace
    try {
      const [rows] = await pool.execute('SELECT id, name, last_name, role, password_hash, hourly_rate, phone, branch, notes, created_at FROM employees WHERE id = ?', [req.params.id]);
      const row = rows && rows[0] ? rows[0] : null;
      if (row) {
        const emps = await readJsonFile('employees.json');
        const idx = emps.findIndex((e) => String(e.id) === String(req.params.id));
        const updated = { id: row.id, name: row.name, last_name: row.last_name, role: row.role, password_hash: row.password_hash || '', hourly_rate: Number(row.hourly_rate || 0), phone: row.phone, branch: row.branch, notes: row.notes || '', created_at: row.created_at };
        if (idx !== -1) {
          emps[idx] = updated;
        } else {
          emps.unshift(updated);
        }
        await writeJsonFile('employees.json', emps);
      }
    } catch (err) {
      console.warn('Could not update employees.json:', err.message || err);
    }
  } else {
    await pool.execute(
      `UPDATE employees
       SET name = ?, last_name = ?, role = ?, hourly_rate = ?, phone = ?, branch = ?, notes = ?
       WHERE id = ?`,
      [name, lastName, role, Number(hourlyRate || 0), phone, branch, notes || '', req.params.id]
    );
    // update JSON: fetch the latest row and sync
    try {
      const [rows] = await pool.execute('SELECT id, name, last_name, role, password_hash, hourly_rate, phone, branch, notes, created_at FROM employees WHERE id = ?', [req.params.id]);
      const row = rows && rows[0] ? rows[0] : null;
      if (row) {
        const emps = await readJsonFile('employees.json');
        const idx = emps.findIndex((e) => String(e.id) === String(req.params.id));
        const updated = { id: row.id, name: row.name, last_name: row.last_name, role: row.role, password_hash: row.password_hash || '', hourly_rate: Number(row.hourly_rate || 0), phone: row.phone, branch: row.branch, notes: row.notes || '', created_at: row.created_at };
        if (idx !== -1) {
          emps[idx] = updated;
        } else {
          emps.unshift(updated);
        }
        await writeJsonFile('employees.json', emps);
      }
    } catch (err) {
      console.warn('Could not update employees.json:', err.message || err);
    }
  }

  res.json({ ok: true, message: 'Empleado actualizado correctamente.' });
});

app.delete('/api/employees/:id', ensureAuth, async (req, res) => {
  await pool.execute('DELETE FROM employees WHERE id = ?', [req.params.id]);
  try {
    const emps = await readJsonFile('employees.json');
    const next = emps.filter((e) => String(e.id) !== String(req.params.id));
    await writeJsonFile('employees.json', next);
  } catch (err) {
    console.warn('Could not update employees.json after delete:', err.message || err);
  }
  res.json({ ok: true, message: 'Empleado eliminado correctamente.' });
});

app.get('/api/files', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM uploaded_files ORDER BY uploaded_at DESC'
  );
  res.json(rows);
});

app.get('/api/files/:id/download', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM uploaded_files WHERE id = ?', [req.params.id]);
  const file = rows[0];

  if (!file) {
    return res.status(404).json({ message: 'Archivo no encontrado.' });
  }

  const filePath = path.join(__dirname, 'uploads', file.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no disponible en el servidor.' });
  }

  res.download(filePath, file.original_name);
});

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', req.path.replace(/^\/admin\//, '')) || path.join(__dirname, 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, 'admin', 'index.html'));
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
