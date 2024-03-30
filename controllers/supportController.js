const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
app.use(bodyParser.json());

const nodemailer = require('nodemailer');

// Configura el transportador para enviar correos
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'goneoapp@gmail.com',
    pass: 'sahv uasy fzei rykf',
  },
  from: 'goneoapp@gmail.com',
});

const sendSupportNotification = async (req, res) => {
  try {
    const { profileId, description, name, subject } = req.body;

    // Busca el perfil correspondiente en la base de datos
    const profileSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .get();
    if (!profileSnapshot.exists) {
      return res.status(404).send('Profile not found');
    }

    // Extrae el correo electrónico del perfil
    const profileData = profileSnapshot.data();
    const profileEmail = profileData.profileEmail;

    // Crea el cuerpo del correo electrónico
    const mailOptions = {
      from: 'goneoapp@gmail.com',
      to: 'goneoapp@gmail.com', // Cambia esto por tu correo de soporte
      subject: `Support Request - ${subject}`,
      html: `
        <p>${description}</p>
        <p>Sender profile Name: ${profileData.profileName} ${profileData.profileLastname}</p>
        <p>Contact Name: ${name}</p>
        <p>Email: ${profileEmail}</p>
      `,
    };

    // Envía el correo electrónico
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Correo enviado con éxito' });
  } catch (error) {
    console.error('Error sending support notification:', error);
    res.status(500).json({
      message: 'An error occurred while sending the support notification',
    });
  }
};

module.exports = {
  sendSupportNotification,
};
