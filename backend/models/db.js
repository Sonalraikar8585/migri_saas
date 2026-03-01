const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(process.env.DB_FILE || './saas.db');

const init = () => {
  db.serialize(() => {
    // tenant names should be unique (case‑insensitive) so that multiple users
    // signing up with the same company name map to a single record. the
    // UNIQUE constraint with NOCASE collation avoids duplicate entries.
    db.run(`CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE COLLATE NOCASE
    )`);
    // in case the table already existed without the UNIQUE constraint we still
    // want to ensure duplicates aren't allowed going forward
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name COLLATE NOCASE)`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'user',
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    )`);
    // migration: add role column for older databases
    db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
      if (err && !/duplicate column/.test(err.message)) {
        console.warn('could not add role column to users', err.message);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      usage_limit INTEGER
    )`);
    // migration: if column missing (older DB) attempt to add
    db.run(`ALTER TABLE plans ADD COLUMN usage_limit INTEGER`, (err) => {
      if (err && !/duplicate column/.test(err.message)) {
        console.warn('could not add usage_limit column to plans', err.message);
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS plan_features (
      plan_id INTEGER,
      feature_id INTEGER,
      PRIMARY KEY(plan_id, feature_id),
      FOREIGN KEY (plan_id) REFERENCES plans(id),
      FOREIGN KEY (feature_id) REFERENCES features(id)
    )`);

    // index for faster lookups when checking entitlements
    db.run(`CREATE INDEX IF NOT EXISTS idx_plan_features_plan ON plan_features(plan_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_plan_features_feature ON plan_features(feature_id)`);

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      plan_id INTEGER,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )`);

    // history keeps every change so you can audit or report
    db.run(`CREATE TABLE IF NOT EXISTS subscription_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      plan_id INTEGER,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (plan_id) REFERENCES plans(id)
    )`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan_id)`);

    // track how many times a tenant has consumed a feature or resource
    db.run(`CREATE TABLE IF NOT EXISTS usage_tracker (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      feature_id INTEGER,
      usage_count INTEGER DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (feature_id) REFERENCES features(id),
      UNIQUE(tenant_id, feature_id) -- enforce at most one row per tenant/feature
    )`);

    // index to help the ON CONFLICT update and lookups
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_tenant_feature ON usage_tracker(tenant_id, feature_id)`);

    db.run(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      user_id INTEGER,
      name TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);
    // migration: add user_id column for older databases
    db.run(`ALTER TABLE projects ADD COLUMN user_id INTEGER`, (err) => {
      if (err && !/duplicate column/.test(err.message)) {
        console.warn('could not add user_id column to projects', err.message);
      }
    });

    console.log('SQLite DB initialized');
  });
};

module.exports = { db, init };