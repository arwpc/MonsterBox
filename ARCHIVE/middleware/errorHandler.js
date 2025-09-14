/**
 * Centralized Error Handling Middleware for MonsterBox
 * 
 * Provides structured error handling with consistent response formats,
 * comprehensive logging, and security-conscious error messages.
 */

const logger = require('../scripts/logger');

/**
 * Custom Error Classes
 */
class ValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        this.field = field;
        this.isOperational = true;
    }
}

class AuthenticationError extends Error {
    constructor(message = 'Authentication required') {
        super(message);
        this.name = 'AuthenticationError';
        this.statusCode = 401;
        this.isOperational = true;
    }
}

class AuthorizationError extends Error {
    constructor(message = 'Insufficient permissions') {
        super(message);
        this.name = 'AuthorizationError';
        this.statusCode = 403;
        this.isOperational = true;
    }
}

class NotFoundError extends Error {
    constructor(resource = 'Resource') {
        super(`${resource} not found`);
        this.name = 'NotFoundError';
        this.statusCode = 404;
        this.isOperational = true;
    }
}

class ConflictError extends Error {
    constructor(message = 'Resource conflict') {
        super(message);
        this.name = 'ConflictError';
        this.statusCode = 409;
        this.isOperational = true;
    }
}

class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded') {
        super(message);
        this.name = 'RateLimitError';
        this.statusCode = 429;
        this.isOperational = true;
    }
}

class HardwareError extends Error {
    constructor(message = 'Hardware operation failed', device = null) {
        super(message);
        this.name = 'HardwareError';
        this.statusCode = 503;
        this.device = device;
        this.isOperational = true;
    }
}

/**
 * Error Response Formatter
 * Creates consistent error response structure
 */
function formatErrorResponse(error, req) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isTest = process.env.NODE_ENV === 'test';
    
    const baseResponse = {
        success: false,
        error: error.message || 'An error occurred',
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    };

    // Add error code if available
    if (error.code) {
        baseResponse.code = error.code;
    }

    // Add field information for validation errors
    if (error.field) {
        baseResponse.field = error.field;
    }

    // Add device information for hardware errors
    if (error.device) {
        baseResponse.device = error.device;
    }

    // Include stack trace and additional details in development/test
    if (isDevelopment || isTest) {
        baseResponse.stack = error.stack;
        baseResponse.details = {
            name: error.name,
            statusCode: error.statusCode,
            isOperational: error.isOperational
        };
    }

    return baseResponse;
}

/**
 * Main Error Handling Middleware
 * Processes all errors and sends appropriate responses
 */
function errorHandler(error, req, res, next) {
    // Log the error with context
    const errorContext = {
        message: error.message,
        name: error.name,
        statusCode: error.statusCode,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: req.user ? req.user.username : 'anonymous'
    };

    // Determine log level based on error severity
    if (error.statusCode >= 500) {
        logger.error('Server Error:', errorContext);
    } else if (error.statusCode >= 400) {
        logger.warn('Client Error:', errorContext);
    } else {
        logger.info('Handled Error:', errorContext);
    }

    // Determine status code
    const statusCode = error.statusCode || 500;

    // Format response
    const response = formatErrorResponse(error, req);

    // Send response
    res.status(statusCode).json(response);
}

/**
 * 404 Not Found Handler
 * Handles requests to non-existent routes
 */
function notFoundHandler(req, res, next) {
    const error = new NotFoundError(`Route ${req.originalUrl}`);
    next(error);
}

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors automatically
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Validation Error Helper
 * Creates validation errors with field information
 */
function createValidationError(message, field = null) {
    return new ValidationError(message, field);
}

/**
 * Hardware Error Helper
 * Creates hardware-specific errors
 */
function createHardwareError(message, device = null) {
    return new HardwareError(message, device);
}

module.exports = {
    // Error Classes
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    HardwareError,
    
    // Middleware Functions
    errorHandler,
    notFoundHandler,
    asyncHandler,
    
    // Helper Functions
    createValidationError,
    createHardwareError,
    formatErrorResponse
};
