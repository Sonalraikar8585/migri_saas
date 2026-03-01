const { db } = require('./db');

const createPlan = (name, usage_limit, callback) => {
  db.run(
    `INSERT INTO plans (name, usage_limit) VALUES (?, ?)`,
    [name, usage_limit],
    function(err) {
      callback(err, this.lastID);
    }
  );
};

const getAllPlans = (callback) => {
  db.all(`SELECT * FROM plans`, callback);
};

module.exports = { createPlan, getAllPlans };