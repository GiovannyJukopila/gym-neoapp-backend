const express = require('express');
const app = express();
const { db } = require('../firebase');

const scanMember = async (req, res) => {
  try {
    const cardSerialNumber = req.params.cardSerialNumber;
    const profilesRef = db.collection('profiles');
    const query = profilesRef
      .where('cardSerialNumber', '==', cardSerialNumber)
      .limit(1);
    const querySnapshot = await query.get();

    if (querySnapshot.empty) {
      res.status(404).send('This card has not been assigned');
      return;
    }

    const profileDoc = querySnapshot.docs[0];
    const profileData = profileDoc.data();
    const currentDateTime = new Date();
    const accessHistoryRef = db.collection('accessHistory');

    const gymId = profileData.gymId;

    if (!profileData.role.includes('unknownMember')) {
      const isFrozen =
        profileData.profileFrozen !== undefined
          ? profileData.profileFrozen
          : false;

      const profileInactiveOtherReason =
        profileData.profileStatus === 'payment-issue' ? true : false;

      if (isFrozen) {
        res
          .status(403)
          .send(
            `${profileData.profileName} ${profileData.profileLastname}'s  membership is currently frozen.`
          );
        return;
      }

      if (profileInactiveOtherReason) {
        res
          .status(403)
          .send(
            `${profileData.profileName} ${profileData.profileLastname}'s  membership is Inactive for a payment Issue `
          );
        return;
      }

      const gymRef = db.collection('gyms').doc(gymId);
      const [gymDoc, membershipSnapshot] = await Promise.all([
        gymRef.get(),
        getMembershipSnapshot(profileData.membershipId),
      ]);

      if (!gymDoc.exists) {
        res.status(404).send('Gym not in our DataBase');
        return;
      }
      const formatCurrentDateTime = currentDateTime.toISOString().split('T')[0];

      if (formatCurrentDateTime > profileData.profileEndDate) {
        if (
          formatCurrentDateTime >=
            profileData?.renewMembershipInQueue?.profileRenewStartDate &&
          profileData?.renewMembershipInQueue?.renewIsInQueue
        ) {
          const renewMembershipInQueue = profileData.renewMembershipInQueue;

          // Realiza los cambios en profileData utilizando los valores de renewMembershipInQueue
          profileData.profileEndDate =
            renewMembershipInQueue.profileRenewEndDate;
          profileData.membershipId = renewMembershipInQueue.membership.value;
          profileData.profileLastMembershipPrice =
            renewMembershipInQueue.profileRenewLastMembershipPrice;
          profileData.profileWasDiscount =
            renewMembershipInQueue.profileRenewWasDiscount;
          profileData.profileWasComplementary =
            renewMembershipInQueue.profileRenewWasComplementary;
          profileData.profileComplementaryReason =
            renewMembershipInQueue.profileRenewComplementaryReason;
          profileData.profileDiscountType =
            renewMembershipInQueue.profileRenewDiscountType;
          profileData.profileDiscountPercentage =
            renewMembershipInQueue.profileRenewDiscountPercentage;
          profileData.profileDiscountValue =
            renewMembershipInQueue.profileRenewDiscountValue;
          profileData.profileTotalReceive =
            renewMembershipInQueue.profileRenewTotalReceive;
          profileData.renewMembershipInQueue.renewIsInQueue = false;
          profileData.profileStartDate =
            renewMembershipInQueue.profileRenewStartDate;
          if (renewMembershipInQueue.profileRenewIsCouple !== undefined) {
            profileData.profileIsACouple =
              renewMembershipInQueue.profileRenewIsCouple;
          }

          // Verifica si el campo existe antes de intentar establecerlo
          if (renewMembershipInQueue.profileRenewCoupleName !== undefined) {
            profileData.profileCoupleName =
              renewMembershipInQueue.profileRenewCoupleName;
          }

          // Verifica si el campo existe antes de intentar establecerlo
          if (renewMembershipInQueue.profileRenewCoupleEmail !== undefined) {
            profileData.profileRenewCoupleEmail =
              renewMembershipInQueue.profileRenewCoupleEmail;
          }

          // Elimina la propiedad renewMembershipInQueue
          //delete profileData.renewMembershipInQueue;

          // Guarda los cambios en la base de datos (suponiendo que profilesRef es tu referencia a la base de datos)
          await profileDoc.ref.set(profileData, { merge: true });
        } else {
          // Membership has expired, and there is no renewal in queue
          res
            .status(403)
            .send(
              `${profileData.profileName} ${profileData.profileLastname}'s Membership has EXPIRED.`
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
              ),
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
                ),
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
                ),
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

    return new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000);
  } else {
    throw new Error('Invalid time zone format.');
  }
};

const getMembershipSnapshot = async (membershipId) => {
  const membershipsRef = db.collection('memberships');
  return await membershipsRef.where('membershipId', '==', membershipId).get();
};

module.exports = {
  scanMember,
};
