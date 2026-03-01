const { db } = require('../models/db');

// Subscribe or upgrade plan
const subscribe = (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { plan_id } = req.body;

  const start_date = new Date().toISOString();
  const end_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

  // if an existing subscription exists, push it to history before replacing
  db.get(`SELECT * FROM subscriptions WHERE tenant_id = ?`, [tenant_id], (err, old) => {
    if (err) return res.status(500).json({ error: err.message });

    const insertNew = () => {
      db.run(
        `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
        [tenant_id, plan_id, 'active', start_date, end_date],
        function(err) {
          if (err) return res.status(500).json({ error: err.message });

          res.json({
            message: "Subscription successful",
            subscription_id: this.lastID,
            expires_on: end_date
          });
        }
      );
    };

    if (old) {
      // copy old to history table
      db.run(
        `INSERT INTO subscription_history (tenant_id, plan_id, status, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
        [old.tenant_id, old.plan_id, old.status, old.start_date, old.end_date],
        (hErr) => {
          if (hErr) console.warn('history insert failed', hErr.message);
          // remove old subscription (keeping only latest active record)
          db.run(`DELETE FROM subscriptions WHERE tenant_id = ?`, [tenant_id], (dErr) => {
            if (dErr) return res.status(500).json({ error: dErr.message });
            insertNew();
          });
        }
      );
    } else {
      insertNew();
    }
  });
};

// Get current subscription
const getSubscription = (req, res) => {
  const tenant_id = req.user.tenant_id;

  // fetch subscription plus plan metadata and features
  db.get(
    `SELECT s.*, p.name as plan_name, p.usage_limit
     FROM subscriptions s
     JOIN plans p ON s.plan_id = p.id
     WHERE s.tenant_id = ?`,
    [tenant_id],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.json({ message: "No active subscription" });

      // mark expired if necessary (read-only endpoint)
      if (row.end_date && new Date(row.end_date) < new Date() && row.status !== 'expired') {
        db.run(`UPDATE subscriptions SET status='expired' WHERE id = ?`, [row.id]);
        row.status = 'expired';
      }

      // fetch features for the plan
      db.all(
        `SELECT f.name FROM features f
         JOIN plan_features pf ON f.id = pf.feature_id
         WHERE pf.plan_id = ?`,
        [row.plan_id],
        (fErr, features) => {
          if (fErr) return res.status(500).json({ error: fErr.message });
          row.features = features.map(f => f.name);
          res.json(row);
        }
      );
    }
  );
};

// return history of changes for current tenant
const getSubscriptionHistory = (req, res) => {
  const tenant_id = req.user.tenant_id;
  db.all(
    `SELECT h.*, p.name as plan_name
     FROM subscription_history h
     JOIN plans p ON h.plan_id = p.id
     WHERE h.tenant_id = ?
     ORDER BY h.changed_at DESC`,
    [tenant_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
};

module.exports = { subscribe, getSubscription, getSubscriptionHistory };
