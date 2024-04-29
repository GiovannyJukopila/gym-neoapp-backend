const express = require('express');
const {
  getAllCourts,
  getClass,
  getTrainers,
  addParticipants,
  createCourt,
  updateCourt,
  deleteCourt,
  createSession,
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
router.get('/todaysCourts/:gymId', verifyToken, getTodaysCourts);

router.post('/create', verifyToken, createCourt);
router.post('/createSession', verifyToken, createSession);
router.post('/update', verifyToken, updateCourt);
router.post('/updateSession', verifyToken, updateSession);
router.delete('/delete/:id', verifyToken, deleteCourt);
router.delete('/deleteSession/:id', verifyToken, deleteSession);
module.exports = router;
