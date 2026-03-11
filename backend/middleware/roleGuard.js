/**
 * Role-based access control middleware.
 * Usage: router.get('/secret', auth, roleGuard('direktur'), handler)
 *
 * @param  {...string} allowedRoles - One or more roles that may proceed.
 */
const roleGuard = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ error: 'No role information in token' });
  }
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied — insufficient permissions' });
  }
  next();
};

module.exports = roleGuard;
