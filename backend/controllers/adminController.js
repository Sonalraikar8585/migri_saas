const bcrypt = require('bcryptjs');
const { createUser, getUsersByTenant, updateUserRole, deleteUserById, findByEmail } = require('../models/userModel');
const { db } = require('../models/db');

// list users; tenant admins see their own, superadmins see everyone
const listUsers = (req, res) => {
  if (req.user.role === 'superadmin') {
    // return all users with tenant info plus the tenant's admin email and current subscription status
    db.all(
      `SELECT u.id, u.name, u.email, u.role,
              t.name as tenant,
              (SELECT email FROM users WHERE tenant_id = u.tenant_id AND role = 'admin' LIMIT 1) as tenant_admin_email,
              (SELECT status FROM subscriptions WHERE tenant_id = u.tenant_id AND status = 'active' LIMIT 1) as tenant_sub_status
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  } else {
    const tenantId = req.user.tenant_id;
    getUsersByTenant(tenantId, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
};

// create a new user within the current tenant (superadmin may specify tenant_id)
const addUser = (req, res) => {
  const { name, email, password, role = 'user', tenant_id } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }

  // determine tenant scope; superadmin may explicitly specify a tenant_id
  let tenantId = req.user.tenant_id;
  if (req.user.role === 'superadmin') {
    // treat empty string or missing as null (platform-level account)
    tenantId = tenant_id ? tenant_id : null;
  }

  // check if email already exists globally
  findByEmail(email, (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hashed = bcrypt.hashSync(password, 10);
    createUser(tenantId, name, email, hashed, role, (err, userId) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: userId, name, email, role, tenant_id: tenantId });
    });
  });
};

// modify user's role (superadmin may modify any user)
const modifyUser = (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'role is required' });

  // optionally check tenant matches if not superadmin
  if (req.user.role !== 'superadmin') {
    // ensure the user to modify belongs to the same tenant
    db.get(`SELECT tenant_id FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row || row.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'Cannot modify user from another tenant' });
      }
      updateUserRole(id, role, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'role updated' });
      });
    });
  } else {
    updateUserRole(id, role, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'role updated' });
    });
  }
};

// delete user (superadmin may delete any)
const removeUser = (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'superadmin') {
    // ensure same tenant
    db.get(`SELECT tenant_id FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row || row.tenant_id !== req.user.tenant_id) {
        return res.status(403).json({ error: 'Cannot delete user from another tenant' });
      }
      deleteUserById(id, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'user deleted' });
      });
    });
  } else {
    deleteUserById(id, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'user deleted' });
    });
  }
};

// list all tenants with current subscription info
const listTenants = (req, res) => {
  db.all(
    `SELECT t.id, t.name,
            s.plan_id, p.name as plan_name, s.status, s.end_date
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id AND s.status = 'active'
     LEFT JOIN plans p ON p.id = s.plan_id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
};

// get a specific tenant's detail (users + subscription)
const getTenantDetails = (req, res) => {
  const { id } = req.params;
  db.get(`SELECT id, name FROM tenants WHERE id = ?`, [id], (err, tenant) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    db.all(`SELECT id, name, email, role FROM users WHERE tenant_id = ?`, [id], (uErr, users) => {
      if (uErr) return res.status(500).json({ error: uErr.message });
      db.get(
        `SELECT s.*, p.name as plan_name FROM subscriptions s JOIN plans p ON s.plan_id=p.id WHERE s.tenant_id = ? AND s.status='active'`,
        [id],
        (sErr, sub) => {
          if (sErr) return res.status(500).json({ error: sErr.message });
          res.json({ tenant, users, subscription: sub });
        }
      );
    });
  });
};

module.exports = { listUsers, addUser, modifyUser, removeUser, listTenants, getTenantDetails };