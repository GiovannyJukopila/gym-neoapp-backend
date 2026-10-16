const { normalizeDateString } = require('./membershipRenewal');

/**
 * Ajuste de pagos desde la seccion financiera del panel.
 *
 * El problema que resuelve
 * ------------------------
 * Un pago es un registro historico; el perfil guarda solo el estado ACTUAL de
 * la membresia. El editor antiguo propagaba siempre al perfil:
 *
 *     profileRef.update({ profileTotalReceive, membershipId })
 *
 * Eso estaba contenido mientras solo se podian editar los pagos de hoy y ayer.
 * Con un filtro por fechas, corregir una cifra de marzo pisaria el plan vigente
 * de octubre sin avisar.
 *
 * Por eso cada pago se clasifica antes de tocar nada:
 *
 *   'queued'     el pago corresponde a la renovacion en cola  -> se actualiza la cola
 *   'active'     el pago rige el periodo vigente              -> se actualiza el perfil
 *   'historical' el pago ya fue reemplazado                   -> SOLO contabilidad
 *   'financial'  el pago no afecta a ninguna membresia         -> SOLO contabilidad
 *                (pistas, sesiones, congelaciones, penalizaciones, prepago)
 */

// Tipos de pago que representan la compra de un periodo de membresia
const MEMBERSHIP_PAYMENT_TYPES = ['new', 'renew'];

const samePeriod = (startA, endA, startB, endB) => {
  const a1 = normalizeDateString(startA);
  const a2 = normalizeDateString(endA);
  const b1 = normalizeDateString(startB);
  const b2 = normalizeDateString(endB);

  // Sin fechas no se puede afirmar que sea el mismo periodo: se trata como
  // historico, que es la opcion que no toca la membresia
  if (!a1 || !a2 || !b1 || !b2) return false;

  return a1 === b1 && a2 === b2;
};

/**
 * Determina el alcance de un ajuste sobre un pago concreto.
 *
 * @param {object} payment      documento de paymentHistory
 * @param {object|null} profile documento del perfil, o null si el pago no tiene perfil
 * @returns {'queued'|'active'|'historical'|'financial'}
 */
const classifyPaymentScope = (payment, profile) => {
  if (!payment) return 'financial';

  // Pistas y sesiones no tienen perfil asociado
  if (!payment.profileId || !profile) return 'financial';

  // Congelaciones, penalizaciones y paquetes prepago no compran un periodo
  if (!MEMBERSHIP_PAYMENT_TYPES.includes(payment.paymentType)) {
    return 'financial';
  }

  const queue = profile.renewMembershipInQueue;

  if (
    queue?.renewIsInQueue === true &&
    samePeriod(
      payment.paymentStartDate,
      payment.paymentEndDate,
      queue.profileRenewStartDate,
      queue.profileRenewEndDate
    )
  ) {
    return 'queued';
  }

  if (
    samePeriod(
      payment.paymentStartDate,
      payment.paymentEndDate,
      profile.profileStartDate,
      profile.profileEndDate
    )
  ) {
    return 'active';
  }

  return 'historical';
};

/**
 * Construye la actualizacion que hay que aplicar a la membresia del cliente
 * segun el alcance. Devuelve un objeto vacio cuando no hay que tocar nada.
 *
 * Solo incluye los campos que llegan definidos, para no borrar datos existentes
 * con undefined.
 */
const buildMembershipUpdate = ({
  scope,
  membershipId,
  paymentAmount,
  membershipPrice,
  periodStartDate,
  periodEndDate,
}) => {
  const update = {};

  if (scope === 'active') {
    if (membershipId) update.membershipId = membershipId;
    if (paymentAmount !== undefined) update.profileTotalReceive = paymentAmount;
    if (membershipPrice !== undefined) {
      update.profileLastMembershipPrice = membershipPrice;
    }
    if (periodStartDate) update.profileStartDate = periodStartDate;
    if (periodEndDate) update.profileEndDate = periodEndDate;
    return update;
  }

  if (scope === 'queued') {
    if (membershipId) {
      update['renewMembershipInQueue.membership.value'] = membershipId;
    }
    if (paymentAmount !== undefined) {
      update['renewMembershipInQueue.profileRenewTotalReceive'] = paymentAmount;
    }
    if (membershipPrice !== undefined) {
      update['renewMembershipInQueue.profileRenewLastMembershipPrice'] =
        membershipPrice;
    }
    if (periodStartDate) {
      update['renewMembershipInQueue.profileRenewStartDate'] = periodStartDate;
    }
    if (periodEndDate) {
      update['renewMembershipInQueue.profileRenewEndDate'] = periodEndDate;
    }
    return update;
  }

  // 'historical' y 'financial': la membresia no se toca
  return update;
};

module.exports = {
  MEMBERSHIP_PAYMENT_TYPES,
  classifyPaymentScope,
  buildMembershipUpdate,
  samePeriod,
};
