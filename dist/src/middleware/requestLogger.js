"use strict";
/**
 * Request Logging Middleware for MonsterBox
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
exports.skipHealthCheck = skipHealthCheck;
const environment_1 = require("../../config/environment");
/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
    const startTime = Date.now();
    // Store original end function
    const originalEnd = res.end;
    // Override end function to capture response details
    res.end = function (chunk, encoding) {
        const responseTime = Date.now() - startTime;
        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress || 'unknown',
            contentLength: res.get('Content-Length') ? parseInt(res.get('Content-Length')) : undefined
        };
        // Log based on environment
        if (environment_1.isDevelopment) {
            console.log(`${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} - ${logEntry.responseTime}ms`);
        }
        else {
            console.log(JSON.stringify(logEntry));
        }
        // Call original end function
        return originalEnd.call(this, chunk, encoding);
    };
    next();
}
/**
 * Health check request filter (skip logging for health checks)
 */
function skipHealthCheck(req, res, next) {
    if (req.path === '/health' || req.path === '/api/health') {
        return next();
    }
    requestLogger(req, res, next);
}
//# sourceMappingURL=requestLogger.js.map