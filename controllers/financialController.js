const express = require('express');
const app = express();
const { db } = require('../firebase');
const {
  classifyPaymentScope,
  buildMembershipUpdate,
} = require('../utils/paymentAdjustment');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const moment = require('moment-timezone');

app.use(bodyParser.json());

// const getAllFinancial = async (req, res) => {
//   try {
//     const { gymId, filterOption, offset, itemsPerPage } = req.query;

//     const filterDate = await calculateDate(filterOption, gymId);
//     // 1. Consultar la colección paymentHistory filtrando por paymentDate y gymId
//     const paymentHistorySnapshot = await db
//       .collection('paymentHistory')
//       .where('paymentDate', '==', filterDate)
//       .where('gymId', '==', gymId)
//       .limit(parseInt(itemsPerPage)) // Limitar la cantidad de elementos devueltos
//       .offset(parseInt(offset)) // Establecer el offset para la paginación
//       .get();

//     // 2. Obtener los datos específicos de los pagos y extraer los profileId, paymentType, paymentDate, paymentAmount, membershipId
//     const payments = [];
//     paymentHistorySnapshot.forEach((doc) => {
//       const paymentData = doc.data();
//       const {
//         paymentId,
//         profileId,
//         paymentType,
//         paymentDate,
//         paymentAmount,
//         membershipId,
//         participants,
//         paymentCourtId,
//         roomNumber,
//         memberType,
//       } = paymentData;

//       // Asegúrate de que profileId y membershipId no sean undefined antes de agregarlos a payments
//       const paymentEntry = {
//         paymentId,
//         paymentType,
//         paymentDate,
//         paymentAmount,
//         participants,
//         paymentCourtId,
//         roomNumber,
//         memberType,
//       };

//       if (profileId !== undefined) {
//         paymentEntry.profileId = profileId;
//       } else {
//         paymentEntry.profileId = null; // O asigna otro valor por defecto
//       }

//       if (membershipId !== undefined) {
//         paymentEntry.membershipId = membershipId;
//       } else {
//         paymentEntry.membershipId = null; // O asigna otro valor por defecto
//       }

//       if (participants && participants.length > 0) {
//         const firstParticipant = participants[0];
//         if (firstParticipant.profileId !== undefined) {
//           paymentEntry.profileId = firstParticipant.profileId;
//         }
//         if (firstParticipant.membershipId !== undefined) {
//           paymentEntry.membershipId = firstParticipant.membershipId;
//         }
//       }

//       payments.push(paymentEntry);
//     });

//     // 3. Obtener los nombres de plan de la colección memberships utilizando los membershipId
//     const membershipIds = payments
//       .filter((payment) => payment.membershipId !== undefined)
//       .map((payment) => payment.membershipId);

//     if (membershipIds.length > 0) {
//       const membershipsSnapshot = await db
//         .collection('memberships')
//         .where('membershipId', 'in', membershipIds)
//         .get();

//       const membershipsData = {};
//       membershipsSnapshot.forEach((doc) => {
//         const membershipData = doc.data();
//         membershipsData[membershipData.membershipId] = membershipData.planName;
//       });

//       // 4. Obtener profileName y profileLastname de la colección profiles utilizando los profileId
//       const profileIds = payments
//         .filter((payment) => payment.profileId !== undefined)
//         .map((payment) => payment.profileId);

//       if (profileIds.length > 0) {
//         const profilesSnapshot = await db
//           .collection('profiles')
//           .where('profileId', 'in', profileIds)
//           .get();

//         const profilesData = {};
//         profilesSnapshot.forEach((doc) => {
//           const profileData = doc.data();
//           profilesData[profileData.profileId] = {
//             profileName: profileData.profileName,
//             profileLastname: profileData.profileLastname,
//           };
//         });

//         // 5. Construir la respuesta combinando la información de pagos, nombres de planes, y nombres de perfil
//         const financialInfo = payments.map((payment) => ({
//           ...payment,
//           planName: membershipsData[payment.membershipId] || 'N/A',
//           profileName: profilesData[payment.profileId]?.profileName || 'N/A',
//           profileLastname:
//             profilesData[payment.profileId]?.profileLastname || '',
//         }));

//         res.status(200).json(financialInfo);
//       } else {
//         // Manejo si no hay perfiles encontrados para esos pagos
//         res.status(200).json([]);
//       }
//     } else {
//       // Manejo si no hay pagos encontrados para esa fecha y gimnasio
//       res.status(200).json([]);
//     }
//   } catch (error) {
//     console.error('Error getting financial data:', error);
//     res.status(500).send('Error getting financial data');
//   }
// };

const getAllFinancial = async (req, res) => {
  try {
    const { gymId, filterOption, offset, itemsPerPage, startDate, endDate } =
      req.query;

    const limitValue = parseInt(itemsPerPage) || 50;
    const offsetValue = parseInt(offset) || 0;

    let paymentHistorySnapshot;

    if (startDate && endDate) {
      // Filtro por rango de fechas. El indice compuesto (gymId + paymentDate)
      // que ya existe soporta la igualdad de gymId mas el rango.
      const rangeQuery = db
        .collection('paymentHistory')
        .where('gymId', '==', gymId)
        .where('paymentDate', '>=', startDate)
        .where('paymentDate', '<=', endDate);

      try {
        // Lo natural es ver primero los pagos mas recientes, pero ese orden
        // necesita el indice (gymId + paymentDate DESC)
        paymentHistorySnapshot = await rangeQuery
          .orderBy('paymentDate', 'desc')
          .limit(limitValue)
          .offset(offsetValue)
          .get();
      } catch (error) {
        // Mientras ese indice no exista, se usa el orden ascendente, que si
        // funciona con el indice actual, en lugar de dejar la pantalla vacia
        if (error.code === 9) {
          console.warn(
            '[financial] Falta el indice (gymId + paymentDate DESC); se usa orden ascendente. Crealo desplegando firestore.indexes.json'
          );
          paymentHistorySnapshot = await rangeQuery
            .orderBy('paymentDate', 'asc')
            .limit(limitValue)
            .offset(offsetValue)
            .get();
        } else {
          throw error;
        }
      }
    } else {
      // Compatibilidad con el filtro anterior (hoy / ayer)
      const filterDate = await calculateDate(filterOption, gymId);
      paymentHistorySnapshot = await db
        .collection('paymentHistory')
        .where('paymentDate', '==', filterDate)
        .where('gymId', '==', gymId)
        .limit(limitValue)
        .offset(offsetValue)
        .get();
    }

    const payments = [];
    paymentHistorySnapshot.forEach((doc) => {
      const paymentData = doc.data();
      payments.push({
        paymentId: paymentData.paymentId,
        paymentType: paymentData.paymentType,
        paymentDate: paymentData.paymentDate,
        paymentAmount: paymentData.paymentAmount,
        participants: paymentData.participants,
        paymentCourtId: paymentData.paymentCourtId,
        roomNumber: paymentData.roomNumber,
        memberType: paymentData.memberType,
        profileId: paymentData.profileId || null,
        membershipId: paymentData.membershipId || null,
        // Periodo que cubre el pago: lo necesita el editor para saber si el
        // pago rige la membresia vigente
        paymentStartDate: paymentData.paymentStartDate || null,
        paymentEndDate: paymentData.paymentEndDate || null,
        lastAdjustedBy: paymentData.lastAdjustedBy || null,
      });
    });

    const membershipIds = payments
      .filter((payment) => payment.membershipId !== null)
      .map((payment) => payment.membershipId);

    const membershipsData = {};
    const profileIds = [];
    payments.forEach((payment) => {
      if (payment.profileId !== null) {
        profileIds.push(payment.profileId);
      }
    });

    if (membershipIds.length > 0) {
      const membershipBatches = [];
      for (let i = 0; i < membershipIds.length; i += 30) {
        membershipBatches.push(membershipIds.slice(i, i + 30));
      }

      for (const batch of membershipBatches) {
        const membershipsSnapshot = await db
          .collection('memberships')
          .where('membershipId', 'in', batch)
          .get();

        membershipsSnapshot.forEach((doc) => {
          const membershipData = doc.data();
          membershipsData[membershipData.membershipId] =
            membershipData.planName;
        });
      }
    }

    const profilesData = {};
    if (profileIds.length > 0) {
      const profileBatches = [];
      for (let i = 0; i < profileIds.length; i += 30) {
        profileBatches.push(profileIds.slice(i, i + 30));
      }

      for (const batch of profileBatches) {
        const profilesSnapshot = await db
          .collection('profiles')
          .where('profileId', 'in', batch)
          .get();

        profilesSnapshot.forEach((doc) => {
          const profileData = doc.data();
          profilesData[profileData.profileId] = {
            profileName: profileData.profileName,
            profileLastname: profileData.profileLastname,
          };
        });
      }
    }

    const financialInfo = payments.map((payment) => ({
      ...payment,
      planName: membershipsData[payment.membershipId] || 'N/A',
      profileName: profilesData[payment.profileId]?.profileName || 'N/A',
      profileLastname: profilesData[payment.profileId]?.profileLastname || '',
    }));

    res.status(200).json(financialInfo);
  } catch (error) {
    console.error('Error getting financial data:', error);
    res.status(500).send('Error getting financial data');
  }
};

async function calculateDate(filterOption, gymId) {
  try {
    // Obtener gymTimeZone del documento de gimnasio usando gymId
    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;

    // Obtener el desplazamiento UTC
    const utcOffset = getUtcOffset(gymTimeZone);

    // Obtener la fecha actual con el desplazamiento UTC
    const currentDate = moment().utcOffset(utcOffset);

    if (filterOption === 'todayPayments') {
      return formatDate(currentDate);
    } else if (filterOption === 'yesterdayPayments') {
      const yesterday = moment(currentDate).subtract(1, 'days');
      return formatDate(yesterday);
    }

    return formatDate(currentDate);
  } catch (error) {
    console.error('Error calculating date:', error);
    throw error;
  }
}

const getUtcOffset = (timeZoneStr) => {
  const regex = /(?:UTC)([+-]\d+)/;
  const match = timeZoneStr.match(regex);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return 0; // Devolver 0 si no se encuentra el offset UTC
};

function formatDate(date) {
  return moment(date).format('YYYY-MM-DD');
}

const updateFinancial = async (req, res) => {
  try {
    const { fullName, gymId, paymentData: innerPaymentData } = req.body;
    const {
      membership,
      paymentType,
      paymentReceived,
      paymentDate,
      periodStartDate,
      periodEndDate,
    } = innerPaymentData;
    const paymentId = req.params.paymentId;

    const paymentRef = db.collection('paymentHistory').doc(paymentId);
    const paymentSnapshot = await paymentRef.get();

    if (!paymentSnapshot.exists) {
      return res.status(404).send('Payment not found');
    }

    const paymentInfo = paymentSnapshot.data();

    // Un importe en texto o vacio corrompia las sumas de los informes
    const amount = Number(paymentReceived);
    if (!Number.isFinite(amount)) {
      return res.status(400).json({ message: 'Invalid payment amount' });
    }

    // El perfil solo se lee si el pago tiene uno. Las pistas y las sesiones no
    // lo tienen, y antes esto reventaba con un 500 al llamar a doc(undefined).
    let profileRef = null;
    let profileData = null;

    if (paymentInfo.profileId) {
      profileRef = db.collection('profiles').doc(paymentInfo.profileId);
      const profileSnapshot = await profileRef.get();
      if (profileSnapshot.exists) {
        profileData = profileSnapshot.data();
      }
    }

    // Decide si este pago rige la membresia vigente, la renovacion en cola, o
    // es un registro ya superado que solo debe corregirse contablemente
    const scope = classifyPaymentScope(paymentInfo, profileData);

    // Precio del plan elegido, para mantener coherente el precio de la membresia
    let membershipPrice;
    if (membership) {
      const membershipSnapshot = await db
        .collection('memberships')
        .doc(membership)
        .get();
      if (membershipSnapshot.exists) {
        membershipPrice = membershipSnapshot.data().price;
      }
    }

    const paymentUpdateData = {
      paymentType: paymentType,
      paymentAmount: amount,
      paymentDate: paymentDate,
      lastAdjustedBy: fullName || 'unknown',
      lastAdjustedAt: admin.firestore.Timestamp.now(),
    };

    if (membership) {
      paymentUpdateData.membershipId = membership;
    }

    // El periodo es un dato del propio pago, asi que se corrige siempre que
    // llegue; lo que depende del alcance es si se propaga a la membresia
    if (periodStartDate) paymentUpdateData.paymentStartDate = periodStartDate;
    if (periodEndDate) paymentUpdateData.paymentEndDate = periodEndDate;

    const membershipUpdate = buildMembershipUpdate({
      scope,
      membershipId: membership,
      paymentAmount: amount,
      membershipPrice,
      periodStartDate,
      periodEndDate,
    });

    const membershipUpdated = Object.keys(membershipUpdate).length > 0;

    // Pago, membresia y registro de auditoria se escriben juntos: si algo
    // falla no queda la contabilidad corregida y la membresia a medias
    const batch = db.batch();

    batch.update(paymentRef, paymentUpdateData);

    if (membershipUpdated && profileRef) {
      batch.update(profileRef, membershipUpdate);
    }

    // Registro de auditoria: antes se recibia el nombre del administrador y se
    // descartaba, asi que no quedaba rastro de quien cambiaba una cifra
    const adjustmentRef = db.collection('financialAdjustments').doc();
    batch.set(adjustmentRef, {
      adjustmentId: adjustmentRef.id,
      paymentId,
      gymId: gymId || paymentInfo.gymId || null,
      profileId: paymentInfo.profileId || null,
      adjustedBy: fullName || 'unknown',
      adjustedAt: admin.firestore.Timestamp.now(),
      scope,
      membershipUpdated,
      previousValues: {
        membershipId: paymentInfo.membershipId || null,
        paymentAmount: paymentInfo.paymentAmount ?? null,
        paymentDate: paymentInfo.paymentDate || null,
        paymentStartDate: paymentInfo.paymentStartDate || null,
        paymentEndDate: paymentInfo.paymentEndDate || null,
      },
      newValues: {
        membershipId: paymentUpdateData.membershipId ?? null,
        paymentAmount: amount,
        paymentDate: paymentDate || null,
        paymentStartDate: paymentUpdateData.paymentStartDate || null,
        paymentEndDate: paymentUpdateData.paymentEndDate || null,
      },
    });

    await batch.commit();

    return res.status(200).json({
      message: 'Payment data updated successfully',
      scope,
      membershipUpdated,
    });
  } catch (error) {
    console.error('Error updating payment data:', error);
    res.status(500).send('Error updating payment data');
  }
};

const getFinancialPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const paymentSnapshot = await admin
      .firestore()
      .collection('paymentHistory')
      .doc(paymentId)
      .get();

    if (!paymentSnapshot.exists) {
      return res.status(404).send('Payment not found');
    }

    const paymentData = paymentSnapshot.data();

    // Asegúrate de que profileId y membershipId no sean undefined antes de agregarlos a combinedData
    const combinedData = {
      ...paymentData,
      planName: null,
      profileName: null,
      profileLastname: null,
    };

    // Verifica si participants es un array y tiene al menos un elemento
    if (
      Array.isArray(paymentData.participants) &&
      paymentData.participants.length > 0
    ) {
      // Toma el membershipId y profileId del primer participante
      const firstParticipant = paymentData.participants[0];
      combinedData.membershipId = firstParticipant.membershipId || null;
      combinedData.profileId = firstParticipant.profileId || null;
    } else {
      // Si participants no es un array o está vacío, establece los valores como null
      combinedData.membershipId = paymentData.membershipId || null;
      combinedData.profileId = paymentData.profileId || null;
    }

    // Obtener información de membresía si existe membershipId
    if (combinedData.membershipId) {
      const membershipSnapshot = await admin
        .firestore()
        .collection('memberships')
        .doc(combinedData.membershipId)
        .get();

      const membershipData = membershipSnapshot.exists
        ? membershipSnapshot.data()
        : null;

      combinedData.planName = membershipData ? membershipData.planName : null;
    }

    // Obtener información de perfil si existe profileId
    let profileData = null;
    if (combinedData.profileId) {
      const profileSnapshot = await admin
        .firestore()
        .collection('profiles')
        .doc(combinedData.profileId)
        .get();

      profileData = profileSnapshot.exists ? profileSnapshot.data() : null;

      combinedData.profileName = profileData ? profileData.profileName : null;
      combinedData.profileLastname = profileData
        ? profileData.profileLastname
        : null;
    }

    // Alcance del ajuste, para que el editor pueda avisar al administrador de
    // si lo que cambie afectara a la membresia del cliente o solo a la
    // contabilidad
    combinedData.scope = classifyPaymentScope(paymentData, profileData);
    combinedData.membershipContext = profileData
      ? {
          profileStartDate: profileData.profileStartDate || null,
          profileEndDate: profileData.profileEndDate || null,
          currentMembershipId: profileData.membershipId || null,
          renewIsInQueue:
            profileData.renewMembershipInQueue?.renewIsInQueue === true,
          queuedStartDate:
            profileData.renewMembershipInQueue?.profileRenewStartDate || null,
          queuedEndDate:
            profileData.renewMembershipInQueue?.profileRenewEndDate || null,
        }
      : null;

    // Enviar la respuesta
    res.status(200).json(combinedData);
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).send('Error fetching payment');
  }
};

module.exports = {
  getAllFinancial,
  updateFinancial,
  getFinancialPayment,
};
