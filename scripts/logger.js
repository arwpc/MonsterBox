const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', 'log');

// Check if we have write permissions
let canWriteToLogDir = false;
try {
  fs.accessSync(logDir, fs.constants.W_OK);
  canWriteToLogDir = true;
} catch (error) {
  console.warn(`No write access to log directory: ${error.message}`);
}

let transports = [
  new winston.transports.Console({
    level: 'info', // Changed to info to see debug logs
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
    handleExceptions: true,
  })
];

if (canWriteToLogDir) {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'MonsterBox-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      handleExceptions: true,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: transports,
  exitOnError: false
});

// Catch any errors that occur during logging
logger.on('error', (error) => {
  console.error('Logging error:', error);
});

// Override console methods
console.log = function(...args) {
  logger.info(args.join(' '));
};

console.warn = function(...args) {
  logger.warn(args.join(' '));
};

console.error = function(...args) {
  logger.error(args.join(' '));
};

module.exports = logger;
