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

app.use(express.static(path.join(__dirname, '/var/www/html')));

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, '/../../var/www/html/index.html'));
});

//routerApi(app);

app.listen(port, () => {
  console.log('NeoApp Server is ON');
});
