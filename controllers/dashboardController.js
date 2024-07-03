const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const Profile = require('../models/profile');
const {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  isValid,
  isWithinInterval,
} = require('date-fns');
const admin = require('firebase-admin');

const getTotalMembers = async (req, res) => {
  try {
    const { gymId } = req.params; // Asumiendo que gymId está en los parámetros de la solicitud

    // Obtener la fecha actual y las fechas para el último mes y la última semana
    const currentDate = new Date();
    const lastMonthDate = new Date();
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastWeekDate = new Date();
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);

    // Convertir las fechas a formato 'YYYY-MM-DD'
    const currentDateStr = currentDate.toISOString().split('T')[0];
    const lastMonthDateStr = lastMonthDate.toISOString().split('T')[0];
    const lastWeekDateStr = lastWeekDate.toISOString().split('T')[0];

    // Consulta para el total de miembros
    const totalMembersSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'member')
      .get();
    const totalMembers = [];
    totalMembersSnapshot.forEach((doc) => {
      totalMembers.push(doc.data());
    });

    // Consulta para el total de miembros en el último mes
    const lastMonthMembersSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'member')
      .where('profileStartDate', '>=', lastMonthDateStr)
      .get();
    const lastMonthMembers = [];
    lastMonthMembersSnapshot.forEach((doc) => {
      lastMonthMembers.push(doc.data());
    });

    // Consulta para el total de miembros en la última semana
    const lastWeekMembersSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'member')
      .where('profileStartDate', '>=', lastWeekDateStr)
      .get();
    const lastWeekMembers = [];
    lastWeekMembersSnapshot.forEach((doc) => {
      lastWeekMembers.push(doc.data());
    });

    res.status(200).json({
      totalMembers: totalMembers.length,
      totalMembersPerLastMonth: lastMonthMembers.length,
      totalMembersPerLastWeek: lastWeekMembers.length,
    });
  } catch (error) {
    console.error('Error al contar miembros:', error);
    res.status(500).json({ error: 'Error al contar miembros' });
  }
};

// const getCurrentMembersByMemberships = async (req, res) => {
//   try {
//     const { gymId } = req.params;
//     const profilesRef = db.collection('paymentHistory');
//     const snapshot = await profilesRef.where('gymId', '==', gymId).get();

//     const gymSnapshot = await admin
//       .firestore()
//       .collection('gyms')
//       .doc(gymId)
//       .get();
//     const gymData = gymSnapshot.data();
//     const gymTimeZone = gymData.gymTimeZone;
//     const utcOffset = getUtcOffset(gymTimeZone);

//     const utcDate = new Date();
//     const localTimeInMilliseconds = utcDate.getTime() - utcOffset * 60 * 1000;

//     const currentDate = new Date(localTimeInMilliseconds);
//     currentDate.setUTCHours(0, 0, 0, 0);

//     const dateString = currentDate.toISOString().split('T')[0];

//     const userCountsByMembership = {};
//     const membershipMap = {};

//     // Obtener el mapeo de membershipId a planName
//     const membershipsSnapshot = await db
//       .collection('memberships')
//       .where('gymId', '==', gymId)
//       .get();
//     membershipsSnapshot.forEach((membershipDoc) => {
//       const membershipData = membershipDoc.data();
//       const membershipId = membershipDoc.id;
//       const planName = membershipData.planName;
//       membershipMap[membershipId] = planName;

//       // Inicializar todos los recuentos a 0
//       userCountsByMembership[planName] = 0;
//     });

//     const profilesCollection = db.collection('profiles');
//     const promises = [];

//     snapshot.forEach(async (doc) => {
//       try {
//         const profileData = doc.data();
//         const profileId = profileData.profileId;
//         const membershipId = profileData.membershipId;
//         const planName = membershipMap[membershipId];

//         // Verificar si planName es undefined
//         if (planName === undefined) {
//           console.warn(
//             `No se encontró un planName para el membershipId: ${membershipId}`
//           );
//           return; // Salir del bucle para este documento si no hay planName
//         }

//         const startDate = profileData.paymentStartDate;
//         const endDate = profileData.paymentEndDate;

//         const promise = profilesCollection
//           .doc(profileId)
//           .get()
//           .then((profileDoc) => {
//             if (profileDoc.exists) {
//               const profileStatus = profileDoc.data().profileStatus;

//               // Verificar si profileStatus es true y el pago intersecta con el mes actual
//               if (
//                 profileStatus === true &&
//                 startDate <= dateString &&
//                 endDate >= dateString
//               ) {
//                 userCountsByMembership[planName] =
//                   (userCountsByMembership[planName] || 0) + 1;
//               }
//             } else {
//               console.warn(
//                 `El documento del perfil con ID ${profileId} no existe`
//               );
//             }
//           })
//           .catch((error) => {
//             console.error(
//               `Error procesando el perfil con ID ${profileId}:`,
//               error
//             );
//           });

//         promises.push(promise);
//       } catch (error) {
//         console.error('Error procesando perfiles:', error);
//       }
//     });

//     // Esperar a que todas las promesas se resuelvan antes de enviar la respuesta
//     await Promise.all(promises);

//     res.status(200).json(userCountsByMembership);
//   } catch (error) {
//     console.error('Error fetching profiles:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

const getUtcOffset = (timeZoneStr) => {
  const sign = timeZoneStr.includes('-') ? -1 : 1;
  const offsetStr = timeZoneStr.split(/[\+\-]/)[1];
  return parseInt(offsetStr, 10) * sign;
};

const getCheckInReport = async (req, res) => {
  const { gymId } = req.params;
  const checkInRef = db.collection('accessHistory');

  try {
    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;
    const utcOffset = getUtcOffset(gymTimeZone);

    const utcDate = new Date();
    const localTimeInMilliseconds = utcDate.getTime() - utcOffset * 60 * 1000;

    const currentDate = new Date(localTimeInMilliseconds);
    currentDate.setUTCHours(0, 0, 0, 0);

    const dateString = currentDate.toISOString().split('T')[0];

    const startOfDay = new Date(`${dateString}T00:00:00`);
    const endOfDay = new Date(`${dateString}T23:59:59.999`);

    const todayCheckinsQuery = await admin
      .firestore()
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-in')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    let totalCheckInsToday = 0;

    let totalCheckOutsToday = 0;

    if (!todayCheckinsQuery.empty) {
      totalCheckInsToday = todayCheckinsQuery.size;
    }

    const todayCheckOutsQuery = await admin
      .firestore()
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-out')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    if (!todayCheckOutsQuery.empty) {
      totalCheckOutsToday = todayCheckOutsQuery.size;
    }

    const responseData = {
      totalCheckOutsToday,
      totalCheckInsToday, // Corregido el nombre de la variable aquí
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error al obtener los datos:', error);
    res
      .status(500)
      .json({ error: 'Ocurrió un error al procesar la solicitud.' });
  }
};

const getUtcOffsetInMilliseconds = (timeZoneStr) => {
  const sign = timeZoneStr.includes('-') ? -1 : 1;
  const offsetStr = timeZoneStr.split(/[\+\-]/)[1];
  const offsetInMinutes = parseInt(offsetStr, 10);
  return offsetInMinutes * sign * 60 * 1000;
};

const getPaymentReport = async (req, res) => {
  const { gymId } = req.params;
  const paymentRef = db.collection('paymentHistory');

  try {
    const gymSnapshot = await db.collection('gyms').doc(gymId).get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;

    const utcOffset = getUtcOffsetInMilliseconds(gymTimeZone);

    const utcDate = new Date();
    const localTimeInMilliseconds = utcDate.getTime() + utcOffset;

    const now = new Date(localTimeInMilliseconds);
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

    const snapshot = await paymentRef.where('gymId', '==', gymId).get();

    let totalPaymentsLastSevenDays = 0;
    let totalPaymentsToday = 0;

    snapshot.forEach((doc) => {
      const paymentType = doc.data().paymentType;
      let paymentDate;

      if (paymentType === 'new') {
        paymentDate = new Date(doc.data().paymentDate).getTime() + utcOffset;
      } else if (paymentType === 'renew') {
        paymentDate = new Date(doc.data().renewDate).getTime() + utcOffset;
      } else {
        return;
      }

      if (
        paymentDate >= now.getTime() - 7 * 24 * 60 * 60 * 1000 &&
        paymentDate <= now.getTime()
      ) {
        totalPaymentsLastSevenDays += parseFloat(doc.data().paymentAmount);
      }

      if (
        paymentDate >= todayStart.getTime() &&
        paymentDate < todayEnd.getTime()
      ) {
        totalPaymentsToday += parseFloat(doc.data().paymentAmount);
      }
    });

    const responseData = {
      totalPaymentsLastSevenDays,
      totalPaymentsToday,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching data:', error);
    res
      .status(500)
      .json({ error: 'An error occurred processing the request.' });
  }
};

const getGuestReport = async (req, res) => {
  const { gymId } = req.params;
  const guestsRef = db.collection('guests');

  try {
    const snapshot = await guestsRef.where('gymId', '==', gymId).get();

    const now = new Date(); // Fecha actual
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ); // Inicio del día actual
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    ); // Fin del día actual
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000; // Hace 7 días en milisegundos

    let totalGuestsLastSevenDays = 0;
    let totalGuestsToday = 0;

    snapshot.forEach((doc) => {
      const currentDate = new Date(doc.data().currentDate).getTime();

      if (currentDate >= sevenDaysAgo && currentDate <= now.getTime()) {
        totalGuestsLastSevenDays++;
      }

      if (
        currentDate >= todayStart.getTime() &&
        currentDate < todayEnd.getTime()
      ) {
        totalGuestsToday++;
      }
    });

    // Enviar los datos recopilados al frontend
    const responseData = {
      totalGuestsLastSevenDays,
      totalGuestsToday,
    };

    res.status(200).json(responseData);
  } catch (error) {
    // Manejo de errores
    console.error('Error al obtener los datos de invitados:', error);
    res
      .status(500)
      .json({ error: 'Ocurrió un error al procesar la solicitud.' });
  }
};

const getCurrentMembersByMemberships = async (gymId) => {
  try {
    const profilesRef = db.collection('profiles');
    const snapshot = await profilesRef
      .where('gymId', '==', gymId)
      .where('profileStatus', '==', 'true')
      .get();

    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;
    const utcOffset = getUtcOffset(gymTimeZone);

    const utcDate = new Date();
    const localTimeInMilliseconds = utcDate.getTime() - utcOffset * 60 * 1000;

    const currentDate = new Date(localTimeInMilliseconds);
    currentDate.setUTCHours(0, 0, 0, 0);

    const dateString = currentDate.toISOString().split('T')[0];

    const membershipTotals = {};

    // Obtener el mapeo de membershipId a planName
    const membershipsSnapshot = await db
      .collection('memberships')
      .where('gymId', '==', gymId)
      .get();
    membershipsSnapshot.forEach((membershipDoc) => {
      const membershipData = membershipDoc.data();
      const membershipId = membershipDoc.id;
      membershipTotals[membershipId] = 0; // Inicializar total de miembros para cada membresía
    });

    const profilesCollection = db.collection('profiles');
    const promises = [];
    snapshot.forEach(async (doc) => {
      try {
        const profileData = doc.data();
        const profileId = profileData.profileId;
        const membershipId = profileData.membershipId;

        // Verificar si membershipId es undefined
        if (membershipTotals[membershipId] === undefined) {
          console.warn(
            `No se encontró un membershipId válido: ${membershipId}`
          );
          return; // Salir del bucle para este documento si no hay membershipId válido
        }

        const startDate = profileData.profileStartDate;
        const endDate = profileData.profileEndDate;

        const promise = profilesCollection
          .doc(profileId)
          .get()
          .then((profileDoc) => {
            if (profileDoc.exists) {
              membershipTotals[membershipId]++; // Incrementar total de miembros para la membresía actual
            } else {
              console.warn(
                `El documento del perfil con ID ${profileId} no existe`
              );
            }
          })
          .catch((error) => {
            console.error(
              `Error procesando el perfil con ID ${profileId}:`,
              error
            );
          });

        promises.push(promise);
      } catch (error) {
        console.error('Error procesando perfiles:', error);
      }
    });
    await Promise.all(promises);

    const membershipsToUpdate = [];

    membershipsSnapshot.forEach((membershipDoc) => {
      const membershipData = membershipDoc.data();
      const membershipId = membershipDoc.id;

      if (membershipTotals[membershipId] !== undefined) {
        membershipsToUpdate.push({
          id: membershipId,
          data: {
            currentTotalMembers: membershipTotals[membershipId],
          },
        });
      } else {
        console.warn(`No se encontró un total válido para ${membershipId}`);
      }
    });

    const updatePromises = membershipsToUpdate.map(async (membership) => {
      await db
        .collection('memberships')
        .doc(membership.id)
        .update(membership.data);
    });

    await Promise.all(updatePromises);

    const updatedMembershipTotals = membershipsToUpdate.map((membership) => ({
      membershipId: membership.id,
      currentTotalMembers: membership.data.currentTotalMembers,
    }));

    return updatedMembershipTotals;
  } catch (error) {
    console.error('Error fetching profiles:', error);
    throw new Error('Internal server error');
  }
};

const setInactiveMembers = async (gymId) => {
  try {
    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;
    const utcOffset = getUtcOffset(gymTimeZone);

    const utcDate = new Date();
    const localTimeInMilliseconds = utcDate.getTime() - utcOffset * 60 * 1000;

    const currentDate = new Date(localTimeInMilliseconds);
    currentDate.setUTCHours(0, 0, 0, 0);

    const dateString = currentDate.toISOString().split('T')[0];

    // Obtener los perfiles en la colección de perfiles para el gimnasio específico
    const profilesSnapshot = await admin
      .firestore()
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'member')
      .get();

    const batch = admin.firestore().batch();
    profilesSnapshot.forEach(async (doc) => {
      const profileData = doc.data();
      const profileFrozen = profileData.profileFrozen || false;
      const profileEndDate = profileData.profileEndDate; // asumiendo que profileEndDate es una cadena
      const renewEndDate =
        profileData.renewMembershipInQueue?.profileRenewEndDate; // asumiendo que renewMembershipInQueue es un objeto opcional
      const profileRef = admin.firestore().collection('profiles').doc(doc.id);

      if (profileFrozen) {
        // No actualizar perfiles congelados
        return;
      }
      // Verificar si renewMembershipInQueue existe y renewIsInQueue es falso
      let profileStatus = 'false';

      if (
        profileData.renewMembershipInQueue &&
        profileData.renewMembershipInQueue.renewIsInQueue
      ) {
        profileStatus =
          profileData.renewMembershipInQueue.profileRenewEndDate > dateString
            ? 'true'
            : 'false';

        const renewMembershipInQueue = profileData.renewMembershipInQueue;

        // Realiza los cambios en profileData utilizando los valores de renewMembershipInQueue
        profileData.profileEndDate = renewMembershipInQueue.profileRenewEndDate;
        profileData.membershipId = renewMembershipInQueue.membership.value;
        profileData.profileLastMembershipPrice =
          renewMembershipInQueue.profileRenewLastMembershipPrice;
        profileData.profileWasDiscount =
          renewMembershipInQueue.profileRenewWasDiscount;
        profileData.profileWasComplementary =
          renewMembershipInQueue.profileRenewWasComplementary;
        profileData.profileComplementaryReason =
          renewMembershipInQueue.profileRenewComplementaryReason;
        profileData.profileDiscountType =
          renewMembershipInQueue.profileRenewDiscountType;
        profileData.profileDiscountPercentage =
          renewMembershipInQueue.profileRenewDiscountPercentage;
        profileData.profileDiscountValue =
          renewMembershipInQueue.profileRenewDiscountValue;
        profileData.profileTotalReceive =
          renewMembershipInQueue.profileRenewTotalReceive;
        profileData.renewMembershipInQueue.renewIsInQueue = false;
        profileData.profileStartDate =
          renewMembershipInQueue.profileRenewStartDate;
        if (renewMembershipInQueue.profileRenewIsCouple !== undefined) {
          profileData.profileIsACouple =
            renewMembershipInQueue.profileRenewIsCouple;
        }

        // Verifica si el campo existe antes de intentar establecerlo
        if (renewMembershipInQueue.profileRenewCoupleName !== undefined) {
          profileData.profileCoupleName =
            renewMembershipInQueue.profileRenewCoupleName;
        }

        // Verifica si el campo existe antes de intentar establecerlo
        if (renewMembershipInQueue.profileRenewCoupleEmail !== undefined) {
          profileData.profileRenewCoupleEmail =
            renewMembershipInQueue.profileRenewCoupleEmail;
        }
        batch.update(doc.ref, profileData);
        // Elimina la propiedad renewMembershipInQueue
        //delete profileData.renewMembershipInQueue;

        // Guarda los cambios en la base de datos (suponiendo que profilesRef es tu referencia a la base de datos)
        await doc.ref.set(profileData, { merge: true });
      } else {
        profileStatus = profileEndDate >= dateString ? 'true' : 'false';
        batch.update(profileRef, { profileStatus });
      }

      // Actualizar el estado del perfil en el lote
    });

    // Ejecutar la actualización en lote
    await batch.commit();
  } catch (error) {
    console.error('Error al actualizar perfiles:', error);
    throw new Error('Error interno del servidor');
  }
};

const updateTotalAmountByMonth = async (gymId) => {
  try {
    const paymentHistoryRef = db.collection('paymentHistory');
    const snapshot = await paymentHistoryRef.where('gymId', '==', gymId).get();

    const totalAmountByMonth = {};
    const gymRef = db.collection('gyms').doc(gymId);

    snapshot.forEach((doc) => {
      const paymentData = doc.data();
      const paymentDate = paymentData.paymentDate;
      const amount = paymentData.paymentAmount;

      // Intentar crear un objeto Date
      const dateObject = new Date(paymentDate);

      // Verificar si la fecha es válida antes de formatearla
      if (isValid(dateObject)) {
        const monthYearKey = format(dateObject, 'yyyy-MM');

        if (!totalAmountByMonth[monthYearKey]) {
          totalAmountByMonth[monthYearKey] = 0;
        }

        totalAmountByMonth[monthYearKey] += amount;
      } else {
        console.warn(`Fecha no válida: ${paymentDate}`);
      }
    });

    await gymRef.update({
      totalAmountByMonth: totalAmountByMonth,
    });

    return totalAmountByMonth;
  } catch (error) {
    console.error('Error fetching payments:', error);
    throw new Error('Internal server error');
  }
};

module.exports = {
  getTotalMembers,
  getCurrentMembersByMemberships,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
  setInactiveMembers,
  updateTotalAmountByMonth,
};
