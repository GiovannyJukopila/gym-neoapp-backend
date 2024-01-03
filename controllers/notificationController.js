'use strict';
const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
app.use(bodyParser.json());

// Importa los módulos necesarios
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
});

function buildCustomEmailContent(subject, content, image, reason) {
  // Agrega una imagen si se proporciona la URL de la imagen
  const imageTag = image
    ? `<img src="${image}" alt="Image" style="max-width: 100%; height: auto;" />`
    : '';
  const button =
    reason === 'setup_password'
      ? `<a href="https://neoappgym.com/setup-password" class="button">Set Up Password</a>`
      : '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email</title>
        <style>
            body {
                background-color: #fff;
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                margin: 0;
            }
            .card {
                width: 700px;
                background-color: #e2e1e1;
                border-radius: 5px;
                box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
            }
            .header {
                background-color: #ff6000;
                color: #fff;
                padding: 20px;
                text-align: center;
            }
            .content {
                padding: 20px;
            }
            .footer {
                background-color: #ff6000;
                color: #fff;
                padding: 20px;
                text-align: center;
            }
            .button {
                display: inline-block;
                padding: 10px 20px;
                background-color: #ff6000;
                color: #fff;
                border: none;
                cursor: pointer;
                border-radius: 5px;
                text-decoration: none;
            }
            /* Subcard dentro del card */
            .subcard {
                background-color: #fff; /* Fondo blanco para el subcard */
                border-radius: 5px;
                box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                padding: 10px; /* Ajusta el relleno según tus necesidades */
                margin: 50px; /* Espacio entre el card principal y el subcard */
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="header">
                <h1>${subject}</h1>
            </div>
            <div class="subcard">
            <div class="content">
                ${imageTag}
                <p>${content}</p>
                ${button}


                </div>

            </div>
            <div class="footer">
                <p>Neo App &copy; 2023 - All rights reserved</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

async function getMemberEmailsByGymId(gymId) {
  const db = admin.firestore(); // Inicializa la base de datos Firestore

  const memberEmails = [];

  try {
    const querySnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .get();

    querySnapshot.forEach((doc) => {
      const profileData = doc.data();
      if (profileData.profileEmail) {
        memberEmails.push(profileData.profileEmail);
      }
    });
  } catch (error) {
    console.error('Error fetching member emails:', error);
  }

  return memberEmails;
}

// Función para enviar un correo personalizado
async function sendCustomEmail(recipient, subject, emailContent, image) {
  try {
    const info = await transporter.sendMail({
      from: '"No Reply - NeoApp 👻" <goneoapp@gmail.com>',
      to: recipient,
      subject: subject,
      html: emailContent, // Usar el contenido HTML generado
    });
  } catch (error) {
    console.error('Error sending email to ' + recipient + ':', error);
  }
}

// Controlador para la ruta /getNotification
const getNotification = async (req, res) => {
  try {
    const { subject, content, image, recipient, reason, isForAll, gymId } =
      req.body;

    // Nombre del archivo adjunto
    const imageFileName = 'image.png';

    function isValidEmail(email) {
      return /\S+@\S+\.\S+/.test(email);
    }

    if (reason === 'setup_password') {
      if (isForAll) {
        const memberEmails = await getMemberEmailsByGymId(gymId);
        for (const email of memberEmails) {
          if (isValidEmail(email)) {
            const emailContent = buildCustomEmailContent(
              subject,
              content,
              image,
              reason
            );
            await sendCustomEmail(email, subject, emailContent);
          }
        }
      } else {
        const recipientEmails = recipient
          .split(',')
          .map((email) => email.trim());
        for (const email of recipientEmails) {
          const emailContent = buildCustomEmailContent(
            subject,
            content,
            image,
            reason
          );
          await sendCustomEmail(email, subject, emailContent);
        }
      }
    } else if (reason === 'others' || reason === 'promo') {
      if (isForAll) {
        const memberEmails = await getMemberEmailsByGymId(gymId);
        for (const email of memberEmails) {
          if (isValidEmail(email)) {
            const emailContent = buildCustomEmailContent(
              subject,
              content,
              image
            );
            await sendCustomEmail(email, subject, emailContent);
          }
        }
      } else {
        const recipientEmails = recipient
          .split(',')
          .map((email) => email.trim());
        for (const email of recipientEmails) {
          const emailContent = buildCustomEmailContent(
            subject,
            content,
            image,
            reason
          );
          await sendCustomEmail(email, subject, emailContent);
        }
      }
    }

    res.status(200).json({ message: 'Correo enviado con éxito' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al enviar el correo' });
  }
};

module.exports = { getNotification };
