// legacy middleware showing how to enforce an active subscription and a
// generic usage limit.  Most routes in this demo now use the more versatile
// `checkEntitlement` middleware (which can also enforce feature flags).
//
// It is kept here for illustration of a simple centralized subscription
// check, and could be reused for resources that don't require a specific
// feature name.

const { db } = require('../models/db');

const checkSubscription = (req, res, next) => {
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

      if (subscription.end_date && new Date(subscription.end_date) < new Date()) {
        // automatically mark expired so next check is faster
        db.run(`UPDATE subscriptions SET status='expired' WHERE id = ?`, [subscription.id]);
        return res.status(403).json({ error: "Subscription expired" });
      }

      // generic usage enforcement: count rows of example resource
      db.get(
        `SELECT COUNT(*) as total FROM projects WHERE user_id = ?`,
        [req.user.id],
        (err, countRow) => {
          if (err) return res.status(500).json({ error: err.message });
          if (countRow.total >= subscription.usage_limit) {
            return res.status(403).json({ error: "Project limit reached for your plan" });
          }
          next();
        }
      );
    }
  );
};

module.exports = checkSubscription;
