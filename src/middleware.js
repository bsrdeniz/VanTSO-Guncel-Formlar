// Yetkilendirme Middleware'leri

// Kullanıcının giriş yapıp yapmadığını kontrol eder
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Lütfen giriş yapın.' });
}

// Belirli bir role (örn: 'hr') sahip olup olmadığını kontrol eder
function requireRole(role) {
  return (req, res, next) => {
    if (req.session && req.session.role === role) {
      return next();
    }
    return res.status(403).json({ error: 'Bu işlem için yetkiniz bulunmamaktadır.' });
  };
}

module.exports = {
  requireAuth,
  requireRole
};
