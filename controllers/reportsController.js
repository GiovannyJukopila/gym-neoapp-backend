const fs = require('fs');
const admin = require('firebase-admin');
const { db } = require('../firebase');

const ExcelJS = require('exceljs');

const generateGlobalReport = async (req, res) => {
  try {
    const { gymId, startDate, endDate } = req.body;

    // Obtener el historial de pagos
    const paymentHistoryRef = db.collection('paymentHistory');
    const paymentSnapshot = await paymentHistoryRef
      .where('gymId', '==', gymId)
      .get();

    // Obtener las membresías asociadas al gimnasio
    const membershipsRef = db.collection('memberships');
    const membershipSnapshot = await membershipsRef
      .where('gymId', '==', gymId)
      .get();

    const userCountsByMonth = {};

    paymentSnapshot.forEach((paymentDoc) => {
      const profileData = paymentDoc.data();
      const paymentStartDate = new Date(profileData.paymentStartDate);
      const paymentEndDate = new Date(profileData.paymentEndDate);

      const membershipId = profileData.membershipId;
      const membershipDoc = membershipSnapshot.docs.find(
        (doc) => doc.id === membershipId
      );
      const membershipData = membershipDoc ? membershipDoc.data() : null;
      const planName = membershipData ? membershipData.planName : '';

      let currentDate = new Date(paymentStartDate);
      currentDate.setDate(1); // Ajusta el currentDate al inicio del mes

      while (currentDate <= paymentEndDate) {
        const monthYearKey = `${currentDate.getFullYear()}-${(
          '0' +
          (currentDate.getMonth() + 1)
        ).slice(-2)}`;

        if (!userCountsByMonth[monthYearKey]) {
          userCountsByMonth[monthYearKey] = {};
          userCountsByMonth[monthYearKey]['Total Members'] = 0; // Agregar el campo de 'Total Members'
        }
        if (!userCountsByMonth[monthYearKey][planName]) {
          userCountsByMonth[monthYearKey][planName] = 0;
        }
        userCountsByMonth[monthYearKey][planName]++;
        userCountsByMonth[monthYearKey]['Total Members']++; // Incrementar el total de miembros

        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1); // Avanza al siguiente mes
      }
    });

    // Crear un rango de fechas con todos los meses entre startDate y endDate
    const dateRange = [];
    let currentDate = new Date(startDate);
    currentDate.setDate(1); // Establecer en el primer día del mes

    while (currentDate <= new Date(endDate)) {
      const monthYearKey = `${currentDate.getFullYear()}-${(
        '0' +
        (currentDate.getMonth() + 1)
      ).slice(-2)}`;

      dateRange.push(monthYearKey);

      currentDate.setMonth(currentDate.getMonth() + 1); // Avanzar al siguiente mes
    }

    const allMonths = Object.keys(userCountsByMonth)
      .filter((key) => dateRange.includes(key))
      .map((key) => {
        const [year, month] = key.split('-');
        return {
          key,
          month: new Date(year, parseInt(month) - 1).toLocaleString('default', {
            month: 'long',
          }),
        };
      });

    allMonths.sort((a, b) => {
      const monthOrder = {
        January: 0,
        February: 1,
        March: 2,
        April: 3,
        May: 4,
        June: 5,
        July: 6,
        August: 7,
        September: 8,
        October: 9,
        November: 10,
        December: 11,
      };
      return monthOrder[a.month] - monthOrder[b.month];
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('UserCountsByMonth');

    const allMembershipPlans = Array.from(
      new Set(
        membershipSnapshot.docs.map((membership) => membership.data().planName)
      )
    );

    // Obtener los nombres de planes presentes en los pagos
    const membershipHeaders = Array.from(
      new Set(
        paymentSnapshot.docs.map((doc) => {
          const membershipId = doc.data().membershipId;
          const membershipDoc = membershipSnapshot.docs.find(
            (membership) => membership.id === membershipId
          );
          return membershipDoc ? membershipDoc.data().planName : '';
        })
      )
    );

    // Agregar los nombres de planes que no estén presentes con un valor inicial de 0
    allMembershipPlans.forEach((plan) => {
      if (!membershipHeaders.includes(plan)) {
        membershipHeaders.push(plan);
      }
    });

    worksheet.columns = [
      { header: 'Date', key: 'date' },
      { header: 'Month', key: 'month' }, // Columna 'Month'
      { header: 'Total Members', key: 'Total Members' }, // Columna 'Total Members'
      ...membershipHeaders.map((header) => ({ header, key: header })),
    ];

    allMonths.forEach((month) => {
      const key = month.key;
      const rowData = {
        date: key,
        'Total Members': userCountsByMonth[key]['Total Members'],
        month: month.month,
      };

      membershipHeaders.forEach((header) => {
        rowData[header] = userCountsByMonth[key][header] || 0;
      });
      worksheet.addRow(rowData);
    });

    // Ajustar ancho de columnas
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    // Enviar el archivo Excel como respuesta
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="userCountsByMonth.xlsx"'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// const generateGlobalReport = async (req, res) => {
//   try {
//     const { gymId, startDate, endDate } = req.body;

//     // Obtener el historial de pagos
//     const paymentHistoryRef = db.collection('paymentHistory');
//     const paymentSnapshot = await paymentHistoryRef
//       .where('gymId', '==', gymId)
//       .get();

//     // Obtener las membresías asociadas al gimnasio
//     const membershipsRef = db.collection('memberships');
//     const membershipSnapshot = await membershipsRef
//       .where('gymId', '==', gymId)
//       .get();

//     const userCountsByMonth = {};

//     paymentSnapshot.forEach((paymentDoc) => {
//       const profileData = paymentDoc.data();
//       const paymentStartDate = new Date(profileData.paymentStartDate);
//       const paymentEndDate = new Date(profileData.paymentEndDate);

//       // Comprueba si el pago intersecta con el rango de fechas proporcionado

//       const membershipId = profileData.membershipId;
//       const membershipDoc = membershipSnapshot.docs.find(
//         (doc) => doc.id === membershipId
//       );
//       const membershipData = membershipDoc ? membershipDoc.data() : null;
//       const planName = membershipData ? membershipData.planName : '';

//       let currentDate = new Date(paymentStartDate);
//       currentDate.setDate(1); // Ajusta el currentDate al inicio del mes

//       while (currentDate <= paymentEndDate) {
//         const monthYearKey = `${currentDate.getFullYear()}-${(
//           '0' +
//           (currentDate.getMonth() + 1)
//         ).slice(-2)}`;

//         if (!userCountsByMonth[monthYearKey]) {
//           userCountsByMonth[monthYearKey] = {};
//           userCountsByMonth[monthYearKey]['Total Members'] = 0; // Agregar el campo de 'Total Members'
//         }
//         if (!userCountsByMonth[monthYearKey][planName]) {
//           userCountsByMonth[monthYearKey][planName] = 0;
//         }
//         userCountsByMonth[monthYearKey][planName]++;
//         userCountsByMonth[monthYearKey]['Total Members']++; // Incrementar el total de miembros

//         currentDate.setMonth(currentDate.getMonth() + 1);
//         currentDate.setDate(1); // Avanza al siguiente mes
//       }
//     });

//     // Obtener todos los meses en inglés y ordenarlos
//     const allMonths = Object.keys(userCountsByMonth).map((key) => {
//       const [year, month] = key.split('-');
//       return {
//         key,
//         month: new Date(year, parseInt(month) - 1).toLocaleString('default', {
//           month: 'long',
//         }),
//       };
//     });

//     allMonths.sort((a, b) => {
//       const monthOrder = {
//         January: 0,
//         February: 1,
//         March: 2,
//         April: 3,
//         May: 4,
//         June: 5,
//         July: 6,
//         August: 7,
//         September: 8,
//         October: 9,
//         November: 10,
//         December: 11,
//       };
//       return monthOrder[a.month] - monthOrder[b.month];
//     });

//     // Generar el archivo Excel
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet('UserCountsByMonth');

//     const allMembershipPlans = Array.from(
//       new Set(
//         membershipSnapshot.docs.map((membership) => membership.data().planName)
//       )
//     );

//     // Obtener los nombres de planes presentes en los pagos
//     const membershipHeaders = Array.from(
//       new Set(
//         paymentSnapshot.docs.map((doc) => {
//           const membershipId = doc.data().membershipId;
//           const membershipDoc = membershipSnapshot.docs.find(
//             (membership) => membership.id === membershipId
//           );
//           return membershipDoc ? membershipDoc.data().planName : '';
//         })
//       )
//     );

//     // Agregar los nombres de planes que no estén presentes con un valor inicial de 0
//     allMembershipPlans.forEach((plan) => {
//       if (!membershipHeaders.includes(plan)) {
//         membershipHeaders.push(plan);
//       }
//     });

//     worksheet.columns = [
//       { header: 'Date', key: 'date' },
//       { header: 'Month', key: 'month' }, // Columna 'Month'
//       { header: 'Total Members', key: 'Total Members' }, // Columna 'Total Members'
//       ...membershipHeaders.map((header) => ({ header, key: header })),
//     ];

//     allMonths.forEach((month) => {
//       const key = month.key;
//       const rowData = {
//         date: key,
//         'Total Members': userCountsByMonth[key]['Total Members'],
//         month: month.month,
//       };

//       membershipHeaders.forEach((header) => {
//         rowData[header] = userCountsByMonth[key][header] || 0;
//       });
//       worksheet.addRow(rowData);
//     });

//     // Ajustar ancho de columnas
//     worksheet.columns.forEach((column, index) => {
//       let maxLength = 0;
//       column.eachCell({ includeEmpty: true }, (cell) => {
//         const columnLength = cell.value ? cell.value.toString().length : 10;
//         if (columnLength > maxLength) {
//           maxLength = columnLength;
//         }
//       });
//       column.width = maxLength < 10 ? 10 : maxLength + 2;
//     });

//     // Enviar el archivo Excel como respuesta
//     res.setHeader(
//       'Content-Type',
//       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//     );
//     res.setHeader(
//       'Content-Disposition',
//       'attachment; filename="userCountsByMonth.xlsx"'
//     );
//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (error) {
//     console.error('Error fetching profiles:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

const generateReportByMembership = async (req, res) => {
  try {
    const { gymId, membershipId, membershipName, startDate, endDate } =
      req.body;

    const paymentHistoryRef = db.collection('paymentHistory');
    const paymentSnapshot = await paymentHistoryRef
      .where('gymId', '==', gymId)
      .where('membershipId', '==', membershipId)
      .get();

    const userCountsByMonth = {};

    const dateRange = [];
    let currentDate = new Date(startDate);
    currentDate.setDate(1); // Establecer en el primer día del mes

    // Crear un rango de fechas con todos los meses entre startDate y endDate
    while (currentDate <= new Date(endDate)) {
      const monthYearKey = `${currentDate.getFullYear()}-${(
        '0' +
        (currentDate.getMonth() + 1)
      ).slice(-2)}`;

      dateRange.push(monthYearKey);

      currentDate.setMonth(currentDate.getMonth() + 1); // Avanzar al siguiente mes
    }

    paymentSnapshot.forEach((paymentDoc) => {
      const profileData = paymentDoc.data();
      const paymentStartDate = new Date(profileData.paymentStartDate);
      const paymentEndDate = new Date(profileData.paymentEndDate);

      // Comprueba si el pago intersecta con el rango de fechas proporcionado

      let currentDate = new Date(paymentStartDate);
      currentDate.setDate(1); // Ajusta el currentDate al inicio del mes

      while (currentDate <= paymentEndDate) {
        const monthYearKey = `${currentDate.getFullYear()}-${(
          '0' +
          (currentDate.getMonth() + 1)
        ).slice(-2)}`;

        if (!userCountsByMonth[monthYearKey]) {
          userCountsByMonth[monthYearKey] = {};
          userCountsByMonth[monthYearKey]['Total Members'] = 0; // Agregar el campo de 'Total Members'
        }

        userCountsByMonth[monthYearKey][membershipId] = userCountsByMonth[
          monthYearKey
        ][membershipId]
          ? userCountsByMonth[monthYearKey][membershipId] + 1
          : 1;

        userCountsByMonth[monthYearKey]['Total Members']++; // Incrementar el total de miembros

        currentDate.setMonth(currentDate.getMonth() + 1);
        currentDate.setDate(1); // Avanza al siguiente mes
      }
    });

    // Asegurar que userCountsByMonth contenga todos los meses del rango
    dateRange.forEach((monthYearKey) => {
      if (!userCountsByMonth[monthYearKey]) {
        userCountsByMonth[monthYearKey] = {};
        userCountsByMonth[monthYearKey]['Total Members'] = 0; // Agregar el campo de 'Total Members'
      }
    });

    // Obtener todos los meses en inglés y ordenarlos
    const allMonths = dateRange.map((key) => {
      const [year, month] = key.split('-');
      return {
        key,
        month: new Date(year, parseInt(month) - 1).toLocaleString('default', {
          month: 'long',
        }),
      };
    });

    allMonths.sort((a, b) => {
      const monthOrder = {
        January: 0,
        February: 1,
        March: 2,
        April: 3,
        May: 4,
        June: 5,
        July: 6,
        August: 7,
        September: 8,
        October: 9,
        November: 10,
        December: 11,
      };
      return monthOrder[a.month] - monthOrder[b.month];
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('UserCountsByMonth');

    // Usa planName o realiza las operaciones necesarias con él

    const membershipHeaders = [membershipName]; // Lista de columnas (membershipId y Total Members)

    worksheet.columns = [
      { header: 'Date', key: 'date' },
      { header: 'Month', key: 'month' }, // Columna 'Month'
      ...membershipHeaders.map((header) => ({ header, key: header })),
    ];

    allMonths.forEach((month) => {
      const key = month.key;
      const rowData = {
        date: key,
        month: month.month,
      };

      membershipHeaders.forEach((header) => {
        rowData[header] = userCountsByMonth[key][membershipId] || 0;
      });
      worksheet.addRow(rowData);
    });

    // Ajustar ancho de columnas
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });

    // Enviar el archivo Excel como respuesta
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="userCountsByMonth.xlsx"'
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// const generateReportByMembership = async (req, res) => {
//   try {
//     const { gymId, membershipId, startDate, endDate } = req.body;

//     const paymentHistoryRef = db.collection('paymentHistory');
//     const paymentSnapshot = await paymentHistoryRef
//       .where('gymId', '==', gymId)
//       .where('membershipId', '==', membershipId)
//       .get();

//     const userCountsByMonth = {};

//     paymentSnapshot.forEach((paymentDoc) => {
//       const profileData = paymentDoc.data();
//       const paymentStartDate = new Date(profileData.paymentStartDate);
//       const paymentEndDate = new Date(profileData.paymentEndDate);

//       // Comprueba si el pago intersecta con el rango de fechas proporcionado
//       if (
//         (paymentStartDate <= new Date(endDate) &&
//           paymentStartDate >= new Date(startDate)) ||
//         (paymentEndDate <= new Date(endDate) &&
//           paymentEndDate >= new Date(startDate))
//       ) {
//         let currentDate = new Date(paymentStartDate);
//         currentDate.setDate(1); // Ajusta el currentDate al inicio del mes

//         while (currentDate <= paymentEndDate) {
//           const monthYearKey = `${currentDate.getFullYear()}-${(
//             '0' +
//             (currentDate.getMonth() + 1)
//           ).slice(-2)}`;

//           if (!userCountsByMonth[monthYearKey]) {
//             userCountsByMonth[monthYearKey] = {};
//             userCountsByMonth[monthYearKey]['Total Members'] = 0; // Agregar el campo de 'Total Members'
//           }

//           userCountsByMonth[monthYearKey][membershipId] = userCountsByMonth[
//             monthYearKey
//           ][membershipId]
//             ? userCountsByMonth[monthYearKey][membershipId] + 1
//             : 1;

//           userCountsByMonth[monthYearKey]['Total Members']++; // Incrementar el total de miembros

//           currentDate.setMonth(currentDate.getMonth() + 1);
//           currentDate.setDate(1); // Avanza al siguiente mes
//         }
//       }
//     });

//     // Obtener todos los meses en inglés y ordenarlos
//     const allMonths = Object.keys(userCountsByMonth).map((key) => {
//       const [year, month] = key.split('-');
//       return {
//         key,
//         month: new Date(year, parseInt(month) - 1).toLocaleString('default', {
//           month: 'long',
//         }),
//       };
//     });

//     allMonths.sort((a, b) => {
//       const monthOrder = {
//         January: 0,
//         February: 1,
//         March: 2,
//         April: 3,
//         May: 4,
//         June: 5,
//         July: 6,
//         August: 7,
//         September: 8,
//         October: 9,
//         November: 10,
//         December: 11,
//       };
//       return monthOrder[a.month] - monthOrder[b.month];
//     });

//     // Generar el archivo Excel
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet('UserCountsByMonth');

//     const membershipHeaders = [membershipId, 'Total Members']; // Lista de columnas (membershipId y Total Members)

//     worksheet.columns = [
//       { header: 'Date', key: 'date' },
//       { header: 'Month', key: 'month' }, // Columna 'Month'
//       ...membershipHeaders.map((header) => ({ header, key: header })),
//     ];

//     allMonths.forEach((month) => {
//       const key = month.key;
//       const rowData = {
//         date: key,
//         'Total Members': userCountsByMonth[key]['Total Members'],
//         month: month.month,
//       };

//       membershipHeaders.forEach((header) => {
//         rowData[header] = userCountsByMonth[key][header] || 0;
//       });
//       worksheet.addRow(rowData);
//     });

//     // Ajustar ancho de columnas
//     worksheet.columns.forEach((column, index) => {
//       let maxLength = 0;
//       column.eachCell({ includeEmpty: true }, (cell) => {
//         const columnLength = cell.value ? cell.value.toString().length : 10;
//         if (columnLength > maxLength) {
//           maxLength = columnLength;
//         }
//       });
//       column.width = maxLength < 10 ? 10 : maxLength + 2;
//     });

//     // Enviar el archivo Excel como respuesta
//     res.setHeader(
//       'Content-Type',
//       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//     );
//     res.setHeader(
//       'Content-Disposition',
//       'attachment; filename="userCountsByMonth.xlsx"'
//     );
//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (error) {
//     console.error('Error fetching profiles:', error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

module.exports = {
  generateGlobalReport,
  generateReportByMembership,
};
