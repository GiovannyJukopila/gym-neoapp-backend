const { db } = require('../firebase');

/**
 * Logica compartida de renovaciones de membresia.
 *
 * Reglas de negocio (iguales en el endpoint de renovacion, en el lector de
 * tarjetas y en la tarea programada):
 *
 *  - Una renovacion queda EN COLA hasta que se cumplan las dos condiciones:
 *      1. el periodo actual del socio ya termino, y
 *      2. la fecha de inicio elegida por el socio ya llego.
 *  - Mientras siga en cola, el status del socio depende unicamente de su
 *    periodo ACTUAL: si pago hoy pero decidio empezar la semana que viene y su
 *    plan ya vencio, queda inactivo hasta ese dia.
 *  - Lo financiero no se ve afectado: el pago se registra el dia que se paga.
 */

// Normaliza cualquier formato de fecha guardado en Firestore a 'YYYY-MM-DD'
const normalizeDateString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
};

// Fecha de hoy en la zona horaria del gimnasio (ej: 'UTC+2')
const getGymToday = async (gymId) => {
  let offsetHours = 0;
  try {
    if (gymId) {
      const gymDoc = await db.collection('gyms').doc(gymId).get();
      const gymTimeZone = gymDoc.exists ? gymDoc.data().gymTimeZone : '';
      const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone || '');
      if (offsetMatch) {
        offsetHours = parseFloat(offsetMatch[1]) || 0;
      }
    }
  } catch (error) {
    console.error('Error reading the gym time zone:', error.message);
  }

  const localTime = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  return localTime.toISOString().slice(0, 10);
};

const stripUndefined = (data) =>
  Object.keys(data).reduce((acc, key) => {
    if (data[key] !== undefined) acc[key] = data[key];
    return acc;
  }, {});

/**
 * Indica si una renovacion en cola ya debe regir: el periodo actual termino y
 * la fecha de inicio elegida ya llego.
 */
const shouldApplyRenewalNow = (profileData, today) => {
  const renewal = profileData?.renewMembershipInQueue;
  if (!renewal || renewal.renewIsInQueue !== true) return false;
  if (profileData.profileFrozen === true) return false;

  const renewStartDate = normalizeDateString(renewal.profileRenewStartDate);
  // El nuevo periodo todavia no empieza: sigue en cola
  if (!renewStartDate || renewStartDate > today) return false;

  const currentEndDate = normalizeDateString(profileData.profileEndDate);
  // El periodo actual sigue vigente: la renovacion espera su turno
  return !currentEndDate || currentEndDate < today;
};

/**
 * Proyecta un renewMembershipInQueue sobre los campos del perfil, es decir,
 * deja la renovacion ya aplicada y el plan nuevo rigiendo.
 */
const buildProfileFromRenewal = (renewal, today) => {
  const renewEndDate = normalizeDateString(renewal.profileRenewEndDate);

  const appliedProfile = {
    profileStartDate: renewal.profileRenewStartDate,
    profileEndDate: renewal.profileRenewEndDate,
    membershipId: renewal.membership.value,
    profileLastMembershipPrice: renewal.profileRenewLastMembershipPrice,
    profileWasDiscount: renewal.profileRenewWasDiscount,
    profileWasComplementary: renewal.profileRenewWasComplementary,
    profileComplementaryReason: renewal.profileRenewComplementaryReason,
    profileDiscountType: renewal.profileRenewDiscountType,
    profileDiscountPercentage: renewal.profileRenewDiscountPercentage,
    profileDiscountValue: renewal.profileRenewDiscountValue,
    profileTotalReceive: renewal.profileRenewTotalReceive,
    // El nuevo periodo ya rige, asi que el socio queda activo (y se limpia
    // cualquier payment-issue anterior: acaba de pagar)
    profileStatus: renewEndDate && renewEndDate >= today ? 'true' : 'false',
    renewMembershipInQueue: {
      ...renewal,
      renewIsInQueue: false,
      renewAppliedDate: today,
    },
  };

  if (renewal.profileRenewIsCouple !== undefined) {
    appliedProfile.profileIsACouple = renewal.profileRenewIsCouple;
  }
  if (renewal.profileRenewCoupleName !== undefined) {
    appliedProfile.profileCoupleName = renewal.profileRenewCoupleName;
  }
  if (renewal.profileRenewCoupleEmail !== undefined) {
    appliedProfile.profileCoupleEmail = renewal.profileRenewCoupleEmail;
  }

  return stripUndefined(appliedProfile);
};

module.exports = {
  normalizeDateString,
  getGymToday,
  stripUndefined,
  shouldApplyRenewalNow,
  buildProfileFromRenewal,
};
