const express = require('express');
const router = express.Router();
const {
  getActivity,
  getActivityStaff,
} = require('../controllers/activityController');
const { requireStaff, requireMaster } = require('../middlewares/staffAuth');

// Actividad del staff: solo la ve un Master Admin
router.get('/', requireStaff(), requireMaster, getActivity);
router.get('/staff', requireStaff(), requireMaster, getActivityStaff);

module.exports = router;
