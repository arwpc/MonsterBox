const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'MonsterBox-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      createSymlink: true,
      symlinkName: 'MonsterBox-current.log',
      // Set a more permissive file mode
      options: { mode: 0o666 }
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'error'
    })
  ]
});

module.exports = logger;
