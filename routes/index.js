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
const dashboard = require('./dashboard.router');
const reports = require('./reports.router');

function routerApi(app) {
  const router = express.Router();
  app.use('/api/v1', router);
  router.use('/gyms', gymsRouter);
  router.use('/scan', scanRouter);
  router.use('/memberships', membershipRouter);
  router.use('/profiles', profileRouter); // To ways to use but this is easier to mantein
  router.use('/auth', authRouter);
  router.use('/classes', classesRouter);
  router.use('/notification', notificationRouter);
  router.use('/trainers', trainersRouter);
  router.use('/guests', guestsRouter);
  router.use('/dashboard', dashboard);
  router.use('/reports', reports);
}
module.exports = routerApi;
