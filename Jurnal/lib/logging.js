const fs = require('fs');
const os = require('os');
const path = require('path');
const { LOG_DIR } = require('./config');
const { nowISO } = require('./time');

function getLogFilePath() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${dateStamp}.log`);
}

function logActivity(message) {
  const timestamp = nowISO();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFile(getLogFilePath(), `${line}${os.EOL}`, err => {
    if (err) {
      console.error('Failed to write log:', err);
    }
  });
}

module.exports = {
  logActivity
};
