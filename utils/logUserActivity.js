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

const logUserActivity = async (
  profileId,
  gymId,
  action, // Ej: "classCancellation", "booking", etc.
  affectedClasses = [], // Clases afectadas por la acción
  timestamp = new Date() // Usa la fecha actual si no se pasa un timestamp
) => {
  try {
    if (!profileId || !gymId || !action) {
      throw new Error('Missing required fields');
    }

    // Obtener la zona horaria del gimnasio
    const gymTimeZone = await getGymTimeZone(gymId);

    // Ajustar la hora al huso horario del gimnasio
    const localTimestamp = getLocalTime(timestamp, gymTimeZone);

    const userActivityCollection = db
      .collection('profiles')
      .doc(profileId)
      .collection('userActivity');

    const activityLog = {
      action: action,
      affectedClasses: Array.isArray(affectedClasses) ? affectedClasses : [],
      timestamp: localTimestamp.toISOString(),
    };

    await userActivityCollection.add(activityLog);
  } catch (error) {
    console.error('Error logging user activity:', error.message);
  }
};

module.exports = { logUserActivity };
