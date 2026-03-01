const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');
const { subscribe, getSubscription, getSubscriptionHistory } = require('../controllers/subscriptionController');

router.post('/subscribe', auth, subscribe);
router.get('/', auth, getSubscription);
router.get('/history', auth, getSubscriptionHistory); // returned list of past subscriptions

module.exports = router;