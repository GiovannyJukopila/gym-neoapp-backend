const express = require('express');
const router = express.Router();
const {
  getlogIn,
  validateEmail,
  validateCode,
  validateAdminCode,
  submitForm,
  reSendVerificationCode,
} = require('../controllers/authController');

router.post('/', getlogIn);
router.post('/validateEmail', validateEmail);
router.post('/validateCode', validateCode);
router.post('/validateAdminCode', validateAdminCode);
router.post('/reSendVerificationCode', reSendVerificationCode);
router.post('/submitForm', submitForm);

module.exports = router;
