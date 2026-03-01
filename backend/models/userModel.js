const { db } = require('./db');

const createUser = (tenant_id, name, email, password, role = 'user', callback) => {
  const stmt = `INSERT INTO users (tenant_id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`;
  db.run(stmt, [tenant_id, name, email, password, role], function(err) {
    callback(err, this.lastID);
  });
};

const findByEmail = (email, callback) => {
  db.get(`SELECT * FROM users WHERE email = ?`, [email], callback);
};

const findById = (id, callback) => {
  db.get(`SELECT id, name, email, tenant_id, role FROM users WHERE id = ?`, [id], callback);
};

// list all users for a given tenant
const getUsersByTenant = (tenant_id, callback) => {
  db.all(
    `SELECT id, name, email, role FROM users WHERE tenant_id = ?`,
    [tenant_id],
    callback
  );
};

// update role (or name/email if needed) for a user within the same tenant
const updateUserRole = (userId, role, callback) => {
  db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, userId], function(err) {
    callback(err);
  });
};

// delete a user by id
const deleteUserById = (userId, callback) => {
  db.run(`DELETE FROM users WHERE id = ?`, [userId], function(err) {
    callback(err);
  });
};

module.exports = { createUser, findByEmail, findById, getUsersByTenant, updateUserRole, deleteUserById };