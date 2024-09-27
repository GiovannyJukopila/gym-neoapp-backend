const express = require('express');
const app = express();
const { db } = require('../firebase');

const getGymTimeZone = async (gymId) => {
  try {
    const gymDoc = await db.collection('gyms').doc(gymId).get();
    if (!gymDoc.exists) {
      throw new Error('Gym not found');
    }
    return gymDoc.data().gymTimeZone;
  } catch (error) {
    console.error('Error fetching gym time zone:', error.message);
    throw error;
  }
};

const getLocalTime = (currentDateTime, gymTimeZone) => {
  const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone);
  if (offsetMatch) {
    const offsetHours = parseFloat(offsetMatch[1]);

    return new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000);
  } else {
    throw new Error('Invalid time zone format.');
  }
};

const logUserPenalty = async (
  profileId,
  gymId,
  penaltyType, // Ej: "timeRestriction", "monetary"
  details, // Detalles sobre la penalización: monto monetario, días de restricción, etc.
  penaltyStatus,
  timestamp = new Date() // Usa la fecha actual si no se pasa un timestamp
) => {
  try {
    if (!profileId || !gymId || !penaltyType || !details) {
      throw new Error('Missing required fields');
    }

    // Obtener la zona horaria del gimnasio
    const gymTimeZone = await getGymTimeZone(gymId);

    // Ajustar la hora al huso horario del gimnasio
    const localTimestamp = getLocalTime(timestamp, gymTimeZone);

    const userPenaltiesCollection = db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties');

    const status = penaltyStatus ? 'active' : 'inactive';

    const penaltyLog = {
      penaltyType: penaltyType,
      details: details, // Ej: { amount: 50, unit: 'days' }
      timestamp: localTimestamp.toISOString(),
      status: status,
    };

    await userPenaltiesCollection.add(penaltyLog);
  } catch (error) {
    console.error('Error logging user penalty:', error.message);
  }
};

module.exports = { logUserPenalty };
