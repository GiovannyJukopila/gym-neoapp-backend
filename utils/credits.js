const { db } = require('../firebase');
const admin = require('firebase-admin');

/**
 * Consumo de creditos de paquetes prepago.
 *
 * Problema que resuelve
 * ---------------------
 * El patron anterior era, en 9 sitios distintos:
 *
 *     if (currentCredit === 0) return res.status(400)...   // a veces leyendo del body
 *     ...
 *     update({ currentCredit: FieldValue.increment(-1) })  // sin tope
 *
 * Con tres agujeros: la comparacion estricta no frena un saldo ya negativo, el
 * valor comprobado venia del cliente (podia estar obsoleto), y entre la
 * comprobacion y el descuento no habia atomicidad, asi que dos peticiones
 * simultaneas pasaban las dos. Eso produjo saldos de -1 y -2 en produccion.
 *
 * Como se resuelve
 * ----------------
 * 1. El saldo se lee SIEMPRE de la base de datos, nunca del request.
 * 2. Comprobacion y descuento ocurren dentro de una transaccion, de modo que
 *    dos peticiones simultaneas se serializan y la segunda ve el saldo ya
 *    descontado.
 * 3. El tope es `<= 0`, no `=== 0`, asi que un saldo negativo tampoco permite
 *    seguir consumiendo.
 * 4. Cada cobro deja una marca en `creditCharges` con un id determinista
 *    (perfil + motivo + actividad). Si la misma reserva o asistencia se envia
 *    dos veces, la segunda se detecta como duplicada y no vuelve a cobrar.
 *
 * Lo que NO hace
 * --------------
 * No interviene en las penalizaciones por cancelacion, que restan credito a
 * proposito y pueden dejar el saldo negativo como deuda (se liquida al comprar
 * el siguiente paquete). Ese negativo es una funcion del producto; el que
 * eliminamos aqui es el que nace del consumo normal.
 */

const CHARGES_COLLECTION = 'creditCharges';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildChargeId = (profileId, reason, activityId) =>
  `${profileId}__${reason}__${activityId}`;

/**
 * Lee el saldo real del perfil. Para las validaciones que solo necesitan
 * comprobar, sin cobrar todavia.
 *
 * @returns {Promise<{exists: boolean, currentCredit: number}>}
 */
const getCurrentCredit = async (profileId) => {
  if (!profileId) return { exists: false, currentCredit: 0 };

  const snapshot = await db.collection('profiles').doc(profileId).get();
  if (!snapshot.exists) return { exists: false, currentCredit: 0 };

  return { exists: true, currentCredit: toNumber(snapshot.data().currentCredit) };
};

/**
 * True si el perfil puede consumir un credito ahora mismo.
 */
const hasAvailableCredit = async (profileId) => {
  const { exists, currentCredit } = await getCurrentCredit(profileId);
  return exists && currentCredit > 0;
};

/**
 * Registra una actividad que consume credito, de forma atomica e idempotente.
 *
 * @param {string}  profileId   perfil que consume
 * @param {string}  activityId  clase, sesion o pista (parte de la clave de idempotencia)
 * @param {string}  reason      'booking' | 'attendance' | ... (parte de la clave)
 * @param {string}  gymId       solo para trazabilidad
 * @param {boolean} shouldDebit si false, se registra la actividad sin descontar
 *                              (paquetes que descuentan en otro momento)
 *
 * @returns {Promise<{status: string, currentCredit: number, debited: boolean}>}
 *   status 'charged'           -> credito descontado
 *          'recorded'          -> actividad registrada sin descuento (shouldDebit=false)
 *          'duplicate'         -> ya estaba registrada, no se vuelve a cobrar
 *          'no-credit'         -> saldo a 0 o negativo, no se descuenta nada
 *          'profile-not-found' -> el perfil no existe
 */
const registerCreditUsage = async ({
  profileId,
  activityId,
  reason,
  gymId = null,
  shouldDebit = true,
}) => {
  if (!profileId || !activityId || !reason) {
    throw new Error(
      'registerCreditUsage requires profileId, activityId and reason'
    );
  }

  const profileRef = db.collection('profiles').doc(profileId);
  const chargeRef = db
    .collection(CHARGES_COLLECTION)
    .doc(buildChargeId(profileId, reason, activityId));

  return db.runTransaction(async (transaction) => {
    const [profileSnapshot, chargeSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(chargeRef),
    ]);

    if (!profileSnapshot.exists) {
      return { status: 'profile-not-found', currentCredit: 0, debited: false };
    }

    const currentCredit = toNumber(profileSnapshot.data().currentCredit);

    // Ya registrada: una segunda peticion no vuelve a cobrar
    if (chargeSnapshot.exists) {
      return { status: 'duplicate', currentCredit, debited: false };
    }

    if (shouldDebit && currentCredit <= 0) {
      return { status: 'no-credit', currentCredit, debited: false };
    }

    const remainingCredit = shouldDebit ? currentCredit - 1 : currentCredit;

    if (shouldDebit) {
      transaction.update(profileRef, { currentCredit: remainingCredit });
    }

    transaction.set(chargeRef, {
      profileId,
      activityId,
      reason,
      gymId,
      debited: shouldDebit,
      creditBefore: currentCredit,
      creditAfter: remainingCredit,
      chargedAt: admin.firestore.Timestamp.now(),
    });

    return {
      status: shouldDebit ? 'charged' : 'recorded',
      currentCredit: remainingCredit,
      debited: shouldDebit,
    };
  });
};

/**
 * Aplica una penalizacion de creditos (cancelacion tardia o no-show) sin dejar
 * nunca el saldo en negativo.
 *
 * Antes se hacia `currentCredit - penaltyAmount` a pelo, y si el socio estaba a
 * 0 el saldo quedaba negativo como forma de representar la deuda. Eso hacia
 * imposible distinguir una deuda legitima de un error de software.
 *
 * Ahora el saldo se cobra hasta donde alcanza y lo que no se puede cobrar queda
 * registrado en `creditDebt`, siempre positivo, que se liquida al comprar el
 * siguiente paquete. Con esto `currentCredit` nunca baja de 0 y cualquier
 * negativo en la base de datos es, sin ambiguedad, un fallo.
 *
 * No modifica `penaltyActive`: ese flag lo comparten las penalizaciones de
 * socios y se mantiene donde ya se mantenia.
 *
 * @returns {Promise<{currentCredit: number, creditDebt: number,
 *                    charged: number, addedToDebt: number}>}
 */
const applyCreditPenalty = async ({ profileId, penaltyAmount }) => {
  if (!profileId) throw new Error('applyCreditPenalty requires profileId');

  const amount = Math.max(0, toNumber(penaltyAmount));
  const profileRef = db.collection('profiles').doc(profileId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profileRef);

    if (!snapshot.exists) {
      return { currentCredit: 0, creditDebt: 0, charged: 0, addedToDebt: 0 };
    }

    const data = snapshot.data();
    // Math.max por si quedara algun saldo negativo heredado
    const availableCredit = Math.max(0, toNumber(data.currentCredit));
    const pendingDebt = Math.max(0, toNumber(data.creditDebt));

    const charged = Math.min(availableCredit, amount);
    const addedToDebt = amount - charged;

    const currentCredit = availableCredit - charged;
    const creditDebt = pendingDebt + addedToDebt;

    transaction.update(profileRef, { currentCredit, creditDebt });

    return { currentCredit, creditDebt, charged, addedToDebt };
  });
};

/**
 * Liquida la deuda pendiente contra los creditos de un paquete recien comprado.
 * Devuelve lo que debe quedar en el perfil.
 */
const settleCreditDebt = ({ purchasedCredits, leftoverCredit, pendingDebt }) => {
  const purchased = Math.max(0, toNumber(purchasedCredits));
  const leftover = Math.max(0, toNumber(leftoverCredit));
  const debt = Math.max(0, toNumber(pendingDebt));

  const settledDebt = Math.min(debt, purchased + leftover);

  return {
    currentCredit: purchased + leftover - settledDebt,
    creditDebt: debt - settledDebt,
    settledDebt,
  };
};

module.exports = {
  CHARGES_COLLECTION,
  getCurrentCredit,
  hasAvailableCredit,
  registerCreditUsage,
  applyCreditPenalty,
  settleCreditDebt,
  buildChargeId,
};
