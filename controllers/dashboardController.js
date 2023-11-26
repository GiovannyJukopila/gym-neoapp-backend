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

module.exports = {
  getTotalMembers,
  getCurrentMembersByMemberships,
};
