const { db } = require('./db');

const getUsage = (tenant_id, feature_id, callback) => {
  db.get(`SELECT * FROM usage_tracker WHERE tenant_id = ? AND feature_id = ?`, [tenant_id, feature_id], callback);
};

const incrementUsage = (tenant_id, feature_id, callback) => {
  // atomic upsert to avoid race conditions
  db.run(
    `INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
     VALUES (?, ?, 1)
     ON CONFLICT(tenant_id, feature_id) DO UPDATE SET usage_count = usage_count + 1`,
    [tenant_id, feature_id],
    callback
  );
};

module.exports = { getUsage, incrementUsage };