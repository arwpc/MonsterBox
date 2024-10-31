const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.resolve(process.cwd(), 'log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Define custom log format
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    // Check if message contains "Successfully" to categorize as info
    if (typeof message === 'string' && message.includes('Successfully')) {
        level = 'info';
    }
    return JSON.stringify({
        timestamp,
        level,
        message
    });
});

// Create Winston logger
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat
    ),
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp }) => {
                    // Check if message contains "Successfully" to categorize as info
                    if (typeof message === 'string' && message.includes('Successfully')) {
                        level = 'info';
                    }
                    return `${level}: ${message} {"timestamp":"${timestamp}"}`;
                })
            )
        }),
        // File transport for errors
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            options: { flags: 'a' }
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            options: { flags: 'a' }
        })
    ]
});

// Add a test log to verify logging is working
logger.info('Logger initialized');

module.exports = logger;
