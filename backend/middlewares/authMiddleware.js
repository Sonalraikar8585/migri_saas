const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // payload now contains id, tenant_id and possibly role
    req.user = decoded; // e.g. {id, tenant_id, role}
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = auth;