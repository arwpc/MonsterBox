const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    console.warn(`Unable to create log directory: ${error.message}`);
  }
}

const fileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'MonsterBox-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  handleExceptions: true,
});

fileTransport.on('error', (error) => {
  console.error(`Error with file logging: ${error.message}`);
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.simple(),
  handleExceptions: true,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    fileTransport,
    consoleTransport
  ],
  exitOnError: false
});

// Catch any errors that occur during logging
logger.on('error', (error) => {
  console.error('Logging error:', error);
});

module.exports = logger;
