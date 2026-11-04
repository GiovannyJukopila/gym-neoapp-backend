const jwt = require('jsonwebtoken');
const { isRevoked } = require('../utils/revokedProfiles');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).send('Unauthorized'); // No hay token, acceso no autorizado
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      return res.status(403).send('Invalid token'); // Token inválido
    }
    // Sesion de un admin eliminado
    if (isRevoked(user?.profileId)) {
      return res.status(401).send('Unauthorized');
    }
    req.user = user; // Almacenar la información del usuario en el objeto de solicitud si es necesario
    next(); // Continuar con la ejecución de la ruta si el token es válido
  });
};

module.exports = verifyToken;
