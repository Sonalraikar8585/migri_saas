const { db } = require('./db');

const createSubscription = (tenant_id, plan_id, status, start_date, end_date, callback) => {
  db.run(
    `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date) VALUES (?, ?, ?, ?, ?)`,
    [tenant_id, plan_id, status, start_date, end_date],
    function(err) {
      callback(err, this.lastID);
    }
  );
};

const getSubscriptionByTenant = (tenant_id, callback) => {
  db.get(`SELECT * FROM subscriptions WHERE tenant_id = ?`, [tenant_id], callback);
};

module.exports = { createSubscription, getSubscriptionByTenant };