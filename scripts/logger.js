const winston = require('winston');
const path = require('path');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'log');

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
      maxFiles: '14d'
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'error'
    })
  ]
});

module.exports = logger;