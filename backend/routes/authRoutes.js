const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Register new user + tenant
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Get current user info
router.get('/user', authMiddleware, authController.getUser);

module.exports = router;