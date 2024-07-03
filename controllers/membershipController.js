const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const PDFDocument = require('pdfkit-table');
app.use(bodyParser.json());

const getAllMemberships = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getMembershipCollection = db.collection('memberships');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getMembershipCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const membershipsArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const membership = {
        id: doc.id,
        descriptions: data.descriptions, // Si descriptions no está definido, usar un array vacío
        gymId: data.gymId, // Si gymId no está definido, usar una cadena vacía
        isCoupleSelected: data.isCoupleSelected,
        isOffPeak: data.isOffPeak,
        membershipId: data.membershipId,
        membershipPeriod: data.membershipPeriod,
        planName: data.planName, // Si planName no está definido, usar una cadena vacía
        price: data.price, // Si price no está definido, usar una cadena vacía
        startTimeOffPeak: data.startTimeOffPeak,
        endTimeOffPeak: data.endTimeOffPeak,
        selectedWeekDays: data.selectedWeekDays,
        currentTotalMembers: data.currentTotalMembers,
      };
      membershipsArray.push(membership);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(membershipsArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

const getMembership = async (req, res) => {
  try {
    const getMembership = db.collection('memberships').doc(req.params.id);
    const response = await getMembership.get();
    res.send(response.data());
  } catch (error) {
    res.send(error);
  }
};

const getUsersByMonthForMembership = async (req, res) => {
  try {
    const { membershipId } = req.params;
    const profilesRef = db.collection('paymentHistory');
    const snapshot = await profilesRef
      .where('membershipId', '==', membershipId)
      .get();

    const userCountsByMonth = {};

    snapshot.forEach((doc) => {
      const profileData = doc.data();
      const startDate = new Date(profileData.paymentStartDate);
      const endDate = new Date(profileData.paymentEndDate);

      let currentDate = new Date(startDate); // Inicializa en la fecha de inicio del pago

      while (currentDate <= endDate) {
        const monthYearKey = `${currentDate.getFullYear()}-${
          currentDate.getMonth() + 1
        }`;

        if (!userCountsByMonth[monthYearKey]) {
          userCountsByMonth[monthYearKey] = 0;
        }
        userCountsByMonth[monthYearKey]++;

        currentDate.setMonth(currentDate.getMonth() + 1); // Avanza al siguiente mes
      }
    });

    res.status(200).json(userCountsByMonth);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// const getTotalUsersByMonth = async (req, res) => {
//   try {
//     const { gymId } = req.params;
//     const paymentHistoryRef = db.collection('paymentHistory');
//     const snapshot = await paymentHistoryRef.where('gymId', '==', gymId).get();

//     const userCountsByMonth = {};
//     const currentYear = new Date().getFullYear();

//     snapshot.forEach((doc) => {
//       const profileData = doc.data();
//       const startDate = new Date(profileData.paymentStartDate);
//       const endDate = new Date(profileData.paymentEndDate);

//       let currentDate = new Date(startDate); // Inicializa en la fecha de inicio del pago

//       while (currentDate <= endDate) {
//         // Verifica si la fecha está en el año actual
//         if (currentDate.getFullYear() === currentYear) {
//           const monthYearKey = format(currentDate, 'yyyy-MM');

//           if (!userCountsByMonth[monthYearKey]) {
//             userCountsByMonth[monthYearKey] = 0;
//           }
//           userCountsByMonth[monthYearKey]++;
//         }

//         currentDate = addMonths(currentDate, 1); // Avanza al siguiente mes
//       }
//     });

//     res.status(200).json(userCountsByMonth);
//   } catch (error) {
//     console.error('Error fetching profiles:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

const getTotalUsersByMonth = async (req, res) => {
  try {
    const { gymId } = req.params;

    // Obtener una referencia a la colección 'gyms'
    const gymsRef = admin.firestore().collection('gyms');

    // Obtener el documento correspondiente al 'gymId'
    const gymDoc = await gymsRef.doc(gymId).get();

    if (!gymDoc.exists) {
      // El gimnasio con el 'gymId' no fue encontrado
      return res.status(404).json({ error: 'Gym not found' });
    }

    // Obtener el objeto 'userCountsByMonth' del documento
    const userCountsByMonth = gymDoc.data().totalAmountByMonth;

    // Devolver el objeto como respuesta
    res.status(200).json(userCountsByMonth);
  } catch (error) {
    console.error('Error updating total users by month:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createMembership = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;
    // Genera el número secuencial utilizando la función
    const membershipSerialNumber = await generateSequentialNumber(gymId);

    // Genera el nombre del documento
    const documentName = `membership-${gymId}-${membershipSerialNumber}`;
    body.membershipId = documentName;
    body.currentTotalMembers = 0;

    // Crea el nuevo documento en la colección "memberships" en Firebase
    const profilesCollection = db.collection('memberships');
    const newProfileRef = profilesCollection.doc(documentName);
    await newProfileRef.set(body);

    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      membershipLastSerialNumber: documentName,
    });

    res.status(201).json({
      message: 'Membership created',
      documentName,
      body,
    });
  } catch (error) {
    console.error('Error creating membership:', error);
    res.status(500).json({
      message: 'An error occurred while creating the membership',
    });
  }
};
async function generateSequentialNumber(gymId) {
  // Consulta la colección "metadata" para obtener el último número secuencial
  const metadataRef = db.collection('gyms').doc(gymId);
  const metadataDoc = await metadataRef.get();
  let gymMemberships = 1;

  if (metadataDoc.exists) {
    const data = metadataDoc.data();
    gymMemberships = data.gymMemberships + 1;
  }

  // Actualiza el número de secuencia en "metadata"
  await metadataRef.set({ gymMemberships }, { merge: true });

  // Devuelve el número secuencial formateado
  return gymMemberships;
}

const updateMembership = async (req, res) => {
  try {
    const { membershipId, formData } = req.body;

    const profileRef = db.collection('memberships').doc(membershipId);

    // Actualiza el documento con los datos proporcionados en formData
    await profileRef.update(formData);

    res.json({ message: 'Profile record updated successfully' });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

const deleteMembership = async (req, res) => {
  try {
    const membershipId = req.params.membershipId;
    const db = admin.firestore();
    const membershipRef = db.collection('memberships').doc(membershipId);

    const membershipDoc = await membershipRef.get();

    if (!membershipDoc.exists) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    const membershipData = membershipDoc.data();
    const gymId = membershipData.gymId;

    // Elimina la membresía de la colección "memberships"
    await membershipRef.delete();

    if (gymId) {
      // Si la membresía está asociada a un gimnasio, también elimínala de la colección "memberships" del gimnasio
      const gymMembershipRef = db
        .collection('gyms')
        .doc(gymId)
        .collection('memberships')
        .doc(membershipId);
      await gymMembershipRef.delete();

      // Actualiza el número secuencial en "metadata" del gimnasio si corresponde
      const metadataRef = db.collection('gyms').doc(gymId);
      const metadataDoc = await metadataRef.get();

      if (metadataDoc.exists) {
        const data = metadataDoc.data();
        const gymMemberships = data.gymMemberships - 1;

        await metadataRef.update({ gymMemberships });
      }
    }

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
const generateMembershipsReport = async (req, res) => {
  const { gymId } = req.params;

  try {
    const membershipsSnapshot = await db
      .collection('memberships')
      .where('gymId', '==', gymId)
      .get();
    const memberships = membershipsSnapshot.docs.map((doc) => doc.data());

    const totalMembers = memberships.reduce(
      (sum, membership) => sum + membership.currentTotalMembers,
      0
    );

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
    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'inline; filename="memberships_report.pdf"'
    );
    doc.pipe(res);

    // Encabezado del documento
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc
      .fontSize(25)
      .fill('white')
      .text('MEMBERSHIPS REPORT', 50, 30, { align: 'left', valign: 'center' });

    doc.fontSize(18).text(`${dateString}`, { bold: true });

    doc
      .moveDown(1)
      .fill('#0000')
      .text(`Total Members: ${totalMembers}`, {
        fontSize: 14,
        bold: true,
      })
      .moveDown(1);
    // Crear la tabla en el PDF
    doc.table({
      headers: ['Membership', 'Current Total Members'],
      rows: memberships.map((membership) => [
        membership.planName,
        membership.currentTotalMembers,
      ]),
      fontSize: 12,
      width: { 0: 250, 1: 150 },
    });

    // Finalizar el documento
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generando el informe de membresías');
  }
};
const getUtcOffset = (timeZoneStr) => {
  const sign = timeZoneStr.includes('-') ? -1 : 1;
  const offsetStr = timeZoneStr.split(/[\+\-]/)[1];
  return parseInt(offsetStr, 10) * sign;
};

module.exports = {
  getAllMemberships,
  getMembership,
  getUsersByMonthForMembership,
  getTotalUsersByMonth,
  createMembership,
  updateMembership,
  deleteMembership,
  generateMembershipsReport,
};
