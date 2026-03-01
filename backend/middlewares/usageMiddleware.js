const { db } = require('../models/db');

const checkUsage = (featureName) => (req, res, next) => {
  const tenant_id = req.user.tenant_id;
  const sql = `
    SELECT f.id as feature_id, ut.usage_count, p.usage_limit
    FROM features f
    JOIN plan_features pf ON f.id = pf.feature_id
    JOIN subscriptions s ON s.plan_id = pf.plan_id
    JOIN plans p ON p.id = pf.plan_id
    LEFT JOIN usage_tracker ut ON ut.feature_id = f.id AND ut.tenant_id = ?
    WHERE f.name = ? AND s.tenant_id = ? AND s.status='active'
  `;
  db.get(sql, [tenant_id, featureName, tenant_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(403).json({ error: 'Feature not allowed' });
    if ((row.usage_count || 0) >= row.usage_limit) return res.status(429).json({ error: 'Usage limit reached' });

    // increment usage atomically using upsert to avoid race conditions
    db.run(
      `INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
       VALUES (?, ?, 1)
       ON CONFLICT(tenant_id, feature_id) DO UPDATE SET usage_count = usage_count + 1`,
      [tenant_id, row.feature_id],
      (uErr) => {
        if (uErr) return res.status(500).json({ error: uErr.message });
        next();
      }
    );
  });
};

module.exports = { checkUsage };