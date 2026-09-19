const express = require('express');
const router = express.Router();
const {
  registerAdmin,
  loginAdmin,
  getSetting,
  saveSetting,
  registerPushToken,
  unregisterPushToken,
  testPushNotification
} = require('../controllers/adminController');
const { protectAdmin, requireRole } = require('../middleware/authMiddleware');

// Public: admin login only.
router.post('/login', loginAdmin);

// Protected: only an authenticated super admin can create new admin accounts.
// (The very first admin is created out-of-band via `node seedAdmin.js`.)
router.post('/register', protectAdmin, requireRole('super admin'), registerAdmin);

// Protected: admin settings (e.g. From Address for invoice dispatch)
router.get('/settings/:key', protectAdmin, getSetting);
router.put('/settings/:key', protectAdmin, saveSetting);

// Protected: push notifications (FCM device token management & testing)
router.post('/notifications/register', protectAdmin, registerPushToken);
router.post('/notifications/unregister', protectAdmin, unregisterPushToken);
router.post('/notifications/test', protectAdmin, testPushNotification);

module.exports = router;
