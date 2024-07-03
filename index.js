const express = require('express');
const routerApi = require('./routes');
const app = express();
const cron = require('node-cron');
const {
  setInactiveMembers,
  updateTotalAmountByMonth,
  getCurrentMembersByMemberships,
} = require('./controllers/dashboardController');
const port = process.env.PORT || 3000;
const path = require('path');

const gymIds = ['gym-test', 'marriot-1'];

cron.schedule('0 0 * * *', async () => {
  try {
    for (const gymId of gymIds) {
      await setInactiveMembers(gymId);
      await updateTotalAmountByMonth(gymId);
      await getCurrentMembersByMemberships(gymId);
    }
  } catch (error) {
    console.error('Error al ejecutar la tarea:', error);
  }
});

const cors = require('cors');
require('dotenv').config();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(cors());

app.use(express.json());

app.use('/api/', routerApi);

app.listen(port, () => {
  console.log('NeoApp Server is ON');
});
