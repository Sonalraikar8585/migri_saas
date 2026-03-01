const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findByEmail, findById } = require('../models/userModel');
const { createTenant } = require('../models/tenantModel');
const { db } = require('../models/db');

const register = async (req, res) => {
  const { tenantName, name, email, password } = req.body;

  createTenant(tenantName, (err, tenantId) => {
    if (err) return res.status(500).json({ error: err.message });

    const hashed = bcrypt.hashSync(password, 10);

    // if this is the first user for the tenant we promote them to admin
    // otherwise every subsequent sign–up is a regular 'user'. this mirrors a
    // common "first user becomes org admin" pattern and ensures there is
    // always at least one administrator for a company after the first
    // registration (Porter in your example).
    const assignRole = (cb) => {
      db.get(
        `SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`,
        [tenantId],
        (checkErr, row) => {
          if (checkErr) return cb(checkErr);
          cb(null, row ? 'user' : 'admin');
        }
      );
    };

    assignRole((roleErr, roleToUse) => {
      if (roleErr) return res.status(500).json({ error: roleErr.message });

      createUser(tenantId, name, email, hashed, roleToUse, (err, userId) => {
        if (err) return res.status(500).json({ error: err.message });

        // 🔥 AUTO ASSIGN FREE PLAN (only if tenant does not already have one)
        db.get(`SELECT id FROM plans WHERE name = 'Free'`, [], (err, plan) => {
          if (plan) {
            db.get(
              `SELECT id FROM subscriptions WHERE tenant_id = ? AND status='active' LIMIT 1`,
              [tenantId],
              (err2, existing) => {
                if (err2) {
                  console.warn('subscription lookup error', err2.message);
                  return;
                }
                if (existing) return; // already have an active plan
                const start_date = new Date().toISOString();
                const end_date = new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000
                ).toISOString();
                db.run(
                  `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date)
           VALUES (?, ?, 'active', ?, ?)`,
                  [tenantId, plan.id, start_date, end_date]
                );
              }
            );
          }
        });

        const token = jwt.sign(
          { id: userId, tenant_id: tenantId, role: roleToUse },
          process.env.JWT_SECRET
        );

        res.json({ token, userId, tenantId });
      });
    });
  });
};

const login = (req, res) => {
  const { email, password } = req.body;

  findByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Incorrect password' });

    const token = jwt.sign(
      { id: user.id, tenant_id: user.tenant_id, role: user.role || 'user' },
      process.env.JWT_SECRET
    );

    res.json({ token, userId: user.id, tenantId: user.tenant_id });
  });
};

const getUser = (req, res) => {
  const userId = req.user.id;

  findById(userId, (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
};

// return tenant/organization information for the current user's tenant
// return tenant/organization information for the current user's tenant
// extended to include the active subscription and, when the requester is an
// org admin, the list of users. this is handy for the "payment admin" or
// dashboard pages so the client can always retrieve the full company picture.
const getTenant = (req, res) => {
  const tenantId = req.user.tenant_id;
  if (!tenantId) return res.status(404).json({ error: 'No tenant associated' });
  db.get(`SELECT id, name FROM tenants WHERE id = ?`, [tenantId], (err, tenant) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // fetch active subscription if any
    db.get(
      `SELECT s.*, p.name as plan_name FROM subscriptions s JOIN plans p ON s.plan_id = p.id WHERE s.tenant_id = ? AND s.status='active'`,
      [tenantId],
      (subErr, sub) => {
        if (subErr) {
          console.warn('subscription lookup error', subErr.message);
        }

        const responseObject = { tenant, subscription: sub || null };

        // if the caller is an org admin, include the full user list too
        if (req.user.role === 'admin' || req.user.role === 'superadmin') {
          db.all(
            `SELECT id, name, email, role FROM users WHERE tenant_id = ?`,
            [tenantId],
            (uErr, users) => {
              if (uErr) {
                console.warn('tenant users lookup error', uErr.message);
                return res.json(responseObject);
              }
              responseObject.users = users;
              res.json(responseObject);
            }
          );
        } else {
          res.json(responseObject);
        }
      }
    );
  });
};

module.exports = { register, login, getUser, getTenant };