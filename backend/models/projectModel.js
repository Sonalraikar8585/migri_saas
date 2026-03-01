const { db } = require('./db');

const createProject = (tenant_id, name, callback) => {
  db.run(`INSERT INTO projects (tenant_id, name) VALUES (?, ?)`, [tenant_id, name], function(err) {
    callback(err, this.lastID);
  });
};

const getProjectsByTenant = (tenant_id, callback) => {
  db.all(`SELECT * FROM projects WHERE tenant_id = ?`, [tenant_id], callback);
};

module.exports = { createProject, getProjectsByTenant };