const express = require('express');
const app = express();
const Profile = require('../models/profile');
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const { profile } = require('console');

const secretKey = 'tu_secreto_secreto';
const allowedIPs = ['::1', '10.0.0.1', '172.16.0.1'];

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'goneoapp@gmail.com',
    pass: 'sahv uasy fzei rykf',
  },
});

const submitForm = async (req, res) => {
  const { email, username, password, confirmPassword } = req.body;

  // Compara si las contraseñas coinciden antes de hacer el hash
  if (password !== confirmPassword) {
    return res
      .status(400)
      .json({ isValid: false, error: 'Las contraseñas no coinciden' });
  }

  try {
    // Realiza una consulta en la colección "profiles" en función del campo "profileEmail"
    const profilesRef = db.collection('profiles');
    const profileQuery = profilesRef.where('profileEmail', '==', email);
    const profileSnapshot = await profileQuery.get();

    const unknownMemberEmailQuery = profilesRef.where(
      'unknownMemberEmail',
      '==',
      email
    );

    const unknownMemberEmailSnapshot = await unknownMemberEmailQuery.get();
    const allSnapshots = [
      ...profileSnapshot.docs,
      ...unknownMemberEmailSnapshot.docs,
    ];

    // Verifica si se encontró algún documento que coincida con el correo electrónico
    if (allSnapshots.length === 0) {
      return res
        .status(404)
        .json({ isValid: false, error: 'Perfil no encontrado' });
    }

    // Se asume que solo hay un documento que coincide con el correo electrónico
    const profileDoc = allSnapshots[0].ref; // Obtén el documento

    // Genera una sal aleatoria
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = hashPassword(password, salt);

    // Obtén el perfil existente
    const profileData = allSnapshots[0].data();

    if (profileData?.profilePassword?.length > 0) {
      const hashedLikeLastPassword = hashPassword(password, profileData.salt);
      // El usuario ya tiene un 'profileUsername'
      if (profileData.profilePassword === hashedLikeLastPassword) {
        // La contraseña proporcionada es la misma que la contraseña actual
        return res.status(400).json({
          isValid: false,
          error:
            'Error setting up your password. Please check if the new password is the same as the previous one',
        });
      }
    }

    // Actualiza la contraseña si es diferente o si no tenía 'profileUsername'
    await profileDoc.update({
      profilePassword: hashedPassword,
      passwordCreationDate: new Date().getTime(),
      salt: salt,
    });

    res.status(201).json({ isValid: true, message: 'Registro exitoso' });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res
      .status(400)
      .json({ isValid: false, error: 'Error al registrar usuario' });
  }
};

function hashPassword(password, salt) {
  const hash = crypto.createHmac('sha512', salt);
  hash.update(password);
  return hash.digest('hex');
}

const getlogIn = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    let profileData;

    // Verifica si el identificador es un email
    const isEmail = /\S+@\S+\.\S+/.test(identifier);

    // Intenta buscar el perfil por el correo electrónico
    const profileRef = db
      .collection('profiles')
      .where('profileEmail', '==', identifier);
    const unknownMemberRef = db
      .collection('profiles')
      .where('unknownMemberEmail', '==', identifier);

    const [profileSnapshot, unknownMemberSnapshot] = await Promise.all([
      profileRef.get(),
      unknownMemberRef.get(),
    ]);

    if (profileSnapshot.empty && unknownMemberSnapshot.empty) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const profiles = new Map();

    profileSnapshot.forEach((doc) => {
      profiles.set(doc.id, doc.data());
    });

    unknownMemberSnapshot.forEach((doc) => {
      profiles.set(doc.id, doc.data());
    });
    profileData = Array.from(profiles.values())[0];

    const gymId = profileData.gymId;
    const gymRef = db.collection('gyms').doc(gymId);
    const gymSnapShot = await gymRef.get();
    const gymData = gymSnapShot.data();
    const gymEndDate = gymData.gymEndDate;
    const activeModules = gymData.activeModules;

    const currentDate = new Date();
    const endDate = new Date(gymEndDate);

    if (endDate < currentDate) {
      return res.status(404).json({
        changepassword: false,
        error: 'The membership period has expired.',
      });
      // Realizar acciones adicionales aquí si el período ha expirado
    }

    const hashedPassword = hashPassword(password, profileData.salt);

    // Compara el hash calculado con el hash almacenado en el perfil
    if (hashedPassword !== profileData.profilePassword) {
      return res
        .status(401)
        .json({ changepassword: false, error: 'Incorrect credentials' });
    }

    const secretKey = process.env.ACCESS_TOKEN_SECRET;

    const token = jwt.sign(
      {
        profileId: profileData.profileId,
      },
      secretKey
    );

    if (
      profileData.profileIsAdmin ||
      (profileData.role &&
        profileData.role.length === 1 &&
        profileData.role[0] === 'trainer')
    ) {
      // const currentDate = new Date();
      // const passwordCreationDate = new Date(profileData.passwordCreationDate);
      // const daysDifference = Math.floor(
      //   (currentDate - passwordCreationDate) / (1000 * 60 * 60 * 24)
      // );

      // If less than 1 minute has passed and it's an administrator, show an error
      // if (daysDifference > 30) {
      //   return res.status(401).json({
      //     changepassword: true,
      //     error: 'You must change your password before logging in.',
      //   });
      // } else {
      const verificationCode = generateVerificationCode();

      // Envía el código de verificación por correo electrónico
      await sendVerificationCodeByEmail(
        profileData.profileEmail,
        verificationCode
      );

      // Guarda el código de verificación en Firestore (o en tu base de datos)
      await saveVerificationCodeInFirestore(
        profileData.profileEmail,
        verificationCode
      );
      // 'profileUsername' exists
      res.status(200).json({
        email: profileData.profileEmail,
        profileIsAdmin: profileData.profileIsAdmin,
        profileIsTrainer: profileData.role,
      });
      //}
    } else {
      const responseData = {
        message: 'Autenticación exitosa',
        // Otros datos de usuario que desees incluir
        profileIsAdmin: profileData.profileIsAdmin,
        token,
        profileId: profileData.profileId,
        profileName: profileData.profileName,
        profileLastname: profileData.profileLastname,
        cardSerialNumber: profileData?.cardSerialNumber,
        profilePicture: profileData.profilePicture,
        membershipId: profileData.membershipId,
        profileAdminLevel: profileData.profileAdminLevel,
        gymId: profileData.gymId,
        profileIsTrainer: profileData.role,
        activeModules: activeModules,
        // ...
      };
      return res.status(200).json(responseData);
    }

    // Hashea la contraseña proporcionada con la sal almacenada en el perfil
  } catch (error) {
    console.error('Error en el inicio de sesión:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const validateEmail = async (req, res) => {
  const { email } = req.body;

  try {
    // Realiza una consulta a la colección 'profiles'
    const profileEmailSnapshot = await db
      .collection('profiles')
      .where('profileEmail', '==', email)
      .where('profileStatus', '==', 'true')
      .get();

    const unknownMemberEmailSnapshot = await db
      .collection('profiles')
      .where('unknownMemberEmail', '==', email)
      .where('unknownMemberStatus', '==', 'active')
      .where('cardSerialNumber', '!=', '')
      .get();

    const allSnapshots = [
      ...profileEmailSnapshot.docs,
      ...unknownMemberEmailSnapshot.docs,
    ];
    // Comprueba si se encontraron documentos
    if (allSnapshots.length > 0) {
      const verificationCode = generateVerificationCode();

      // Envía el código de verificación por correo electrónico
      await sendVerificationCodeByEmail(email, verificationCode);

      // Guarda el código de verificación en Firestore (o en tu base de datos)
      await saveVerificationCodeInFirestore(email, verificationCode);
      // 'profileUsername' exists
      res.status(200).json({ emailExists: true });
    } else {
      // El correo no existe en la plataforma
      res.status(404).json({
        emailExists: false,
        error: 'Correo electrónico no encontrado',
      });
    }
  } catch (error) {
    console.error('Error al validar el correo:', error);
    res.status(500).json({ error: 'Error al validar el correo' });
  }
};

const generateVerificationCode = () => {
  const specialChars = '!@#$&*';
  const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
  const numberChars = '0123456789';

  const getRandomChar = (chars) =>
    chars[Math.floor(Math.random() * chars.length)];

  let code = '';

  // Genera al menos 2 caracteres especiales
  code += getRandomChar(specialChars);
  code += getRandomChar(specialChars);

  // Genera al menos 2 letras mayúsculas
  code += getRandomChar(upperChars);

  // Genera 1 letra minúscula
  code += getRandomChar(lowerChars);

  // Genera 1 número
  code += getRandomChar(numberChars);
  code += getRandomChar(numberChars);

  // Completa el código con caracteres aleatorios
  while (code.length < 6) {
    const allChars = specialChars + upperChars + lowerChars + numberChars;
    code += getRandomChar(allChars);
  }

  // Mezcla aleatoriamente el código
  code = code
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');

  return code;
};

const generateVerificationEmailTemplate = (verificationCode) => {
  // Utiliza template literals para definir la plantilla HTML
  const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              /* Estilos para el contenedor del card */
              .card {
                  width: 300px;
                  margin: 0 auto;
                  padding: 20px;
                  background-color: #f7f7f7;
                  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2);
                  border-radius: 5px;
                  text-align: center;
              }

              /* Estilos para el título del card */
              .title {
                  font-size: 24px;
                  font-weight: bold;
              }

              /* Estilos para el párrafo del card */
              .text {
                  font-size: 18px;
              }

              /* Estilos para el código de verificación */
              .verification-code {
                  font-size: 24px;
                  color: #007bff; /* Azul, puedes ajustar el color según tus preferencias */
              }
          </style>
      </head>
      <body>
          <div class="card">
              <div class="title">Verify Your Email</div>
              <p class="text">Please use the following security code to verify your email address on the app:</p>
              <div class="verification-code">${verificationCode}</div>
          </div>
      </body>
      </html>
  `;

  return emailTemplate;
};

const sendVerificationCodeByEmail = async (email, verificationCode) => {
  const renderedTemplate = generateVerificationEmailTemplate(verificationCode);

  const mailOptions = {
    from: 'NeoApp - Verification Code 🔐" <goneoapp@gmail.com>',
    to: email,
    subject: 'Verify your email address',
    html: renderedTemplate,
    text: `Please use the following security code to verify your email address on the app: ${verificationCode}`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error(
      'Error al enviar el código de verificación por correo electrónico:',
      error
    );
    throw new Error(
      'No se pudo enviar el código de verificación por correo electrónico.'
    );
  }
};

const saveVerificationCodeInFirestore = async (email, verificationCode) => {
  try {
    // Establece una fecha de expiración (por ejemplo, 10 minutos a partir de la creación)
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 5);

    // Guarda el código de verificación y su fecha de expiración en Firestore
    await db.collection('verificationCodes').doc(email).set({
      code: verificationCode,
      expirationTime: expirationTime,
    });
  } catch (error) {
    console.error('Error al guardar el código de verificación:', error);
    throw new Error('No se pudo guardar el código de verificación.');
  }
};

const validateCode = async (req, res) => {
  const email = req.body.email;
  const enteredCode = req.body.enteredCode;

  try {
    const snapshot = await admin
      .firestore()
      .collection('verificationCodes')
      .doc(email)
      .get();

    if (snapshot.exists) {
      const storedCode = snapshot.data().code;
      const expirationTime = snapshot.data().expirationTime.toDate();
      const currentTime = new Date();

      if (currentTime <= expirationTime) {
        if (enteredCode === storedCode) {
          // Código correcto
          res
            .status(200)
            .json({ successCode: true, message: 'Verification successful' });

          // También puedes eliminar el código de la base de datos si se ha utilizado correctamente
          await admin
            .firestore()
            .collection('verificationCodes')
            .doc(email)
            .delete();
        } else {
          // Código incorrecto
          res
            .status(401)
            .json({ successCode: false, message: 'Invalid verification code' });
        }
      } else {
        // El código ha expirado
        res.status(200).json({
          successCode: false,
          message: 'Verification code has expired',
        });
      }
    } else {
      // No se encontró un código asociado a ese correo electrónico
      res
        .status(401)
        .json({ successCode: false, message: 'Verification code not found' });
    }
  } catch (error) {
    console.error('Error during code validation:', error);
    res
      .status(500)
      .json({ successCode: false, message: 'Internal server error' });
  }
};

const validateAdminCode = async (req, res) => {
  const email = req.body.email;
  const enteredCode = req.body.enteredCode;

  try {
    const snapshot = await admin
      .firestore()
      .collection('verificationCodes')
      .doc(email)
      .get();

    if (snapshot.exists) {
      const storedCode = snapshot.data().code;
      const expirationTime = snapshot.data().expirationTime.toDate();
      const currentTime = new Date();

      if (currentTime <= expirationTime) {
        if (enteredCode === storedCode) {
          const profileRef = db
            .collection('profiles')
            .where('profileEmail', '==', email);
          const profileSnapshot = await profileRef.get();

          const profileDoc = profileSnapshot.docs[0];
          const profileData = profileDoc.data();

          const profileId = profileData.profileId;
          const gymId = profileData.gymId;

          const gymRef = db.collection('gyms').doc(gymId);
          const gymSnapShot = await gymRef.get();
          const gymData = gymSnapShot.data();
          const activeModules = gymData.activeModules;

          const secretKey = process.env.ACCESS_TOKEN_SECRET;

          const token = jwt.sign(
            {
              profileId: profileId,
            },
            secretKey
          );
          await admin
            .firestore()
            .collection('verificationCodes')
            .doc(email)
            .delete();

          const responseData = {
            message: 'Autenticación exitosa',
            // Otros datos de usuario que desees incluir
            profileIsAdmin: profileData.profileIsAdmin,
            token,
            profileId: profileData.profileId,
            profileName: profileData.profileName,
            profileLastname: profileData.profileLastname,
            profilePicture: profileData.profilePicture,
            membershipId: profileData.membershipId,
            profileAdminLevel: profileData.profileAdminLevel,
            gymId: profileData.gymId,
            profileIsTrainer: profileData.role,
            activeModules: activeModules,
            // ...
          };
          return res.status(200).json({
            responseData,
          });

          // También puedes eliminar el código de la base de datos si se ha utilizado correctamente
        } else {
          // Código incorrecto
          res
            .status(200)
            .json({ successCode: false, message: 'Invalid verification code' });
        }
      } else {
        // El código ha expirado
        res.status(200).json({
          successCode: false,
          message: 'Verification code has expired',
        });
      }
    } else {
      // No se encontró un código asociado a ese correo electrónico
      res
        .status(200)
        .json({ successCode: false, message: 'Verification code not found' });
    }
  } catch (error) {
    console.error('Error during code validation:', error);
    res
      .status(500)
      .json({ successCode: false, message: 'Internal server error' });
  }
};

const reSendVerificationCode = async (req, res) => {
  const { email } = req.body;

  try {
    // Genera un nuevo código de verificación
    const verificationCode = generateVerificationCode();

    // Envía el código de verificación por correo electrónico
    await sendVerificationCodeByEmail(email, verificationCode);

    // Guarda el código de verificación en Firestore (o en tu base de datos)
    await saveVerificationCodeInFirestore(email, verificationCode);

    // Responde con un objeto JSON que incluye el correo electrónico y si el usuario es un administrador
    res.status(200).json({
      message: 'Verification code sent successfully',
    });
  } catch (error) {
    console.error('Error al reenviar el código de verificación:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getlogIn,
  validateEmail,
  validateCode,
  validateAdminCode,
  submitForm,
  reSendVerificationCode,
};
