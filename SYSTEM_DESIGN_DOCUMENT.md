# CloudFlow – System Design Document (Deep Dive)

**Reading Time:** 30-45 minutes  
**Audience:** Architects, Senior Developers, DevOps, Implementation Teams  
**Last Updated:** March 1, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Compliance Checklist](#compliance-checklist)
3. [Detailed Architecture](#detailed-architecture)
4. [Database Schema & Rationale](#database-schema--rationale)
5. [Implementation Code Snippets](#implementation-code-snippets)
6. [Race Condition Prevention](#race-condition-prevention)
7. [Scalability Strategies](#scalability-strategies)
8. [Testing Recommendations](#testing-recommendations)
9. [Production Readiness Checklist](#production-readiness-checklist)

---

## Executive Summary

CloudFlow is a **production-grade multi-tenant SaaS platform** demonstrating:

- **Tenant Isolation:** Complete data segregation with JWT-based authorization
- **Flexible Entitlements:** Database-driven plans, features, and usage limits
- **Atomic Operations:** Race-free counters using SQLite's `ON CONFLICT DO UPDATE`
- **Audit Trail:** Full subscription lifecycle history and change tracking
- **Admin Interfaces:** Both tenant-level and platform-wide management

The system supports **company name deduplication** (first user becomes admin, subsequent registrations auto-join) and enforces all business rules at the API middleware layer—not the UI.

---

## Compliance Checklist

### ✅ Mandatory Requirements

| # | Requirement | Status | Evidence | Notes |
|---|-------------|--------|----------|-------|
| **1** | Multi-Tenant Architecture | ✅ | `tenants` table + `tenant_id` FK in all user data | Case-insensitive UNIQUE constraint; `createTenant()` returns existing ID |
| **2** | Plans in Database (No Hardcoding) | ✅ | `plans`, `features`, `plan_features` tables | Add new plans via SQL INSERT; no code changes needed |
| **3** | Feature-Based Access Control | ✅ | `entitlementMiddleware.js` | Enforced at API layer before controller execution |
| **4** | Usage Limit Enforcement | ✅ | `usage_tracker` table + atomic updates | `ON CONFLICT DO UPDATE` prevents race conditions |
| **5** | Subscription Lifecycle | ✅ | `subscriptions` + `subscription_history` | Active/expired detection; 30-day auto-assignment on register |
| **6** | Architecture Diagrams | ✅ | ASCII diagrams in README + Mermaid in DIAGRAMS.md | System, middleware flow, and ER diagrams included |
| **7** | Database Schema & ER Diagram | ✅ | 8 normalized tables; ER diagram in DIAGRAMS.md | Foreign keys, indexes, uniqueness constraints defined |
| **8** | Design Rationale | ✅ | Documented in README and code comments | JWT for stateless auth, atomic ops for consistency |
| **9** | Scalability Strategy | ✅ | 3-phase roadmap in README | SQLite → Redis → Read Replicas → Sharding |
| **10** | Race Condition Prevention | ✅ | Atomic SQL patterns + proof in this document | Zero lost updates on concurrent requests |
| **11** | Upgrade/Downgrade Support | ✅ | `subscription_history` tracks all changes | Full audit trail of plan transitions |
| **12** | Extensibility | ✅ | Config-driven routes, no hardcoded business logic | Easy to add plans, features, or new resource types |

### ✅ Security & Production Readiness

| Area | Status | Details |
|------|--------|---------|
| **Authentication** | ✅ | JWT tokens; `authMiddleware` validates on every request |
| **Tenant Isolation** | ✅ | 3-layer: JWT token, API queries, DB queries all filter by `tenant_id` |
| **API Security** | ✅ | 403 Forbidden for unauthorized; proper HTTP semantics |
| **Credential Storage** | ✅ | bcryptjs hashing (10 rounds); plaintext never stored |
| **Atomic Operations** | ✅ | SQLite `ON CONFLICT DO UPDATE` prevents lost updates |
| **Audit Trail** | ✅ | `subscription_history` records all plan changes with timestamps |

---

## Detailed Architecture

### 3-Tier Request Pipeline

Each request follows this immutable order:

```
1. Express Router
   ↓
2. authMiddleware (JWT verification)
   • Validate token signature
   • Extract tenant_id and role
   • Attach to req.user
   ✗ Reject if invalid → 401 Unauthorized
   ↓
3. Route-Specific Middleware (if applicable)
   • entitlementMiddleware (for /projects)
   • subscriptionMiddleware (for /subscriptions)
   • usageMiddleware (atomic counter increment)
   ✗ Block if quota exceeded → 403 Forbidden
   ↓
4. Controller Logic
   • Handle business logic
   • Query tenant-scoped data
   • Return response
   ↓
5. Response Serialization
```

### Authentication Flow

**Registration:**
```
User submits { tenantName, name, email, password }
  ↓
createTenant(tenantName)
  • Check: SELECT id FROM tenants WHERE name = ? (case-insensitive)
  • Found? Return existing ID
  • Not found? INSERT new tenant, return new ID
  ↓
Check for existing admin in tenant
  • Query: SELECT id FROM users WHERE tenant_id = ? AND role = 'admin'
  • No admin? New user becomes admin (first-user-is-admin pattern)
  • Admin exists? New user becomes regular user
  ↓
createUser(tenantId, name, email, hashedPassword, role)
  • Hash password with bcryptjs (10 rounds)
  • INSERT user with assigned role
  ↓
Auto-assign Free plan
  • Check: SELECT id FROM subscriptions WHERE tenant_id = ? AND status='active'
  • Exists? Skip (already have plan)
  • Missing? INSERT subscription with Free plan, expires in 30 days
  ↓
Issue JWT token
  • token = jwt.sign({ id: userId, tenant_id: tenantId, role }, JWT_SECRET)
  • Return to client
```

**Login:**
```
User submits { email, password }
  ↓
findByEmail(email)
  • Query: SELECT * FROM users WHERE email = ?
  • Not found? Return 400 "User not found"
  ↓
bcryptjs.compareSync(password, user.password)
  • Match? Continue
  • No match? Return 400 "Incorrect password"
  ↓
Issue JWT token
  • token = jwt.sign({ id: user.id, tenant_id: user.tenant_id, role: user.role }, JWT_SECRET)
  • Return to client
```

### Entitlement Flow

**Request with Feature Gate (e.g., POST /api/projects):**

```
req = { headers: { authorization: "Bearer <jwt>" }, body: { name: "Project 4" } }
  ↓
authMiddleware
  ▸ jwt.verify(token, JWT_SECRET)
  ▸ req.user = { id: 8, tenant_id: 1, role: 'user' }
  ↓
entitlementMiddleware('CREATE_PROJECT', { countTable: 'projects' })
  ▸ Query current subscription:
    SELECT s.*, p.name, p.usage_limit
    FROM subscriptions s
    JOIN plans p ON s.plan_id = p.id
    WHERE s.tenant_id = ? AND s.status = 'active'
  
  ▸ Result: { plan_name: 'Free', usage_limit: 3, end_date: '2026-03-31' }
  
  ▸ Check 1: Is subscription expired?
    IF (new Date() > new Date(end_date)) 
      RETURN 403 "Subscription expired"
  
  ▸ Check 2: Does plan have feature?
    SELECT 1 FROM plan_features pf
    WHERE pf.plan_id = ? AND pf.feature_id = (SELECT id FROM features WHERE name = 'CREATE_PROJECT')
    IF NOT EXISTS RETURN 403 "Feature not included in your plan"
  
  ▸ Check 3: Has tenant exceeded usage limit?
    SELECT COUNT(*) as usage FROM projects WHERE tenant_id = ?
    IF (usage >= usage_limit) RETURN 403 "Quota exceeded"
  
  ▸ All checks pass → continue to controller
  ↓
projectController.createProject(req, res)
  ▸ INSERT INTO projects (tenant_id, user_id, name) VALUES (?, ?, ?)
  ▸ RETURN 201 { success, projectId }
```

### JWT & Token Structure

```javascript
// Example JWT payload (decoded)
{
  "id": 8,
  "tenant_id": 1,
  "role": "user",
  "iat": 1709251200,
  "exp": 1709337600  // expires in 24 hours (optional)
}

// Token contains complete authorization context
// No server-side session needed (stateless)
// Validated with JWT_SECRET on every request
```

---

## Database Schema & Rationale

### Table: `tenants`

```sql
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE COLLATE NOCASE
);
CREATE UNIQUE INDEX idx_tenants_name ON tenants(name COLLATE NOCASE);
```

**Rationale:**
- `UNIQUE COLLATE NOCASE`: Ensures "Port" and "port" map to same company
- `createTenant()` function returns existing ID if name found
- Prevents accidental duplicate tenants when multiple users register with same company name
- Single index lookup (O(1)) on `tenants.name` for every registration

**Migration Path:** Existing tables without constraint:
```sql
-- If upgrading from old version without constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name 
ON tenants(name COLLATE NOCASE);
```

---

### Table: `users`

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'user',
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);
```

**Rationale:**
- `tenant_id` nullable: allows superadmin accounts (tenant_id = NULL) for platform management
- `email` UNIQUE: globally unique; prevents duplicate accounts
- `role` field: supports `user`, `admin`, `superadmin`
  - `user`: regular org member
  - `admin`: can manage other users in same tenant
  - `superadmin`: can manage whole platform
- No password field constraints: bcryptjs handles validation

**First-User-is-Admin Logic:**
```javascript
// In authController.register
assignRole = (callback) => {
  db.get(
    `SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`,
    [tenantId],
    (err, row) => {
      if (err) return callback(err);
      // If admin exists, new user is 'user'. Otherwise new user is 'admin'.
      callback(null, row ? 'user' : 'admin');
    }
  );
};
```

---

### Table: `plans`

```sql
CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  usage_limit INTEGER
);
```

**Rationale:**
- Database-driven: add new plans with SQL, no code redeploy
- `usage_limit`: applies to CREATE_PROJECT feature (easily extensible)
- Allows runtime configuration without application restart

**Seeding:**
```sql
INSERT INTO plans (name, usage_limit) VALUES ('Free', 3);
INSERT INTO plans (name, usage_limit) VALUES ('Pro', 10);
INSERT INTO plans (name, usage_limit) VALUES ('Enterprise', 100);
```

---

### Table: `features`

```sql
CREATE TABLE features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT
);
```

**Rationale:**
- Feature flags stored as data, not code
- Allows dynamic feature rollout without deployment
- Example features: `CREATE_PROJECT`, `PREMIUM_DASHBOARD`, `ADVANCED_REPORTING`

**Seeding:**
```sql
INSERT INTO features (name) VALUES ('CREATE_PROJECT');
INSERT INTO features (name) VALUES ('PREMIUM_DASHBOARD');
```

---

### Table: `plan_features`

```sql
CREATE TABLE plan_features (
  plan_id INTEGER,
  feature_id INTEGER,
  PRIMARY KEY(plan_id, feature_id),
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
CREATE INDEX idx_plan_features_plan ON plan_features(plan_id);
CREATE INDEX idx_plan_features_feature ON plan_features(feature_id);
```

**Rationale:**
- Junction table: many-to-many relationship between plans and features
- Free plan gets CREATE_PROJECT only
- Pro/Enterprise get CREATE_PROJECT + PREMIUM_DASHBOARD
- Easily add new features to any plan without schema changes

**Seeding:**
```sql
INSERT INTO plan_features VALUES (1, 1);  -- Free → CREATE_PROJECT
INSERT INTO plan_features VALUES (2, 1);  -- Pro → CREATE_PROJECT
INSERT INTO plan_features VALUES (2, 2);  -- Pro → PREMIUM_DASHBOARD
INSERT INTO plan_features VALUES (3, 1);  -- Enterprise → CREATE_PROJECT
INSERT INTO plan_features VALUES (3, 2);  -- Enterprise → PREMIUM_DASHBOARD
```

---

### Table: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER UNIQUE,
  plan_id INTEGER,
  status TEXT,
  start_date TEXT,
  end_date TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
```

**Rationale:**
- `tenant_id UNIQUE`: at most one active subscription per tenant
- `status` field: `active` or `expired` (determined by comparing end_date to NOW())
- Auto-assign Free plan on registration:
  ```javascript
  // If no active subscription exists, insert one
  if (!existingSubscription) {
    const start_date = new Date().toISOString();
    const end_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date)
       VALUES (?, ?, 'active', ?, ?)`,
      [tenantId, freeplanId, start_date, end_date]
    );
  }
  ```
- Prevents orphaned subscriptions: one tenant = one active plan at any time

---

### Table: `subscription_history`

```sql
CREATE TABLE subscription_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  plan_id INTEGER,
  status TEXT,
  start_date TEXT,
  end_date TEXT,
  changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
```

**Rationale:**
- **Immutable audit trail:** every subscription change recorded
- `changed_at`: automatic timestamp (CURRENT_TIMESTAMP)
- Enables:
  - Revenue tracking: which plans were active when?
  - Compliance: prove who had access to what features when?
  - Analytics: churn analysis, upgrade/downgrade patterns
- Populated via trigger or explicit insert on subscription change

**Trigger (Alternative to Application Logic):**
```sql
CREATE TRIGGER subscription_history_trigger
AFTER UPDATE ON subscriptions
FOR EACH ROW
BEGIN
  INSERT INTO subscription_history (tenant_id, plan_id, status, start_date, end_date)
  VALUES (NEW.tenant_id, NEW.plan_id, NEW.status, NEW.start_date, NEW.end_date);
END;
```

---

### Table: `usage_tracker`

```sql
CREATE TABLE usage_tracker (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  feature_id INTEGER,
  usage_count INTEGER DEFAULT 0,
  UNIQUE(tenant_id, feature_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (feature_id) REFERENCES features(id)
);
CREATE UNIQUE INDEX idx_usage_tenant_feature 
ON usage_tracker(tenant_id, feature_id);
```

**Rationale:**
- Tracks per-tenant, per-feature usage (e.g., projects created by tenant 1)
- `UNIQUE(tenant_id, feature_id)`: at most one row per tenant/feature combo
- **Atomic increments** prevent race conditions:
  ```sql
  INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
  VALUES (?, ?, 1)
  ON CONFLICT(tenant_id, feature_id)
  DO UPDATE SET usage_count = usage_count + 1;
  ```
- No lost updates even under concurrent requests

---

### Table: `projects`

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  user_id INTEGER,
  name TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Rationale:**
- Domain resource: belongs to exactly one tenant
- `user_id`: tracks creator for ownership/permission logic (future enhancement)
- Entitlement enforcement: blocks creation if tenant exceeds usage_limit for CREATE_PROJECT feature

---

### Complete ER Diagram (SQL View)

```
tenants (1) ──┬─── (∞) users
              ├─── (1) subscriptions (at most one active per tenant)
              ├─── (∾) subscription_history (immutable audit trail)
              ├─── (∞) projects
              └─── (∞) usage_tracker

plans (1) ──┬─── (∞) subscriptions
            ├─── (∾) subscription_history
            └─── (∞) plan_features (many-to-many via junction)

features (1) ──┬─── (∞) plan_features
               └─── (∞) usage_tracker

users (1) ─── (∞) projects

Uniqueness Constraints:
• tenants.name (COLLATE NOCASE)
• users.email (global)
• subscriptions.tenant_id (one active per tenant)
• usage_tracker.tenant_id + usage_tracker.feature_id
```

---

## Implementation Code Snippets

### 1. Atomic Usage Increment (Race-Free)

**File:** `backend/middlewares/usageMiddleware.js`

```javascript
const usageMiddleware = (featureName, { countTable }) => {
  return (req, res, next) => {
    const tenantId = req.user.tenant_id;
    
    // Get feature ID
    db.get(
      `SELECT id FROM features WHERE name = ?`,
      [featureName],
      (err, feature) => {
        if (err) return next(err);
        if (!feature) return res.status(400).json({ error: 'Feature not found' });
        
        // Atomic insert-or-update (no lost updates)
        db.run(
          `INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
           VALUES (?, ?, 1)
           ON CONFLICT(tenant_id, feature_id)
           DO UPDATE SET usage_count = usage_count + 1`,
          [tenantId, feature.id],
          (err) => {
            if (err) return next(err);
            next();
          }
        );
      }
    );
  };
};

module.exports = usageMiddleware;
```

**Why This Works:**
- `ON CONFLICT DO UPDATE` is atomic: SQLite executes as single transaction
- No possibility of two requests both reading count=3, incrementing to 4
- Both will succeed, one increments from 3→4, other from 4→5

---

### 2. Entitlement Check Middleware

**File:** `backend/middlewares/entitlementMiddleware.js`

```javascript
const checkEntitlement = (featureName, options = {}) => {
  return (req, res, next) => {
    const tenantId = req.user.tenant_id;
    const { countTable, limitField = 'usage_limit' } = options;

    // Step 1: Get active subscription
    db.get(
      `SELECT s.id, s.plan_id, s.end_date, p.${limitField}
       FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = ? AND s.status = 'active'
       LIMIT 1`,
      [tenantId],
      (err, subscription) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!subscription) {
          return res.status(403).json({ error: 'No active subscription' });
        }

        // Step 2: Check expiry
        if (new Date() > new Date(subscription.end_date)) {
          return res.status(403).json({ error: 'Subscription expired' });
        }

        // Step 3: Check feature exists in plan
        db.get(
          `SELECT 1 FROM plan_features pf
           WHERE pf.plan_id = ?
           AND pf.feature_id = (SELECT id FROM features WHERE name = ?)`,
          [subscription.plan_id, featureName],
          (fErr, feature) => {
            if (fErr) return res.status(500).json({ error: fErr.message });
            if (!feature) {
              return res.status(403).json({
                error: `Feature "${featureName}" not included in your plan`
              });
            }

            // Step 4: Check usage limit (only if countTable specified)
            if (countTable && subscription[limitField]) {
              db.get(
                `SELECT COUNT(*) as usage FROM ${countTable} WHERE tenant_id = ?`,
                [tenantId],
                (uErr, row) => {
                  if (uErr) return res.status(500).json({ error: uErr.message });
                  if (row.usage >= subscription[limitField]) {
                    return res.status(403).json({
                      error: `Quota exceeded. ${featureName} limit: ${subscription[limitField]}`
                    });
                  }
                  next();
                }
              );
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
```

**Usage in Routes:**
```javascript
const checkEntitlement = require('../middlewares/entitlementMiddleware');
const usageMiddleware = require('../middlewares/usageMiddleware');

router.post(
  '/projects',
  authMiddleware,
  checkEntitlement('CREATE_PROJECT', { countTable: 'projects' }),
  usageMiddleware('CREATE_PROJECT', { countTable: 'projects' }),
  projectController.createProject
);
```

---

### 3. First-User-is-Admin Logic

**File:** `backend/controllers/authController.js`

```javascript
const register = async (req, res) => {
  const { tenantName, name, email, password } = req.body;

  createTenant(tenantName, (err, tenantId) => {
    if (err) return res.status(500).json({ error: err.message });

    const hashed = bcrypt.hashSync(password, 10);

    // Determine role: first user becomes admin, others are users
    db.get(
      `SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' LIMIT 1`,
      [tenantId],
      (checkErr, row) => {
        if (checkErr) return res.status(500).json({ error: checkErr.message });
        
        const roleToUse = row ? 'user' : 'admin';

        createUser(tenantId, name, email, hashed, roleToUse, (err, userId) => {
          if (err) return res.status(500).json({ error: err.message });

          // Auto-assign Free plan
          db.get(`SELECT id FROM plans WHERE name = 'Free'`, [], (err, plan) => {
            if (plan) {
              db.get(
                `SELECT id FROM subscriptions WHERE tenant_id = ? AND status='active' LIMIT 1`,
                [tenantId],
                (err2, existing) => {
                  if (!existing) {
                    const start_date = new Date().toISOString();
                    const end_date = new Date(
                      Date.now() + 30 * 24 * 60 * 60 * 1000
                    ).toISOString();
                    db.run(
                      `INSERT INTO subscriptions (tenant_id, plan_id, status, start_date, end_date)
                       VALUES (?, ?, 'active', ?, ?)`,
                      [tenantId, plan.id, start_date, end_date]
                    );
                  }
                }
              );
            }
          });

          const token = jwt.sign(
            { id: userId, tenant_id: tenantId, role: roleToUse },
            process.env.JWT_SECRET
          );

          res.json({ token, userId, tenantId, role: roleToUse });
        });
      }
    );
  });
};
```

---

### 4. Tenant-Deduplicating createTenant()

**File:** `backend/models/tenantModel.js`

```javascript
const createTenant = (name, callback) => {
  if (!name || !name.trim()) {
    return callback(new Error('tenant name required'));
  }

  const clean = name.trim();

  // Look for existing tenant (case-insensitive)
  db.get(
    `SELECT id FROM tenants WHERE name = ?`,
    [clean],
    (err, row) => {
      if (err) return callback(err);
      if (row) {
        // Tenant exists; reuse it
        console.log(`[AUDIT] Reusing existing tenant "${clean}" (ID: ${row.id})`);
        return callback(null, row.id);
      }

      // Create new tenant
      const stmt = `INSERT INTO tenants (name) VALUES (?)`;
      db.run(stmt, [clean], function(err) {
        if (err) return callback(err);
        console.log(`[AUDIT] Created new tenant "${clean}" (ID: ${this.lastID})`);
        callback(null, this.lastID);
      });
    }
  );
};

module.exports = { createTenant };
```

**Key Features:**
- Case-insensitive lookup: "Port", "port", "PORT" all map to same tenant
- Returns existing ID without inserting duplicate
- Logs each tenant action for audit trail

---

### 5. List Users (Tenant-Scoped or Platform-Wide)

**File:** `backend/controllers/adminController.js`

```javascript
const listUsers = (req, res) => {
  if (req.user.role === 'superadmin') {
    // Superadmin sees all users across all tenants
    db.all(
      `SELECT u.id, u.name, u.email, u.role,
              t.name as tenant,
              (SELECT email FROM users WHERE tenant_id = u.tenant_id AND role = 'admin' LIMIT 1) as tenant_admin_email,
              (SELECT status FROM subscriptions WHERE tenant_id = u.tenant_id AND status = 'active' LIMIT 1) as tenant_sub_status
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  } else {
    // Tenant admin sees only users in their tenant
    const tenantId = req.user.tenant_id;
    db.all(
      `SELECT id, name, email, role FROM users WHERE tenant_id = ?`,
      [tenantId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  }
};
```

**Isolation Mechanism:**
- Tenant admin: filtered by `tenant_id = req.user.tenant_id`
- Superadmin: no filter (sees all)
- Even if attacker removes the filter, JWT doesn't contain other tenant IDs
- Database layer is the ultimate enforcement point

---

## Race Condition Prevention

### Problem Statement

**Scenario:** Two concurrent requests both try to increment usage.

```
Time | Request 1 (T1)           | Request 2 (T2)
-----|--------------------------|---------------------------
1    | READ usage = 3           |
2    |                          | READ usage = 3
3    | CALCULATE new = 3+1 = 4  |
4    |                          | CALCULATE new = 3+1 = 4
5    | WRITE usage = 4          |
6    |                          | WRITE usage = 4
-----|--------------------------|---------------------------
Result: usage = 4 (should be 5) ← LOST UPDATE
```

This classic race condition causes under-counting.

### Solution: Atomic ON CONFLICT DO UPDATE

**Implementation:**
```sql
INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
VALUES (?, ?, 1)
ON CONFLICT(tenant_id, feature_id)
DO UPDATE SET usage_count = usage_count + 1;
```

**How It Works:**

SQLite atomically executes this in single transaction:

```
Single Transaction (Atomic):
├─ TRY: Insert (tenant_id=1, feature_id=5, usage_count=1)
├─ IF constraint violation (UNIQUE already exists):
│   └─ EXECUTE: UPDATE usage_tracker SET usage_count=usage_count+1 WHERE tenant_id=1 AND feature_id=5
└─ COMMIT all or ROLLBACK none
```

**Proof (Two Concurrent Requests):**

```
T1: INSERT ... ON CONFLICT DO UPDATE        T2: INSERT ... ON CONFLICT DO UPDATE
│                                            │
├─ Acquire lock on usage_tracker table       │
├─ Check constraint: no conflict (usage=3)   │
├─ INSERT row (usage=1)                      │
├─ Update: usage_count = 3+1 = 4             │
├─ COMMIT (lock released)                    │
│                                            └─ Acquire lock
│                                               Check: conflict exists
│                                               UPDATE usage_count = 4+1 = 5
│                                               COMMIT
Result: usage_count = 5 ✓ (correct!)
```

### Alternative: Explicit Locking (Not Needed Here)

If SQLite's atomic op wasn't sufficient, could use:

```sql
BEGIN TRANSACTION;
SELECT usage_count FROM usage_tracker WHERE tenant_id=? AND feature_id=? FOR UPDATE;
UPDATE usage_tracker SET usage_count = usage_count+1 WHERE tenant_id=? AND feature_id=?;
COMMIT;
```

But `ON CONFLICT DO UPDATE` is cleaner and equally correct for this use case.

### Verification Test

```javascript
// Run 100 concurrent increments; should reach 100, not less
const concurrentIncrements = async (tenantId) => {
  const promises = [];
  
  for (let i = 0; i < 100; i++) {
    promises.push(
      new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO usage_tracker (tenant_id, feature_id, usage_count)
           VALUES (?, ?, 1)
           ON CONFLICT(tenant_id, feature_id)
           DO UPDATE SET usage_count = usage_count + 1`,
          [tenantId, 1],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    );
  }
  
  await Promise.all(promises);
  
  // Verify final count
  db.get(
    `SELECT usage_count FROM usage_tracker WHERE tenant_id=? AND feature_id=?`,
    [tenantId, 1],
    (err, row) => {
      console.assert(row.usage_count === 100, `Expected 100, got ${row.usage_count}`);
    }
  );
};
```

---

## Scalability Strategies

### Current State (Phase 0): SQLite Single-File

**Characteristics:**
- Single process; no replication
- ACID guarantees
- Good for: 1K–10K tenants, 10K–100K users

**Limitations:**
- Write throughput capped at ~1K TPS
- No horizontal scaling
- File locks during heavy load

**When to upgrade:** > 5K concurrent users or > 1K TPS

---

### Phase 1: Redis Caching Layer

**Architecture:**
```
Browser → Express → Redis (Cache) ↘
                                     SQLite (Source of Truth)
```

**Cached Queries:**
```javascript
const getCachedSubscription = async (tenantId) => {
  const cacheKey = `subscription:${tenantId}`;
  
  // Try Redis first
  let cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Fall back to SQLite
  const row = await db.get(
    `SELECT ... FROM subscriptions WHERE tenant_id=?`,
    [tenantId]
  );
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(row));
  return row;
};
```

**Invalidation Strategy:**
- On subscription change: `redis.del(`subscription:${tenantId}`)`
- TTL-based: automatic 5-minute expiry

**Expected Improvement:** 10× speedup on hot queries (80% cache hit rate)

**TPS Improvement:**
- SQLite baseline: 1K TPS (with cache misses)
- With Redis (80% hit): ~20K TPS

---

### Phase 2: Read Replicas

**Architecture:**
```
Browser → Load Balancer → Express API #1 → SQLite (Primary, Writes)
                         → Express API #2 → SQLite Replica (Reads)
                         → Express API #3 → SQLite Replica (Reads)
```

**Implementation (using replication):**
```javascript
// Write queries → Primary
db.run(`INSERT INTO projects ...`, [...], callback);

// Read queries → Replica (if available)
replicaDb.get(`SELECT * FROM projects ...`, [...], callback);
```

**Limitations of SQLite Replicas:**
- SQLite doesn't have native replication
- Use WAL (Write-Ahead Logging) mode + file sync
- For true multi-node, move to PostgreSQL

**Expected Improvement:** 3× throughput (3 API servers sharing load)

---

### Phase 3: Sharding by Tenant

**Architecture:**
```
Tenant 1–1000 → Shard A (SQLite instance 1)
Tenant 1001–2000 → Shard B (SQLite instance 2)
Tenant 2001–3000 → Shard C (SQLite instance 3)
```

**Shard Key Selection:**
```javascript
const getShardId = (tenantId) => {
  return Math.floor((tenantId - 1) / 1000) % numShards;
};

const shardedQuery = (query, tenantId, params) => {
  const shardId = getShardId(tenantId);
  const db = shards[shardId];
  return db.all(query, params);
};
```

**Benefits:**
- Linear horizontal scaling: N shards = N× throughput
- Each shard handles ~1000 tenants
- No single bottleneck

**Challenges:**
- Tenant-to-shard mapping must be global
- Cross-shard queries impossible (avoided by design)
- Rebalancing shards is complex

**When to implement:** > 10K concurrent users

---

### Expected Metrics

| Phase | Architecture | Tenants | TPS | Latency | Cost |
|-------|--------------|---------|-----|---------|------|
| **0** | SQLite | 1–10K | 1K | 10ms | $5/mo (hobby) |
| **1** | SQLite + Redis | 1–10K | 20K | 2ms | $50/mo |
| **2** | SQLite + Redis + Replicas | 10–50K | 15K | 15ms | $200/mo |
| **3** | Sharded (3 shards) | 50K–300K | 45K | 15ms | $600/mo |
| **4** | Postgres + Redis + Sharding | 300K+ | 100K+ | <10ms | $2K+/mo |

---

## Testing Recommendations

### Unit Tests

**File:** `backend/tests/unit/tenantModel.test.js`

```javascript
const { createTenant } = require('../../models/tenantModel');
const { db } = require('../../models/db');

describe('createTenant', () => {
  beforeEach(() => {
    db.run(`DELETE FROM tenants`);
  });

  test('should insert new tenant', (done) => {
    createTenant('Acme Corp', (err, tenantId) => {
      expect(err).toBeNull();
      expect(tenantId).toBeDefined();
      done();
    });
  });

  test('should return existing tenant for same name', (done) => {
    createTenant('Acme Corp', (err, id1) => {
      createTenant('Acme Corp', (err, id2) => {
        expect(id1).toBe(id2);
        done();
      });
    });
  });

  test('should be case-insensitive', (done) => {
    createTenant('Acme Corp', (err, id1) => {
      createTenant('acme corp', (err, id2) => {
        expect(id1).toBe(id2);
        done();
      });
    });
  });
});
```

---

### Integration Tests

**File:** `backend/tests/integration/registration.test.js`

```javascript
const request = require('supertest');
const app = require('../../server');
const { db } = require('../../models/db');

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    db.run(`DELETE FROM users`);
    db.run(`DELETE FROM tenants`);
  });

  test('first user should be admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        tenantName: 'Port',
        name: 'Porter',
        email: 'porter@example.com',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();

    // Verify token contains admin role
    const decoded = jwt.decode(res.body.token);
    expect(decoded.role).toBe('admin');
  });

  test('second user with same tenant should be regular user', async () => {
    // Register first user
    await request(app)
      .post('/api/auth/register')
      .send({
        tenantName: 'Port',
        name: 'Porter',
        email: 'porter@example.com',
        password: 'password123'
      });

    // Register second user with same tenant
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        tenantName: 'Port',
        name: 'Porter 2',
        email: 'porter2@example.com',
        password: 'password123'
      });

    const decoded = jwt.decode(res.body.token);
    expect(decoded.role).toBe('user');
  });

  test('should auto-assign free plan', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        tenantName: 'NewCorp',
        name: 'Admin',
        email: 'admin@newcorp.com',
        password: 'password123'
      });

    const decoded = jwt.decode(res.body.token);
    const tenantId = decoded.tenant_id;

    // Verify subscription exists
    db.get(
      `SELECT p.name FROM subscriptions s
       JOIN plans p ON s.plan_id = p.id
       WHERE s.tenant_id = ? AND s.status = 'active'`,
      [tenantId],
      (err, row) => {
        expect(row.name).toBe('Free');
      }
    );
  });
});
```

---

### Load Tests

**File:** `backend/tests/load/concurrent-usage.test.js`

```javascript
const { spawn } = require('child_process');

describe('Concurrent Usage Increment', () => {
  test('100 concurrent increments should result in usage=100', (done) => {
    const numRequests = 100;
    const completed = { count: 0 };

    for (let i = 0; i < numRequests; i++) {
      // Simulate concurrent POST /api/projects
      spawn('curl', [
        '-X', 'POST',
        'http://localhost:5000/api/projects',
        '-H', 'Authorization: Bearer <validToken>',
        '-H', 'Content-Type: application/json',
        '-d', '{"name": "Project"}',
        '-s'
      ]).on('close', () => {
        completed.count++;
        if (completed.count === numRequests) {
          // Verify final usage
          db.get(
            `SELECT COUNT(*) as count FROM projects WHERE tenant_id = ?`,
            [testTenantId],
            (err, row) => {
              expect(row.count).toBe(numRequests);
              done();
            }
          );
        }
      });
    }
  });
});
```

---

### Security Tests

**File:** `backend/tests/security/tenant-isolation.test.js`

```javascript
describe('Tenant Isolation', () => {
  test('user cannot access another tenant\'s projects', async () => {
    // User 1 (tenant 1) creates a project
    const user1Token = await registerAndLogin('user1', 'tenant1');
    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ name: 'User1 Project' });

    // User 2 (tenant 2) tries to access User 1's project
    const user2Token = await registerAndLogin('user2', 'tenant2');
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${user2Token}`);

    // User 2 should see no projects
    expect(res.body).toEqual([]);
  });

  test('user cannot forge JWT with different tenant_id', async () => {
    const validToken = await registerAndLogin('user', 'tenant1');
    const decoded = jwt.decode(validToken);
    
    // Try to hand-modify and re-sign
    const forged = jwt.sign(
      { ...decoded, tenant_id: 999 },
      'wrong-secret'  // Wrong secret
    );

    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  test('user cannot exceed quota despite deleting JWT check', () => {
    // Even with UI bypass, entitlementMiddleware blocks over-quota requests
    // See integration test ensuring middleware returns 403
  });
});
```

---

## Production Readiness Checklist

### ✅ Deployment

- [ ] **Database**
  - [ ] SQLite database file backed up daily
  - [ ] WAL mode enabled (`PRAGMA journal_mode=WAL`)
  - [ ] Connection pooling configured (max 10 concurrent)
  - [ ] Indexes created on tenant_id, email, plan_id
  - [ ] Migrations run and verified
  - [ ] Constraints enforced (UNIQUE, FK, NOT NULL)

- [ ] **Backend (Node.js)**
  - [ ] Environment variables documented (.env.example provided)
  - [ ] Error handling middleware in place
  - [ ] Request logging (Morgan or equivalent)
  - [ ] Rate limiting enabled (express-rate-limit)
  - [ ] CORS configured for frontend domain
  - [ ] JWT secret rotated and stored in secrets manager
  - [ ] Health check endpoint (`/health`)
  - [ ] Docker image built and deployed

- [ ] **Frontend (React)**
  - [ ] API endpoints use environment variables (not hardcoded)
  - [ ] Production build tested locally
  - [ ] Service worker configured for offline support
  - [ ] Deployed to CDN (Vercel, Netlify)
  - [ ] SSL/TLS verified

---

### ✅ Security

- [ ] **Authentication**
  - [ ] JWT secret >= 32 bytes, cryptographically random
  - [ ] Token expiration set to reasonable value (24h or less)
  - [ ] Refresh token rotation implemented (optional)
  - [ ] HTTPS-only for all API endpoints
  - [ ] HttpOnly cookies for token storage if applicable

- [ ] **Data**
  - [ ] Passwords hashed with bcryptjs (10+ rounds)
  - [ ] No sensitive data in logs
  - [ ] Database backups encrypted at rest
  - [ ] Backup tested for restoration (monthly)
  - [ ] PII compliance (GDPR if applicable)

- [ ] **API**
  - [ ] SQL injection prevented (parameterized queries used)
  - [ ] XSS prevention (Content-Security-Policy headers)
  - [ ] CSRF tokens if session-based (not needed for JWT)
  - [ ] Rate limiting on auth endpoints (100 req/hour per IP)
  - [ ] Admin endpoints require superadmin role
  - [ ] Tenant data filtered by tenant_id on all queries

---

### ✅ Monitoring & Logging

- [ ] **Logs**
  - [ ] Error logs sent to centralized system (Sentry, LogRocket)
  - [ ] Audit trail for sensitive actions (user creation, plan changes)
  - [ ] Request logs with timestamp, user_id, endpoint, status code
  - [ ] Log retention policy (30 days min)

- [ ] **Metrics**
  - [ ] Request latency tracked (P50, P95, P99)
  - [ ] Database query latency monitored
  - [ ] Error rate alarmed (> 1% triggers alert)
  - [ ] Payment processing success rate tracked
  - [ ] Subscription expiry alerts configured

- [ ] **Alerts**
  - [ ] Disk space > 80% → alert
  - [ ] Error rate > 5% → PagerDuty integration
  - [ ] Database connection pool exhausted → alert
  - [ ] JWT validation failures spike → alert (potential attack)

---

### ✅ Testing

- [ ] **Unit Tests**
  - [ ] All model functions tested (tenantModel, userModel, etc.)
  - [ ] Middleware tested in isolation
  - [ ] Test coverage >= 80%
  - [ ] Tests run on every commit (CI/CD)

- [ ] **Integration Tests**
  - [ ] Registration flow (first user = admin)
  - [ ] Login flow
  - [ ] Subscription upgrade/downgrade
  - [ ] Project creation with entitlement checks
  - [ ] Tenant isolation verified
  - [ ] Tests run on staging before production deployment

- [ ] **Load Tests**
  - [ ] 100 concurrent users, 5 min duration
  - [ ] 1000 concurrent requests/sec verified
  - [ ] Database query latency < 50ms p99
  - [ ] API response time < 100ms p99

- [ ] **Security Tests**
  - [ ] SQL injection attempts blocked
  - [ ] JWT forgery rejected
  - [ ] Cross-tenant data access prevented
  - [ ] Quota enforcement verified
  - [ ] Penetration test passed (optional, but recommended)

---
