const express = require('express');
const {
  getAllCourts,
  getClass,
  getTrainers,
  addParticipants,
  getCourtsByDate,
  createCourt,
  updateCourt,
  deleteCourt,
  createSession,
  createSessionAsMember,
  createCourtAsUnknownMember,
  getallSession,
  updateSession,
  deleteSession,
  getTodaysCourts,
  removeParticipant,
  cancelClass,
} = require('../controllers/courtsController');
const verifyToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/getall', verifyToken, getAllCourts);
router.get('/getallSession', verifyToken, getallSession);
router.get('/getCourtsByDate', verifyToken, getCourtsByDate);
router.get('/todaysCourts/:gymId', verifyToken, getTodaysCourts);

router.post('/create', verifyToken, createCourt);
router.post('/createSession', verifyToken, createSession);
router.post('/createSessionAsMember', verifyToken, createSessionAsMember);
router.post(
  '/createCourtAsUnknownMember',
  verifyToken,
  createCourtAsUnknownMember
);
router.post('/update', verifyToken, updateCourt);
router.post('/updateSession', verifyToken, updateSession);
router.delete('/delete/:id', verifyToken, deleteCourt);
router.delete('/deleteSession/:id', verifyToken, deleteSession);
module.exports = router;
