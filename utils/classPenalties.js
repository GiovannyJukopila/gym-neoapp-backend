/**
 * Reglas de penalizacion de las clases: cancelaciones tardias y no shows.
 *
 * La configuracion la decide el manager en cada clase primaria, por separado
 * para miembros (memberRestrictions) y no miembros (nonMemberRestrictions).
 * Este modulo la interpreta igual para los dos:
 *
 *  - Interruptor de restricciones   apagado = sin penalizaciones.
 *  - Ventana de cancelacion gratis  (dias u horas antes de la clase). Cancelar
 *                                   antes es SIEMPRE gratis y no cuenta para
 *                                   nada. Cancelar despues es una cancelacion
 *                                   tardia. Vacio o 0 = no hay tardias.
 *  - Cancelaciones tardias          cuantas se perdonan cada 30 dias.
 *    permitidas                     0 = ninguna: todas se penalizan.
 *  - No shows permitidos            cuantos se perdonan cada 30 dias.
 *                                   0 = ninguno: todos se penalizan.
 *  - Penalizacion                   miembros: multa en euros o dias sin poder
 *                                   reservar. No miembros: creditos. Sin
 *                                   penalizacion definida no se cobra nada.
 *
 * Es la misma logica que usan los sistemas de reservas habituales: el limite
 * se refiere a las cancelaciones tardias, nunca a las hechas a tiempo.
 *
 * Fallos que corrige
 * ------------------
 *  - `if (maxCancellations && (...))`: con el limite en 0 (todas las clases de
 *    Marriott) la regla de antelacion no se evaluaba nunca.
 *  - La cancelacion o el no show que reiniciaba la ventana de 30 dias salia
 *    sin evaluar ninguna regla.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WINDOW_DAYS = 30;

// Los formularios guardan numeros, cadenas vacias o null: todo lo que no sea
// un numero positivo cuenta como "no configurado" (0)
const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const toCount = (value) => Math.floor(toPositiveNumber(value));

const plural = (amount, unit) => `${amount} ${amount === 1 ? unit : `${unit}s`}`;

/**
 * Normaliza la configuracion de una clase primaria para un tipo de socio.
 *
 * @param {object} restrictions  memberRestrictions o nonMemberRestrictions
 * @param {'member'|'nonMember'} audience
 */
const toPolicy = (restrictions = {}, audience) => {
  const r = restrictions || {};

  if (audience === 'member') {
    let penalty = null;
    if (r.penaltyType === 'monetary' && toPositiveNumber(r.monetaryAmount)) {
      penalty = { type: 'monetary', amount: toPositiveNumber(r.monetaryAmount) };
    } else if (
      r.penaltyType === 'timeRestriction' &&
      toCount(r.timeRestrictionDays)
    ) {
      penalty = {
        type: 'timeRestriction',
        amount: toCount(r.timeRestrictionDays),
      };
    }

    return {
      enabled: r.restrictions === true,
      waiveUnit: r.penaltyWaiveUnit,
      waiveDays: r.penaltyWaiveDays,
      waiveHours: r.penaltyWaiveHours,
      lateCancellationsAllowed: toCount(r.maxCancellationsPer30Days),
      noShowsAllowed: toCount(r.maxNoShowPer30Days),
      penalty,
    };
  }

  const credits = toPositiveNumber(r.nonMemberCreditsPenalty);
  return {
    enabled: r.restrictions === true,
    waiveUnit: r.penaltyNonMemberWaiveUnit,
    waiveDays: r.penaltyNonMemberWaiveDays,
    waiveHours: r.penaltyNonMemberWaiveHours,
    lateCancellationsAllowed: toCount(r.maxNonMembersCancellations),
    noShowsAllowed: toCount(r.maxNonMembersNoShows),
    penalty: credits ? { type: 'creditsPenalty', amount: credits } : null,
  };
};

// Ventana de cancelacion gratis en ms; 0 cuando el manager no la definio
const getWaiveWindowMs = (policy) => {
  if (policy.waiveUnit === 'hours') {
    return toPositiveNumber(policy.waiveHours) * HOUR_MS;
  }
  if (policy.waiveUnit === 'days') {
    return toPositiveNumber(policy.waiveDays) * DAY_MS;
  }
  return 0;
};

// '12 hours' / '1 day'
const describeWaiveWindow = (policy) =>
  policy.waiveUnit === 'hours'
    ? plural(toPositiveNumber(policy.waiveHours), 'hour')
    : plural(toPositiveNumber(policy.waiveDays), 'day');

// Desfase en horas de una zona tipo 'UTC+2'
const parseUtcOffsetHours = (gymTimeZone) => {
  const match = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone || '');
  return match ? parseFloat(match[1]) || 0 : 0;
};

/**
 * Hora de inicio de la clase, expresada igual que getLocalTime (hora local del
 * gimnasio guardada como si fuera UTC). Se arma con la fecha del evento y su
 * startTime para no depender de que eventDate traiga la hora.
 */
const getClassStartLocal = (classData = {}) => {
  const eventDate = String(classData.eventDate || '');
  const startTime = String(classData.startTime || '');

  if (/^\d{4}-\d{2}-\d{2}/.test(eventDate) && /^\d{2}:\d{2}$/.test(startTime)) {
    return new Date(`${eventDate.slice(0, 10)}T${startTime}:00.000Z`);
  }
  return new Date(classData.eventDate);
};

/**
 * Avanza el contador de una ventana de 30 dias. Si no hay ventana abierta o ya
 * vencio, empieza una nueva con este evento como el primero.
 *
 * @returns {{count: number, windowStart: string}} valores a guardar en el perfil
 */
const nextWindowCount = ({ windowStart, count, now }) => {
  const start = windowStart ? new Date(windowStart) : null;
  const expired =
    !start ||
    Number.isNaN(start.getTime()) ||
    now.getTime() - start.getTime() >= WINDOW_DAYS * DAY_MS;

  if (expired) {
    return { count: 1, windowStart: now.toISOString() };
  }
  return { count: toCount(count) + 1, windowStart: start.toISOString() };
};

// Cuantos eventos lleva el socio en la ventana vigente (0 si ya vencio)
const countInWindow = ({ windowStart, count, now }) => {
  const start = windowStart ? new Date(windowStart) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  if (now.getTime() - start.getTime() >= WINDOW_DAYS * DAY_MS) return 0;
  return toCount(count);
};

/**
 * True si cancelar ahora es una cancelacion tardia segun la clase.
 */
const isLateCancellation = ({ policy, timeUntilClassMs }) => {
  if (!policy.enabled) return false;
  const waiveWindowMs = getWaiveWindowMs(policy);
  return waiveWindowMs > 0 && timeUntilClassMs < waiveWindowMs;
};

/**
 * Decide si una cancelacion tardia se penaliza.
 *
 * @param {number} lateCancellationCount  tardias en la ventana, incluida esta
 */
const evaluateLateCancellation = ({ policy, lateCancellationCount }) => {
  const allowed = policy.lateCancellationsAllowed;
  const window = describeWaiveWindow(policy);

  return {
    penalize:
      policy.enabled && !!policy.penalty && lateCancellationCount > allowed,
    penalty: policy.penalty,
    reason:
      allowed > 0
        ? `Late cancellation (less than ${window} before the class). Exceeded the ${allowed} late cancellations allowed within ${WINDOW_DAYS} days.`
        : `Late cancellation: less than ${window} before the class started.`,
  };
};

/**
 * Decide si un no show se penaliza.
 *
 * @param {number} noShowCount  no shows en la ventana, incluido este
 */
const evaluateNoShow = ({ policy, noShowCount }) => {
  const allowed = policy.noShowsAllowed;

  return {
    penalize: policy.enabled && !!policy.penalty && noShowCount > allowed,
    penalty: policy.penalty,
    reason:
      allowed > 0
        ? `No show. Exceeded the ${allowed} no shows allowed within ${WINDOW_DAYS} days.`
        : 'No show: the class was booked but not attended.',
  };
};

/**
 * Politica de cancelacion de una clase para un no miembro, lista para que la
 * PWA le diga si cancelar ahora le costara creditos. freeCancellationUntil es
 * un instante real (UTC): el telefono lo compara con su hora y lo muestra en
 * su zona.
 */
const describeCancellationPolicy = ({
  restrictions,
  classData,
  gymTimeZone,
  profileData = {},
  now = new Date(),
}) => {
  const policy = toPolicy(restrictions, 'nonMember');
  const waiveWindowMs = policy.enabled ? getWaiveWindowMs(policy) : 0;
  const classStart = getClassStartLocal(classData);

  // Sin penalizacion o sin ventana no hay cancelaciones que cuesten creditos
  if (!policy.enabled || !policy.penalty || !waiveWindowMs) {
    return {
      creditsPenalty: 0,
      waiveWindow: null,
      freeCancellationUntil: null,
      lateCancellationsAllowed: 0,
      lateCancellationsRemaining: 0,
    };
  }

  const used = countInWindow({
    windowStart: profileData.first30DaysLateCancellation,
    count: profileData.lateCancellationCount,
    now,
  });

  return {
    creditsPenalty: policy.penalty.amount,
    waiveWindow: describeWaiveWindow(policy),
    freeCancellationUntil: Number.isNaN(classStart.getTime())
      ? null
      : new Date(
          classStart.getTime() -
            waiveWindowMs -
            parseUtcOffsetHours(gymTimeZone) * HOUR_MS
        ).toISOString(),
    lateCancellationsAllowed: policy.lateCancellationsAllowed,
    lateCancellationsRemaining: Math.max(
      0,
      policy.lateCancellationsAllowed - used
    ),
  };
};

module.exports = {
  WINDOW_DAYS,
  toPolicy,
  getWaiveWindowMs,
  getClassStartLocal,
  nextWindowCount,
  isLateCancellation,
  evaluateLateCancellation,
  evaluateNoShow,
  describeCancellationPolicy,
};
