const { db } = require('./db');

// Attempts to create a tenant or return the existing one with the same
// name. This ensures that users who register with the same company/company
// name are grouped together rather than creating duplicate tenants.
const createTenant = (name, callback) => {
  if (!name || !name.trim()) return callback(new Error('tenant name required'));
  const clean = name.trim();
  // look for an existing tenant first (NOCASE collation ensures case-insensitive)
  db.get(`SELECT id FROM tenants WHERE name = ?`, [clean], (err, row) => {
    if (err) return callback(err);
    if (row) return callback(null, row.id);
    // none found, insert a new one
    const stmt = `INSERT INTO tenants (name) VALUES (?)`;
    db.run(stmt, [clean], function(err) {
      if (err) return callback(err);
      callback(null, this.lastID);
    });
  });
};

module.exports = { createTenant };