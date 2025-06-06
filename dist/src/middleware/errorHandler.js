"use strict";
/**
 * Error Handling Middleware for MonsterBox
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
exports.asyncHandler = asyncHandler;
exports.createError = createError;
const environment_1 = require("../../config/environment");
/**
 * Global error handler middleware
 */
function errorHandler(error, req, res, next) {
    // Log error
    console.error('Error occurred:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
    });
    // Determine status code
    const statusCode = error.statusCode || 500;
    // Prepare error response
    const errorResponse = {
        success: false,
        error: {
            message: error.message || 'Internal Server Error',
            code: error.code || 'INTERNAL_ERROR',
            timestamp: new Date().toISOString()
        }
    };
    // Add details in development mode
    if (environment_1.isDevelopment) {
        errorResponse.error.stack = error.stack;
        errorResponse.error.details = error.details;
    }
    // Send error response
    res.status(statusCode).json(errorResponse);
}
/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            message: `Route ${req.method} ${req.path} not found`,
            code: 'NOT_FOUND',
            timestamp: new Date().toISOString()
        }
    });
}
/**
 * Async error wrapper for route handlers
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
/**
 * Create custom error
 */
function createError(message, statusCode = 500, code, details) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    error.details = details;
    return error;
}
//# sourceMappingURL=errorHandler.js.map