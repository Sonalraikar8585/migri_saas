const { createPlan, getAllPlans } = require('../models/planModel');
const { createFeature, getAllFeatures, assignFeatureToPlan } = require('../models/featureModel');
const { db } = require('../models/db');

// plan operations (could be protected behind an admin flag)
const addPlan = (req, res) => {
  const { name, usage_limit } = req.body;
  if (!name || usage_limit == null) {
    return res.status(400).json({ error: 'name and usage_limit are required' });
  }
  createPlan(name, usage_limit, (err, id) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name, usage_limit });
  });
};

const listPlans = (req, res) => {
  // join features to each plan for clarity
  db.all(
    `SELECT p.*, GROUP_CONCAT(f.name) as features
     FROM plans p
     LEFT JOIN plan_features pf ON p.id = pf.plan_id
     LEFT JOIN features f ON pf.feature_id = f.id
     GROUP BY p.id`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // convert comma separated features into array
      rows = rows.map(r => ({
        ...r,
        features: r.features ? r.features.split(',') : []
      }));
      res.json(rows);
    }
  );
};

// feature operations
const addFeature = (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'feature name required' });
  createFeature(name, (err, id) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, name });
  });
};

const listFeatures = (req, res) => {
  getAllFeatures((err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

const mapFeatureToPlan = (req, res) => {
  // planId may be supplied as URL param or body
  const plan_id = req.params.planId || req.body.plan_id;
  const feature_id = req.body.feature_id;
  if (!plan_id || !feature_id) {
    return res.status(400).json({ error: 'plan_id and feature_id required' });
  }
  assignFeatureToPlan(plan_id, feature_id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'feature assigned to plan' });
  });
};

module.exports = {
  addPlan,
  listPlans,
  addFeature,
  listFeatures,
  mapFeatureToPlan,
};
