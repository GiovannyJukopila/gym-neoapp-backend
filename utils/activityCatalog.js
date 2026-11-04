/**
 * Catalogo de acciones del panel que se registran en la actividad del staff.
 *
 * Cada entrada describe una ruta (relativa a /api):
 *   method, path   como en el router ('/classes/delete/:classId')
 *   action         identificador estable ('class.deleted')
 *   category       agrupacion para los filtros del panel
 *   summary        verbo en ingles; el panel muestra "<quien> <summary> <a quien>"
 *   target(ctx)    { type, id, name? } a quien o sobre que se hizo
 *   details(ctx)   [{ label, value }] datos utiles para entender la accion
 *   resolveBefore  el nombre de lo afectado se busca ANTES de la accion
 *                  (borrados: despues ya no existe)
 *   actor(ctx)     solo para el login: quien entra viene en la respuesta
 *   requiresChanges solo se registra si la peticion cambio datos (rutas GET
 *                  que a veces escriben, como el escaner)
 *
 * ctx = { params, body, query, response }
 *
 * Los datos que cambian se capturan siempre, esten o no en el catalogo
 * (utils/activityCapture.js); el catalogo solo da una frase mejor. Una ruta
 * que no esta aqui y cambia datos se describe a partir de esos datos.
 */

const full = (...parts) => parts.filter(Boolean).join(' ').trim();

const memberFromForm = (form) =>
  form && typeof form === 'object'
    ? full(form.profileName, form.profileLastname) || form.fullName || ''
    : '';

const money = (value) =>
  value === undefined || value === null || value === '' ? '' : `${value} €`;

const REPORTS = {
  generateGlobalReport: 'Global report',
  generateReportByMembership: 'Report by membership',
  generateDailyReport: 'Daily report',
  generateGymVisitReport: 'Gym visits report',
  generateDnaReport: 'DNA report',
  generateExpirationReport: 'Expiration report',
  generateWalkinReport: 'Walk-in report',
  generatePenaltiesReport: 'Penalties report',
};

const reportEntry = (name, path) => ({
  method: 'POST',
  path,
  action: 'report.downloaded',
  category: 'reports',
  summary: 'downloaded the',
  target: () => ({ type: 'report', id: name, name: REPORTS[name] }),
  details: ({ body }) =>
    [
      body?.startDate && { label: 'From', value: body.startDate },
      body?.endDate && { label: 'To', value: body.endDate },
      body?.selectedDate && { label: 'Date', value: body.selectedDate },
      body?.membershipName && { label: 'Plan', value: body.membershipName },
    ].filter(Boolean),
});

const ACTIVITY_CATALOG = [
  // ---- Acceso ----
  {
    method: 'POST',
    path: '/auth/validateAdminCode',
    action: 'auth.signedIn',
    category: 'access',
    summary: 'signed in to the panel',
    actor: ({ response }) => response?.responseData?.profileId,
  },

  {
    method: 'POST',
    path: '/auth/submitForm',
    action: 'auth.signedUp',
    category: 'access',
    summary: 'completed the sign-up form',
  },

  // ---- Escaner de entrada ----
  {
    method: 'GET',
    path: '/scan/getMember/:cardSerialNumber',
    action: 'checkin.scanned',
    category: 'checkins',
    summary: 'scanned the card',
    requiresChanges: true,
    target: ({ params }) => ({
      type: 'card',
      id: params.cardSerialNumber,
      name: params.cardSerialNumber,
    }),
  },
  {
    method: 'GET',
    path: '/scan/markClassMemberAttendance/:profileId/:classId',
    action: 'class.attendanceMarked',
    category: 'checkins',
    summary: 'marked attendance in the class',
    requiresChanges: true,
    target: ({ params }) => ({ type: 'class', id: params.classId }),
    details: ({ params }) => [
      { label: 'Member', value: params.profileId, profileId: params.profileId },
    ],
  },

  // ---- App de socios ----
  {
    method: 'POST',
    path: '/users/addClassParticipants',
    action: 'class.booked',
    category: 'classes',
    summary: 'booked a place in the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/users/addClassUnknownParticipants',
    action: 'class.booked',
    category: 'classes',
    summary: 'booked a place (non-member) in the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/users/addToMemberWaitingList',
    action: 'class.waitingListJoined',
    category: 'classes',
    summary: 'joined the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/users/addToUnknownMemberWaitingList',
    action: 'class.waitingListJoined',
    category: 'classes',
    summary: 'joined (non-member) the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/users/cancelMemberClass',
    action: 'class.bookingCancelled',
    category: 'classes',
    summary: 'cancelled the booking in',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'DELETE',
    path: '/users/cancelMemberCourt',
    action: 'court.bookingCancelled',
    category: 'courts',
    summary: 'cancelled a court booking',
  },
  {
    method: 'POST',
    path: '/courts/createSessionAsMember',
    action: 'court.booked',
    category: 'courts',
    summary: 'booked a court',
  },
  {
    method: 'POST',
    path: '/courts/createCourtAsUnknownMember',
    action: 'court.booked',
    category: 'courts',
    summary: 'booked a court (non-member)',
  },

  // ---- Socios ----
  {
    method: 'POST',
    path: '/profiles/create',
    action: 'member.created',
    category: 'members',
    summary: 'created the member',
    target: ({ body, response }) => ({
      type: 'profile',
      id: response?.profileId || response?.profile?.profileId || '',
      name: full(body?.profileName, body?.profileLastname),
    }),
    details: ({ body }) =>
      [
        body?.cardSerialNumber && { label: 'Card', value: body.cardSerialNumber },
        body?.profileTotalReceive && {
          label: 'Amount received',
          value: money(body.profileTotalReceive),
        },
      ].filter(Boolean),
  },
  {
    method: 'POST',
    path: '/profiles/update',
    action: 'member.updated',
    category: 'members',
    summary: 'updated the profile of',
    target: ({ body }) => ({ type: 'profile', id: body?.profileCode }),
  },
  {
    method: 'POST',
    path: '/profiles/updateProfileEndDate/:profileId',
    action: 'membership.renewed',
    category: 'members',
    summary: 'renewed the membership of',
    target: ({ params }) => ({ type: 'profile', id: params.profileId }),
    details: ({ body }) => {
      const renewal = body?.profilReneweData || {};
      return [
        renewal.currentSubscription?.label && {
          label: 'Plan',
          value: renewal.currentSubscription.label,
        },
        renewal.profileRenewStartDate && {
          label: 'Starts',
          value: renewal.profileRenewStartDate,
        },
        renewal.profileRenewEndDate && {
          label: 'Ends',
          value: renewal.profileRenewEndDate,
        },
        renewal.totalReceive !== undefined && {
          label: 'Amount received',
          value: money(renewal.totalReceive),
        },
      ].filter(Boolean);
    },
  },
  {
    method: 'POST',
    path: '/profiles/freeze-membership',
    action: 'membership.frozen',
    category: 'members',
    summary: 'froze the membership of',
    target: ({ body }) => ({ type: 'profile', id: body?.profileId }),
  },
  {
    method: 'POST',
    path: '/profiles/unfreeze-membership',
    action: 'membership.unfrozen',
    category: 'members',
    summary: 'unfroze the membership of',
    target: ({ body }) => ({ type: 'profile', id: body?.profileId }),
    details: ({ body }) =>
      [
        body?.profileUnfreezeExpirationDate && {
          label: 'New expiration',
          value: String(body.profileUnfreezeExpirationDate).slice(0, 10),
        },
        body?.profileUnFreezeDays !== undefined && {
          label: 'Days',
          value: body.profileUnFreezeDays,
        },
        body?.profileUnFreezeFee !== undefined && {
          label: 'Fee',
          value: money(body.profileUnFreezeFee),
        },
        body?.profileFrozenReason && {
          label: 'Reason',
          value: body.profileFrozenReason,
        },
      ].filter(Boolean),
  },
  {
    method: 'POST',
    path: '/profiles/uploadFile',
    action: 'member.fileUploaded',
    category: 'members',
    summary: 'uploaded a document for',
    target: ({ body }) => ({ type: 'profile', id: body?.profileCode }),
  },
  {
    method: 'DELETE',
    path: '/profiles/deleteFile',
    action: 'member.fileDeleted',
    category: 'members',
    summary: 'deleted a document of',
    target: ({ query }) => ({ type: 'profile', id: query?.profileCode }),
  },
  {
    method: 'POST',
    path: '/dashboard/updateInactiveMembers/:gymId',
    action: 'members.statusRefreshed',
    category: 'members',
    summary: 'refreshed the status of all members',
  },
  {
    method: 'POST',
    path: '/users/penalties/pay',
    action: 'penalty.paid',
    category: 'members',
    summary: 'registered a penalty payment for',
    target: ({ body }) => ({ type: 'profile', id: body?.profileId }),
  },
  {
    method: 'PATCH',
    path: '/users/penalties/updateStatus',
    action: 'penalty.statusChanged',
    category: 'members',
    summary: 'changed a penalty of',
    target: ({ body }) => ({ type: 'profile', id: body?.profileId }),
    details: ({ body }) =>
      body?.status ? [{ label: 'New status', value: body.status }] : [],
  },

  // ---- Staff ----
  {
    method: 'POST',
    path: '/admins/createAdmin',
    action: 'admin.created',
    category: 'staff',
    summary: 'created the admin',
    target: ({ body, response }) => ({
      type: 'profile',
      id: response?.profileId || response?.profile?.profileId || '',
      name: full(body?.profileName, body?.profileLastname),
    }),
  },
  {
    method: 'DELETE',
    path: '/admins/:profileId',
    action: 'admin.deleted',
    category: 'staff',
    summary: 'deleted the admin',
    resolveBefore: true,
    target: ({ params }) => ({ type: 'profile', id: params.profileId }),
  },
  {
    method: 'POST',
    path: '/trainers/createTrainer',
    action: 'trainer.created',
    category: 'staff',
    summary: 'created the trainer',
    target: ({ body, response }) => ({
      type: 'profile',
      id: response?.profileId || response?.profile?.profileId || '',
      name: full(body?.profileName, body?.profileLastname),
    }),
  },

  // ---- Planes ----
  {
    method: 'POST',
    path: '/memberships/create',
    action: 'plan.created',
    category: 'plans',
    summary: 'created the plan',
    target: ({ body }) => ({
      type: 'plan',
      id: '',
      name: body?.planName || body?.formData?.planName || '',
    }),
    details: ({ body }) => {
      const price = body?.price ?? body?.formData?.price;
      return price !== undefined ? [{ label: 'Price', value: money(price) }] : [];
    },
  },
  {
    method: 'POST',
    path: '/memberships/update',
    action: 'plan.updated',
    category: 'plans',
    summary: 'updated the plan',
    target: ({ body }) => ({
      type: 'plan',
      id: body?.membershipId,
      name: body?.formData?.planName || '',
    }),
    details: ({ body }) =>
      body?.formData?.price !== undefined
        ? [{ label: 'Price', value: money(body.formData.price) }]
        : [],
  },
  {
    method: 'DELETE',
    path: '/memberships/delete/:membershipId',
    action: 'plan.deleted',
    category: 'plans',
    summary: 'deleted the plan',
    resolveBefore: true,
    target: ({ params }) => ({ type: 'plan', id: params.membershipId }),
  },

  // ---- Clases ----
  {
    method: 'POST',
    path: '/classes/create',
    action: 'class.created',
    category: 'classes',
    summary: 'created the class',
    target: ({ body }) => ({
      type: 'class',
      id: '',
      name: body?.className || body?.formData?.className || '',
    }),
  },
  {
    method: 'POST',
    path: '/classes/createPrimaryClasses',
    action: 'class.scheduleCreated',
    category: 'classes',
    summary: 'created the recurring class',
    target: ({ body }) => ({
      type: 'primaryClass',
      id: '',
      name: body?.className || body?.formData?.className || '',
    }),
  },
  {
    method: 'POST',
    path: '/classes/update',
    action: 'class.updated',
    category: 'classes',
    summary: 'updated the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/updateAllClasses',
    action: 'class.seriesUpdated',
    category: 'classes',
    summary: 'updated all sessions of the class',
    target: ({ body }) => ({
      type: 'primaryClass',
      id: body?.personalClassId || body?.classId,
    }),
  },
  {
    method: 'POST',
    path: '/classes/updatePrimaryClasses',
    action: 'class.scheduleUpdated',
    category: 'classes',
    summary: 'updated the recurring class',
    target: ({ body }) => ({ type: 'primaryClass', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/cancelClass',
    action: 'class.cancelled',
    category: 'classes',
    summary: 'cancelled the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
    details: ({ body }) =>
      body?.eventStartDate
        ? [{ label: 'Date', value: String(body.eventStartDate).slice(0, 16) }]
        : [],
  },
  {
    method: 'DELETE',
    path: '/classes/delete/:classId',
    action: 'class.deleted',
    category: 'classes',
    summary: 'deleted the class',
    resolveBefore: true,
    target: ({ params }) => ({ type: 'class', id: params.classId }),
  },
  {
    method: 'POST',
    path: '/classes/deletePrimaryClass/:classId',
    action: 'class.scheduleDeleted',
    category: 'classes',
    summary: 'deleted the recurring class',
    resolveBefore: true,
    target: ({ params }) => ({ type: 'primaryClass', id: params.classId }),
  },
  {
    method: 'DELETE',
    path: '/classes/deleteAllClasses/:personalClassId',
    action: 'class.seriesDeleted',
    category: 'classes',
    summary: 'deleted all sessions of the class',
    resolveBefore: true,
    target: ({ params }) => ({
      type: 'primaryClass',
      id: params.personalClassId,
    }),
  },
  {
    method: 'POST',
    path: '/classes/addParticipants',
    action: 'class.memberAdded',
    category: 'classes',
    summary: 'added a member to the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
    details: ({ body }) => {
      const name = memberFromForm(body?.memberForm);
      return name ? [{ label: 'Member', value: name }] : [];
    },
  },
  {
    method: 'POST',
    path: '/classes/addUnknownParticipants',
    action: 'class.nonMemberAdded',
    category: 'classes',
    summary: 'added a non-member to the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
    details: ({ body }) => {
      const name = memberFromForm(body?.memberForm);
      return name ? [{ label: 'Non-member', value: name }] : [];
    },
  },
  {
    method: 'POST',
    path: '/classes/removeParticipant',
    action: 'class.memberRemoved',
    category: 'classes',
    summary: 'removed a member from the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
    details: ({ body }) =>
      body?.deletedProfileId
        ? [{ label: 'Member', value: body.deletedProfileId, profileId: body.deletedProfileId }]
        : [],
  },
  {
    method: 'POST',
    path: '/classes/removeUnknownParticipant',
    action: 'class.nonMemberRemoved',
    category: 'classes',
    summary: 'removed a non-member from the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/changeMemberAttendanceStatus',
    action: 'class.attendanceChanged',
    category: 'classes',
    summary: 'changed attendance in the class',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
    details: ({ body }) =>
      body?.memberId
        ? [{ label: 'Member', value: body.memberId, profileId: body.memberId }]
        : [],
  },
  {
    method: 'POST',
    path: '/classes/addClassMemberWaitingList',
    action: 'class.waitingListAdded',
    category: 'classes',
    summary: 'added a member to the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/addClassUnknownWaitingList',
    action: 'class.waitingListAdded',
    category: 'classes',
    summary: 'added a non-member to the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/removeMemberFromWaitingList',
    action: 'class.waitingListRemoved',
    category: 'classes',
    summary: 'removed a member from the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/removeUnknownMemberFromWaitingList',
    action: 'class.waitingListRemoved',
    category: 'classes',
    summary: 'removed a non-member from the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/waitinglist/updateUserPositions',
    action: 'class.waitingListReordered',
    category: 'classes',
    summary: 'reordered the waiting list of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/waitinglist/moveMemberToBookings',
    action: 'class.waitingListMoved',
    category: 'classes',
    summary: 'moved a member from the waiting list into',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/waitinglist/moveNonmemberToBookings',
    action: 'class.waitingListMoved',
    category: 'classes',
    summary: 'moved a non-member from the waiting list into',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },
  {
    method: 'POST',
    path: '/classes/generateClassReport/:gymId',
    action: 'report.downloaded',
    category: 'reports',
    summary: 'downloaded the attendance report of',
    target: ({ body }) => ({ type: 'class', id: body?.classId }),
  },

  // ---- Pistas ----
  {
    method: 'POST',
    path: '/courts/create',
    action: 'court.created',
    category: 'courts',
    summary: 'created the court',
    target: ({ body }) => ({
      type: 'court',
      id: '',
      name: body?.courtName || body?.formData?.courtName || '',
    }),
  },
  {
    method: 'POST',
    path: '/courts/update',
    action: 'court.updated',
    category: 'courts',
    summary: 'updated the court',
    target: ({ body }) => ({ type: 'court', id: body?.courtId }),
  },
  {
    method: 'DELETE',
    path: '/courts/delete/:id',
    action: 'court.deleted',
    category: 'courts',
    summary: 'deleted the court',
    resolveBefore: true,
    target: ({ params }) => ({ type: 'court', id: params.id }),
  },
  {
    method: 'POST',
    path: '/courts/createSession',
    action: 'court.booked',
    category: 'courts',
    summary: 'booked a court session',
  },
  {
    method: 'POST',
    path: '/courts/updateSession',
    action: 'court.bookingUpdated',
    category: 'courts',
    summary: 'updated a court booking',
  },
  {
    method: 'DELETE',
    path: '/courts/deleteSession/:id',
    action: 'court.bookingDeleted',
    category: 'courts',
    summary: 'deleted a court booking',
  },

  // ---- No socios y bonos ----
  {
    method: 'POST',
    path: '/unknownModule/createUnknownMember',
    action: 'nonMember.created',
    category: 'nonMembers',
    summary: 'created the non-member',
    target: ({ body }) => ({
      type: 'nonMember',
      id: body?.cardSerialNumber || '',
      name: body?.fullName || '',
    }),
    details: ({ body }) =>
      body?.fee !== undefined ? [{ label: 'Fee', value: money(body.fee) }] : [],
  },
  {
    method: 'POST',
    path: '/unknownModule/updateUnknownMember',
    action: 'nonMember.updated',
    category: 'nonMembers',
    summary: 'updated the non-member',
    target: ({ body }) => ({
      type: 'nonMember',
      id: body?.cardSerialNumber || '',
      name: body?.profileName || '',
    }),
  },
  {
    method: 'POST',
    path: '/unknownModule/renewprepaidpackage',
    action: 'nonMember.packageRenewed',
    category: 'nonMembers',
    summary: 'renewed a prepaid package',
  },
  {
    method: 'POST',
    path: '/unknownModule/createprepaidpackage',
    action: 'package.created',
    category: 'nonMembers',
    summary: 'created a prepaid package',
  },
  {
    method: 'DELETE',
    path: '/unknownModule/delete/:id',
    action: 'package.deleted',
    category: 'nonMembers',
    summary: 'deleted a prepaid package',
  },
  {
    method: 'POST',
    path: '/unknownModule/refundUnknownMemberCard/:cardId',
    action: 'nonMember.refunded',
    category: 'nonMembers',
    summary: 'refunded the card',
    target: ({ params }) => ({ type: 'card', id: params.cardId, name: params.cardId }),
  },
  {
    method: 'DELETE',
    path: '/unknownModule/removeUnknownMemberCard/:id',
    action: 'nonMember.cardRemoved',
    category: 'nonMembers',
    summary: 'removed the card',
    target: ({ params }) => ({ type: 'card', id: params.id, name: params.id }),
  },

  // ---- Invitados ----
  {
    method: 'POST',
    path: '/guests/createGuest',
    action: 'guest.created',
    category: 'guests',
    summary: 'registered the guest',
    target: ({ body }) => ({
      type: 'guest',
      id: '',
      name: full(body?.name, body?.lastname),
    }),
    details: ({ body }) =>
      [
        body?.roomNumber && { label: 'Room', value: body.roomNumber },
        body?.numberOfPeople && { label: 'People', value: body.numberOfPeople },
      ].filter(Boolean),
  },
  {
    method: 'POST',
    path: '/guests/guest/:guestId',
    action: 'guest.updated',
    category: 'guests',
    summary: 'updated the guest',
    target: ({ params }) => ({ type: 'guest', id: params.guestId }),
  },

  // ---- Finanzas ----
  {
    method: 'POST',
    path: '/financial/payment/adjustment/:paymentId',
    action: 'payment.adjusted',
    category: 'finance',
    summary: 'adjusted a payment of',
    target: ({ body, params }) => ({
      type: 'payment',
      id: params.paymentId,
      name: body?.fullName || '',
    }),
    details: ({ body }) => {
      const data = body?.paymentData || {};
      return [
        data.paymentAmount !== undefined && {
          label: 'Amount',
          value: money(data.paymentAmount),
        },
        data.paymentDate && { label: 'Payment date', value: data.paymentDate },
        data.adjustmentReason && { label: 'Reason', value: data.adjustmentReason },
      ].filter(Boolean);
    },
  },

  // ---- Informes ----
  ...Object.keys(REPORTS).map((name) =>
    reportEntry(
      name,
      ['generateGlobalReport', 'generateReportByMembership'].includes(name)
        ? `/reports/${name}`
        : `/reports/${name}/:gymId`
    )
  ),
  {
    method: 'POST',
    path: '/memberships/generateMembershipsReport/:gymId',
    action: 'report.downloaded',
    category: 'reports',
    summary: 'downloaded the',
    target: () => ({ type: 'report', id: 'memberships', name: 'Memberships report' }),
  },

  // ---- Comunicacion ----
  {
    method: 'POST',
    path: '/notification/sendEmail',
    action: 'notification.sent',
    category: 'communication',
    summary: 'sent an email notification',
    details: ({ body }) =>
      [
        body?.subject && { label: 'Subject', value: body.subject },
        {
          label: 'To',
          value: body?.isForAll ? 'All members' : body?.recipient || '',
        },
      ].filter((detail) => detail && detail.value),
  },
  {
    method: 'POST',
    path: '/pushNotification/send-notification',
    action: 'notification.pushSent',
    category: 'communication',
    summary: 'sent a push notification',
  },
  {
    method: 'POST',
    path: '/estore/sendEmailToPay',
    action: 'store.paymentLinkSent',
    category: 'store',
    summary: 'sent a store payment link',
    details: ({ body }) =>
      body?.total !== undefined ? [{ label: 'Total', value: money(body.total) }] : [],
  },
  {
    method: 'POST',
    path: '/support/sendSupportNotification',
    action: 'support.ticketSent',
    category: 'communication',
    summary: 'sent a support ticket',
    details: ({ body }) =>
      body?.subject ? [{ label: 'Subject', value: body.subject }] : [],
  },

  // ---- Ajustes y tienda ----
  {
    method: 'POST',
    path: '/gyms/update-gym/:gymId',
    action: 'settings.updated',
    category: 'settings',
    summary: 'updated the gym settings',
  },
  {
    method: 'POST',
    path: '/gyms/update-gyminfo/:gymId',
    action: 'settings.infoUpdated',
    category: 'settings',
    summary: 'updated the gym information',
  },
  {
    method: 'POST',
    path: '/gyms/uploadGymLogo',
    action: 'settings.logoUploaded',
    category: 'settings',
    summary: 'uploaded a new gym logo',
  },
  {
    method: 'DELETE',
    path: '/gyms/deleteLogo',
    action: 'settings.logoDeleted',
    category: 'settings',
    summary: 'deleted the gym logo',
  },
  {
    method: 'PUT',
    path: '/estore/products/:productId/visibility',
    action: 'store.productVisibility',
    category: 'store',
    summary: 'changed the visibility of a store product',
    details: ({ body }) =>
      body?.isVisible !== undefined
        ? [{ label: 'Visible', value: body.isVisible ? 'Yes' : 'No' }]
        : [],
  },
];

// '/classes/delete/:classId' -> expresion regular con sus parametros
const compile = (path) => {
  const names = [];
  const pattern = path
    .replace(/\/$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${pattern}/?$`), names };
};

const COMPILED = ACTIVITY_CATALOG.map((entry) => ({
  entry,
  ...compile(entry.path),
}));

const matchActivity = (method, path) => {
  for (const { entry, regex, names } of COMPILED) {
    if (entry.method !== method) continue;
    const match = regex.exec(path);
    if (!match) continue;
    const params = {};
    names.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1]);
    });
    return { entry, params };
  }
  return null;
};

module.exports = { ACTIVITY_CATALOG, matchActivity };
