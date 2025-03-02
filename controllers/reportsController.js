const fs = require('fs');
const admin = require('firebase-admin');
const { db } = require('../firebase');
const PDFDocument = require('pdfkit-table');
const { format } = require('date-fns');
// const PDFDocumentTable = require('pdfkit-table');

const ExcelJS = require('exceljs');

const generateGymVisitReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Gym_Visit_Report.pdf"'
    );
    res.setHeader('Content-Type', 'application/pdf');
    doc.pipe(res);

    // 🔹 Obtener información del gym
    const gymSnapshot = await admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .get();
    const gymData = gymSnapshot.data();
    const gymName = gymData?.gymName || 'Unknown Gym';

    // 🔹 Obtener estadísticas de visitas
    const {
      summaryTableData,
      totalVisits,
      startDate,
      dayWithMostVisits,
      visitPercentagesByDay,
    } = await getGymVisitStatistics(gymId);

    // 🔥 Encabezado del reporte
    doc.rect(0, 0, 612, 80).fill('#007BFF'); // Azul corporativo
    doc
      .fillColor('white')
      .fontSize(25)
      .text('GYM VISIT REPORT', 50, 30, { align: 'left' });

    // 📌 Nombre del gym y fecha
    const today = new Date();
    const dateString = today.toISOString().split('T')[0];

    doc
      .fontSize(18)
      .text(`${gymName} - Report Date: ${dateString}`, { bold: true });

    doc.moveDown(2);
    doc
      .fillColor('black')
      .fontSize(14)
      .text(`Evaluation Period: ${startDate} - ${dateString}`, { bold: true });

    doc.moveDown(1);
    doc.fontSize(14).text(`Total Visits: ${totalVisits}`, { bold: true });

    doc.moveDown(1);
    doc.fontSize(14).text(`Busiest Day: ${dayWithMostVisits}`, { bold: true });

    doc.moveDown(2);

    // 📊 Agregar la tabla de estadísticas generales
    doc.fontSize(14).text('General Statistics:', { bold: true });
    doc.moveDown(1);

    // 📊 Crear la tabla con los promedios de visitas y tiempos
    const generalStatsTable = {
      headers: ['Statistic', 'Value'],
      rows: summaryTableData,
    };

    // 📊 Tabla de promedios ocupando todo el ancho disponible
    doc.table(generalStatsTable, { width: 510, x: 50, y: doc.y });

    doc.moveDown(2);

    // 📈 Agregar tabla de visitas por día de la semana
    doc
      .fontSize(14)
      .text('Visits by Day of the Week (Percentages):', { bold: true });
    doc.moveDown(1);

    // Crear la tabla de porcentajes de visitas
    const tableData = Object.entries(visitPercentagesByDay).map(
      ([day, percentage]) => ({
        day,
        percentage: `${percentage}%`,
      })
    );

    const table = {
      headers: ['Day', 'Visit Percentage'],
      rows: tableData.map((item) => [item.day, item.percentage]),
    };

    doc.table(table, { width: 250, x: 50, y: doc.y });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating the report');
  }
};

async function getGymVisitStatistics(gymId) {
  try {
    let totalVisits = 0;
    let morningVisits = 0,
      afternoonVisits = 0,
      eveningVisits = 0;
    let morningTimeSum = 0,
      afternoonTimeSum = 0,
      eveningTimeSum = 0;
    let visitDays = {}; // Para contar visitas por día de la semana

    // Fecha de inicio (hace 1 año)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1); // Restamos 1 año
    const startDate = oneYearAgo.toISOString().split('T')[0]; // Formato YYYY-MM-DD

    const accessSnapshot = await admin
      .firestore()
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('action', '==', 'check-in')
      .where('timestamp', '>=', oneYearAgo) // Cambié esta línea
      .get();

    accessSnapshot.forEach((doc) => {
      const timestamp = doc.data().timestamp.toDate();
      const hours = timestamp.getHours();
      const minutes = timestamp.getMinutes();
      const timeInMinutes = hours * 60 + minutes;
      const dayOfWeek = timestamp.toLocaleDateString('en-US', {
        weekday: 'long',
      });

      // Contar visitas por día de la semana
      visitDays[dayOfWeek] = (visitDays[dayOfWeek] || 0) + 1;

      // Clasificar las visitas en franjas horarias
      if (hours >= 5 && hours < 12) {
        morningVisits++;
        morningTimeSum += timeInMinutes;
      } else if (hours >= 12 && hours < 18) {
        afternoonVisits++;
        afternoonTimeSum += timeInMinutes;
      } else {
        eveningVisits++;
        eveningTimeSum += timeInMinutes;
      }

      totalVisits++;
    });

    // Calcular porcentajes de visitas por franja horaria
    const morningPercentage = totalVisits
      ? ((morningVisits / totalVisits) * 100).toFixed(2)
      : '0.00';
    const afternoonPercentage = totalVisits
      ? ((afternoonVisits / totalVisits) * 100).toFixed(2)
      : '0.00';
    const eveningPercentage = totalVisits
      ? ((eveningVisits / totalVisits) * 100).toFixed(2)
      : '0.00';

    // Calcular la hora promedio de cada franja horaria
    const calculateAverageTime = (timeSum, totalVisits) => {
      if (totalVisits === 0) return 'N/A';
      const avgMinutes = Math.floor(timeSum / totalVisits);
      const avgHours = Math.floor(avgMinutes / 60);
      const remainingMinutes = avgMinutes % 60;
      return `${avgHours.toString().padStart(2, '0')}:${remainingMinutes
        .toString()
        .padStart(2, '0')}`;
    };

    const morningAverageTime = calculateAverageTime(
      morningTimeSum,
      morningVisits
    );
    const afternoonAverageTime = calculateAverageTime(
      afternoonTimeSum,
      afternoonVisits
    );
    const eveningAverageTime = calculateAverageTime(
      eveningTimeSum,
      eveningVisits
    );

    // Calcular porcentajes de visitas por día de la semana
    const visitPercentagesByDay = Object.fromEntries(
      Object.entries(visitDays).map(([day, count]) => [
        day,
        ((count / totalVisits) * 100).toFixed(2),
      ])
    );

    // Obtener el día con más visitas
    const dayWithMostVisits = Object.entries(visitDays).reduce(
      (a, b) => (b[1] > a[1] ? b : a),
      ['None', 0]
    )[0];

    return {
      totalVisits,
      startDate,
      dayWithMostVisits,
      visitPercentagesByDay,
      summaryTableData: [
        ['Average Morning Visit (Opening - 12:00 PM)', `${morningPercentage}%`],
        [
          'Average Afternoon Visit (12:00 PM - 6:00 PM)',
          `${afternoonPercentage}%`,
        ],
        ['Average Evening Visit (6:00 PM - Closing)', `${eveningPercentage}%`],
        ['Average time of morning visits', morningAverageTime],
        ['Average time of afternoon visits', afternoonAverageTime],
        ['Average time of evening visits', eveningAverageTime],
      ],
    };
  } catch (error) {
    console.error('Error fetching gym visit statistics:', error);
    return null;
  }
}

// async function getGymVisitStatistics(gymId) {
//   try {
//     let totalVisits = 0;
//     let morningVisits = 0,
//       afternoonVisits = 0,
//       eveningVisits = 0;
//     let morningTimeSum = 0,
//       afternoonTimeSum = 0,
//       eveningTimeSum = 0;
//     let visitDays = {}; // Para contar visitas por día de la semana

//     // Fecha de inicio (hace 6 meses)
//     const sixMonthsAgo = new Date();
//     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
//     const startDate = sixMonthsAgo.toISOString().split('T')[0];

//     const accessSnapshot = await admin
//       .firestore()
//       .collection('accessHistory')
//       .where('gymId', '==', gymId)
//       .where('action', '==', 'check-in')
//       .where('timestamp', '>=', sixMonthsAgo)
//       .get();

//     accessSnapshot.forEach((doc) => {
//       const timestamp = doc.data().timestamp.toDate();
//       const hours = timestamp.getHours();
//       const minutes = timestamp.getMinutes();
//       const timeInMinutes = hours * 60 + minutes;
//       const dayOfWeek = timestamp.toLocaleDateString('en-US', {
//         weekday: 'long',
//       });

//       // Contar visitas por día de la semana
//       visitDays[dayOfWeek] = (visitDays[dayOfWeek] || 0) + 1;

//       // Clasificar las visitas en franjas horarias
//       if (hours >= 5 && hours < 12) {
//         morningVisits++;
//         morningTimeSum += timeInMinutes;
//       } else if (hours >= 12 && hours < 18) {
//         afternoonVisits++;
//         afternoonTimeSum += timeInMinutes;
//       } else {
//         eveningVisits++;
//         eveningTimeSum += timeInMinutes;
//       }

//       totalVisits++;
//     });

//     // Calcular porcentajes de visitas por franja horaria
//     const morningPercentage = totalVisits
//       ? ((morningVisits / totalVisits) * 100).toFixed(2)
//       : '0.00';
//     const afternoonPercentage = totalVisits
//       ? ((afternoonVisits / totalVisits) * 100).toFixed(2)
//       : '0.00';
//     const eveningPercentage = totalVisits
//       ? ((eveningVisits / totalVisits) * 100).toFixed(2)
//       : '0.00';

//     // Calcular la hora promedio de cada franja horaria
//     const calculateAverageTime = (timeSum, totalVisits) => {
//       if (totalVisits === 0) return 'N/A';
//       const avgMinutes = Math.floor(timeSum / totalVisits);
//       const avgHours = Math.floor(avgMinutes / 60);
//       const remainingMinutes = avgMinutes % 60;
//       return `${avgHours.toString().padStart(2, '0')}:${remainingMinutes
//         .toString()
//         .padStart(2, '0')}`;
//     };

//     const morningAverageTime = calculateAverageTime(
//       morningTimeSum,
//       morningVisits
//     );
//     const afternoonAverageTime = calculateAverageTime(
//       afternoonTimeSum,
//       afternoonVisits
//     );
//     const eveningAverageTime = calculateAverageTime(
//       eveningTimeSum,
//       eveningVisits
//     );

//     // Calcular porcentajes de visitas por día de la semana
//     const visitPercentagesByDay = Object.fromEntries(
//       Object.entries(visitDays).map(([day, count]) => [
//         day,
//         ((count / totalVisits) * 100).toFixed(2),
//       ])
//     );

//     // Obtener el día con más visitas
//     const dayWithMostVisits = Object.entries(visitDays).reduce(
//       (a, b) => (b[1] > a[1] ? b : a),
//       ['None', 0]
//     )[0];

//     return {
//       totalVisits,
//       startDate,
//       dayWithMostVisits,
//       visitPercentagesByDay,
//       summaryTableData: [
//         ['Average Morning Visit (Opening - 12:00 PM)', `${morningPercentage}%`],
//         [
//           'Average Afternoon Visit (12:00 PM - 6:00 PM)',
//           `${afternoonPercentage}%`,
//         ],
//         ['Average Evening Visit (6:00 PM - Closing)', `${eveningPercentage}%`],
//         ['Average time of morning visits', morningAverageTime],
//         ['Average time of afternoon visits', afternoonAverageTime],
//         ['Average time of evening visits', eveningAverageTime],
//       ],
//     };
//   } catch (error) {
//     console.error('Error fetching gym visit statistics:', error);
//     return null;
//   }
// }

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
      .where('role', 'array-contains', 'member')
      .where('profileStatus', '==', 'true')
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

    const penaltyQuery = await admin
      .firestore()
      .collection('paymentHistory')
      .where('gymId', '==', gymId)
      .where('paymentType', '==', 'Penalty')
      .where('paymentDate', '==', selectedDate)
      .get();

    const totalPenalties = penaltyQuery.size;

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
      Penalty: [],
    };

    for (const doc of querySnapshot.docs) {
      const paymentData = doc.data();
      const paymentAmount = parseFloat(paymentData.paymentAmount); // Convertir a número

      if (!isNaN(paymentAmount)) {
        totalReceive += paymentAmount;
      }

      try {
        if (
          ['renew', 'new', 'Freeze', 'UnFreeze', 'Penalty'].includes(
            paymentData.paymentType
          )
        ) {
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
          } else if (paymentData.paymentType === 'Penalty') {
            tablesByPaymentType.Penalty.push([
              paymentData.paymentDate,
              fullName,
              cardNo,
              membershipType,
              netRevenue,
              paymentData.paymentType,
            ]);
          }
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
      ["Today's Penalties", totalPenalties],
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
      Penalty: [
        'Penalty Date',
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
    for (const paymentType of [
      'Renew',
      'New',
      'Freeze',
      'Unfreeze',
      'Penalty',
    ]) {
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
    try {
      // Generar la tabla de Courts
      const courtsPaymentsSnapshot = await admin
        .firestore()
        .collection('paymentHistory')
        .where('gymId', '==', gymId)
        .where('paymentType', '==', 'Court')
        .where('paymentDate', '==', selectedDate)
        .get();

      const courtsTableData = [];

      for (const doc of courtsPaymentsSnapshot.docs) {
        const paymentData = doc.data();

        const signUpDate = paymentData.paymentDate; // Usar el dato que corresponda
        const netRevenue = `€ ${paymentData.paymentAmount}`;

        if (paymentData.memberType === 'member') {
          let fullName = '';
          let cardNo = '';
          if (paymentData.participants && paymentData.participants.length > 0) {
            const participant = paymentData.participants[0];
            const participantId = participant.profileId;

            const profileSnapshot = await admin
              .firestore()
              .collection('profiles')
              .doc(participantId)
              .get();

            const profileData = profileSnapshot.data();
            fullName = `${profileData.profileName} ${profileData.profileLastname}`;
            cardNo = profileData.cardSerialNumber;
          } else {
            console.error(
              'Participant not found for Courts payment:',
              paymentData
            );
          }
          courtsTableData.push([
            signUpDate,
            fullName,
            cardNo,
            'Member', // Tipo de membresía para miembros de Courts
            netRevenue,
            'Courts', // Tipo de pago
          ]);
        } else if (paymentData.memberType === 'guest') {
          const roomNumber = paymentData.roomNumber;
          courtsTableData.push([
            signUpDate,
            'Guest', // Tipo de membresía para invitados de Courts
            roomNumber,
            'Unknow Member',
            netRevenue,
            'Courts', // Tipo de pago
          ]);
        } else if (paymentData.memberType === 'unknownmember') {
          let cardNo = '';
          if (
            paymentData.unknownParticipants &&
            paymentData.unknownParticipants.length > 0
          ) {
            const participant = paymentData.unknownParticipants[0];
            const participantId = participant.profileId;

            const profileSnapshot = await admin
              .firestore()
              .collection('profiles')
              .doc(participantId)
              .get();

            const profileData = profileSnapshot.data();
            fullName = profileData.profileName;
            cardNo = profileData.cardSerialNumber;
          } else {
            console.error(
              'Participant not found for Courts payment:',
              paymentData
            );
          }
          courtsTableData.push([
            signUpDate,
            fullName,
            cardNo,
            'Unknown Member', // Tipo de membresía para miembros de Courts
            netRevenue,
            'Courts', // Tipo de pago
          ]);
        } else {
          console.error(
            'Invalid memberType for Courts payment:',
            paymentData.memberType
          );
        }
      }

      const courtsTableHeaders = [
        'Sign Up Date',
        'Full Name',
        'Card No/ Room Number',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ];

      if (courtsTableData.length > 0) {
        // Verificar si hay suficiente espacio en la página actual
        if (doc.y + 300 > doc.page.height) {
          doc.addPage(); // Agregar una nueva página si no hay suficiente espacio
        }

        generateTable('Courts', courtsTableData, courtsTableHeaders);
      }
    } catch (error) {
      console.error('Error generating Courts table:', error);
      // Manejar el error apropiadamente
    }

    try {
      // Generar la tabla de Courts
      const courtsPaymentsSnapshot = await admin
        .firestore()
        .collection('paymentHistory')
        .where('gymId', '==', gymId)
        .where('paymentType', '==', 'prepaidPackage')
        .where('paymentDate', '==', selectedDate)
        .get();

      const courtsTableData = [];

      for (const doc of courtsPaymentsSnapshot.docs) {
        const paymentData = doc.data();

        const signUpDate = paymentData.paymentDate; // Usar el dato que corresponda
        const netRevenue = `€ ${paymentData.paymentAmount}`;

        if (paymentData.memberType === 'unknownmember') {
          let cardNo = '';
          if (paymentData.profileId) {
            const participant = paymentData;
            const participantId = participant.profileId;

            const profileSnapshot = await admin
              .firestore()
              .collection('profiles')
              .doc(participantId)
              .get();

            const profileData = profileSnapshot.data();
            fullName = profileData.profileName;
            cardNo = profileData.cardSerialNumber;
          } else {
            console.error(
              'Participant not found for Prepaid Package payment:',
              paymentData
            );
          }
          courtsTableData.push([
            signUpDate,
            fullName,
            cardNo,
            'Unknown Member', // Tipo de membresía para miembros de Courts
            netRevenue,
            'Prepaid Package', // Tipo de pago
          ]);
        } else {
          console.error(
            'Invalid memberType for Prepaid Package payment:',
            paymentData.memberType
          );
        }
      }

      const courtsTableHeaders = [
        'Payment Date',
        'Full Name',
        'Card No/ Room Number',
        'Membership Type',
        'Net Revenue',
        'Payment Type',
      ];

      if (courtsTableData.length > 0) {
        // Verificar si hay suficiente espacio en la página actual
        if (doc.y + 300 > doc.page.height) {
          doc.addPage(); // Agregar una nueva página si no hay suficiente espacio
        }

        generateTable('Prepaid Package', courtsTableData, courtsTableHeaders);
      }
    } catch (error) {
      console.error('Error generating Prepaid Packages table:', error);
      // Manejar el error apropiadamente
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
      .where('role', 'array-contains', 'member')
      .where('profileStatus', '==', 'true')
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
        profileStatus: profile.profileStatus == 'true' ? 'Active' : 'Inactive',
      });
    });

    // Guarda el archivo Excel en una ubicación específica
    const outputPath = `active_members_${gymId}.xlsx`;

    workbook.xlsx
      .writeFile(outputPath)
      .then(() => {
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
      .where('role', 'array-contains', 'member')
      .where('profileStatus', '==', 'false')
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
        profileStatus: profile.profileStatus == 'true' ? 'Active' : 'Inactive',
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

const generateDnaReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { profileId } = req.body;
    const doc = new PDFDocument();

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Dna_report.pdf"'
    );
    doc.pipe(res);

    // Título del informe
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc.fontSize(25).fill('white').text('DNA REPORT - SUMMARY ', 50, 30, {
      align: 'left',
      valign: 'center',
    });

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

    // Agregar el título del informe
    doc.fontSize(18).text(`${dateString}`, { bold: true }).moveDown(1);

    // Obtener datos del perfil
    const profileSnapshot = await admin
      .firestore()
      .collection('profiles')
      .doc(profileId)
      .get();
    const profileData = profileSnapshot.data();

    // Obtener el ID de la membresía actual
    const name = profileData.profileName + ' ' + profileData.profileLastname;
    const membershipId = profileData.membershipId;
    const cardSerialNumber = profileData.cardSerialNumber;

    // Obtener datos de la membresía actual
    const membershipSnapshot = await admin
      .firestore()
      .collection('memberships')
      .doc(membershipId)
      .get();
    const membershipData = membershipSnapshot.data();

    // Obtener el tipo de membresía actual y la fecha de vencimiento
    const currentMembershipType = membershipData.planName;
    const expirationDate = profileData.profileEndDate;

    const paymentSnapshot = await admin
      .firestore()
      .collection('paymentHistory')
      .where('profileId', '==', profileId)
      .where('paymentType', '==', 'new')
      .get();

    let memberSinceDate = null;
    if (!paymentSnapshot.empty) {
      const oldestPayment = paymentSnapshot.docs[0].data();
      memberSinceDate =
        oldestPayment.paymentDate || oldestPayment.paymentStartDate;
    }

    const renewalSnapshot = await admin
      .firestore()
      .collection('paymentHistory')
      .where('profileId', '==', profileId)
      .where('paymentType', '==', 'renew')
      .get();

    const numberOfRenewals = renewalSnapshot.docs.length;

    const accessSnapshot = await admin
      .firestore()
      .collection('accessHistory')
      .where('profileId', '==', profileId)
      .where('action', '==', 'check-in')
      .get();

    const numberOfVisitsSinceRenewal = accessSnapshot.docs.length;

    const averageVisitTime = await calculateAverageVisitTime(profileId);
    const averageHourVisitTime = await calculateAverageHourVisitTime(profileId);
    const classParticipation = await calculateGroupClassParticipation(
      profileId,
      gymId
    );
    const courtsParticipation = await calculateCourtBookings(profileId, gymId);

    const summaryTableData = [
      ['Member Name', name],
      ['Current Card Serial Number', cardSerialNumber],
      ['Current Membership Type', currentMembershipType],
      ['Expiration of Current Membership', expirationDate],
      ['Member since', memberSinceDate],
      ['Number of Renewal', numberOfRenewals],
      ['Number of visits since inception', numberOfVisitsSinceRenewal],
      [
        'Average Morning Visit (Opening - 12:00 PM)',
        `${averageVisitTime.morning}%`,
      ],
      [
        'Average Afternoon Visit (12:00 PM - 6:00 PM)',
        `${averageVisitTime.afternoon}%`,
      ],
      [
        'Average Evening Visit (6:00 PM - Closing)',
        `${averageVisitTime.evening}%`,
      ],
      ['Average time of morning visits', averageHourVisitTime.morning],
      ['Average time of afternoon visits', averageHourVisitTime.afternoon],
      ['Average time of evening visits', averageHourVisitTime.evening],
      ['Group class participation', classParticipation],
      ['Court bookings', courtsParticipation],
    ];

    // Configurar la tabla
    const summaryTable = {
      headers: ['Title', 'Value'],
      rows: summaryTableData,
    };

    // Agregar la tabla al documento con estilos personalizados
    doc.table(summaryTable, {
      prepareHeader: () =>
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black'),
      prepareRow: (row, indexColumn, indexRow) => {
        doc.font('Helvetica').fontSize(10).fillColor('black');
      },
      borderHorizontalWidths: () => 1,
      borderVerticalWidths: () => 1,
      borderColor: () => 'black',
      padding: 10,
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    // Agregar la tabla de pagos al documento con estilos personalizados

    const paymentsTableData = await generatePaymentsTable(profileId);
    const paymentsTable = {
      headers: ['Date', 'Membership Type', 'Net Revenue', 'Payment Type'],
      rows: [],
    };

    paymentsTableData.forEach((payment) => {
      paymentsTable.rows.push(payment); // Agregar la fila completa
    });

    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(18) // Tamaño de fuente más grande
      .text('Payments', { bold: true })
      .moveDown(); // Espacio adicional después del título
    doc.table(paymentsTable, {
      prepareHeader: () =>
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black'),
      prepareRow: (row, indexColumn, indexRow) => {
        doc.font('Helvetica').fontSize(10).fillColor('black');
      },
      borderHorizontalWidths: () => 1,
      borderVerticalWidths: () => 1,
      borderColor: () => 'black',
      padding: 10,
      margins: { top: 20, bottom: 20, left: 50, right: 50 },
    });

    doc.addPage();

    const checkInOutData = await getCheckInOutData(profileId);
    const checkInOutTable = {
      headers: ['Index', 'Date', 'Check-In', 'Check-Out'],
      rows: checkInOutData.map((entry) => [
        entry.index,
        entry.date,
        entry.checkIn || '',
        entry.checkOut || `Didn't check-out`,
      ]),
    };

    // Agregar la tabla de CheckIn/CheckOut al documento
    doc
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(18) // Tamaño de fuente más grande
      .text('Check-In / Check-Out', { bold: true })
      .moveDown();
    doc.table(checkInOutTable, {
      prepareHeader: () =>
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black'),
      prepareRow: (row, indexColumn, indexRow) => {
        doc.font('Helvetica').fontSize(10).fillColor('black');
      },
      borderHorizontalWidths: () => 1,
      borderVerticalWidths: () => 1,
      borderColor: () => 'black',
      padding: 10,
      margins: { top: 20, bottom: 20, left: 50, right: 50 },
    });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating the report');
  }
};

// Función para obtener los datos de CheckIn/CheckOut
async function getCheckInOutData(profileId) {
  const accessSnapshot = await admin
    .firestore()
    .collection('accessHistory')
    .where('profileId', '==', profileId)
    .where('action', 'in', ['check-in', 'check-out'])
    .orderBy('timestamp')
    .get();

  const checkInOutData = [];

  let index = 1; // Iniciamos el índice en 1

  accessSnapshot.forEach((doc) => {
    const accessData = doc.data();
    const date = accessData.timestamp.toDate().toLocaleDateString();
    const time = accessData.timestamp.toDate().toLocaleTimeString();

    if (accessData.action === 'check-in') {
      // Si es check-in, agregamos una nueva entrada
      checkInOutData.push({ index, date, checkIn: time, checkOut: '' });
      index++; // Incrementamos el índice
    } else {
      // Si es check-out, actualizamos la última entrada de check-in
      if (checkInOutData.length > 0) {
        const lastEntry = checkInOutData[checkInOutData.length - 1];
        if (lastEntry.checkOut === '') {
          lastEntry.checkOut = time;
        }
      }
    }
  });

  return checkInOutData;
}

async function generatePaymentsTable(profileId) {
  const paymentsTableData = [];

  const paymentsSnapshot = await admin
    .firestore()
    .collection('paymentHistory')
    .where('profileId', '==', profileId)
    .get();

  for (const doc of paymentsSnapshot.docs) {
    const payment = doc.data();
    let date = '';
    if (payment.paymentDate) {
      date = payment.paymentDate;
    } else if (payment.paymentStartDate) {
      date = payment.paymentStartDate;
    }
    const membershipType = await getMembershipType(payment.membershipId);
    const netRevenue = `€ ${payment.paymentAmount}`;
    const paymentType = payment.paymentType;
    paymentsTableData.push([date, membershipType, netRevenue, paymentType]);
  }

  return paymentsTableData;
}

async function getMembershipType(membershipId) {
  const membershipSnapshot = await admin
    .firestore()
    .collection('memberships')
    .doc(membershipId)
    .get();

  return membershipSnapshot.exists
    ? membershipSnapshot.data().planName
    : 'Unknown';
}

async function calculateAverageVisitTime(profileId) {
  let totalVisits = 0;
  let morningVisits = 0;
  let afternoonVisits = 0;
  let eveningVisits = 0;

  const accessSnapshot = await admin
    .firestore()
    .collection('accessHistory')
    .where('profileId', '==', profileId)
    .where('action', '==', 'check-in')
    .get();

  accessSnapshot.forEach((doc) => {
    const timestamp = doc.data().timestamp.toDate();
    const hours = timestamp.getHours();

    if (hours >= 5 && hours < 12) {
      morningVisits++;
    } else if (hours >= 12 && hours < 18) {
      afternoonVisits++;
    } else {
      eveningVisits++;
    }

    totalVisits++;
  });

  const morningPercentage = (morningVisits / totalVisits) * 100;
  const afternoonPercentage = (afternoonVisits / totalVisits) * 100;
  const eveningPercentage = (eveningVisits / totalVisits) * 100;

  return {
    morning: morningPercentage.toFixed(2),
    afternoon: afternoonPercentage.toFixed(2),
    evening: eveningPercentage.toFixed(2),
  };
}

async function calculateAverageHourVisitTime(profileId) {
  let totalMorningVisits = 0;
  let totalAfternoonVisits = 0;
  let totalEveningVisits = 0;
  let morningTimeSum = 0;
  let afternoonTimeSum = 0;
  let eveningTimeSum = 0;

  const accessSnapshot = await admin
    .firestore()
    .collection('accessHistory')
    .where('profileId', '==', profileId)
    .where('action', '==', 'check-in')
    .get();

  accessSnapshot.forEach((doc) => {
    const timestamp = doc.data().timestamp.toDate();
    const hours = timestamp.getHours();
    const minutes = timestamp.getMinutes();
    const timeInMinutes = hours * 60 + minutes;

    if (hours >= 5 && hours < 12) {
      morningTimeSum += timeInMinutes;
      totalMorningVisits++;
    } else if (hours >= 12 && hours < 18) {
      afternoonTimeSum += timeInMinutes;
      totalAfternoonVisits++;
    } else {
      eveningTimeSum += timeInMinutes;
      totalEveningVisits++;
    }
  });

  const calculateAverageTime = (timeSum, totalVisits) => {
    if (totalVisits === 0) return 'No visits';

    const averageTimeInMinutes = timeSum / totalVisits;
    const averageHours = Math.floor(averageTimeInMinutes / 60);
    const averageMinutes = Math.floor(averageTimeInMinutes % 60);
    const period = averageHours < 12 ? 'AM' : 'PM';
    const formattedHours = averageHours % 12 || 12; // Convertir horas a formato de 12 horas

    return `${formattedHours}:${
      averageMinutes < 10 ? '0' : ''
    }${averageMinutes} ${period}`;
  };

  const morningAverageTime = calculateAverageTime(
    morningTimeSum,
    totalMorningVisits
  );
  const afternoonAverageTime = calculateAverageTime(
    afternoonTimeSum,
    totalAfternoonVisits
  );
  const eveningAverageTime = calculateAverageTime(
    eveningTimeSum,
    totalEveningVisits
  );

  return {
    morning: morningAverageTime,
    afternoon: afternoonAverageTime,
    evening: eveningAverageTime,
  };
}
async function calculateGroupClassParticipation(profileId, gymId) {
  let totalParticipations = 0;

  const classesSnapshot = await admin
    .firestore()
    .collection('classes')
    .where('gymId', '==', gymId)
    .get();

  classesSnapshot.forEach((doc) => {
    const classData = doc.data();
    if (classData.participants && classData.participants.includes(profileId)) {
      totalParticipations++;
    }
  });

  return totalParticipations;
}

async function calculateCourtBookings(profileId, gymId) {
  let totalBookings = 0;

  const sessionsSnapshot = await admin
    .firestore()
    .collection('sessionHistory')
    .where('gymId', '==', gymId)
    .get();

  sessionsSnapshot.forEach((doc) => {
    const sessionData = doc.data();
    if (
      sessionData.participants &&
      sessionData.participants.includes(profileId)
    ) {
      totalBookings++;
    }
  });

  return totalBookings;
}

const generateWalkinReport = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { selectedDate, sortBy } = req.body;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Checkin Checkout Report');

    // Consulta la colección accessHistory filtrando por gymId y timestamp
    const accessHistorySnapshot = await db
      .collection('accessHistory')
      .where('gymId', '==', gymId)
      .where('timestamp', '>=', new Date(selectedDate))
      .where('timestamp', '<', new Date(selectedDate + 'T23:59:59'))
      .get();

    const reportData = [];

    // Itera sobre los resultados de accessHistory
    for (const accessDoc of accessHistorySnapshot.docs) {
      const accessData = accessDoc.data();
      const profileId = accessData.profileId;

      // Consulta la colección profiles para obtener más información sobre el perfil
      const profileSnapshot = await db
        .collection('profiles')
        .doc(profileId)
        .get();
      const profileData = profileSnapshot.data();

      // Consulta la colección memberships para obtener el planName
      const membershipId = profileData.membershipId;
      const membershipSnapshot = await db
        .collection('memberships')
        .doc(membershipId)
        .get();
      const membershipData = membershipSnapshot.data();
      const planName = membershipData.planName;

      // Añade los datos al array para el informe
      reportData.push({
        timestamp: new Date(
          accessData.timestamp._seconds * 1000 +
            accessData.timestamp._nanoseconds / 1e6
        ),
        profileName: profileData.profileName,
        profileLastname: profileData.profileLastname,
        cardSerialNumber: profileData.cardSerialNumber,
        planName: planName,
        eventType: accessData.action, // Puedes cambiarlo según la estructura real
      });
    }
    // reportData.sort((a, b) => a.planName.localeCompare(b.planName));

    // reportData.sort((a, b) =>
    //   a.cardSerialNumber.localeCompare(b.cardSerialNumber)
    // );
    if (sortBy === 'planName') {
      reportData.sort((a, b) => a.planName.localeCompare(b.planName));
    } else if (sortBy === 'cardSerialNumber') {
      reportData.sort((a, b) =>
        a.cardSerialNumber.localeCompare(b.cardSerialNumber)
      );
    } else {
      // Orden por defecto (por timestamp u otro criterio)
      // Aquí puedes ajustar el criterio de orden por defecto según tus necesidades
      reportData.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Configura las columnas del archivo Excel
    worksheet.columns = [
      { header: 'Index', key: 'index', width: 5 },
      {
        header: 'Date',
        key: 'date',
        width: 10,
        style: {
          numFmt: 'yyyy-mm-dd',
        },
      },
      {
        header: 'Time',
        key: 'time',
        width: 12,
        style: {
          numFmt: 'hh:mm:ss AM/PM',
        },
      },
      { header: 'Name', key: 'profileName', width: 15 },
      { header: 'Last Name', key: 'profileLastname', width: 15 },
      { header: 'Card Number', key: 'cardSerialNumber', width: 15 },
      { header: 'Membership', key: 'planName', width: 34 },
      { header: 'Event Type', key: 'eventType', width: 15 },
    ];

    reportData.forEach((data, index) => {
      const date = data.timestamp.toISOString().split('T')[0];
      const time = data.timestamp.toLocaleTimeString('en-US', {
        hour12: true,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });

      worksheet.addRow({
        index: index + 1,
        date: date,
        time: time,
        profileName: data.profileName,
        profileLastname: data.profileLastname,
        cardSerialNumber: data.cardSerialNumber,
        planName: data.planName,
        eventType: data.eventType,
      });
    });

    // Configura la respuesta HTTP para enviar el archivo Excel
    res.status(200).attachment('walk_in_report.xlsx');

    // Guarda el archivo Excel y envía la respuesta
    await workbook.xlsx.write(res);
  } catch (error) {
    console.error('Error al generar el informe de walk-ins:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const generatePenaltiesReport = async (req, res) => {
  const { gymId } = req.params;

  try {
    // Consultar los perfiles que tengan penaltyActive en true y que pertenezcan al gymId
    const profilesSnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('penaltyActive', '==', true)
      .get();

    // Extraer los datos relevantes de cada perfil
    const profiles = profilesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        profileName: data.profileName,
        profileLastname: data.profileLastname,
        cardSerialNumber: data.cardSerialNumber,
      };
    });

    // Obtener la información del gimnasio para la zona horaria
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
      'inline; filename="penalties_report.pdf"'
    );
    doc.pipe(res);

    // Encabezado del documento
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc
      .fontSize(25)
      .fill('white')
      .text('PENALTIES REPORT', 50, 30, { align: 'left', valign: 'center' });

    doc.fontSize(18).text(`${dateString}`, { bold: true });

    doc
      .moveDown(1)
      .fill('#0000')
      .text(`Total Members with Penalties: ${profiles.length}`, {
        fontSize: 14,
        bold: true,
      })
      .moveDown(1);

    // Crear la tabla en el PDF
    doc.table({
      headers: ['First Name', 'Last Name', 'Card Serial Number'],
      rows: profiles.map((profile) => [
        profile.profileName,
        profile.profileLastname,
        profile.cardSerialNumber,
      ]),
      fontSize: 12,
      width: { 0: 200, 1: 200, 2: 150 },
    });

    // Finalizar el documento
    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).send('Error generating the penalties report');
  }
};

module.exports = {
  generateGlobalReport,
  generateReportByMembership,
  generateDailyReport,
  generateExpirationReport,
  generateActiveMembersReport,
  generateInactiveMembersReport,
  generateDnaReport,
  generateWalkinReport,
  generatePenaltiesReport,
  generateGymVisitReport,
};
