const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const Profile = require('../models/profile');

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
      .where('role', '==', 'member')
      .get();
    const totalMembers = [];
    totalMembersSnapshot.forEach((doc) => {
      totalMembers.push(doc.data());
    });

    // Consulta para el total de miembros en el último mes
    const lastMonthMembersSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', '==', 'member')
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
      .where('role', '==', 'member')
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

const getCurrentMembersByMemberships = async (req, res) => {
  try {
    const { gymId } = req.params;
    const profilesRef = db.collection('paymentHistory');
    const snapshot = await profilesRef.where('gymId', '==', gymId).get();

    const userCountsByMembership = {};
    const membershipMap = {};

    // Obtener el mapeo de membershipId a planName
    const membershipsSnapshot = await db
      .collection('memberships')
      .where('gymId', '==', gymId)
      .get();
    membershipsSnapshot.forEach((membershipDoc) => {
      const membershipData = membershipDoc.data();
      const membershipId = membershipDoc.id;
      const planName = membershipData.planName;
      membershipMap[membershipId] = planName;

      // Inicializar todos los recuentos a 0
      userCountsByMembership[planName] = 0;
    });

    snapshot.forEach((doc) => {
      const profileData = doc.data();
      const membershipId = profileData.membershipId;
      const planName = membershipMap[membershipId];

      const startDate = new Date(profileData.paymentStartDate);
      const endDate = new Date(profileData.paymentEndDate);

      // Verificar si el pago intersecta con el mes actual
      const today = new Date();
      if (startDate <= today && endDate >= today) {
        userCountsByMembership[planName]++;
      }
    });

    res.status(200).json(userCountsByMembership);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getCheckInReport = async (req, res) => {
  const { gymId } = req.params;
  const checkInRef = db.collection('accessHistory');

  try {
    const snapshot = await checkInRef
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-in')
      .get();

    const now = new Date(); // Fecha actual
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Fecha hace 7 días

    let totalCheckInsLastSevenDays = 0;
    let totalCheckInsToday = 0;

    snapshot.forEach((doc) => {
      const timestamp = new Date(doc.data().timestamp);

      if (timestamp >= sevenDaysAgo) {
        totalCheckInsLastSevenDays++;
      }

      if (
        timestamp.toISOString().split('T')[0] ===
        now.toISOString().split('T')[0]
      ) {
        totalCheckInsToday++;
      }
    });

    // Enviar los datos recopilados al frontend
    const responseData = {
      totalCheckInsLastSevenDays,
      totalCheckInsToday,
    };

    res.status(200).json(responseData);
  } catch (error) {
    // Manejo de errores
    console.error('Error al obtener los datos:', error);
    res
      .status(500)
      .json({ error: 'Ocurrió un error al procesar la solicitud.' });
  }
};

const getPaymentReport = async (req, res) => {
  const { gymId } = req.params;
  const paymentRef = db.collection('paymentHistory');

  try {
    const snapshot = await paymentRef.where('gymId', '==', gymId).get();

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

    let totalPaymentsLastSevenDays = 0;
    let totalPaymentsToday = 0;

    snapshot.forEach((doc) => {
      const paymentType = doc.data().paymentType;
      let paymentDate;

      if (paymentType === 'new') {
        paymentDate = new Date(doc.data().paymentStartDate).getTime();
      } else if (paymentType === 'renew') {
        paymentDate = new Date(doc.data().renewDate).getTime();
      } else {
        return; // Si el tipo de pago no es 'new' o 'renew', pasamos al siguiente documento
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

    // Enviar los datos recopilados al frontend
    const responseData = {
      totalPaymentsLastSevenDays,
      totalPaymentsToday,
    };

    res.status(200).json(responseData);
  } catch (error) {
    // Manejo de errores
    console.error('Error al obtener los datos:', error);
    res
      .status(500)
      .json({ error: 'Ocurrió un error al procesar la solicitud.' });
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

module.exports = {
  getTotalMembers,
  getCurrentMembersByMemberships,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
};
