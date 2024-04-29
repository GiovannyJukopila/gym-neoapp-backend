const express = require('express');
const router = express.Router();
const {
  getAllPrepaidPackages,
  getAllPrepaidInactiveCards,
  getAllPrepaidActiveCards,
  getCardDetail,
  createPrepaidPackage,
  sendUnknownMemberAttendance,
  createUnknownMember,
  updateUnknownMember,
  deletePrepaidPackage,
  removeUnknownMemberCard,
  searchInactiveCardNumber,
  searchActiveCardNumber,
  refundUnknownMemberCard,
  renewprepaidpackage,
} = require('../controllers/unknownModuleController.js');
const verifyToken = require('../middlewares/authMiddleware');

router.get('/getallpackages', verifyToken, getAllPrepaidPackages);
router.get(
  '/getall/prepaidInactiveCards',
  verifyToken,
  getAllPrepaidInactiveCards
);
router.get('/searchInactiveCardNumber', searchInactiveCardNumber);
router.get('/getall/prepaidActiveCards', verifyToken, getAllPrepaidActiveCards);
router.get('/searchActiveCardNumber', searchActiveCardNumber);
router.get('/getCardDetail/:cardNumber', verifyToken, getCardDetail);
router.post('/createprepaidpackage', verifyToken, createPrepaidPackage);
router.post(
  '/sendUnknownMemberAttendance',
  verifyToken,
  sendUnknownMemberAttendance
);
router.post('/createUnknownMember', verifyToken, createUnknownMember);
router.post('/updateUnknownMember', verifyToken, updateUnknownMember);
router.post('/renewprepaidpackage', verifyToken, renewprepaidpackage);
router.post(
  '/refundUnknownMemberCard/:cardId',
  verifyToken,
  refundUnknownMemberCard
);
router.delete(
  '/removeUnknownMemberCard/:id',
  verifyToken,
  removeUnknownMemberCard
);
router.delete('/delete/:id', verifyToken, deletePrepaidPackage);

module.exports = router;
