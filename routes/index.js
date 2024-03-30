const express = require('express');

const profileRouter = require('./profiles.router');
const authRouter = require('./auth.router');
const classesRouter = require('./classes.router');
const membershipRouter = require('./memberships.router');
const scanRouter = require('./scan.router');
const gymsRouter = require('./gyms.router');
const notificationRouter = require('./notification.router');
const trainersRouter = require('./trainers.router');
const guestsRouter = require('./guests.router');
const dashboardRouter = require('./dashboard.router');
const reportsRouter = require('./reports.router');
const financialRouter = require('./financial.router');
const adminsRouter = require('./admins.router');
const courtsRouter = require('./courts.router');
const supportRouter = require('./support.router');

const router = express.Router();
//app.use('/api/v1', router);
router.use('/gyms', gymsRouter);
router.use('/scan', scanRouter);
router.use('/memberships', membershipRouter);
router.use('/profiles', profileRouter); // To ways to use but this is easier to mantein
router.use('/auth', authRouter);
router.use('/classes', classesRouter);
router.use('/notification', notificationRouter);
router.use('/trainers', trainersRouter);
router.use('/admins', adminsRouter);
router.use('/guests', guestsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/reports', reportsRouter);
router.use('/financial', financialRouter);
router.use('/courts', courtsRouter);
router.use('/support', supportRouter);

module.exports = router;
