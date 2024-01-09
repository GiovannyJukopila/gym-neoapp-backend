const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const moment = require('moment-timezone');

app.use(bodyParser.json());

const getAllFinancial = async (req, res) => {
  try {
    const { gymId, filterOption, offset, itemsPerPage } = req.query;

    const filterDate = await calculateDate(filterOption, gymId);
    // 1. Consultar la colección paymentHistory filtrando por paymentDate y gymId
    const paymentHistorySnapshot = await db
      .collection('paymentHistory')
      .where('paymentDate', '==', filterDate)
      .where('gymId', '==', gymId)
      .limit(parseInt(itemsPerPage)) // Limitar la cantidad de elementos devueltos
      .offset(parseInt(offset)) // Establecer el offset para la paginación
      .get();

    // 2. Obtener los datos específicos de los pagos y extraer los profileId, paymentType, paymentDate, paymentAmount, membershipId
    const payments = [];
    paymentHistorySnapshot.forEach((doc) => {
      const paymentData = doc.data();
      const {
        paymentId,
        profileId,
        paymentType,
        paymentDate,
        paymentAmount,
        membershipId,
      } = paymentData;
      payments.push({
        paymentId,
        profileId,
        paymentType,
        paymentDate,
        paymentAmount,
        membershipId,
      });
    });

    // 3. Obtener los nombres de plan de la colección memberships utilizando los membershipId
    const membershipIds = payments.map((payment) => payment.membershipId);

    if (membershipIds.length > 0) {
      const membershipsSnapshot = await db
        .collection('memberships')
        .where('membershipId', 'in', membershipIds)
        .get();

      const membershipsData = {};
      membershipsSnapshot.forEach((doc) => {
        const membershipData = doc.data();
        membershipsData[membershipData.membershipId] = membershipData.planName;
      });

      // 4. Obtener profileName y profileLastname de la colección profiles utilizando los profileId
      const profileIds = payments.map((payment) => payment.profileId);

      const profilesSnapshot = await db
        .collection('profiles')
        .where('profileId', 'in', profileIds)
        .get();

      const profilesData = {};
      profilesSnapshot.forEach((doc) => {
        const profileData = doc.data();
        profilesData[profileData.profileId] = {
          profileName: profileData.profileName,
          profileLastname: profileData.profileLastname,
        };
      });

      // 5. Construir la respuesta combinando la información de pagos, nombres de planes, y nombres de perfil
      const financialInfo = payments.map((payment) => ({
        ...payment,
        planName: membershipsData[payment.membershipId],
        profileName: profilesData[payment.profileId]?.profileName || '',
        profileLastname: profilesData[payment.profileId]?.profileLastname || '',
      }));

      res.status(200).json(financialInfo);
    } else {
      // Manejo si no hay pagos encontrados para esa fecha y gimnasio
      res.status(200).json([]);
    }
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
    const { membership, paymentType, paymentReceived } = innerPaymentData;
    const paymentId = req.params.paymentId;

    const paymentRef = db.collection('paymentHistory').doc(paymentId);
    const paymentSnapshot = await paymentRef.get();

    if (!paymentSnapshot.exists) {
      return res.status(404).send('Payment not found');
    }

    const paymentInfo = paymentSnapshot.data();
    const { profileId } = paymentInfo;

    const profileRef = db.collection('profiles').doc(profileId);
    const profileSnapshot = await profileRef.get();

    if (!profileSnapshot.exists) {
      return res.status(404).send('Profile not found');
    }

    const profileData = profileSnapshot.data();
    const { renewMembershipInQueue } = profileData;

    const profileUpdateData = {
      profileTotalReceive: paymentReceived,
      membershipId: membership,
    };

    const paymentUpdateData = {
      membershipId: membership,
      paymentType: paymentType,
      paymentAmount: paymentReceived,
    };

    await paymentRef.update(paymentUpdateData);

    if (paymentType === 'renew') {
      if (renewMembershipInQueue?.renewIsInQueue) {
        // Actualizar renewMembershipInQueue si renewIsInQueue es true
        await profileRef.update({
          'renewMembershipInQueue.profileRenewTotalReceive': paymentReceived,
          'renewMembershipInQueue.membership.value': membership,
        });
      } else {
        await profileRef.update(profileUpdateData);
      }
    }

    // Actualizar el perfil según el tipo de pago
    if (paymentType === 'new') {
      await profileRef.update(profileUpdateData);
    }

    res.status(200).json({ message: 'Payment data updated successfully' });
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

    // Obtener información de membresía
    const membershipSnapshot = await admin
      .firestore()
      .collection('memberships')
      .doc(paymentData.membershipId)
      .get();

    const membershipData = membershipSnapshot.exists
      ? membershipSnapshot.data()
      : null;

    // Obtener información de perfil
    const profileSnapshot = await admin
      .firestore()
      .collection('profiles')
      .doc(paymentData.profileId)
      .get();

    const profileData = profileSnapshot.exists ? profileSnapshot.data() : null;

    // Combinar la información y enviar la respuesta
    const combinedData = {
      ...paymentData,
      planName: membershipData ? membershipData.planName : null,
      profileName: profileData ? profileData.profileName : null,
      profileLastname: profileData ? profileData.profileLastname : null,
    };

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
