/**
 * app.js — Express app setup (no listener). Used by server.js and tests.
 */
const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Environment Loading ───
let envFile = '.env';
if (process.env.NODE_ENV !== 'production') {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    if (currentBranch === 'dev' && fs.existsSync(path.join(__dirname, '.env.dev'))) envFile = '.env.dev';
  } catch (e) { /* fallback */ }
}
if (fs.existsSync(path.join(__dirname, envFile))) {
  require('dotenv').config({ path: path.join(__dirname, envFile) });
  console.log(`[Env] Loaded from ${envFile} → DB: ${process.env.DB_NAME || 'DATABASE_URL used'}`);
} else {
  console.log('[Env] No .env file found, using system environment variables');
}

const app = express();

// ─── CORS ───
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://habil-dashboard.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean));
const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      allowedOrigins.add(`http://${net.address}:3000`);
    }
  }
}
const originsArray = [...allowedOrigins];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || originsArray.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(cors(corsOptions));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: (req) => {
    const path = req.originalUrl.split('?')[0];
    return req.method === 'POST' && path === '/api/auth/login';
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend running', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/distributors', require('./routes/distributors'));
app.use('/api/products', require('./routes/products'));
app.use('/api/bugs', require('./routes/bugs'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/online-store', require('./routes/onlineStore'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/ledger', require('./routes/ledger'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/print-settings', require('./routes/printSettings'));

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
