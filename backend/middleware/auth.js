const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // Salah konfigurasi server: jangan samarkan sebagai token invalid.
      console.error('[auth] JWT_SECRET tidak diset — semua permintaan ditolak');
      return res.status(500).json({ error: 'Server auth tidak terkonfigurasi' });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    return next();
  } catch (err) {
    // v1.67.24: token kadaluarsa/invalid adalah kejadian normal (sesi 4 jam) —
    // jangan dibanjiri ke error log; hanya error tak terduga yang dicatat.
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('[auth] verifikasi token gagal tak terduga:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = auth;
