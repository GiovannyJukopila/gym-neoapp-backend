const express = require('express');
// const cors = require('cors');
const routerApi = require('./routes');
const app = express();
const port = process.env.PORT || 80;
//const port = process.env.PORT || 3000;
const cors = require('cors');
require('dotenv').config();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

app.use(cors());

app.use(express.json());
// app.use(cors());
// app.use(bodyParser.json());

routerApi(app);

app.listen(port, () => {
  console.log('Mi port' + port);
});
