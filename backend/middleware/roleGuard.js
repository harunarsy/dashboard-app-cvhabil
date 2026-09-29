/**
 * Role-based access control middleware.
 * Usage: router.get('/secret', auth, roleGuard('direktur'), handler)
 *
 * @param  {...string} allowedRoles - One or more roles that may proceed.
 */
const roleGuard = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ error: 'Akun tidak punya informasi peran (role). Silakan login ulang.' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Akun Anda tidak punya izin untuk tindakan ini.' });
  }
  next();
};

module.exports = roleGuard;
