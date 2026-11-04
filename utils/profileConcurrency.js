/**
 * Proteccion de los datos de membresia frente a guardados con datos viejos.
 *
 * El problema
 * -----------
 * El formulario de perfil del panel envia el perfil completo, incluidas las
 * fechas, el plan, el precio y el status. Si la pantalla se abrio ANTES de un
 * cambio hecho por otra via (una renovacion, un descongelamiento, otro
 * administrador) y alguien pulsa "Save", esos valores viejos pisaban el cambio.
 *
 * La regla
 * --------
 * Para cada campo de membresia que llega en el formulario:
 *   - si su valor es igual al guardado, no hay nada que comprobar;
 *   - si es distinto (el panel quiere cambiarlo), el panel tiene que demostrar
 *     que partia del valor actual: el valor que vio al abrir (originalValues)
 *     debe coincidir con el guardado. Si no coincide, alguien lo cambio mientras
 *     tanto y el guardado se rechaza (409) para que el panel recargue.
 *
 * Un panel antiguo (sin originalValues) solo puede guardar sin tocar estos
 * campos; si intenta cambiarlos se rechaza, porque no hay forma de saber si el
 * cambio es intencional o si su pantalla estaba desactualizada.
 */

const admin = require('firebase-admin');

const MEMBERSHIP_FIELDS = [
  'membershipId',
  'profileStartDate',
  'profileEndDate',
  'profileStatus',
  'profileLastMembershipPrice',
  'profileTotalReceive',
  'profileWasDiscount',
  'profileWasComplementary',
  'profileComplementaryReason',
  'profileDiscountType',
  'profileDiscountPercentage',
  'profileDiscountValue',
  'profileIsACouple',
  'profileCoupleName',
  'profileCoupleEmail',
];

const DATE_FIELDS = ['profileStartDate', 'profileEndDate'];

// Misma conversion que usa el endpoint que entrega el perfil al panel, para
// comparar en el mismo formato que vio el administrador
const toDateString = (value) => {
  if (typeof value?.toDate === 'function') value = value.toDate();
  // 'YYYY-MM-DD' tal cual; los años mal escritos ('0224') llegan al panel sin
  // ceros a la izquierda ('224'), asi que se rellenan para comparar igual
  const plainDate = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(value);
  if (typeof value === 'string' && plainDate) {
    return `${plainDate[1].padStart(4, '0')}-${plainDate[2]}-${plainDate[3]}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Normaliza para comparar: sin valor, booleanos guardados como texto o como
// booleano, y numeros guardados como texto o como numero valen lo mismo
const normalizeValue = (field, value) => {
  if (value === undefined || value === null || value === '') return '';
  if (DATE_FIELDS.includes(field)) return toDateString(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string' && value.trim() !== '' && !isNaN(value)) {
    return String(Number(value));
  }
  return String(value);
};

const sameValue = (field, a, b) =>
  normalizeValue(field, a) === normalizeValue(field, b);

/**
 * Devuelve los campos de membresia que el formulario quiere cambiar partiendo
 * de un valor que ya no es el actual. Lista vacia = el guardado es seguro.
 *
 * @param {object} currentProfile perfil tal como esta guardado ahora
 * @param {object} formData       campos que envia el panel
 * @param {object} [originalValues] valores que el panel vio al abrir
 * @returns {string[]}
 */
const findMembershipConflicts = (currentProfile, formData, originalValues) => {
  const original = originalValues || {};

  return MEMBERSHIP_FIELDS.filter((field) => {
    if (!(field in formData)) return false;

    const currentValue = currentProfile[field];
    if (sameValue(field, formData[field], currentValue)) return false;

    return !sameValue(field, original[field], currentValue);
  });
};

/**
 * Que cambio en la membresia desde que el panel abrio el perfil: lo que el
 * administrador tenia en pantalla frente a lo guardado ahora.
 */
const describeMembershipChanges = (
  currentProfile,
  formData,
  originalValues,
  conflicts
) => {
  const seen = originalValues || formData;
  const fields = new Set(conflicts);

  if (originalValues) {
    MEMBERSHIP_FIELDS.forEach((field) => {
      if (
        field in originalValues &&
        !sameValue(field, originalValues[field], currentProfile[field])
      ) {
        fields.add(field);
      }
    });
  }

  return MEMBERSHIP_FIELDS.filter((field) => fields.has(field)).map(
    (field) => ({
      field,
      onScreen: normalizeValue(field, seen[field]),
      saved: normalizeValue(field, currentProfile[field]),
    })
  );
};

// ---- Ultimo cambio de membresia (quien, como y cuando) ----
//
// Se guarda en el propio perfil, en la misma escritura que hace el cambio, asi
// que no cuesta lecturas ni escrituras extra. Incluye los valores que dejo: si
// despues otra via los cambia sin dejar constancia, ya no se atribuye a nadie.

const cleanText = (value) =>
  typeof value === 'string' ? value.trim().slice(0, 80) : '';

const membershipSnapshot = (profile) =>
  MEMBERSHIP_FIELDS.reduce((acc, field) => {
    acc[field] = normalizeValue(field, profile[field]);
    return acc;
  }, {});

const membershipChanged = (before, after) =>
  MEMBERSHIP_FIELDS.some((field) => !sameValue(field, before[field], after[field]));

/**
 * @param {string} action          'Profile edited', 'Renewal', 'Freeze'...
 * @param {object} [changedBy]      { profileId, name, isNeoApp } de quien lo hizo
 * @param {object} resultingProfile perfil tal como queda tras el cambio
 */
const buildMembershipStamp = (action, changedBy, resultingProfile) =>
  // El equipo NeoApp no deja rastro: se quita la marca anterior (si se quedara
  // y coincidieran los valores, el cambio se atribuiria a otra persona)
  changedBy?.isNeoApp
    ? admin.firestore.FieldValue.delete()
    : {
        action,
        byProfileId: cleanText(changedBy?.profileId),
        byName: cleanText(changedBy?.name),
        at: new Date().toISOString(),
        values: membershipSnapshot(resultingProfile),
      };

// Devuelve el ultimo cambio registrado solo si sigue siendo el vigente
const describeLastChange = (profile) => {
  const stamp = profile?.membershipLastChange;
  if (!stamp || !stamp.values) return null;

  const current = membershipSnapshot(profile);
  const stillCurrent = MEMBERSHIP_FIELDS.every(
    (field) => (stamp.values[field] ?? '') === current[field]
  );
  if (!stillCurrent) return null;

  return {
    action: stamp.action || '',
    byName: stamp.byName || '',
    at: stamp.at || '',
  };
};

module.exports = {
  MEMBERSHIP_FIELDS,
  findMembershipConflicts,
  describeMembershipChanges,
  membershipChanged,
  buildMembershipStamp,
  describeLastChange,
};
