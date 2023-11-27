const express = require('express');
const app = express();
const { db } = require('../firebase');

// const scanMember = async (req, res) => {
//   try {
//     const cardSerialNumber = req.params.cardSerialNumber;
//     const profilesRef = db.collection('profiles');
//     const query = profilesRef.where('cardSerialNumber', '==', cardSerialNumber);
//     const querySnapshot = await query.get();
//     const currentDateTime = new Date();
//     console.log('currentDateTime', currentDateTime);
//     const accessHistoryRef = db.collection('accessHistory');

//     if (querySnapshot.empty) {
//       res.status(404).send('Perfil no encontrado');
//       return; // Salir de la función si no se encuentra el perfil
//     }

//     const profileDoc = querySnapshot.docs[0];
//     const profileDate = profileDoc.data();
//     const gymId = profileDate.gymId;

//     // Obtén la zona horaria del gimnasio desde la base de datos
//     const gymRef = db.collection('gyms').doc(gymId);
//     const gymDoc = await gymRef.get();

//     if (!gymDoc.exists) {
//       res.status(404).send('Gimnasio no encontrado');
//       return; // Salir de la función si no se encuentra el gimnasio
//     }
//     const profileEndDate = new Date(profileDate.profileEndDate);
//     if (currentDateTime > profileEndDate) {
//       res
//         .status(403)
//         .send(
//           'Your membership has expired. You are not allowed to check in or check out.'
//         );
//       return; // Salir de la función
//     }

//     const gymData = gymDoc.data();
//     const gymTimezone = gymData.gymTimeZone; // Suponiendo que el campo se llama profileTimeZone y es un valor como 'UTC+4'

//     console.log(gymTimezone);
//     // Parsea la zona horaria del gimnasio para obtener el desplazamiento en horas
//     const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimezone);

//     console.log('Este es el offsetMatch', offsetMatch);
//     if (!offsetMatch) {
//       res.status(400).send('Formato de zona horaria no válido');
//       return; // Salir de la función si el formato de zona horaria no es válido
//     }

//     const offsetHours = parseFloat(offsetMatch[1]);

//     // Calcula la hora local en base al desplazamiento horario del gimnasio
//     const localTime = new Date(
//       currentDateTime.getTime() + offsetHours * 60 * 60 * 1000
//     );
//     console.log('localTime', localTime);

//     if (!profileDate.wasCheckIn) {
//       console.log('Siempre entra shit');
//       await accessHistoryRef.add({
//         gymId: profileDate.gymId,
//         profileId: profileDoc.id,
//         action: 'check-in',
//         timestamp: localTime.toISOString(),
//       });

//       await profileDoc.ref.set(
//         { lastCheckIn: localTime.toISOString(), wasCheckIn: true },
//         { merge: true }
//       );
//       const profileData = querySnapshot.docs[0].data();
//       res.send(profileData);
//     } else {
//       const lastCheckISOString = profileDate.lastCheckIn;
//       const lastCheck = new Date(lastCheckISOString);
//       const timeDifference = localTime - lastCheck;
//       console.log(timeDifference);

//       const eightHoursInMilliseconds = 8 * 60 * 60 * 1000;

//       if (timeDifference <= eightHoursInMilliseconds) {
//         await accessHistoryRef.add({
//           gymId: profileDate.gymId,
//           profileId: profileDoc.id,
//           action: 'check-out',
//           timestamp: localTime.toISOString(),
//         });

//         await profileDoc.ref.set(
//           {
//             lastCheckOut: localTime.toISOString(),
//             wasCheckIn: false,
//             notCheckOut: false,
//           },
//           { merge: true }
//         );

//         const profileData = querySnapshot.docs[0].data();
//         res.send(profileData);
//       } else {
//         await accessHistoryRef.add({
//           gymId: profileDate.gymId,
//           profileId: profileDoc.id,
//           action: 'check-in',
//           timestamp: localTime.toISOString(),
//         });

//         await profileDoc.ref.set(
//           {
//             lastCheckIn: localTime.toISOString(),
//             wasCheckIn: true,
//             notCheckOut: true,
//           },
//           { merge: true }
//         );
//         const profileData = querySnapshot.docs[0].data();
//         res.send(profileData);
//       }
//     }
//   } catch (error) {
//     res.status(500).send(error);
//   }
// };

// const scanMember = async (req, res) => {
//   try {
//     const cardSerialNumber = req.params.cardSerialNumber; // Obtener el número de serie desde los parámetros de la solicitud
//     console.log(cardSerialNumber);
//     // Realizar una consulta en la colección 'profiles' para encontrar el perfil con el campo 'cardSerialNumber' igual al número de serie
//     const profilesRef = db.collection('profiles');
//     const query = profilesRef.where('cardSerialNumber', '==', cardSerialNumber);
//     const querySnapshot = await query.get();

//     if (querySnapshot.empty) {
//       // Si no se encontraron coincidencias, responder con un mensaje de error
//       res.status(404).send('Perfil no encontrado');
//     } else {
//       // Si se encontró una coincidencia, responder con los datos del perfil encontrado (asumiendo que hay una única coincidencia)
//       const profileData = querySnapshot.docs[0].data();
//       res.send(profileData);
//     }
//   } catch (error) {
//     res.status(500).send(error);
//   }
// };

//<-----> The best option
const scanMember = async (req, res) => {
  try {
    const cardSerialNumber = req.params.cardSerialNumber;
    const profilesRef = db.collection('profiles');
    const query = profilesRef.where('cardSerialNumber', '==', cardSerialNumber);
    const querySnapshot = await query.get();

    console.log('entro aca', cardSerialNumber);

    if (querySnapshot.empty) {
      res.status(404).send('Perfil no encontrado');
      return;
    }

    const profileDoc = querySnapshot.docs[0];
    const profileData = profileDoc.data();
    console.log(profileData);
    const currentDateTime = new Date();
    const accessHistoryRef = db.collection('accessHistory');

    const gymId = profileData.gymId;
    const gymRef = db.collection('gyms').doc(gymId);
    const [gymDoc, membershipSnapshot] = await Promise.all([
      gymRef.get(),
      getMembershipSnapshot(profileData.membershipId),
    ]);

    if (!gymDoc.exists) {
      res.status(404).send('Gimnasio no encontrado');
      return;
    }

    if (currentDateTime > new Date(profileData.profileEndDate)) {
      if (profileData.renewMembershipInQueue) {
        // Use renewMembershipInQueue if it exists
        profileData.profileStartDate = renewMembershipInQueue.newStartDate;
        profileData.profileEndDate = renewMembershipInQueue.newEndDate;
        profileData.membershipId = renewMembershipInQueue.membership.value;

        // Delete renewMembershipInQueue
        delete profileData.renewMembershipInQueue;

        await profileRef.set(profileData);
      } else {
        // Membership has expired, and there is no renewal in queue
        res
          .status(403)
          .send(
            'Your membership has expired. You cannot check in or check out.'
          );
        return;
      }
    } else {
      if (membershipSnapshot.empty) {
        res.status(403).send('No matching membership found for the user.');
        return;
      }

      const membershipDoc = membershipSnapshot.docs[0].data();

      const selectedWeekDays = membershipDoc.selectedWeekDays;
      const currentDay = currentDateTime
        .toLocaleString('en-US', { weekday: 'short' })
        .toUpperCase();

      if (!selectedWeekDays.includes(currentDay)) {
        res
          .status(403)
          .send('Today is not allowed according to your membership.');
        return;
      }

      if (membershipDoc.isOffPeak) {
        const currentTime = new Date(
          getLocalTime(currentDateTime, gymDoc.data().gymTimeZone)
        );
        const formattedTime = currentTime.toISOString().substr(11, 5);
        const startTimeOffPeak = membershipDoc.startTimeOffPeak;
        const endTimeOffPeak = membershipDoc.endTimeOffPeak;

        if (
          formattedTime < startTimeOffPeak ||
          formattedTime > endTimeOffPeak
        ) {
          res
            .status(403)
            .send('The current time is not within the Off-Peak range.');
          return;
        }
      }

      if (!profileData.wasCheckIn) {
        await Promise.all([
          accessHistoryRef.add({
            gymId: profileData.gymId,
            profileId: profileDoc.id,
            action: 'check-in',
            timestamp: getLocalTime(
              currentDateTime,
              gymDoc.data().gymTimeZone
            ).toISOString(),
          }),
          profileDoc.ref.set(
            {
              lastCheckIn: getLocalTime(
                currentDateTime,
                gymDoc.data().gymTimeZone
              ).toISOString(),
              wasCheckIn: true,
            },
            { merge: true }
          ),
        ]);
      } else {
        const lastCheckISOString = profileData.lastCheckIn;
        const lastCheck = new Date(lastCheckISOString);
        const timeDifference = currentDateTime - lastCheck;
        const eightHoursInMilliseconds = 8 * 60 * 60 * 1000;

        if (timeDifference <= eightHoursInMilliseconds) {
          await Promise.all([
            accessHistoryRef.add({
              gymId: profileData.gymId,
              profileId: profileDoc.id,
              action: 'check-out',
              timestamp: getLocalTime(
                currentDateTime,
                gymDoc.data().gymTimeZone
              ).toISOString(),
            }),
            profileDoc.ref.set(
              {
                lastCheckOut: getLocalTime(
                  currentDateTime,
                  gymDoc.data().gymTimeZone
                ).toISOString(),
                wasCheckIn: false,
                notCheckOut: false,
              },
              { merge: true }
            ),
          ]);
        } else {
          await Promise.all([
            accessHistoryRef.add({
              gymId: profileData.gymId,
              profileId: profileDoc.id,
              action: 'check-in',
              timestamp: getLocalTime(
                currentDateTime,
                gymDoc.data().gymTimeZone
              ).toISOString(),
            }),
            profileDoc.ref.set(
              {
                lastCheckIn: getLocalTime(
                  currentDateTime,
                  gymDoc.data().gymTimeZone
                ).toISOString(),
                wasCheckIn: true,
                notCheckOut: true,
              },
              { merge: true }
            ),
          ]);
        }
      }
    }

    const updatedProfileData = (await profileDoc.ref.get()).data();
    res.send(updatedProfileData);
  } catch (error) {
    res.status(500).send(error);
  }
};

const getLocalTime = (currentDateTime, gymTimeZone) => {
  const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone);
  if (offsetMatch) {
    const offsetHours = parseFloat(offsetMatch[1]);
    console.log(
      'Checkin :',
      new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000)
    );
    return new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000);
  } else {
    throw new Error('Invalid time zone format.');
  }
};

const getMembershipSnapshot = async (membershipId) => {
  const membershipsRef = db.collection('memberships');
  return await membershipsRef.where('membershipId', '==', membershipId).get();
};

//<------> The best option

// const scanMember = async (req, res) => {
//   try {
//     const cardSerialNumber = req.params.cardSerialNumber;
//     const profilesRef = db.collection('profiles');
//     const query = profilesRef.where('cardSerialNumber', '==', cardSerialNumber);
//     const querySnapshot = await query.get();
//     const currentDateTime = new Date();
//     const accessHistoryRef = db.collection('accessHistory');

//     if (querySnapshot.empty) {
//       res.status(404).send('Perfil no encontrado');
//     } else {
//       const profileDoc = querySnapshot.docs[0];
//       const profileDate = profileDoc.data();

//       if (!profileDate.wasCheckIn) {
//         console.log('Siempre entra shit');
//         await accessHistoryRef.add({
//           gymId: profileDate.gymId,
//           profileId: profileDoc.id,
//           action: 'check-in',
//           timestamp: currentDateTime,
//         });

//         await profileDoc.ref.set(
//           { lastCheckIn: currentDateTime, wasCheckIn: true },
//           { merge: true }
//         );
//         const profileData = querySnapshot.docs[0].data();
//         res.send(profileData);
//       } else {
//         const lastCheck = profileDate.lastCheckIn.toDate();
//         const timeDifference = currentDateTime - lastCheck;
//         const eightHoursInMilliseconds = 8 * 60 * 60 * 1000;
//         //const eightHoursInMilliseconds = 10 * 1000;

//         if (timeDifference <= eightHoursInMilliseconds) {
//           await accessHistoryRef.add({
//             gymId: profileDate.gymId,
//             profileId: profileDoc.id,
//             action: 'check-out',
//             timestamp: currentDateTime,
//           });

//           await profileDoc.ref.set(
//             {
//               lastCheckOut: currentDateTime,
//               wasCheckIn: false,
//               notCheckOut: false,
//             },
//             { merge: true }
//           );

//           const profileData = querySnapshot.docs[0].data();
//           res.send(profileData);
//         } else {
//           await accessHistoryRef.add({
//             gymId: profileDate.gymId,
//             profileId: profileDoc.id,
//             action: 'check-in',
//             timestamp: currentDateTime,
//           });

//           await profileDoc.ref.set(
//             {
//               lastCheckIn: currentDateTime,
//               wasCheckIn: true,
//               notCheckOut: true,
//             },
//             { merge: true }
//           );
//           const profileData = querySnapshot.docs[0].data();
//           res.send(profileData);
//         }
//       }
//     }
//   } catch (error) {
//     res.status(500).send(error);
//   }
// };

module.exports = {
  scanMember,
};
