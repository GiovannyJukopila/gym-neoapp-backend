const ExcelJS = require('exceljs');
const { db } = require('../firebase');

const gymIdToFilter = '23-MAR'; // Esto puede variar según tu caso específico
const cardsRef = db.collection('cards');
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Cards');

// Crear una función para generar los IDs en el rango deseado
function generateCardSerialNumbers() {
  const cardSerialNumbers = [];
  for (let i = 1000; i <= 1999; i++) {
    const paddedNumber = i.toString().padStart(3, '0'); // Añade ceros a la izquierda si es necesario
    const cardSerialNumber = `${gymIdToFilter}-${paddedNumber}`;
    cardSerialNumbers.push(cardSerialNumber);
  }
  return cardSerialNumbers;
}

const cardSerialNumbers = generateCardSerialNumbers();

// Obteniendo los documentos basados en los IDs generados
const promises = cardSerialNumbers.map((cardSerialNumber) => {
  return cardsRef.doc(cardSerialNumber).get();
});

Promise.all(promises)
  .then((snapshots) => {
    const filteredCards = snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data());

    // Configuración de las columnas del archivo Excel
    worksheet.columns = [
      { header: 'cardSerialNumber', key: 'cardSerialNumber' },
      { header: 'qrImage', key: 'qrImage' },
    ];

    // Llena el archivo Excel con los datos filtrados
    filteredCards.forEach((card) => {
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
      .then(() => {
        console.log('Archivo Excel generado y guardado:', outputPath);
      })
      .catch((error) => {
        console.error('Error al guardar el archivo Excel:', error);
      });
  })
  .catch((error) => {
    console.error('Error al obtener datos de Firestore:', error);
  });
