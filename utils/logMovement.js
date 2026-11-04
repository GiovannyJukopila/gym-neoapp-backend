/**
 * OBSOLETO: registro antiguo de movimientos de clases ('activityLogs').
 *
 * Toda la actividad (clases incluidas) se registra ahora en un unico sitio,
 * 'staffActivity', capturando los datos reales de cada cambio y quien lo hizo
 * (ver utils/activityCapture.js). Esta funcion se mantiene para no tocar a los
 * controladores que la llaman, pero ya no escribe nada.
 *
 * El historial antiguo se puede importar con scripts/migrateLegacyActivity.js.
 */
const logMovement = async () => {};

module.exports = { logMovement };
