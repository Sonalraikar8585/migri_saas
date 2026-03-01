const { db } = require('../models/db');

// options can include { usageCountTable: 'projects' } or similar
// if provided the middleware will also enforce the plan's usage_limit by counting rows
const checkEntitlement = (requiredFeature, options = {}) => {
  return (req, res, next) => {
    // admins and superadmins skip entitlement checks entirely
    if (req.user?.role === 'admin' || req.user?.role === 'superadmin') {
      return next();
    }

    const tenant_id = req.user.tenant_id;

    db.get(
      `SELECT s.*, p.usage_limit
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = ? AND s.status = 'active'`,
      [tenant_id],
      (err, subscription) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!subscription) {
          return res.status(403).json({ error: "No active subscription" });
        }

        // Expiry check and auto-update status
        if (subscription.end_date && new Date(subscription.end_date) < new Date()) {
          // mark expired in db for transparency
          db.run(`UPDATE subscriptions SET status='expired' WHERE id = ?`, [subscription.id]);
          return res.status(403).json({ error: "Subscription expired" });
        }

        // Check feature entitlement
        db.get(
          `SELECT pf.*
           FROM plan_features pf
           JOIN features f ON pf.feature_id = f.id
           WHERE pf.plan_id = ? AND f.name = ?`,
          [subscription.plan_id, requiredFeature],
          (err, feature) => {
            if (err) return res.status(500).json({ error: err.message });

            if (!feature) {
              return res.status(403).json({ error: "Feature not allowed in your plan" });
            }

            // attach subscription for downstream handlers
            req.subscription = subscription;

            // if a usage table is provided we must enforce usage_limit
            if (options.usageCountTable) {
              const table = options.usageCountTable;
              // count per-user for consistency with new project structure
              const sql = `SELECT COUNT(*) as total FROM ${table} WHERE user_id = ?`;
              db.get(sql, [req.user.id], (err, countRow) => {
                if (err) return res.status(500).json({ error: err.message });
                if (countRow.total >= subscription.usage_limit) {
                  return res.status(403).json({ error: "Usage limit reached for your plan" });
                }
                next();
              });
            } else {
              next();
            }
          }
        );
      }
    );
  };
};

module.exports = checkEntitlement;