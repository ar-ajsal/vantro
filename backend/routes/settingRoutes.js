const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { protectAdmin } = require('../middleware/authMiddleware');

// Public route to get a setting
router.get('/:key', settingController.getSetting);

// Admin route to update a setting
router.put('/:key', protectAdmin, settingController.updateSetting);

module.exports = router;
