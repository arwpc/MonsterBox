/**
 * JWT Configuration for MonsterBox Secure Remote Access System
 * 
 * This module provides JWT configuration and utilities for the MonsterBox
 * animatronic control system, supporting secure remote access to:
 * - Orlok (192.168.8.120)
 * - Coffin (192.168.8.140) 
 * - Pumpkinhead (192.168.1.101)
 */

require('dotenv').config();

const jwtConfig = {
    // JWT Signing Configuration
    secret: process.env.JWT_SECRET || 'MonsterBox-JWT-2024-SecureKey-f8e9d7c6b5a4-RemoteAccess-Auth',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'MonsterBox-Refresh-2024-SecureKey-a4b5c6d7e8f9-RemoteAccess-Refresh',
    
    // Token Lifetime Configuration
    expiresIn: process.env.JWT_EXPIRES_IN || '8h', // 8 hours for operational sessions
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', // 7 days for refresh tokens
    
    // Algorithm Configuration (RS256 preferred for production)
    algorithm: 'HS256', // Using HS256 for development, upgrade to RS256 for production
    
    // Token Claims Configuration
    issuer: 'MonsterBox-System',
    audience: 'MonsterBox-Animatronics',
    
    // Animatronic System Configuration
    animatronics: {
        'orlok': {
            id: 'orlok',
            name: 'Orlok',
            host: '192.168.8.120',
            permissions: ['view', 'control', 'configure', 'ssh']
        },
        'coffin': {
            id: 'coffin', 
            name: 'Coffin',
            host: '192.168.8.140',
            permissions: ['view', 'control', 'configure', 'ssh']
        },
        'pumpkinhead': {
            id: 'pumpkinhead',
            name: 'Pumpkinhead', 
            host: '192.168.1.101',
            permissions: ['view', 'control', 'configure', 'ssh']
        }
    },
    
    // Security Configuration
    security: {
        // Rate limiting for authentication endpoints
        rateLimit: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // 5 attempts per window
            skipSuccessfulRequests: true
        },
        
        // IP Whitelisting (empty means all IPs allowed)
        allowedIPs: [],
        
        // Session integration
        sessionIntegration: true,
        
        // Audit logging
        auditLogging: true
    }
};

/**
 * Generate JWT payload for a user with animatronic access
 * @param {Object} user - User object
 * @param {Array} animatronicAccess - Array of animatronic IDs user can access
 * @param {Array} permissions - Array of permissions
 * @returns {Object} JWT payload
 */
function generatePayload(user, animatronicAccess = [], permissions = []) {
    const now = Math.floor(Date.now() / 1000);
    
    return {
        // Standard JWT claims
        iss: jwtConfig.issuer,
        aud: jwtConfig.audience,
        sub: user.id || user.username,
        iat: now,
        exp: now + (8 * 60 * 60), // 8 hours
        
        // MonsterBox specific claims
        user: {
            id: user.id,
            username: user.username,
            role: user.role || 'operator',
            email: user.email
        },
        
        // Animatronic access permissions
        animatronics: animatronicAccess.map(id => ({
            id: id,
            host: jwtConfig.animatronics[id]?.host,
            permissions: permissions
        })),
        
        // Session information
        sessionId: user.sessionId,
        
        // Security metadata
        ipAddress: user.ipAddress,
        userAgent: user.userAgent
    };
}

/**
 * Validate JWT payload structure
 * @param {Object} payload - JWT payload to validate
 * @returns {boolean} True if valid
 */
function validatePayload(payload) {
    // Check required standard claims
    if (!payload.iss || !payload.aud || !payload.sub || !payload.iat || !payload.exp) {
        return false;
    }
    
    // Check MonsterBox specific claims
    if (!payload.user || !payload.user.username || !payload.user.role) {
        return false;
    }
    
    // Check animatronic access structure
    if (payload.animatronics && !Array.isArray(payload.animatronics)) {
        return false;
    }
    
    return true;
}

/**
 * Check if user has permission for specific animatronic and action
 * @param {Object} payload - JWT payload
 * @param {string} animatronicId - Animatronic ID
 * @param {string} permission - Required permission
 * @returns {boolean} True if authorized
 */
function hasPermission(payload, animatronicId, permission) {
    if (!payload.animatronics) {
        return false;
    }
    
    const animatronic = payload.animatronics.find(a => a.id === animatronicId);
    if (!animatronic) {
        return false;
    }
    
    return animatronic.permissions.includes(permission);
}

module.exports = {
    jwtConfig,
    generatePayload,
    validatePayload,
    hasPermission
};
