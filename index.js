const express = require('express');
const routerApi = require('./routes');
const app = express();
const port = process.env.PORT || 80;
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

//routerApi(app);

app.listen(port, () => {
  console.log('NeoApp Server is ON');
});
