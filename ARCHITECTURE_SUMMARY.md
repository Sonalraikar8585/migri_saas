# CloudFlow – Architecture Summary

**Reading Time:** 10-15 minutes  
**Audience:** Architects, Senior Engineers, Tech Leads  
**Use For:** Design reviews, onboarding, technical decisions

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────────────────────────────────────────────┤
│ React SPA (TypeScript)                                       │
│  ├─ Pages: Login, Register, Dashboard, TenantAdmin, Admin   │
│  ├─ Components: ProjectForm, Notification, Subscription UI  │
│  ├─ State: User, Token, Projects, Subscription             │
│  └─ API: axios wrapper (base URL: /api)                    │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY / ROUTER                      │
├─────────────────────────────────────────────────────────────┤
│ Express.js (Node 14+)                                        │
│  Routes (Namespaced):                                        │
│  ├─ /api/auth/*           (register, login)                 │
│  ├─ /api/projects/*       (CRUD with quota check)           │
│  ├─ /api/subscriptions/*  (upgrade, view history)           │
│  └─ /api/admin/*          (plans, users, tenants)           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   MIDDLEWARE STACK (Order Matters)           │
├─────────────────────────────────────────────────────────────┤
│ 1. CORS Middleware                                           │
│    • Allow origin: http://localhost:3000 (in production)    │
│    • Allow methods: GET, POST, PUT, DELETE                  │
│                                                              │
│ 2. JSON Parser Middleware                                    │
│    • Parse request body as JSON                             │
│                                                              │
│ 3. Authentication Middleware (authMiddleware)               │
│    • Extract JWT from Authorization header                  │
│    • Verify signature                                       │
│    • Attach req.user = { id, tenant_id, role }             │
│    • ✗ Return 401 if invalid                               │
│                                                              │
│ 4. Route-Specific Middleware (Optional)                      │
│    • subscriptionMiddleware: Check status & expiry          │
│    • entitlementMiddleware: Check feature & quota           │
│    • usageMiddleware: Atomic counter increment              │
│    • ✗ Return 403 if blocked                               │
│                                                              │
│ 5. Controller Logic                                          │
│    • Execute business logic                                 │
│    • Query database with req.user.tenant_id                │
│    • Return 200 + response or error                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                         │
├─────────────────────────────────────────────────────────────┤
│ SQLite3 Database (saas.db)                                   │
│  ├─ 8 normalized tables                                      │
│  ├─ Indexes on tenant_id, email, plan_id                   │
│  ├─ UNIQUE constraints (tenants.name, users.email)         │
│  ├─ Foreign key enforcement (PRAGMA foreign_keys=ON)       │
│  ├─ Atomic operations (ON CONFLICT DO UPDATE)              │
│  └─ Backup: Daily snapshots                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Request Flow: Detailed Example

### User Tries to Create a Project (GET /api/projects)

```
Browser
  │
  ├─ GET /api/projects
  │  Authorization: "Bearer eyJhbGc..."
  │
  ▼ Express Router
  │
  ├─ CORS Middleware ✓
  │
  ├─ JSON Parser ✓
  │
  ├─ authMiddleware
  │  ├─ Extract token from header
  │  ├─ jwt.verify(token, JWT_SECRET)
  │  ├─ Payload = { id: 8, tenant_id: 1, role: 'user' }
  │  ├─ req.user = { id: 8, tenant_id: 1, role: 'user' }
  │  └─ next() ✓
  │
  ├─ entitlementMiddleware('CREATE_PROJECT', { countTable: 'projects' })
  │  ├─ Query: SELECT subscription WHERE tenant_id=1 AND status='active'
  │  ├─ Result: { plan_name: 'Free', usage_limit: 3 }
  │  ├─ Check 1: Expiry? new Date() < end_date ✓
  │  ├─ Check 2: Feature exists? CREATE_PROJECT in Free plan ✓
  │  ├─ Check 3: Usage? COUNT(projects WHERE tenant_id=1) = 2 < 3 ✓
  │  └─ next() ✓
  │
  ├─ usageMiddleware('CREATE_PROJECT')
  │  ├─ INSERT/UPDATE usage_tracker (atomic - no race condition)
  │  └─ next() ✓
  │
  ├─ projectController.getProjects(req, res)
  │  ├─ Query: SELECT * FROM projects WHERE tenant_id = 1
  │  ├─ Returns: [{ id: 1, name: 'Project A' }, { id: 2, name: 'Project B' }]
  │  └─ res.json([...]) 200
  │
  ▼ Browser
  │
  └─ [{ id: 1, name: 'Project A' }, { id: 2, name: 'Project B' }]
```

### User Tries to Create 4th Project (Exceeds Quota)

```
Same as above, but at entitlementMiddleware Step 3:

├─ Check 3: Usage? COUNT(projects WHERE tenant_id=1) = 3 >= 3 ✗
│
├─ Return 403 Forbidden
│  {
│    "error": "Project limit reached for your plan (limit: 3)"
│  }
│
└─ DOES NOT REACH projectController
```

---

## Entitlement Enforcement Flow

```
For every request to a feature-gated endpoint (POST /api/projects):

┌─────────────────────────────────────────────┐
│ entitlementMiddleware('CREATE_PROJECT', ...) │
└──────────────┬──────────────────────────────┘
               │
               ▼
       ┌───────────────────┐
       │ Get Active        │ SELECT s.*, p.usage_limit
       │ Subscription      │ FROM subscriptions s
       │                   │ JOIN plans p ON s.plan_id=p.id
       │                   │ WHERE tenant_id=? AND status='active'
       └─────────┬─────────┘
                 │
        ┌────────▼────────┐
        │ No Subscription?│ ✗ → 403 "No active subscription"
        │ All Checks OK?  │
        └──┬──────────────┘
           │
           ▼
    ┌──────────────────┐
    │ Expires Soon?    │ ✗ → 403 "Subscription expired"
    │ Check: NOW() >   │
    │ end_date?        │
    └──┬───────────────┘
       │
       ▼
    ┌──────────────────────┐
    │ Feature in Plan?      │ SELECT 1 FROM plan_features
    │ Check: Does plan     │ WHERE plan_id=? AND feature_id
    │ include feature_id?   │ = (SELECT id FROM features 
    │                       │   WHERE name='CREATE_PROJECT')
    └──┬───────────────────┘
       │
       ▼
    ┌──────────────────────┐
    │ Quota Exceeded?       │ ✗ → 403 "Quota Exceeded"
    │ COUNT(*) >= limit?    │ SELECT COUNT(*) FROM projects
    │                       │ WHERE tenant_id=?
    └──┬───────────────────┘
       │
       ▼
   ✓ All Checks Pass
   │ Continue to Controller
```

---

## Database Schema (Visual)

```sql
┌─ TENANTS (Organizations)
│  └─ id (PK), name (UNIQUE COLLATE NOCASE)
│
├─ USERS (Team Members)
│  └─ id, tenant_id (FK), name, email (UNIQUE), password, role
│
├─ PLANS (Subscription Tiers)
│  └─ id, name, usage_limit
│
├─ FEATURES (Feature Flags)
│  └─ id, name
│
├─ PLAN_FEATURES (Many-to-Many)
│  └─ plan_id (FK), feature_id (FK)
│     Example: (1, 1) = Free plan has CREATE_PROJECT feature
│
├─ SUBSCRIPTIONS (Active Plan per Tenant)
│  └─ id, tenant_id (FK UNIQUE), plan_id (FK), status, start_date, end_date
│     Invariant: At most one active per tenant
│
├─ SUBSCRIPTION_HISTORY (Audit Trail)
│  └─ id, tenant_id (FK), plan_id (FK), status, start_date, end_date, changed_at
│
├─ USAGE_TRACKER (Atomic Counters)
│  └─ id, tenant_id (FK), feature_id (FK), usage_count
│     Unique(tenant_id, feature_id) – one row per tenant/feature
│
└─ PROJECTS (Domain Resource)
   └─ id, tenant_id (FK), user_id (FK), name
```

---

## Authentication & Authorization Model

### JWT Token Structure

```javascript
Header: { alg: "HS256", typ: "JWT" }

Payload: {
  "id": 8,              // user.id
  "tenant_id": 1,       // user.tenant_id (company)
  "role": "user",       // "user" | "admin" | "superadmin"
  "iat": 1709251200,    // issued at
  "exp": 1709337600     // expires in 24 hours
}

Signature: HMAC-SHA256(header.payload, JWT_SECRET)
```

### Role-Based Access

| Role | Can Do | Example Endpoints |
|------|--------|-------------------|
| **user** | Create/list own projects, view subscription | POST /api/projects, GET /api/subscriptions |
| **admin** | Manage users in their tenant, view billing | GET /api/admin/users, PUT /api/admin/users/:id |
| **superadmin** | View all platforms tenants/users/plans | GET /api/admin/platform/tenants, PUT admin configurations |

### Tenant Isolation at Three Layers

```
1. TOKEN LAYER
   └─ JWT contains tenant_id; user has exactly one

2. API LAYER (authMiddleware)
   └─ Every endpoint calls authMiddleware; fails without valid JWT
   └─ tenantMiddleware checks req.user.tenant_id for routes

3. DATABASE LAYER (Queries)
   └─ Every query filters: WHERE tenant_id = req.user.tenant_id
   └─ Even if middleware bypassed, isolation maintained
```

### Example: User 8 (tenant_id=1) Tries SQL Injection

```
Attacker modifies network request:
  GET /api/projects?filter=1' OR '1'='1

But backend does:
  db.all(
    `SELECT * FROM projects WHERE tenant_id = ? AND (filter)`,
    [req.user.tenant_id]  ← Parameterized! Can't inject
  )

Result: Projects from tenant_id=1 only. ✓ Safe.
```

---

## Middleware Order & Dependencies

```
CRITICAL: Order Matters!

1. CORS
   └─ Allow frontend domain

2. JSON Parser
   └─ Parse req.body

3. authMiddleware
   └─ MUST be first
   └─ Sets req.user
   └─ All subsequent middlewares depend on req.user

4. entitlementMiddleware (optional, per route)
   └─ Depends on req.user from authMiddleware
   └─ Checks subscription/features/quotas

5. usageMiddleware (optional, per route)
   └─ Depends on req.user from authMiddleware
   └─ Increments usage counter (atomic)

6. Controller
   └─ Uses req.user.tenant_id for data isolation
```

If you put authMiddleware after other middleware, it breaks!

---

## Subscription Lifecycle State Machine

```
User Registration Event
  │
  ├─ Check for existing tenant with same name
  ├─ If exists, reuse tenant_id
  └─ If new, create with auto-assigned admin role
  │
  ▼
┌──────────────────┐
│ SUBSCRIPTIONS   │
├──────────────────┤
│ status: 'active' │
│ plan_id: 1       │ (Free)
│ end_date: +30d   │
└────────┬─────────┘
         │ User clicks "Upgrade to Pro"
         ▼
┌──────────────────────────────────────────┐
│ Check: User is admin or superadmin?      │
│ Check: Pro plan exists?                  │
│ Charge payment (future integration)      │
└────────┬─────────────────────────────────┘
         │
         ▼
INSERT INTO subscription_history (old "Free" record)
  │
  ├─ UPDATE subscriptions SET plan_id=2, end_date=+30d
  │
  ▼
INSERT INTO subscription_history (new "Pro" record)
  │
  ▼
┌──────────────────┐
│ SUBSCRIPTIONS   │
├──────────────────┤
│ status: 'active' │ ← User can now create 10 projects
│ plan_id: 2       │ (Pro)
│ end_date: +30d   │
└────────┬─────────┘
         │ End of 30 days (time passes)
         │ OR Manual expiry by admin
         ▼
AUTO-CHECK: new Date() > end_date
  │
  ├─ entitlementMiddleware detects expiry
  ├─ Returns 403 "Subscription expired"
  └─ User blocked from ALL feature-gated endpoints
```

---

## Scalability Roadmap

### Phase 0: Current (SQLite)
- **Database:** Single SQLite file
- **Throughput:** ~1K TPS
- **Tenants:** 1K–10K
- **Deployment:** Single server or serverless

### Phase 1: Add Redis Caching
```
Browser → API → Redis (Cache)
                   └─→ SQLite (Source of Truth)

Cache Layer:
  Key: "subscription:123"
  Value: { plan_id: 2, status: 'active', ... }
  TTL: 300 seconds

Invalidation:
  On subscription update: redis.del("subscription:123")

Benefits:
  • 80% cache hit rate = 10× speedup
  • TPS: 1K → 20K
```

### Phase 2: Read Replicas
```
Writes → Primary SQLite
Reads  → Replica SQLite (synced via WAL)

Load balancing:
  • Write requests → Primary
  • Read requests → Replica (round-robin)

Benefits:
  • 3× throughput (3 read replicas)
  • TPS: 20K → 30K
```

### Phase 3: Sharding by Tenant
```
Shard 1 (DB A) ← Tenants 1–1000
Shard 2 (DB B) ← Tenants 1001–2000
Shard 3 (DB C) ← Tenants 2001–3000

Shard Key:
  shard_id = tenant_id % num_shards

Benefits:
  • Linear scaling: N shards = N× throughput
  • TPS: 30K → UP TO 100K+
```

### Phase 4: Migrate to PostgreSQL
```
PostgreSQL + pgBouncer (connection pooling)
  ├─ Native replication
  ├─ Better performance at scale
  ├─ JSON columns for flexibility
  └─ Built-in geographic partitioning

Benefits:
  • Proven at 100K+ TPS
  • Better than SQLite for concurrent writes
```

---

## Security Model

### Defense in Depth

```
Layer 1: Network Level
  └─ TLS/HTTPS for all endpoints (enforced in production)

Layer 2: API Level
  ├─ CORS: Whitelist frontend domains only
  ├─ Rate Limiting: 100 req/min per IP (auth endpoints)
  └─ Content Security Policy: Prevent XSS

Layer 3: Authentication
  ├─ JWT signature validation (JWT_SECRET)
  ├─ Token expiration: 24 hours
  └─ Refresh tokens (future): For long sessions

Layer 4: Authorization
  ├─ Role checks: user | admin | superadmin
  ├─ Tenant isolation: WHERE tenant_id = req.user.tenant_id
  └─ Feature gates: entitlementMiddleware

Layer 5: Data Protection
  ├─ Passwords hashed: bcryptjs (10+ rounds)
  ├─ No plaintext PII in logs
  ├─ Backups encrypted at rest
  └─ Database: PRAGMA foreign_keys=ON

Layer 6: Audit Trail
  ├─ subscription_history: Every plan change recorded
  ├─ Timestamps: changed_at = CURRENT_TIMESTAMP
  └─ Immutable: Rows never updated, only inserted
```

### Common Attacks & Defenses

| Attack | Example | Defense |
|--------|---------|---------|
| **SQL Injection** | `' OR '1'='1` | Parameterized queries (db.get(..., [params])) |
| **Cross-Tenant Access** | Modify JWT tenant_id | Signature validation; database layer isolation |
| **Brute Force** | Try 1000 passwords | Rate limiting; account lockout (future) |
| **Privilege Escalation** | User tries to set role=admin | API checks req.user.role before update |
| **Race Condition** | Two requests same quota | ON CONFLICT DO UPDATE (atomic) |
| **XSS** | `<script>steal JWT</script>` | DOMPurify; Content-Security-Policy |

---

## Performance Characteristics

### Query Latency (p99)

| Query Type | Without Cache | With Redis | Notes |
|---|---|---|---|
| Get subscription | 10ms | 1ms | Cached for 5 min |
| Count projects | 5ms | N/A | Not cached (volatile) |
| List users (admin) | 8ms | N/A | Small result set |
| List all tenants (superadmin) | 20ms | N/A | Large result set |

### API Response Times (p99)

| Endpoint | Latency | Bottleneck |
|---|---|---|
| POST /auth/register | 150ms | bcryptjs hashing + DB writes |
| POST /projects | 50ms | Entitlement check + DB |
| GET /projects | 20ms | DB query + serialization |
| GET /subscriptions | 5ms | Redis cache hit |

### Database Indexes

```sql
-- Ensure all these exist:
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_usage_tracker_tenant_feature ON usage_tracker(tenant_id, feature_id);

-- Without these, queries degrade to O(n) full table scan
```

---

## Extensibility Points

### Adding a New Plan

```sql
-- 1. Insert plan
INSERT INTO plans (name, usage_limit) VALUES ('Standard', 50);

-- 2. Get its ID
SELECT id FROM plans WHERE name = 'Standard';  -- returns 4

-- 3. Assign features
INSERT INTO plan_features VALUES (4, 1);  -- Standard → CREATE_PROJECT
INSERT INTO plan_features VALUES (4, 2);  -- Standard → PREMIUM_DASHBOARD

-- 4. That's it!
-- Users can now upgrade to Standard via API
```

### Adding a New Feature

```sql
-- 1. Insert feature
INSERT INTO features (name) VALUES ('ADVANCED_REPORTING');

-- 2. Get its ID
SELECT id FROM features WHERE name = 'ADVANCED_REPORTING';  -- returns 3

-- 3. Assign to plans
INSERT INTO plan_features VALUES (2, 3);  -- Pro gets it
INSERT INTO plan_features VALUES (3, 3);  -- Enterprise gets it

-- 4. In code, check for it:
apiHandler = checkEntitlement('ADVANCED_REPORTING');
```

### Adding New Resource Type (Beyond Projects)

```javascript
// 1. Add table
CREATE TABLE insights (
  id INTEGER PRIMARY KEY,
  tenant_id INTEGER,
  name TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

// 2. Create feature
INSERT INTO features VALUES ('CREATE_INSIGHT');

// 3. Assign to plans
INSERT INTO plan_features VALUES (pro_id, insight_feature_id);

// 4. Create endpoint with entitlement check
router.post('/insights',
  authMiddleware,
  checkEntitlement('CREATE_INSIGHT', { countTable: 'insights' }),
  usageMiddleware('CREATE_INSIGHT'),
  insightController.create
);
```

---

## Testing Strategy

### Unit Tests (Models & Utilities)
```javascript
// Test tenantModel.createTenant
✓ should create new tenant
✓ should return existing tenant (case-insensitive)
✓ should prevent duplicates
```

### Integration Tests (Routes & Middleware)
```javascript
// Test POST /api/auth/register
✓ first user becomes admin
✓ second user is regular user
✓ auto-assign free plan
✓ same tenant name groups users

// Test POST /api/projects (entitlement)
✓ free user can create 3 projects
✓ free user blocked on 4th project
✓ pro user can create 10 projects
```

### Load Tests (Performance)
```javascript
// 100 concurrent requests
✓ no lost updates (usage counter = 100)
✓ latency < 100ms p99
✓ database remains consistent
```

---
