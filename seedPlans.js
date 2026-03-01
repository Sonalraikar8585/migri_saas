require('dotenv').config();
// always target the backend database file when running the script from project root
process.env.DB_FILE = process.env.DB_FILE || './backend/saas.db';
const { db, init } = require('./backend/models/db');

// ensure tables exist before seeding
init();

db.serialize(() => {
  console.log("🌱 Seeding started...");

  // 1️⃣ Insert Plans with usage limits (max projects in this demo)
  db.run(`INSERT OR IGNORE INTO plans (id, name, usage_limit) VALUES (1, 'Free', 3)`);
  db.run(`INSERT OR IGNORE INTO plans (id, name, usage_limit) VALUES (2, 'Pro', 10)`);
  db.run(`INSERT OR IGNORE INTO plans (id, name, usage_limit) VALUES (3, 'Enterprise', 100)`); // high limit for enterprise

  // 2️⃣ Insert Feature(s)
  db.run(`INSERT OR IGNORE INTO features (id, name) VALUES (1, 'CREATE_PROJECT')`);
  db.run(`INSERT OR IGNORE INTO features (id, name) VALUES (2, 'PREMIUM_DASHBOARD')`);

  // 3️⃣ Map Feature to Plans
  // all plans get basic project creation
  db.run(`INSERT OR IGNORE INTO plan_features (plan_id, feature_id) VALUES (1, 1)`);
  db.run(`INSERT OR IGNORE INTO plan_features (plan_id, feature_id) VALUES (2, 1)`);
  db.run(`INSERT OR IGNORE INTO plan_features (plan_id, feature_id) VALUES (3, 1)`);
  // only Pro and Enterprise get the premium dashboard
  db.run(`INSERT OR IGNORE INTO plan_features (plan_id, feature_id) VALUES (2, 2)`);
  db.run(`INSERT OR IGNORE INTO plan_features (plan_id, feature_id) VALUES (3, 2)`);

  console.log("✅ Seeding completed!");
});