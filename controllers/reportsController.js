const fs = require('fs');
const admin = require('firebase-admin');
const { db } = require('../firebase');
const PDFDocument = require('pdfkit-table');
const { format } = require('date-fns');
// const PDFDocumentTable = require('pdfkit-table');

const ExcelJS = require('exceljs');

const getLocalTime = (currentDateTime, gymTimeZone) => {
  const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone);
  if (offsetMatch) {
    const offsetHours = parseFloat(offsetMatch[1]);

    return new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000);
  } else {
    throw new Error('Invalid time zone format.');
  }
};
const generateGlobalReport = async (req, res) => {
  try {
    const { gymId, startDate, endDate } = req.body;

    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymTimeZone = gymData.gymTimeZone;
    const utcDate = new Date();
    const localDate = getLocalTime(utcDate, gymTimeZone);

    const formattedDate = localDate.toISOString().split('T')[0];
    const formatNewDate = localDate.toISOString().slice(11, 16);

    const hours = parseInt(formatNewDate.slice(0, 2));
    const minutes = parseInt(formatNewDate.slice(3, 5));

    // Determinar si es AM o PM
    const period = hours < 12 ? 'AM' : 'PM';

    // Convertir las horas al formato de 12 horas
    const hours12 = hours % 12 || 12;

    // Formatear la hora en el formato deseado (12 horas)
    const formattedTime12 = `${hours12}:${
      minutes < 10 ? '0' : ''
    }${minutes} ${period}`;
    // Consultar los pagos en el rango de fechas y para el gymId específico
    const snapshot = await db
      .collection('paymentHistory')
      .where('paymentDate', '>=', startDate)
      .where('paymentDate', '<=', endDate)
      .where('gymId', '==', gymId)
      .get();

    const payments = snapshot.docs.map((doc) => doc.data());

    const monthlyData = {};

    // Procesar los pagos y agruparlos por mes
    payments.forEach((payment) => {
      const monthYear = payment.paymentDate.substring(0, 7); // Tomar solo el año y mes

      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = 0;
      }

      monthlyData[monthYear] += payment.paymentAmount;
    });

    const doc = new PDFDocument();

    // Agregamos contenido al PDF
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc.fontSize(25).fill('white').text('TOTAL REVENUE REPORT', 50, 30, {
      align: 'left',
      valign: 'center',
    });

    doc
      .fontSize(18)
      .text(`${formattedDate}   ${formattedTime12}`, { bold: true })
      .moveDown(0.5);
    doc.moveDown();

    doc
      .fontSize(14)
      .fill('black')
      .text(`From ${startDate} to ${endDate}`, { bold: true })
      .moveDown(0.5);
    doc.moveDown();

    // Ordenar las fechas para asegurarse de que estén en orden
    const sortedDates = Object.keys(monthlyData).sort();

    // Crear una tabla más elaborada
    const table = {
      headers: ['Month', 'Total Revenue'],
      rows: [],
    };

    // Llenar la tabla con datos y aplicar formato
    sortedDates.forEach((monthYear) => {
      const revenueFormatted = `€ ${monthlyData[monthYear].toFixed(2)}`;
      table.rows.push([monthYear, revenueFormatted]);
    });

    // Establecer el ancho de las columnas
    const columnWidths = [
      doc.widthOfString('Month') + 30,
      doc.widthOfString('Revenue') + 30,
    ];
    table.widths = columnWidths;

    // Imprimir la tabla en el PDF
    doc.table(table, {
      prepareHeader: () =>
        doc.font('Helvetica-Bold').fill('black').fontSize(14), // Color negro para las cabeceras
      prepareRow: (row, i) => doc.font('Helvetica').fontSize(12),
    });

    // Establece el tipo de contenido y el encabezado de respuesta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=revenue_report.pdf');

    // Pasa el contenido del PDF directamente a la respuesta
    doc.pipe(res);

    // Finaliza el documento
    doc.end();
  } catch (error) {
    console.error('Error generando el informe global:', error);
    res.status(500).send('Internal Server Error');
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

//     // Crear un rango de fechas con todos los meses entre startDate y endDate
//     const dateRange = [];
//     let currentDate = new Date(startDate);
//     currentDate.setDate(1); // Establecer en el primer día del mes

//     while (currentDate <= new Date(endDate)) {
//       const monthYearKey = `${currentDate.getFullYear()}-${(
//         '0' +
//         (currentDate.getMonth() + 1)
//       ).slice(-2)}`;

//       dateRange.push(monthYearKey);

//       currentDate.setMonth(currentDate.getMonth() + 1); // Avanzar al siguiente mes
//     }

//     const allMonths = Object.keys(userCountsByMonth)
//       .filter((key) => dateRange.includes(key))
//       .map((key) => {
//         const [year, month] = key.split('-');
//         return {
//           key,
//           month: new Date(year, parseInt(month) - 1).toLocaleString('default', {
//             month: 'long',
//           }),
//         };
//       });

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

const getUtcOffset = (timeZoneStr) => {
  const sign = timeZoneStr.includes('-') ? -1 : 1;
  const offsetStr = timeZoneStr.split(/[\+\-]/)[1];
  return parseInt(offsetStr, 10) * sign;
};

const generateExpirationReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { selectedDays } = req.body;

    // Consulta a Firestore para obtener perfiles que cumplen con los criterios
    const profilesSnapshot = await admin
      .firestore()
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('profileStatus', '==', true)
      .get();

    // Configurar el encabezado de la respuesta para descargar el PDF
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="expiration_report.pdf"'
    );

    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    doc.pipe(res);

    // Título del informe
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc
      .fontSize(25)
      .fill('white')
      .text('EXPIRATION REPORT', 50, 30, { align: 'left', valign: 'center' });

    // Obtener la fecha límite para la expiración (hoy + selectedDays)
    const currentDate = new Date();
    const endDate = new Date(
      currentDate.getTime() + selectedDays * 24 * 60 * 60 * 1000
    );

    // Tabla para mostrar la información
    const tableData = [];

    // Iterar sobre los perfiles y agregar la información a la tabla
    for (const profileDoc of profilesSnapshot.docs) {
      const profile = profileDoc.data();
      const {
        profileName,
        profileLastname,
        membershipId,
        profileEndDate,
        profileEmail,
      } = profile;

      // Convertir la cadena 'YYYY-MM-DD' a un objeto Date
      const endDateAsDate = new Date(profileEndDate);

      // Calcular la diferencia de días
      const daysDifference = Math.floor(
        (endDateAsDate - currentDate) / (24 * 60 * 60 * 1000)
      );

      // Verificar si el perfil está dentro del rango de días seleccionado
      if (daysDifference <= selectedDays) {
        // Obtener información del tipo de membresía
        const membershipSnapshot = await admin
          .firestore()
          .collection('memberships')
          .doc(membershipId)
          .get();
        const membership = membershipSnapshot.data();

        tableData.push([
          profileName + ' ' + profileLastname,
          membership.planName,
          profileEndDate,
          profileEmail,
        ]);
      }
    }
    if (tableData.length > 0) {
      const table = {
        headers: ['Full Name', 'Membership Type', 'Expiration Date', 'Email'],
        rows: tableData,
      };

      doc.moveDown().table(table, {
        x: 100,
        y: 150,
        autoSize: true,
      });
    } else {
      doc.text('No data available for the selected criteria.', 100, 150);
    }

    doc.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
};

const generateDailyReport = async (req, res) => {
  try {
    const { gymId } = req.params;

    const { selectedDate } = req.body;
    const doc = new PDFDocument();

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="daily_report.pdf"'
    );
    doc.pipe(res);

    // Título del informe
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc
      .fontSize(25)
      .fill('white')
      .text('DAILY REPORT', 50, 30, { align: 'left', valign: 'center' });

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

    const tableData = [];

    const newMembersQuery = await admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentType', '==', 'new')
      .where('paymentDate', '>=', selectedDate)
      .get();

    const totalNewMembers = newMembersQuery.size;

    const renewedMembersQuery = await admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentType', '==', 'renew')
      .where('paymentDate', '>=', selectedDate)
      .get();

    const totalRenewedMembers = renewedMembersQuery.size;

    const startOfDay = new Date(`${selectedDate}T00:00:00`);
    const endOfDay = new Date(`${selectedDate}T23:59:59.999`);

    const todayCheckinsQuery = await admin
      .firestore()
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-in')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    const totalCheckins = todayCheckinsQuery.size;
    // Today's Revenue

    const todayCheckoutsQuery = await admin
      .firestore()
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-out')
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    const totalCheckouts = todayCheckoutsQuery.size;

    const guestsQuery = await admin
      .firestore()
      .collection('guests')
      .where('gymId', '==', gymId)
      .where('currentDate', '==', selectedDate)
      .get();

    const totalGuests = guestsQuery.size;

    const frozenQuery = await admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentType', '==', 'Freeze')
      .where('paymentDate', '==', selectedDate)
      .get();

    let totalFrozen = 0; // Inicializa la variable para evitar errores

    if (frozenQuery) {
      totalFrozen = frozenQuery.size;
    }

    // Ahora puedes usar totalFrozen en tu lógica

    const unFrozenQuery = await admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentType', '==', 'UnFreeze')
      .where('paymentDate', '==', selectedDate)
      .get();

    const totalUnfrozen = unFrozenQuery.size;

    const paymentsRef = admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentDate', '==', selectedDate);

    let totalReceive = 0;
    const querySnapshot = await paymentsRef.get();

    const tablesByPaymentType = {
      Renew: [],
      New: [],
      Freeze: [],
      Unfreeze: [],
    };

    for (const doc of querySnapshot.docs) {
      const paymentData = doc.data();
      const paymentAmount = parseFloat(paymentData.paymentAmount); // Convertir a número

      if (!isNaN(paymentAmount)) {
        totalReceive += paymentAmount;
      }

      try {
        const profileSnapshot = await admin
          .firestore()
          .collection('profiles')
          .doc(paymentData.profileId)
          .get();

        const membershipSnapshot = await admin
          .firestore()
          .collection('memberships')
          .doc(paymentData.membershipId)
          .get();

        const profileData = profileSnapshot.data();
        const membershipData = membershipSnapshot.data();

        const signUpDate = paymentData.paymentDate; // Usar el dato que corresponda
        const fullName = `${profileData.profileName} ${profileData.profileLastname}`;
        const cardNo = profileData.cardSerialNumber;
        const membershipType = membershipData.planName
          ? membershipData.planName
          : '';
        const netRevenue = `€ ${paymentData.paymentAmount}`;
        const paymentType = paymentData.paymentType;

        if (paymentType === 'renew') {
          tablesByPaymentType.Renew.push([
            signUpDate,
            fullName,
            cardNo,
            membershipType,
            netRevenue,
            paymentType,
          ]);
        } else if (paymentType === 'new') {
          tablesByPaymentType.New.push([
            signUpDate,
            fullName,
            cardNo,
            membershipType,
            netRevenue,
            paymentType,
          ]);
        } else if (paymentType === 'Freeze') {
          tablesByPaymentType.Freeze.push([
            signUpDate,
            fullName,
            cardNo,
            membershipType,
            netRevenue,
            paymentType,
          ]);
        } else if (paymentType === 'UnFreeze') {
          tablesByPaymentType.Unfreeze.push([
            signUpDate,
            fullName,
            cardNo,
            membershipType,
            netRevenue,
            paymentType,
          ]);
        }
      } catch (error) {
        console.error('Error fetching profiles/memberships:', error);
      }
    }

    // Resto del código después de que todas las promesas se resuelvan

    doc
      .fontSize(18)
      .text(`SUMMARY  ${selectedDate}`, { bold: true })
      .moveDown(1);

    //First table

    const summaryTableData = [
      ["Today's revenue", `€ ${totalReceive}`],
      ["Today's new memberships", totalNewMembers],
      ["Today's new renewal", totalRenewedMembers],
      ["Today's check-in", totalCheckins],
      ["Today's check-out", totalCheckouts],
      ["Today's Guest's", totalGuests],
      ["Today's Memberships Frozen", totalFrozen],
      ["Today's Memberships UnFrozen", totalUnfrozen],
    ];

    const summaryTable = {
      headers: ['Title', 'Value'],
      rows: summaryTableData,
    };

    doc.table(summaryTable, {
      prepareHeader: () =>
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black'),
      prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
        doc.font('Helvetica').fontSize(10);
        doc.fillColor('black'); // Establece el color de la fuente aquí

        // Configuración de estilos para las celdas

        // Asegúrate de dibujar solo el borde exterior de la tabla
      },

      borderHorizontalWidths: (i) => (i === -1 ? 1 : 0),
      borderVerticalWidths: (i) => (i === -1 ? 1 : 0),
      borderColor: (i) => (i === -1 ? 'black' : 'gray'),
      padding: 10,
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      // Ubicación vertical de la tabla en el documento
    });

    // Second table

    const headersByPaymentType = {
      Renew: [
        'Renewal Date',
        'Full Name',
        'Card No',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ],
      New: [
        'Sign Up Date',
        'Full Name',
        'Card No',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ],
      Freeze: [
        'Freeze Date',
        'Full Name',
        'Card No',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ],
      Unfreeze: [
        'Unfreeze Date',
        'Full Name',
        'Card No',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ],
    };

    function generateTable(paymentType, tableData, tableHeaders) {
      const table = {
        title: `${paymentType} Payments Details`,
        headers: tableHeaders.map((header) => ({
          label: header,
          property: header.toLowerCase(),
          width: 80,
          renderer: null,
        })),
        rows: tableData.map((data) => data.map((cell) => String(cell))),
      };

      // Generar la tabla en el documento PDF
      doc.text(table.title, { align: 'center' }).moveDown(0.5);
      doc.table(table, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
        prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
          doc.font('Helvetica').fontSize(10);
          // ... lógica para preparar las filas
        },
        borderHorizontalWidths: (i) => 0.8,
        borderVerticalWidths: (i) => 0.8,
        borderColor: (i) => (i === -1 ? 'black' : 'gray'),
        padding: 10,
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });
    }

    // Recorre los tipos de pago y genera tablas
    for (const paymentType of ['Renew', 'New', 'Freeze', 'Unfreeze']) {
      if (Object.hasOwnProperty.call(tablesByPaymentType, paymentType)) {
        const tableData = tablesByPaymentType[paymentType];
        if (tableData.length > 0) {
          const tableHeaders = headersByPaymentType[paymentType];

          // Verificar si hay suficiente espacio en la página actual
          if (doc.y + 300 > doc.page.height) {
            doc.addPage(); // Agregar una nueva página si no hay suficiente espacio
          }

          generateTable(paymentType, tableData, tableHeaders);
        }
      }
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating the report');
  }
};

const generateActiveMembersReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const profilesRef = db.collection('profiles');
    const membershipsRef = db.collection('memberships');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Active Members');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId)
      .where('role', '==', 'member')
      .where('profileStatus', '==', true)
      .get();

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
    const outputPath = `active_members_${gymId}.xlsx`;

    workbook.xlsx
      .writeFile(outputPath)
      .then(() => {
        c;

        // Puedes enviar el archivo al cliente como respuesta
        res.download(outputPath, (downloadError) => {
          if (downloadError) {
            console.error(
              'Error al descargar el archivo Excel:',
              downloadError
            );
          }
          // Elimina el archivo después de enviarlo al cliente
          // Puedes omitir esta parte si prefieres conservar el archivo
          require('fs').unlink(outputPath, (unlinkError) => {
            if (unlinkError) {
              console.error('Error al eliminar el archivo Excel:', unlinkError);
            }
          });
        });
      })
      .catch((writeError) => {
        console.error('Error al guardar el archivo Excel:', writeError);
        res.status(500).json({ error: 'Error interno del servidor' });
      });
  } catch (error) {
    console.error('Error al generar el informe de miembros activos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
const generateInactiveMembersReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const profilesRef = db.collection('profiles');
    const membershipsRef = db.collection('memberships');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inactive Members');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId)
      .where('role', '==', 'member')
      .where('profileStatus', '==', false)
      .get();

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
      const profileData = doc.data();
      const membershipId = profileData.membershipId || '';
      const membershipData = membershipDataMap.get(membershipId) || {};
      const planName = membershipData.planName || '';

      // Agregar la columna adicional "Inactive Type"
      const inactiveType =
        profileData.profileFrozen ?? false ? 'Frozen' : 'Expired';

      profilesData.push({
        ...profileData,
        planName: planName,
        inactiveType: inactiveType,
      });
    });
    profilesData.sort((a, b) => {
      if (a.inactiveType === 'Frozen' && b.inactiveType !== 'Frozen') {
        return -1;
      } else if (a.inactiveType !== 'Frozen' && b.inactiveType === 'Frozen') {
        return 1;
      }
      return 0;
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
      { header: 'Inactive Type', key: 'inactiveType', width: 15 }, // Nueva columna
    ];

    // Llena el archivo Excel con los datos filtrados
    profilesData.forEach((profile, index) => {
      worksheet.addRow({
        index: index + 1,
        profileName: profile.profileName || '',
        profileLastname: profile.profileLastname || '',
        cardSerialNumber: profile.cardSerialNumber || '',
        profileStartDate: profile.profileStartDate || '',
        profileEndDate: profile.profileEndDate || '',
        planName: profile.planName || '',
        profileStatus: profile.profileStatus ? 'Active' : 'Inactive',
        inactiveType: profile.inactiveType || '',
      });
    });

    // Guarda el archivo Excel en una ubicación específica
    const outputPath = `inactive_members_report_${gymId}.xlsx`;

    await workbook.xlsx.writeFile(outputPath);

    // Puedes enviar el archivo Excel como respuesta a la solicitud HTTP
    res.status(200).download(outputPath, (err) => {
      if (err) {
        console.error('Error al enviar el archivo Excel como respuesta:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
      } else {
      }
    });
  } catch (error) {
    console.error('Error al generar el informe de miembros inactivos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  generateGlobalReport,
  generateReportByMembership,
  generateDailyReport,
  generateExpirationReport,
  generateActiveMembersReport,
  generateInactiveMembersReport,
};
