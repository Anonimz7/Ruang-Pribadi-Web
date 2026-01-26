const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const TEMP_UPLOAD_DIR = path.join(UPLOAD_DIR, 'tmp');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const LOG_DIR = path.join(ROOT_DIR, 'log');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  TEMP_UPLOAD_DIR,
  DB_PATH,
  LOG_DIR,
  PORT,
  HOST
};
