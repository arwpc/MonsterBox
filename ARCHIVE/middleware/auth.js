/**
 * JWT Authentication Middleware for MonsterBox Secure Remote Access System
 * 
 * Provides middleware functions for JWT token validation, role-based access control,
 * and animatronic-specific authorization for the MonsterBox system.
 */

const authService = require('../services/auth/authService');
const { hasPermission } = require('../config/auth/jwt-config');

/**
 * JWT Authentication Middleware
 * Validates JWT tokens and attaches user information to request
 */
const authenticateJWT = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Access token required',
                code: 'NO_TOKEN'
            });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        const verification = await authService.verifyAccessToken(token);
        
        if (!verification.success) {
            return res.status(401).json({
                success: false,
                error: verification.error,
                code: verification.error === 'Token expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
            });
        }
        
        // Attach user information to request
        req.user = verification.payload.user;
        req.jwt = verification.payload;
        req.sessionId = verification.payload.sessionId;
        
        next();
    } catch (error) {
        console.error('JWT authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
};

/**
 * Optional JWT Authentication Middleware
 * Validates JWT tokens if present but doesn't require them
 */
const optionalJWT = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const verification = await authService.verifyAccessToken(token);
            
            if (verification.success) {
                req.user = verification.payload.user;
                req.jwt = verification.payload;
                req.sessionId = verification.payload.sessionId;
            }
        }
        
        next();
    } catch (error) {
        // Continue without authentication if token validation fails
        next();
    }
};

/**
 * Role-based Authorization Middleware
 * Requires specific roles for access
 * @param {Array|string} allowedRoles - Array of allowed roles or single role
 */
const requireRole = (allowedRoles) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_ROLE',
                required: roles,
                current: req.user.role
            });
        }
        
        next();
    };
};

/**
 * Permission-based Authorization Middleware
 * Requires specific permissions for access
 * @param {Array|string} requiredPermissions - Array of required permissions or single permission
 */
const requirePermission = (requiredPermissions) => {
    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const userPermissions = req.jwt?.user?.permissions || [];
        const hasAllPermissions = permissions.every(permission => 
            userPermissions.includes(permission)
        );
        
        if (!hasAllPermissions) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                required: permissions,
                current: userPermissions
            });
        }
        
        next();
    };
};

/**
 * Animatronic Access Authorization Middleware
 * Requires access to specific animatronic systems
 * @param {string} animatronicId - Animatronic ID (orlok, coffin, pumpkinhead)
 * @param {string} permission - Required permission (view, control, configure, ssh)
 */
const requireAnimatronicAccess = (animatronicId, permission = 'view') => {
    return (req, res, next) => {
        if (!req.user || !req.jwt) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        // Check if user has access to the animatronic with required permission
        if (!hasPermission(req.jwt, animatronicId, permission)) {
            return res.status(403).json({
                success: false,
                error: `Access denied to ${animatronicId} with permission ${permission}`,
                code: 'ANIMATRONIC_ACCESS_DENIED',
                animatronic: animatronicId,
                permission: permission
            });
        }
        
        // Attach animatronic info to request
        req.animatronic = {
            id: animatronicId,
            permission: permission
        };
        
        next();
    };
};

/**
 * Dynamic Animatronic Access Middleware
 * Checks access based on route parameters
 * @param {string} permission - Required permission
 */
const requireDynamicAnimatronicAccess = (permission = 'view') => {
    return (req, res, next) => {
        const animatronicId = req.params.animatronicId || req.params.id || req.body.animatronicId;
        
        if (!animatronicId) {
            return res.status(400).json({
                success: false,
                error: 'Animatronic ID required',
                code: 'MISSING_ANIMATRONIC_ID'
            });
        }
        
        if (!req.user || !req.jwt) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        if (!hasPermission(req.jwt, animatronicId, permission)) {
            return res.status(403).json({
                success: false,
                error: `Access denied to ${animatronicId} with permission ${permission}`,
                code: 'ANIMATRONIC_ACCESS_DENIED',
                animatronic: animatronicId,
                permission: permission
            });
        }
        
        req.animatronic = {
            id: animatronicId,
            permission: permission
        };
        
        next();
    };
};

/**
 * Admin Only Middleware
 * Requires admin role for access
 */
const requireAdmin = requireRole('admin');

/**
 * Session Integration Middleware
 * Integrates JWT authentication with Express sessions
 */
const integrateWithSession = (req, res, next) => {
    // If JWT authentication is present, sync with session
    if (req.user && req.sessionId) {
        req.session.jwtUser = req.user;
        req.session.jwtSessionId = req.sessionId;
        req.session.jwtAuthenticated = true;
    }
    
    // If session has JWT info but no current JWT, clear session
    if (req.session.jwtAuthenticated && !req.user) {
        delete req.session.jwtUser;
        delete req.session.jwtSessionId;
        req.session.jwtAuthenticated = false;
    }
    
    next();
};

/**
 * Rate Limiting Middleware for Authentication Endpoints
 */
const authRateLimit = require('express-rate-limit')({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true
});

module.exports = {
    authenticateJWT,
    optionalJWT,
    requireRole,
    requirePermission,
    requireAnimatronicAccess,
    requireDynamicAnimatronicAccess,
    requireAdmin,
    integrateWithSession,
    authRateLimit
};
