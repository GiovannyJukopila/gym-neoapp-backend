'use strict';
const express = require('express');
const app = express();
const { db } = require('../firebase'); // Ejemplo de dependencia de Firebase
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
app.use(bodyParser.json());
require('dotenv').config();

const checkInternetConnection = async () => {
  try {
    await db.collection('metadata').limit(1).get();

    return true;
  } catch (error) {
    return false;
  }
};

const getConnection = async (req, res) => {
  try {
    const isConnected = await checkInternetConnection();

    if (isConnected) {
      return res.status(200).json({
        status: 'OK',
        message: 'Backend is online and Firebase is reachable',
      });
    } else {
      throw new Error('No connectivity to Firebase');
    }
  } catch (error) {
    return res.status(500).json({
      status: 'ERROR',
      message: 'Unable to reach Firebase or no internet connection',
      error: error.message,
    });
  }
};

module.exports = { getConnection };
