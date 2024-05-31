const ExcelJS = require('exceljs');
const fs = require('fs');
const admin = require('firebase-admin');
const { db } = require('../firebase');

const gymIdToFilter = 'marriot-1';
const cardsRef = db.collection('cards');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Cards');

cardsRef
  .where('gymId', '==', gymIdToFilter)
  .where('cardSerialNumber', '>=', `NMP-MAR-000`)
  .where('cardSerialNumber', '<=', `NMP-MAR-200`)
  .get()
  .then((snapshot) => {
    const filteredCards = [];
    snapshot.forEach((doc) => {
      filteredCards.push(doc.data());
    });

    // Configuración de las columnas del archivo Excel
    worksheet.columns = [
      { header: 'cardSerialNumber', key: 'cardSerialNumber', width: 15 },
      { header: 'qrImage', key: 'qrImage', width: 15 },
    ];

    // Llena el archivo Excel con los datos filtrados
    filteredCards.forEach((card) => {
      // Aplica la configuración para cortar el texto y mostrar una parte en la celda
      worksheet.addRow({
        cardSerialNumber: card.cardSerialNumber,
        qrImage: card.qrImage,
      });
      worksheet.getRow(worksheet.rowCount).eachCell((cell) => {
        cell.alignment = { wrapText: true, shrinkToFit: true };
      });
    });

    // Guarda el archivo Excel en una ubicación específica
    const outputPath = 'excel.xlsx';

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
