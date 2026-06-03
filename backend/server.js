/**
 * server.js — Entry point. Imports app.js and starts listener.
 */
const app = require('./app');
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server, { cors: {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowed = ['http://localhost:3000', 'https://habil-dashboard.vercel.app', process.env.FRONTEND_URL].filter(Boolean);
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
}});

global.io = io;

io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] User connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] User disconnected: ${socket.id}`);
  });
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
