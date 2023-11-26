const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const Profile = require('../models/profile');

const admin = require('firebase-admin');

const createGuest = async (req, res) => {
  try {
    const guestsRef = db.collection('guests');

    // Resto de los campos del guest
    const guestData = {
      gymId: req.body.gymId,
      roomNumber: req.body.roomNumber,
      name: req.body.name,
      lastname: req.body.lastname,
      numberOfPeople: req.body.numberOfPeople,
      currentDate: req.body.currentDate,
    };

    // Crea el nuevo guest
    const newGuestRef = await guestsRef.add(guestData);
    const newGuestId = newGuestRef.id;
    guestData.guestId = newGuestId;

    // Responde con éxito
    res
      .status(201)
      .json({ message: 'Invitado creado con éxito', guest: guestData });
  } catch (error) {
    console.error('Error al crear el invitado:', error);
    res.status(500).json({ error: 'Error al crear el invitado' });
  }
};

const getAllGuests = async (req, res) => {
  try {
    const gymId = req.query.gymId; // Obtén el gymId de los parámetros de la consulta
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;
    // Verifica si se proporcionó el parámetro gymId
    if (!gymId) {
      return res
        .status(400)
        .json({ error: 'El parámetro gymId es obligatorio' });
    }

    const guestsRef = db.collection('guests');

    // Realiza la consulta para obtener todos los invitados con el gymId proporcionado
    const guestsSnapshot = await guestsRef
      .where('gymId', '==', gymId)
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    // Construye un array con los datos de cada invitado
    const guestsData = [];
    guestsSnapshot.forEach((doc) => {
      const guestData = {
        guestId: doc.id,
        ...doc.data(),
        currentDate: formatDate(doc.data().currentDate), // Aplicar formatDate a currentDate
      };
      guestsData.push(guestData);
    });

    // Responde con los invitados obtenidos
    res.status(200).json({ guestsData });
  } catch (error) {
    console.error('Error al obtener los invitados:', error);
    res.status(500).json({ error: 'Error al obtener los invitados' });
  }
};
function formatDate(date) {
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else if (date && typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return formatDate(parsedDate);
    }
  }
  return date; // Devolver tal cual si no es una instancia de Date ni una cadena válida
}

const updateGuest = async (req, res) => {
  try {
    const guestId = req.params.guestId; // Obtén el guestId de los parámetros de la ruta

    // Verifica si se proporcionó el parámetro guestId
    if (!guestId) {
      return res
        .status(400)
        .json({ error: 'El parámetro guestId es obligatorio' });
    }

    const guestsRef = db.collection('guests');
    const guestDoc = await guestsRef.doc(guestId).get();

    // Verifica si el invitado existe
    if (!guestDoc.exists) {
      return res.status(404).json({ error: 'Invitado no encontrado' });
    }

    // Realiza la actualización del invitado
    await guestsRef.doc(guestId).update(req.body);

    // Obtén el invitado actualizado
    const updatedGuestDoc = await guestsRef.doc(guestId).get();
    const updatedGuestData = {
      guestId: updatedGuestDoc.id,
      currentDate: formatDate(guestDoc.data().currentDate),
      ...updatedGuestDoc.data(),
    };

    // Responde con el invitado actualizado
    res.status(200).json({
      message: 'Invitado actualizado con éxito',
      updatedGuestData,
    });
  } catch (error) {
    console.error('Error al actualizar el invitado:', error);
    res.status(500).json({ error: 'Error al actualizar el invitado' });
  }
};

const getGuest = async (req, res) => {
  try {
    const guestId = req.params.id;

    if (!guestId) {
      return res
        .status(400)
        .json({ error: 'El parámetro guestId es obligatorio' });
    }

    const guestRef = db.collection('guests').doc(guestId);
    const guestDoc = await guestRef.get();

    if (!guestDoc.exists) {
      return res.status(404).json({
        error: 'No se encontró ningún invitado con el ID proporcionado',
      });
    }

    const guestData = guestDoc.data();
    return res.status(200).json({ guestData });
  } catch (error) {
    console.error('Error al obtener el invitado:', error);
    return res.status(500).json({ error: 'Error al obtener el invitado' });
  }
};

module.exports = {
  createGuest,
  getAllGuests,
  updateGuest,
  getGuest,
};
