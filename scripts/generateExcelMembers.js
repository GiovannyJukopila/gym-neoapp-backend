const ExcelJS = require('exceljs');
const admin = require('firebase-admin');
const { db } = require('../firebase');

const gymIdToFilter = 'marriot-1';
const roleToFilter = 'member';
const profilesRef = db.collection('profiles');
const membershipsRef = db.collection('memberships');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Profiles');

profilesRef
  .where('gymId', '==', gymIdToFilter)
  .where('role', 'array-contains', roleToFilter)
  .where('profileStatus', '==', 'false')
  .get()
  .then(async (snapshot) => {
    const profilesData = [];
    const membershipDataMap = new Map();

    // Additional query to get membership data
    const membershipsSnapshot = await membershipsRef.get();
    membershipsSnapshot.forEach((membershipDoc) => {
      const membershipData = membershipDoc.data();
      const membershipId = membershipDoc.id;
      membershipDataMap.set(membershipId, membershipData);
    });

    snapshot.forEach((doc) => {
      profilesData.push(doc.data());
    });

    // Configuración de las columnas del archivo Excel
    worksheet.columns = [
      { header: 'Index', key: 'index', width: 5 },
      { header: 'Profile Name', key: 'profileName', width: 15 },
      { header: 'Profile Lastname', key: 'profileLastname', width: 15 },
      { header: 'Card Serial Number', key: 'cardSerialNumber', width: 15 },
      { header: 'Start Date', key: 'profileStartDate', width: 15 },
      { header: 'Expiration Date', key: 'profileEndDate', width: 15 },
      { header: 'Plan Name', key: 'planName', width: 20 },
      { header: 'Profile Status', key: 'profileStatus', width: 15 },
    ];

    // Llena el archivo Excel con los datos filtrados
    profilesData.forEach((profile, index) => {
      const membershipId = profile.membershipId || '';
      const membershipData = membershipDataMap.get(membershipId) || {};
      const planName = membershipData.planName || '';

      worksheet.addRow({
        index: index + 1,
        profileName: profile.profileName || '',
        profileLastname: profile.profileLastname || '',
        cardSerialNumber: profile.cardSerialNumber || '',
        profileStartDate: profile.profileStartDate || '',
        profileEndDate: profile.profileEndDate || '',
        planName: planName,
        profileStatus: profile.profileStatus ? 'Active' : 'Inactive',
      });
    });

    // Guarda el archivo Excel en una ubicación específica
    const outputPath = 'profiles.xlsx';

    workbook.xlsx
      .writeFile(outputPath)
      .then(() => {
        // Ahora, puedes realizar la operación de lectura aquí
        workbook.xlsx
          .readFile(outputPath)
          .then(() => {
            // Puedes continuar con cualquier operación que necesites realizar con el archivo leído.
          })
          .catch((readError) => {
            console.error('Error al leer el archivo Excel:', readError);
          });
      })
      .catch((writeError) => {
        console.error('Error al guardar el archivo Excel:', writeError);
      });
  })
  .catch((error) => {
    console.error('Error al obtener datos de Firestore:', error);
  });
