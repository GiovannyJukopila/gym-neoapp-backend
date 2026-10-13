const express = require('express');
const routerApi = require('./routes');
const app = express();
const cron = require('node-cron');
const pushNotificationRouter = require('./routes/pushNotification.router');

const {
  setInactiveMembers,
  updateTotalAmountByMonth,
  getCurrentMembersByMemberships,
} = require('./controllers/dashboardController');

const {
  penalizeNoShows,
  checkAndDeactivatePenalties,
} = require('./controllers/userInterfaceController');

const { db } = require('./firebase');
const port = process.env.PORT || 3000;
const path = require('path');

// Los ids de los gimnasios son los ids de documento de la coleccion 'gyms'.
// Se leen en cada ejecucion, asi un gimnasio nuevo entra en la tarea sin
// necesidad de volver a desplegar. select() sin campos trae solo las
// referencias, que es la lectura mas barata.
const getAllGymIds = async () => {
  const gymsSnapshot = await db.collection('gyms').select().get();
  return gymsSnapshot.docs.map((doc) => doc.id);
};

// La tarea diaria solo se programa si se pide explicitamente con
// ENABLE_CRON=true. Por defecto esta apagada para que un servidor local
// (que apunta a la MISMA base de datos que produccion) no la ejecute en
// paralelo con el desplegado: penalizeNoShows no es idempotente y duplicaria
// los no-shows de los socios.
const cronEnabled = process.env.ENABLE_CRON === 'true';

if (!cronEnabled) {
  console.log('[cron] disabled (set ENABLE_CRON=true to enable it)');
}

// Tarea diaria de membresias y cierre del dia.
// Se programa en UTC para que el horario no dependa de donde corra el servidor;
// cada gimnasio resuelve su propia fecha local con su gymTimeZone.
const dailyJob = cron.schedule(
  '0 0 * * *',
  async () => {
    console.log('[cron] Daily membership job started');

    let gymIds = [];
    try {
      gymIds = await getAllGymIds();
    } catch (error) {
      console.error('[cron] Could not read the gyms collection:', error.message);
      return;
    }

    if (!gymIds.length) {
      console.warn('[cron] No gyms found, nothing to process');
      return;
    }

    console.log(`[cron] Processing ${gymIds.length} gym(s):`, gymIds.join(', '));

    for (const gymId of gymIds) {
      try {
        const summary = await setInactiveMembers(gymId);
        console.log('[cron] memberships updated', summary);

        await updateTotalAmountByMonth(gymId);
        await getCurrentMembersByMemberships(gymId);
        await penalizeNoShows(gymId);
        await checkAndDeactivatePenalties(gymId);
      } catch (error) {
        // Un gimnasio que falle no debe abortar los demas
        console.error(`[cron] Error processing gym ${gymId}:`, error.message);
      }
    }

    console.log('[cron] Daily membership job finished');
  },
  { timezone: 'UTC', scheduled: cronEnabled }
);

if (cronEnabled) {
  console.log('[cron] Daily membership job scheduled at 00:00 UTC');
}

const cors = require('cors');
require('dotenv').config();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(cors());

app.use(express.json());

// app.use('/api/pushNotifications', pushNotificationRouter);

app.use('/api/', routerApi);

app.listen(port, () => {
  console.log('NeoApp Server is ON');
});
