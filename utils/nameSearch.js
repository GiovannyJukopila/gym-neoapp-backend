/**
 * Busqueda de personas por nombre.
 *
 * El problema que habia
 * ---------------------
 * El tope del rango de prefijo estaba escrito como '\\uf8ff', es decir una
 * barra invertida literal seguida de "uf8ff", en vez del caracter Unicode alto
 * . Con ese tope, buscar "Gio" excluia "Giovanny" (la 'v' ordena despues
 * de la barra), asi que solo aparecia la coincidencia exacta. De ahi que hubiera
 * que escribir el nombre completo y perfecto.
 *
 * Ademas solo se miraba profileName: el apellido no se buscaba nunca, y en
 * cuanto el termino tenia un espacio se exigia igualdad exacta.
 *
 * Como funciona ahora
 * -------------------
 * Igual que los buscadores de personas de las aplicaciones grandes: cada
 * palabra que se escribe tiene que ser el PREFIJO de alguna palabra del nombre
 * completo, en cualquier orden.
 *
 *   "gio"            -> Giovanny Rueda
 *   "rue"            -> Giovanny Rueda
 *   "gio rue"        -> Giovanny Rueda
 *   "rueda giovanny" -> Giovanny Rueda   (el orden no importa)
 *
 * La comparacion ignora mayusculas y acentos.
 */

// Caracter alto que cierra un rango de prefijo en Firestore
const PREFIX_CEILING = '';

/** Minusculas y sin acentos, para comparar sin sorpresas */
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Divide el termino en palabras utiles */
const tokenize = (term) =>
  String(term || '')
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

/**
 * Variantes de capitalizacion con las que buscar el prefijo. Los nombres se
 * guardan con la primera letra en mayuscula, pero quedan algunos registros
 * antiguos en minuscula, asi que se prueban las dos.
 */
const prefixVariants = (token) => {
  const lower = token.toLowerCase();
  const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
  return capitalized === lower ? [capitalized] : [capitalized, lower];
};

/** Todas las palabras del nombre completo de un perfil, normalizadas */
const profileWords = (profile) => {
  const full = `${profile.profileName || ''} ${profile.profileLastname || ''}`;
  return normalize(full).split(/\s+/).filter(Boolean);
};

/**
 * True si CADA palabra buscada es prefijo de alguna palabra del nombre.
 * Es lo que permite "gio rue" y tambien "rue gio".
 */
const matchesAllTokens = (profile, tokens) => {
  if (tokens.length === 0) return true;

  const words = profileWords(profile);

  return tokens.every((token) => {
    const needle = normalize(token);
    if (!needle) return true;
    return words.some((word) => word.startsWith(needle));
  });
};

/**
 * Puntua para ordenar: primero lo que empieza por el nombre, luego por el
 * apellido, y a igualdad de puntos por orden alfabetico.
 */
const scoreProfile = (profile, tokens) => {
  const first = normalize(profile.profileName);
  const last = normalize(profile.profileLastname);
  const needle = normalize(tokens[0] || '');
  const fullNeedle = normalize(tokens.join(' '));
  const full = `${first} ${last}`.trim();

  let score = 0;

  if (full === fullNeedle) score += 100; // nombre completo exacto
  if (first === needle) score += 50; // nombre exacto
  if (last === needle) score += 40; // apellido exacto
  if (first.startsWith(needle)) score += 20; // el nombre empieza por lo escrito
  if (last.startsWith(needle)) score += 10; // el apellido empieza por lo escrito

  return score;
};

/**
 * Filtra y ordena los candidatos que vienen de la base de datos.
 */
const rankProfiles = (profiles, tokens, limit = 50) => {
  const seen = new Set();
  const unique = [];

  profiles.forEach((profile) => {
    const id = profile.profileId || profile.cardSerialNumber;
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    unique.push(profile);
  });

  return unique
    .filter((profile) => matchesAllTokens(profile, tokens))
    .map((profile) => ({ profile, score: scoreProfile(profile, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const nameA = `${a.profile.profileName || ''} ${
        a.profile.profileLastname || ''
      }`;
      const nameB = `${b.profile.profileName || ''} ${
        b.profile.profileLastname || ''
      }`;
      return nameA.localeCompare(nameB);
    })
    .slice(0, limit)
    .map((entry) => entry.profile);
};

module.exports = {
  PREFIX_CEILING,
  normalize,
  tokenize,
  prefixVariants,
  matchesAllTokens,
  rankProfiles,
};
