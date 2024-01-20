const ExcelJS = require('exceljs');
const admin = require('firebase-admin');
const { db } = require('../firebase');

const gymIdToFilter = 'marriot-1';
const roleToFilter = 'member';
const profilesRef = db.collection('profiles');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Profiles');

profilesRef
  .where('gymId', '==', gymIdToFilter)
  .where('role', '==', roleToFilter)
  .get()
  .then((snapshot) => {
    const profilesData = [];
    snapshot.forEach((doc) => {
      profilesData.push(doc.data());
    });

    // Configuración de las columnas del archivo Excel
    worksheet.columns = [
      { header: 'Index', key: 'index' },
      { header: 'Profile Name', key: 'profileName' },
      { header: 'Profile Lastname', key: 'profileLastname' },
      { header: 'Card Serial Number', key: 'cardSerialNumber' },
      { header: 'Membership ID', key: 'membershipId' },
      { header: 'Start Date', key: 'profileStartDate' },
      { header: 'Expiration Date', key: 'profileEndDate' },
      { header: 'Profile Status', key: 'profileStatus' },
    ];

    // Llena el archivo Excel con los datos filtrados
    profilesData.forEach((profile, index) => {
      worksheet.addRow({
        index: index + 1,
        profileName: profile.profileName || '',
        profileLastname: profile.profileLastname || '',
        cardSerialNumber: profile.cardSerialNumber || '',
        membershipId: profile.membershipId || '',
        profileStartDate: profile.profileStartDate || '',
        profileEndDate: profile.profileEndDate || '',
        profileStatus: profile.profileStatus || '',
      });
    });

    // Guarda el archivo Excel en una ubicación específica
    const outputPath = 'profiles.xlsx';

    workbook.xlsx
      .writeFile(outputPath)
      .then(() => {})
      .catch((error) => {
        console.error('Error al guardar el archivo Excel:', error);
      });
  })
  .catch((error) => {
    console.error('Error al obtener datos de Firestore:', error);
  });
