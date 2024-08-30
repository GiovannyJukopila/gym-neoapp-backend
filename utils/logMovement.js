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

const logMovement = async (
  profileId,
  gymId,
  section,
  action,
  affectedClasses = [], // Usa un valor predeterminado vacío si no se pasa un arreglo
  affectedProfiles = [],
  timestamp = new Date() // Usa la fecha actual si no se pasa un timestamp
) => {
  try {
    if (!profileId || !gymId || !section || !action) {
      throw new Error('Missing required fields');
    }

    // Obtener la zona horaria del gimnasio
    const gymTimeZone = await getGymTimeZone(gymId);

    // Ajustar la hora al huso horario del gimnasio
    const localTimestamp = getLocalTime(timestamp, gymTimeZone);

    const movementsCollection = db.collection('activityLogs');

    const movementLog = {
      profileId: profileId,
      gymId: gymId,
      section: section,
      action: action,
      affectedClasses: Array.isArray(affectedClasses) ? affectedClasses : [], // Asegúrate de que affectedClasses sea un arreglo
      affectedProfiles: Array.isArray(affectedProfiles) ? affectedProfiles : [],
      timestamp: localTimestamp.toISOString(),
    };

    await movementsCollection.add(movementLog);
  } catch (error) {
    console.error('Error logging movement:', error.message);
  }
};

module.exports = { logMovement };
