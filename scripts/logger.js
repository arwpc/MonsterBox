const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = path.resolve(process.cwd(), 'log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Clean up old log files
const cleanOldLogs = () => {
    try {
        const files = fs.readdirSync(logDir);
        files.forEach(file => {
            const filePath = path.join(logDir, file);
            const stats = fs.statSync(filePath);
            const fileAgeDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
            
            // Delete files older than 7 days
            if (fileAgeDays > 7) {
                fs.unlinkSync(filePath);
            }
        });
    } catch (error) {
        console.error('Error cleaning old logs:', error);
    }
};

// Clean old logs on startup
cleanOldLogs();

// Define custom log format
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    // Ensure message is a string
    const formattedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
    
    return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message: formattedMessage
    });
});

// Create Winston logger with daily rotate file
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        logFormat
    ),
    transports: [
        // Console transport with colors
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp }) => {
                    const formattedMessage = typeof message === 'object' ? JSON.stringify(message) : message;
                    return `${timestamp} ${level}: ${formattedMessage}`;
                })
            )
        }),
        // File transport for errors
        new winston.transports.File({
            filename: path.join(logDir, `error-${new Date().toISOString().split('T')[0]}.log`),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 7,
            tailable: true,
            options: { flags: 'a' }
        }),
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logDir, `combined-${new Date().toISOString().split('T')[0]}.log`),
            maxsize: 5242880, // 5MB
            maxFiles: 7,
            tailable: true,
            options: { flags: 'a' }
        })
    ],
    exitOnError: false
});

// Handle exceptions
logger.exceptions.handle(
    new winston.transports.File({
        filename: path.join(logDir, `exceptions-${new Date().toISOString().split('T')[0]}.log`),
        maxsize: 5242880, // 5MB
        maxFiles: 7,
        tailable: true
    })
);

// Handle rejections
logger.rejections.handle(
    new winston.transports.File({
        filename: path.join(logDir, `rejections-${new Date().toISOString().split('T')[0]}.log`),
        maxsize: 5242880, // 5MB
        maxFiles: 7,
        tailable: true
    })
);

// Add a test log to verify logging is working
logger.info('Logger initialized with enhanced configuration');

// Export logger instance
module.exports = logger;
