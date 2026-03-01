require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { init, db } = require('./models/db'); // ✅ Correct import (db used for seeding)

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const planRoutes = require('./routes/planRoutes');
const authMiddleware = require('./middlewares/authMiddleware');
const authController = require('./controllers/authController');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/admin', planRoutes); // simple admin namespace for plan/feature management

// Get current user
app.get('/api/user', authMiddleware, authController.getUser);
// extra convenience: return tenant/organization info
app.get('/api/tenant', authMiddleware, authController.getTenant);

// Initialize DB tables
init(); // ✅ Properly call init()
// create a default superadmin account if one does not exist
 db.get(`SELECT id FROM users WHERE role = 'superadmin' LIMIT 1`, [], (err, row) => {
   if (err) {
     console.warn('error checking for superadmin user', err.message);
     return;
   }
   if (!row) {
     const bcrypt = require('bcryptjs');
     const superEmail = process.env.SUPERADMIN_EMAIL || 'superadmin@cloudflow.com';
     const superPassword = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!';
     const hashed = bcrypt.hashSync(superPassword, 10);
     // tenant_id left NULL for platform-wide account
     db.run(
       `INSERT INTO users (tenant_id, name, email, password, role) VALUES (NULL, ?, ?, ?, 'superadmin')`,
       ['Platform Owner', superEmail, hashed],
       (err) => {
         if (err) console.warn('failed to insert superadmin user', err.message);
         else console.log('✔️ default superadmin user created:', superEmail);
       }
     );
   }
 });
// NOTE: we only auto-create a superadmin account. tenants and normal admins
// are managed by the platform owner via the UI or API, no hardcoded defaults.
// the old `admin@cloudflow.com` seed was removed per requirements. the only
// remaining default is the superadmin above.


// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});