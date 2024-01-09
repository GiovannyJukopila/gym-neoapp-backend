const express = require('express');
const router = express.Router();
const {
  getAllFinancial,
  getFinancialPayment,
  updateFinancial,
} = require('../controllers/financialController');
const verifyToken = require('../middlewares/authMiddleware');

router.get('/get/all', verifyToken, getAllFinancial);
router.get('/payment/:paymentId', verifyToken, getFinancialPayment);
router.post('/payment/adjustment/:paymentId', verifyToken, updateFinancial);

module.exports = router;
