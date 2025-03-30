const express = require('express');
const router = express.Router();
const {
  getProducts,
  getMobileProducts,
  getMobileProductsByTarget,
  getAvailableColors,
  updateProductVisibility,
  sendEmailToPay,
} = require('../controllers/estoreController');
const verifyToken = require('../middlewares/authMiddleware');
router.get('/products', getProducts);
router.get('/mobileproducts', getMobileProducts);
router.get('/mobileproductsByTarget', getMobileProductsByTarget);
router.get('/:productId/available-colors', getAvailableColors);
router.put('/products/:productId/visibility', updateProductVisibility);
router.post('/sendEmailToPay', sendEmailToPay);

module.exports = router;
