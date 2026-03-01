const express = require('express');
const router = express.Router();

const auth = require('../middlewares/authMiddleware');
const checkEntitlement = require('../middlewares/entitlementMiddleware');
const { createProject, getProjects } = require('../controllers/projectController');

// create a project requires entitlement and also counts against the plan's project budget
router.post(
  '/',
  auth,
  checkEntitlement('CREATE_PROJECT', { usageCountTable: 'projects' }),
  createProject
);

router.get('/', auth, getProjects);

module.exports = router;