const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const os = require('os');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Environment Loading ──────────────────────────────────────────────
let envFile = '.env';
if (process.env.NODE_ENV !== 'production') {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    if (currentBranch === 'dev' && fs.existsSync(path.join(__dirname, '.env.dev'))) {
      envFile = '.env.dev';
    }
  } catch (e) { /* Fallback to default .env if git not available */ }
}

if (fs.existsSync(path.join(__dirname, envFile))) {
  require('dotenv').config({ path: path.join(__dirname, envFile) });
  console.log(`[Env] Loaded from ${envFile} → DB: ${process.env.DB_NAME || 'DATABASE_URL used'}`);
} else {
  console.log('[Env] No .env file found, using system environment variables');
}

// Build allowed origins: localhost + all local network IPs + Production URL
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://habil-dashboard.vercel.app', // Explicitly allow production frontend
  process.env.FRONTEND_URL,
].filter(Boolean));
// Auto-detect local network IPs and add them
const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      allowedOrigins.add(`http://${net.address}:3000`);
    }
  }
}
const originsArray = [...allowedOrigins];
console.log('Allowed CORS origins:', originsArray);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (curl, mobile apps, etc.)
    if (!origin || originsArray.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: corsOptions });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors(corsOptions));

app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend running', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Routes
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

io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);
  });
});

global.io = io;

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => { console.log('Server closed'); process.exit(0); });
});
