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
const {
  normalizeDateString,
  getGymToday,
  shouldApplyRenewalNow,
  buildProfileFromRenewal,
} = require('../utils/membershipRenewal');

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

    // Solo necesitamos el numero de accesos, no los documentos: count() se
    // factura como una lectura por cada 1000 entradas de indice, mientras que
    // traer los documentos cuesta una lectura por cada uno. Usa el mismo indice
    // que la consulta anterior, asi que no hace falta crear ninguno.
    const countAccessesToday = async (action) => {
      const snapshot = await db
        .collection('accessHistory')
        .where('gymId', '==', gymId)
        .where('action', '==', action)
        .where('timestamp', '>=', startOfDay)
        .where('timestamp', '<=', endOfDay)
        .count()
        .get();

      return snapshot.data().count || 0;
    };

    const [totalCheckInsToday, totalCheckOutsToday] = await Promise.all([
      countAccessesToday('check-in'),
      countAccessesToday('check-out'),
    ]);

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

    // Antes se leia la coleccion paymentHistory COMPLETA del gimnasio en cada
    // apertura del dashboard (miles de documentos) para acabar sumando solo los
    // de los ultimos 7 dias. Ahora se acota la consulta a esa ventana.
    //
    // La consulta por paymentDate filtra por gymId porque ya existe el indice
    // compuesto (gymId + paymentDate). La de renewDate no tiene indice
    // compuesto, asi que usa el indice automatico de un solo campo y descarta
    // los otros gimnasios en memoria: en una ventana de 7 dias son unas pocas
    // decenas de documentos. Si llega a crecer, basta crear el indice
    // (gymId + renewDate) y añadirle el .where('gymId', '==', gymId).
    //
    // Se piden 9 dias en lugar de 7 para no perder ningun documento por el
    // desplazamiento de zona horaria; el filtro exacto sigue siendo el de abajo.
    const windowStartDate = new Date(
      localTimeInMilliseconds - 9 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

    // Los pagos de tipo 'renew' se fechan por renewDate, el resto por
    // paymentDate, asi que hacen falta las dos consultas
    const [byPaymentDate, byRenewDate] = await Promise.all([
      paymentRef
        .where('gymId', '==', gymId)
        .where('paymentDate', '>=', windowStartDate)
        .get(),
      paymentRef.where('renewDate', '>=', windowStartDate).get(),
    ]);

    const recentPayments = new Map();
    [...byPaymentDate.docs, ...byRenewDate.docs].forEach((doc) => {
      if (doc.data().gymId === gymId) recentPayments.set(doc.id, doc);
    });

    let totalPaymentsLastSevenDays = 0;
    let totalPaymentsToday = 0;

    recentPayments.forEach((doc) => {
      const paymentType = doc.data().paymentType;
      let paymentDate;

      if (paymentType === 'new' || paymentType === 'prepaidPackage') {
        paymentDate = new Date(doc.data().paymentDate).getTime() + utcOffset;
      } else if (paymentType === 'renew') {
        paymentDate = new Date(doc.data().renewDate).getTime() + utcOffset;
      } else {
        return;
      }

      // if (paymentType === 'new') {
      //   paymentDate = new Date(doc.data().paymentDate).getTime() + utcOffset;
      // } else if (paymentType === 'renew') {
      //   paymentDate = new Date(doc.data().renewDate).getTime() + utcOffset;
      // } else {
      //   return;
      // }

      // Un importe nulo o en texto convertia la suma entera en NaN
      const amount = Number(doc.data().paymentAmount) || 0;

      if (
        paymentDate >= now.getTime() - 7 * 24 * 60 * 60 * 1000 &&
        paymentDate <= now.getTime()
      ) {
        totalPaymentsLastSevenDays += amount;
      }

      if (
        paymentDate >= todayStart.getTime() &&
        paymentDate < todayEnd.getTime()
      ) {
        totalPaymentsToday += amount;
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

// Firestore acepta 500 operaciones por lote; dejamos margen
const PROFILE_BATCH_LIMIT = 450;

const commitProfileWrites = async (writes) => {
  for (let i = 0; i < writes.length; i += PROFILE_BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + PROFILE_BATCH_LIMIT).forEach(({ ref, data }) => {
      batch.update(ref, data);
    });
    await batch.commit();
  }
};

/**
 * Tarea diaria de membresias. Para cada socio del gimnasio:
 *
 *  1. Si tiene una renovacion en cola cuyo periodo ya rige (el plan anterior
 *     termino y la fecha de inicio elegida llego), la aplica: cambia el plan,
 *     las fechas, el precio y deja el status activo.
 *  2. Si no, recalcula el status contra su fecha de expiracion actual. Una
 *     renovacion que todavia no empieza NO lo activa: si su plan vencio,
 *     queda inactivo hasta el dia que eligio para empezar.
 *
 * Los perfiles congelados y los marcados manualmente como 'payment-issue' se
 * dejan intactos, y solo se escribe lo que realmente cambia.
 */
const setInactiveMembers = async (gymId) => {
  if (!gymId || typeof gymId !== 'string') {
    throw new Error('A valid gymId is required to update memberships');
  }

  try {
    const today = await getGymToday(gymId);

    const profilesSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'member')
      .get();

    const writes = [];
    let renewalsApplied = 0;
    let statusesUpdated = 0;

    profilesSnapshot.forEach((doc) => {
      const profileData = doc.data();

      // No se tocan los perfiles congelados
      if (profileData.profileFrozen) return;

      // 1. La renovacion en cola ya rige: se cambia el plan y queda activo
      if (shouldApplyRenewalNow(profileData, today)) {
        writes.push({
          ref: doc.ref,
          data: buildProfileFromRenewal(
            profileData.renewMembershipInQueue,
            today
          ),
        });
        renewalsApplied += 1;
        return;
      }

      // 'payment-issue' es una marca manual del administrador, no se pisa
      if (profileData.profileStatus === 'payment-issue') return;

      // 2. El status depende solo del periodo actual del socio
      const currentEndDate = normalizeDateString(profileData.profileEndDate);
      const profileStatus =
        currentEndDate && currentEndDate >= today ? 'true' : 'false';

      if (profileData.profileStatus === profileStatus) return;

      writes.push({ ref: doc.ref, data: { profileStatus } });
      statusesUpdated += 1;
    });

    await commitProfileWrites(writes);

    return {
      gymId,
      date: today,
      profilesReviewed: profilesSnapshot.size,
      renewalsApplied,
      statusesUpdated,
    };
  } catch (error) {
    console.error('Error al actualizar perfiles:', error);
    throw new Error('Error interno del servidor');
  }
};

// Version expuesta por HTTP (boton "update member status" del panel)
const setInactiveMembersHandler = async (req, res) => {
  try {
    const summary = await setInactiveMembers(req.params.gymId);
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({ error: error.message });
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
      // Algunos paymentAmount llegan como texto o null: sin convertir a numero,
      // el += concatena strings y corrompe el total del mes entero
      const amount = Number(paymentData.paymentAmount) || 0;

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

// Version expuesta por HTTP de getCurrentMembersByMemberships
// (carga del dashboard y boton "Cake Graphic" de master-admin)
const getCurrentMembersByMembershipsHandler = async (req, res) => {
  const { gymId } = req.params;

  if (!gymId || typeof gymId !== 'string') {
    return res.status(400).json({ error: 'A valid gymId is required' });
  }

  try {
    const membershipTotals = await getCurrentMembersByMemberships(gymId);
    return res.status(200).json(membershipTotals);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// Version expuesta por HTTP de updateTotalAmountByMonth
const updateTotalAmountByMonthHandler = async (req, res) => {
  const { gymId } = req.params;

  if (!gymId || typeof gymId !== 'string') {
    return res.status(400).json({ error: 'A valid gymId is required' });
  }

  try {
    const totalAmountByMonth = await updateTotalAmountByMonth(gymId);
    return res.status(200).json(totalAmountByMonth);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getTotalMembers,
  getCurrentMembersByMemberships,
  getCurrentMembersByMembershipsHandler,
  updateTotalAmountByMonthHandler,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
  setInactiveMembers,
  setInactiveMembersHandler,
  updateTotalAmountByMonth,
};
