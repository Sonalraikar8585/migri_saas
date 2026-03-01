const { db } = require('../models/db');

const createProject = (req, res) => {
  const user_id = req.user.id;
  const tenant_id = req.user.tenant_id;
  db.run(
    `INSERT INTO projects (tenant_id, user_id, name) VALUES (?, ?, ?)`,
    [tenant_id, user_id, req.body.name],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ 
        id: this.lastID,
        name: req.body.name,
        message: `Project "${req.body.name}" created successfully!`
      });
    }
  );
};

const getProjects = (req, res) => {
  const user_id = req.user.id;

  db.all(
    `SELECT * FROM projects WHERE user_id = ?`,
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
};

module.exports = { createProject, getProjects };