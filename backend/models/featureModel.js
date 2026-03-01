const { db } = require('./db');

const createFeature = (name, callback) => {
  db.run(`INSERT INTO features (name) VALUES (?)`, [name], function(err) {
    callback(err, this.lastID);
  });
};

const getAllFeatures = (callback) => {
  db.all(`SELECT * FROM features`, callback);
};

const assignFeatureToPlan = (plan_id, feature_id, callback) => {
  db.run(`INSERT INTO plan_features (plan_id, feature_id) VALUES (?, ?)`, [plan_id, feature_id], callback);
};

module.exports = { createFeature, getAllFeatures, assignFeatureToPlan };