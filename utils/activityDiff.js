/**
 * Como se describe un cambio de datos en la actividad: que es cada documento,
 * que campos cambiaron (antes / despues) y que datos nunca se guardan.
 */

// ---- Que es cada coleccion ----

const fullName = (d) =>
  [d.profileName, d.profileLastname].filter(Boolean).join(' ') ||
  d.fullName ||
  '';

const profileKind = (d) => {
  const roles = Array.isArray(d.role) ? d.role : [];
  if (d.profileIsAdmin || roles.includes('admin')) return 'admin';
  if (roles.includes('trainer')) return 'trainer';
  if (d.memberType === 'unknownmember' || roles.includes('unknownmember')) {
    return 'non-member';
  }
  return 'member';
};

const COLLECTIONS = {
  profiles: {
    category: (d) =>
      ({ admin: 'staff', trainer: 'staff', 'non-member': 'nonMembers' }[
        profileKind(d)
      ] || 'members'),
    entity: (d) => profileKind(d),
    name: fullName,
  },
  classes: { category: 'classes', entity: 'class', name: (d) => d.className },
  primaryClasses: {
    category: 'classes',
    entity: 'recurring class',
    name: (d) => d.className,
  },
  memberships: { category: 'plans', entity: 'plan', name: (d) => d.planName },
  courts: { category: 'courts', entity: 'court', name: (d) => d.courtName },
  sessionHistory: { category: 'courts', entity: 'court booking', name: () => '' },
  guests: {
    category: 'guests',
    entity: 'guest',
    name: (d) => [d.name, d.lastname].filter(Boolean).join(' '),
  },
  paymentHistory: {
    category: 'finance',
    entity: 'payment',
    name: (d) => [d.paymentType, d.paymentAmount !== undefined ? `${d.paymentAmount} €` : '']
      .filter(Boolean)
      .join(' · '),
  },
  financialAdjustments: {
    category: 'finance',
    entity: 'payment adjustment',
    name: (d) => d.adjustedBy || '',
  },
  creditCharges: {
    category: 'nonMembers',
    entity: 'credit charge',
    name: (d) => d.reason || '',
  },
  prepaidpackages: {
    category: 'nonMembers',
    entity: 'prepaid package',
    name: (d) => d.packageName || d.name || '',
  },
  cards: { category: 'members', entity: 'card', name: (d) => d.cardSerialNumber },
  accessHistory: {
    category: 'checkins',
    entity: 'check-in',
    name: (d) => d.action || '',
  },
  attendanceHistory: {
    category: 'checkins',
    entity: 'class attendance',
    name: () => '',
  },
  storeTransactions: {
    category: 'store',
    entity: 'store order',
    name: (d) => d.orderId || '',
  },
  products: { category: 'store', entity: 'product', name: (d) => d.name },
  colors: { category: 'store', entity: 'color', name: (d) => d.name },
  gyms: { category: 'settings', entity: 'gym', name: (d) => d.gymName },
  availableColors: { category: 'store', entity: 'product color', name: (d) => d.name },
  userActivity: { category: 'members', entity: 'member activity', name: () => '' },

  // Subcolecciones (su documento padre queda enlazado en la actividad)
  participants: {
    category: 'classes',
    entity: 'class booking',
    name: (d) => fullName(d) || d.profileId || '',
  },
  unknownParticipants: {
    category: 'classes',
    entity: 'non-member class booking',
    name: (d) => fullName(d) || d.profileId || '',
  },
  waitingList: {
    category: 'classes',
    entity: 'waiting list place',
    name: (d) => fullName(d) || d.profileId || '',
  },
  unknownWaitingList: {
    category: 'classes',
    entity: 'non-member waiting list place',
    name: (d) => fullName(d) || d.profileId || '',
  },
  userPenalties: {
    category: 'members',
    entity: 'penalty',
    name: (d) => d.reason || d.status || '',
  },
};

// Nunca se registran (tecnicos o el propio registro)
const IGNORED_COLLECTIONS = new Set([
  'staffActivity',
  'activityLogs',
  'metadata',
  'verificationCodes',
]);

// Campos que cambian solos (contadores y estadisticas) y no aportan nada
const IGNORED_FIELDS = {
  gyms: [
    /^userCountsByMonth/,
    /^totalAmountByMonth/,
    /LastSerialNumber$/,
    /^lastSerialNumber$/,
    /^gymMemberships$/,
    // Contadores para numerar clases, pistas, sesiones...
    /^gym(Classes|PrimaryClasses|Courts|prepaidpackages|Sessions|Products|Colors|Guests|Profiles|Cards)$/i,
  ],
  memberships: [/^currentTotalMembers$/, /^usersByMonth/],
  profiles: [/^pushSubscription/, /^subscription/],
};

const describeCollection = (collection, data) => {
  const meta = COLLECTIONS[collection];
  const doc = data || {};
  if (!meta) {
    return { category: 'other', entity: collection, name: '' };
  }
  const pick = (value) => (typeof value === 'function' ? value(doc) : value);
  return {
    category: pick(meta.category),
    entity: pick(meta.entity),
    name: String(meta.name(doc) || '').trim(),
  };
};

// ---- Datos que nunca se guardan tal cual ----

const SECRET_KEY = /password|secret|token|verificationcode|enteredcode|apikey|private_key/i;
const MAX_TEXT = 200;

const sanitizeValue = (key, value) => {
  if (SECRET_KEY.test(key)) return '[hidden]';
  if (typeof value !== 'string') return value;
  if (value.startsWith('data:')) return '[image]';
  if (/X-Goog-Signature|GoogleAccessId=/.test(value)) return '[file link]';
  if (value.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200))) {
    return '[file]';
  }
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
};

// ---- Valores de Firestore a texto ----

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  (value.constructor === Object || value.constructor === undefined);

// Valores que se leen mejor con palabras
const VALUE_LABELS = {
  profileStatus: { true: 'Active', false: 'Inactive', 'payment-issue': 'Payment issue' },
  profileAdminLevel: { 1: 'Admin', 2: 'Master Admin', 3: 'NeoApp' },
};

const toText = (value, key = '') => {
  if (value === undefined || value === null || value === '') return '';
  const named = VALUE_LABELS[key]?.[String(value)];
  if (named) return named;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (typeof value?.path === 'string' && typeof value?.id === 'string') {
    return value.path; // DocumentReference
  }
  if (typeof value?.latitude === 'number') {
    return `${value.latitude}, ${value.longitude}`;
  }
  if (Buffer.isBuffer(value)) return '[file]';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value).slice(0, MAX_TEXT);
    } catch (error) {
      return '[object]';
    }
  }
  return String(value);
};

// Elementos de una lista de objetos: se identifican por su id para decir
// "se añadio X / se quito Y" en vez de comparar posiciones
const ITEM_KEYS = ['profileId', 'memberId', 'id', 'cardSerialNumber', 'classId', 'productId', 'sku'];

const itemKey = (item) => {
  if (!isPlainObject(item)) return null;
  const key = ITEM_KEYS.find((k) => item[k] !== undefined && item[k] !== '');
  return key ? String(item[key]) : null;
};

const itemLabel = (item) =>
  fullName(item) || item.name || item.className || itemKey(item) || 'item';

/**
 * Aplana un documento a { 'campo.subcampo': texto }. Las listas de objetos
 * con id se convierten en 'lista[id]': nombre.
 */
const flatten = (data, prefix = '', depth = 0, out = {}) => {
  Object.entries(data || {}).forEach(([key, raw]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = sanitizeValue(key, raw);

    if (isPlainObject(value) && depth < 2) {
      flatten(value, path, depth + 1, out);
    } else if (Array.isArray(value)) {
      const keyed = value.length && value.every((item) => itemKey(item));
      if (keyed) {
        value.forEach((item) => {
          out[`${path}[${itemKey(item)}]`] = itemLabel(item);
        });
      } else {
        out[path] = value
          .map((item) => toText(sanitizeValue(key, item)))
          .join(', ')
          .slice(0, MAX_TEXT);
      }
    } else {
      out[path] = toText(value, key);
    }
  });
  return out;
};

// ---- Etiquetas legibles ----

const FIELD_LABELS = {
  profileName: 'First name',
  profileLastname: 'Last name',
  profileEmail: 'Email',
  profileTelephoneNumber: 'Phone',
  profileBirthday: 'Birthday',
  profileGender: 'Gender',
  profileAddress: 'Address',
  profileCity: 'City',
  profilePostalCode: 'Postal code',
  profileCountry: 'Country',
  profileNotes: 'Notes',
  cardSerialNumber: 'Card',
  membershipId: 'Plan',
  profileStartDate: 'Start date',
  profileEndDate: 'Expiration date',
  profileStatus: 'Status',
  profileLastMembershipPrice: 'Plan price',
  profileTotalReceive: 'Amount received',
  profileWasDiscount: 'Discount',
  profileWasComplementary: 'Complimentary',
  profileComplementaryReason: 'Complimentary reason',
  profileDiscountType: 'Discount type',
  profileDiscountPercentage: 'Discount %',
  profileDiscountValue: 'Discount amount',
  profileIsACouple: 'Couple plan',
  profileCoupleName: 'Partner name',
  profileCoupleEmail: 'Partner email',
  profileIsAdmin: 'Admin access',
  profileAdminLevel: 'Admin level',
  profileIsTrainer: 'Trainer',
  profilePicture: 'Photo',
  profileFile: 'Document',
  profileFrozen: 'Frozen',
  profileId: 'Member',
  memberId: 'Member',
  classId: 'Class',
  gymId: 'Gym',
  role: 'Roles',
  selectTrainer: 'Trainer',
  currentClassParticipants: 'Participants',
  participants: 'Participant',
  waitingList: 'Waiting list',
  classCapacity: 'Capacity',
  eventDate: 'Date',
  renewMembershipInQueue: 'Renewal',
  membershipLastChange: 'Last membership change',
};

// 'profileUnFreezeDays' -> 'Un freeze days'
const humanize = (key) => {
  const words = key
    .replace(/^profile(?=[A-Z])/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
};

const labelFor = (path) => {
  const listItem = /^(.+)\[(.+)\]$/.exec(path);
  const base = listItem ? listItem[1] : path;
  const parts = base.split('.');
  const label = parts
    .map((part) => FIELD_LABELS[part] || humanize(part))
    .join(' › ');
  return label;
};

/**
 * Diferencias entre dos versiones de un documento.
 * @returns [{ field, label, before, after }]
 */
const MAX_FIELDS = 80;

const diffDocuments = (collection, before, after) => {
  const a = flatten(before);
  const b = flatten(after);
  const ignored = IGNORED_FIELDS[collection] || [];

  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((field) => !ignored.some((pattern) => pattern.test(field)))
    .filter((field) => (a[field] ?? '') !== (b[field] ?? ''))
    .slice(0, MAX_FIELDS)
    .map((field) => ({
      field,
      label: labelFor(field),
      before: a[field] ?? '',
      after: b[field] ?? '',
    }));
};

// ---- Como queda un documento tras una escritura ----

const clone = (value) =>
  isPlainObject(value)
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]))
    : Array.isArray(value)
    ? value.map(clone)
    : value;

const sameItem = (a, b) => toText(a) === toText(b);

// FieldValue.increment / arrayUnion / delete... aplicados sobre el valor anterior
const applyTransform = (current, value) => {
  switch (value?.methodName) {
    case 'FieldValue.delete':
      return { remove: true };
    case 'FieldValue.serverTimestamp':
      return { value: new Date() };
    case 'FieldValue.increment':
      return { value: (Number(current) || 0) + Number(value.operand) };
    case 'FieldValue.arrayUnion': {
      const list = Array.isArray(current) ? [...current] : [];
      value.elements.forEach((element) => {
        if (!list.some((item) => sameItem(item, element))) list.push(element);
      });
      return { value: list };
    }
    case 'FieldValue.arrayRemove': {
      const list = Array.isArray(current) ? current : [];
      return {
        value: list.filter(
          (item) => !value.elements.some((element) => sameItem(item, element))
        ),
      };
    }
    default:
      return null;
  }
};

const setPath = (target, segments, value) => {
  let node = target;
  segments.slice(0, -1).forEach((segment) => {
    if (!isPlainObject(node[segment])) node[segment] = {};
    node = node[segment];
  });
  const last = segments[segments.length - 1];
  const transform = applyTransform(node[last], value);
  if (transform?.remove) delete node[last];
  else node[last] = transform ? transform.value : resolveSentinels(value);
};

// Quita los FieldValue que vengan dentro de objetos nuevos
const resolveSentinels = (value) => {
  if (value?.methodName) {
    const transform = applyTransform(undefined, value);
    return transform?.remove ? undefined : transform?.value;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([k, v]) => [k, resolveSentinels(v)])
        .filter(([, v]) => v !== undefined)
    );
  }
  return value;
};

const deepMerge = (base, patch) => {
  const out = isPlainObject(base) ? clone(base) : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && !value.methodName && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      setPath(out, [key], value);
    }
  });
  return out;
};

/**
 * @param op { type: 'create'|'set'|'update'|'delete', data, options }
 * @param before datos anteriores (null si no existia o no se conoce)
 */
const applyWrite = (op, before) => {
  switch (op.type) {
    case 'delete':
      return null;
    case 'create':
      return resolveSentinels(op.data);
    case 'set':
      return op.options?.merge || op.options?.mergeFields
        ? deepMerge(before, op.data)
        : resolveSentinels(op.data);
    case 'update': {
      const out = isPlainObject(before) ? clone(before) : {};
      Object.entries(op.data || {}).forEach(([path, value]) => {
        setPath(out, String(path).split('.'), value);
      });
      return out;
    }
    default:
      return before;
  }
};

module.exports = {
  IGNORED_COLLECTIONS,
  describeCollection,
  diffDocuments,
  applyWrite,
  flatten,
};
