const ExcelJS = require('exceljs');
const admin = require('firebase-admin');
const { db } = require('../firebase');

async function generateExcel() {
  const db = admin.firestore();
  const paymentsHistoryCollection = db.collection('paymentHistory');
  const profilesCollection = db.collection('profiles');

  const gymID = 'marriot-1';
  const paymentType = 'UnFreeze';

  const paymentsSnapshot = await paymentsHistoryCollection
    .where('gymId', '==', gymID)
    .where('paymentType', '==', paymentType)
    .get();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Payments History');

  // Agregar encabezados
  worksheet.addRow(['Name', 'Payment Date', 'Payment UnFreeze Days']);

  // Agregar datos
  for (const paymentDoc of paymentsSnapshot.docs) {
    const payment = paymentDoc.data();

    // Obtener el nombre del perfil usando profileId
    const profileSnapshot = await profilesCollection
      .doc(payment.profileId)
      .get();
    const profile = profileSnapshot.data();

    const name = `${profile.profileName} ${profile.profileLastname}`;
    const paymentDate = payment.paymentDate;
    const paymentUnFreezeDays = payment.paymentUnFreezeDays;

    worksheet.addRow([name, paymentDate, paymentUnFreezeDays]);
  }

  // Guardar el archivo de Excel
  await workbook.xlsx.writeFile('paymentsHistory.xlsx');
  console.log('Excel file generated successfully');
}

generateExcel().catch((err) => console.error(err));
