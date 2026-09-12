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

app.use(cors());
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
    maxAge: 1000 * 60 * 60 * 8,
    sameSite: 'lax'
  }
}));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
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
      total DECIMAL(12,2) NOT NULL DEFAULT 0,
      notas TEXT,
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
      hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
      phone VARCHAR(50) NOT NULL,
      branch VARCHAR(120) NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [adminRows] = await pool.execute('SELECT * FROM admins WHERE username = ?', ['admin']);

      if (!adminRows.length) {
        const hash = await bcrypt.hash('tazadmin123', 10);
        await pool.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
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

app.get('/api/health', (_, res) => {
  res.json({ ok: true, message: 'TAZ admin API online' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos.' });
  }

  const [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [username]);
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ message: 'Credenciales inválidas.' });
  }

  req.session.user = { id: user.id, username: user.username };
  res.json({ ok: true, user: req.session.user, redirect: '/admin/dashboard.html' });
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
    qr: Number(qr || 0)
  };

  const total = cleanAmounts.efectivo + cleanAmounts.transferencias + cleanAmounts.qr;

  await pool.execute(
    `INSERT INTO records (fecha, sucursal, efectivo, transferencias, qr, total, notas, usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [fecha, sucursal, cleanAmounts.efectivo, cleanAmounts.transferencias, cleanAmounts.qr, total, notas || '', req.session.user.username]
  );

  res.status(201).json({ ok: true, message: 'Registro guardado correctamente.' });
});

app.get('/api/records', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM records ORDER BY fecha DESC, created_at DESC'
  );
  res.json(rows);
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

  await pool.execute(
    'INSERT INTO uploaded_files (original_name, stored_name, mimetype, size, uploaded_by, file_path) VALUES (?, ?, ?, ?, ?, ?)',
    [fileRecord.original_name, fileRecord.stored_name, fileRecord.mimetype, fileRecord.size, fileRecord.uploaded_by, fileRecord.file_path]
  );

  res.status(201).json({ ok: true, file: fileRecord });
});

app.get('/api/employees', ensureAuth, async (req, res) => {
  const [rows] = await pool.execute(
    'SELECT * FROM employees ORDER BY created_at DESC'
  );
  res.json(rows);
});

app.post('/api/employees', ensureAuth, async (req, res) => {
  const { name, lastName, role, hourlyRate, phone, branch, notes } = req.body;

  if (!name || !lastName || !role || !phone || !branch) {
    return res.status(400).json({ message: 'Faltan datos del empleado.' });
  }

  await pool.execute(
    `INSERT INTO employees (name, last_name, role, hourly_rate, phone, branch, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, lastName, role, Number(hourlyRate || 0), phone, branch, notes || '']
  );

  res.status(201).json({ ok: true, message: 'Empleado guardado correctamente.' });
});

app.put('/api/employees/:id', ensureAuth, async (req, res) => {
  const { name, lastName, role, hourlyRate, phone, branch, notes } = req.body;

  await pool.execute(
    `UPDATE employees
     SET name = ?, last_name = ?, role = ?, hourly_rate = ?, phone = ?, branch = ?, notes = ?
     WHERE id = ?`,
    [name, lastName, role, Number(hourlyRate || 0), phone, branch, notes || '', req.params.id]
  );

  res.json({ ok: true, message: 'Empleado actualizado correctamente.' });
});

app.delete('/api/employees/:id', ensureAuth, async (req, res) => {
  await pool.execute('DELETE FROM employees WHERE id = ?', [req.params.id]);
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
