const express = require('express');
const routerApi = require('./routes');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');
//const port = process.env.PORT || 2083;
const cors = require('cors');
require('dotenv').config();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(cors());

app.use(express.json());
// app.use(cors());
// app.use(bodyParser.json());

app.use('/api/', routerApi);

const indexPath = '/var/www/html/index.html';

// Ruta estática
app.use(express.static(path.dirname(indexPath)));

// Manejo de rutas no coincidentes con el archivo 'index.html'
app.get('/*', (req, res) => {
  res.sendFile(indexPath);
});

//routerApi(app);

app.listen(port, () => {
  console.log('NeoApp Server is ON');
});
