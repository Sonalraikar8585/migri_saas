const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const adminOnly = require('../middlewares/adminMiddleware');
const superAdminOnly = require('../middlewares/superAdminMiddleware');
const {
  addPlan,
  listPlans,
  addFeature,
  listFeatures,
  mapFeatureToPlan,
} = require('../controllers/planController');
const {
  listUsers,
  addUser,
  modifyUser,
  removeUser,
  listTenants,
  getTenantDetails,
} = require('../controllers/adminController');

// plan management (admin only)
router.get('/plans', auth, listPlans);
router.post('/plans', auth, adminOnly, addPlan);

// features endpoints (admin only)
router.get('/features', auth, adminOnly, listFeatures);
router.post('/features', auth, adminOnly, addFeature);

// assign a feature to a plan (admin only)
router.post('/plans/:planId/features', auth, adminOnly, mapFeatureToPlan);

// user management (tenant admins or superadmins)
router.get('/users', auth, adminOnly, listUsers);
router.post('/users', auth, adminOnly, addUser);
router.put('/users/:id', auth, adminOnly, modifyUser);
router.delete('/users/:id', auth, adminOnly, removeUser);

// platform-level views (superadmin only)
router.get('/platform/users', auth, superAdminOnly, listUsers); // same handler returns all users when superadmin
router.get('/platform/tenants', auth, superAdminOnly, listTenants);
router.get('/platform/tenants/:id', auth, superAdminOnly, getTenantDetails);

module.exports = router;
