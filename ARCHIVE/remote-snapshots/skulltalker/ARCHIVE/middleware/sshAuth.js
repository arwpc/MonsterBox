/**
 * SSH Authentication Middleware for MonsterBox Secure Remote Access System
 * 
 * Provides middleware functions for SSH command execution with JWT authentication
 * and role-based access control integration.
 */

const sshAuthService = require('../services/auth/sshAuthService');
const rbacService = require('../services/auth/rbacService');

/**
 * SSH Access Middleware
 * Validates JWT token and SSH permissions before allowing SSH operations
 */
const requireSSHAccess = async (req, res, next) => {
    try {
        if (!req.user || !req.jwt) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required for SSH access',
                code: 'AUTH_REQUIRED'
            });
        }
        
        // Check SSH permission
        const hasSSHPermission = await rbacService.hasPermission(req.user.role, 'ssh');
        if (!hasSSHPermission) {
            return res.status(403).json({
                success: false,
                error: 'SSH access denied - insufficient permissions',
                code: 'SSH_PERMISSION_DENIED',
                userRole: req.user.role
            });
        }
        
        next();
    } catch (error) {
        console.error('SSH access check error:', error);
        return res.status(500).json({
            success: false,
            error: 'SSH access validation failed',
            code: 'SSH_ACCESS_ERROR'
        });
    }
};

/**
 * SSH Animatronic Access Middleware
 * Validates access to specific animatronic for SSH operations
 * @param {string} paramName - Parameter name containing animatronic ID
 */
const requireSSHAnimatronicAccess = (paramName = 'animatronicId') => {
    return async (req, res, next) => {
        try {
            const animatronicId = req.params[paramName] || req.body[paramName];
            
            if (!animatronicId) {
                return res.status(400).json({
                    success: false,
                    error: `${paramName} is required for SSH operations`,
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
            
            // Check SSH permission and animatronic access
            const canPerformSSH = await rbacService.canPerformAction(req.user.role, animatronicId, 'ssh');
            if (!canPerformSSH) {
                return res.status(403).json({
                    success: false,
                    error: `SSH access denied to ${animatronicId}`,
                    code: 'SSH_ANIMATRONIC_ACCESS_DENIED',
                    animatronic: animatronicId,
                    userRole: req.user.role
                });
            }
            
            // Check if animatronic is operational
            const isOperational = await rbacService.isAnimatronicOperational(animatronicId);
            if (!isOperational) {
                return res.status(503).json({
                    success: false,
                    error: `${animatronicId} is not operational for SSH access`,
                    code: 'ANIMATRONIC_NOT_OPERATIONAL',
                    animatronic: animatronicId
                });
            }
            
            // Attach animatronic info to request
            req.sshTarget = {
                animatronicId,
                verified: true
            };
            
            next();
        } catch (error) {
            console.error('SSH animatronic access check error:', error);
            return res.status(500).json({
                success: false,
                error: 'SSH animatronic access validation failed',
                code: 'SSH_ANIMATRONIC_ACCESS_ERROR'
            });
        }
    };
};

/**
 * SSH Command Validation Middleware
 * Validates SSH commands before execution
 */
const validateSSHCommand = (req, res, next) => {
    try {
        const { command } = req.body;
        
        if (!command || typeof command !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Valid command is required',
                code: 'INVALID_COMMAND'
            });
        }
        
        // Basic command sanitization
        const sanitizedCommand = command.trim();
        if (!sanitizedCommand) {
            return res.status(400).json({
                success: false,
                error: 'Command cannot be empty',
                code: 'EMPTY_COMMAND'
            });
        }
        
        // Check command length
        if (sanitizedCommand.length > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Command too long (max 1000 characters)',
                code: 'COMMAND_TOO_LONG'
            });
        }
        
        // Attach sanitized command to request
        req.sshCommand = sanitizedCommand;
        
        next();
    } catch (error) {
        console.error('SSH command validation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Command validation failed',
            code: 'COMMAND_VALIDATION_ERROR'
        });
    }
};

/**
 * SSH Rate Limiting Middleware
 * Limits SSH command execution rate per user
 */
const sshRateLimit = require('express-rate-limit')({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 commands per minute per user
    message: {
        success: false,
        error: 'Too many SSH commands, please slow down',
        code: 'SSH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit per user
        return req.user ? req.user.id : req.ip;
    },
    skip: (req) => {
        // Skip rate limiting for admin users (but still log)
        return req.user && req.user.role === 'admin';
    }
});

/**
 * SSH Admin Rate Limiting Middleware
 * Separate, more lenient rate limiting for admin users
 */
const sshAdminRateLimit = require('express-rate-limit')({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 commands per minute for admin
    message: {
        success: false,
        error: 'Admin SSH rate limit exceeded',
        code: 'SSH_ADMIN_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user ? `admin_${req.user.id}` : req.ip;
    },
    skip: (req) => {
        // Only apply to admin users
        return !req.user || req.user.role !== 'admin';
    }
});

/**
 * SSH Execution Middleware
 * Executes SSH commands using the SSH authentication service
 */
const executeSSHCommand = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.substring(7); // Remove 'Bearer '
        const animatronicId = req.sshTarget.animatronicId;
        const command = req.sshCommand;
        const options = {
            timeout: req.body.timeout || 30,
            validateCommand: req.body.validateCommand !== false
        };
        
        const result = await sshAuthService.executeCommand(token, animatronicId, command, options);
        
        // Attach result to request for further processing
        req.sshResult = result;
        
        next();
    } catch (error) {
        console.error('SSH command execution error:', error);
        return res.status(500).json({
            success: false,
            error: 'SSH command execution failed',
            code: 'SSH_EXECUTION_ERROR',
            details: error.message
        });
    }
};

/**
 * SSH Response Middleware
 * Formats and sends SSH execution results
 */
const sendSSHResponse = (req, res) => {
    try {
        const result = req.sshResult;
        
        if (!result) {
            return res.status(500).json({
                success: false,
                error: 'No SSH result available',
                code: 'NO_SSH_RESULT'
            });
        }
        
        // Set appropriate status code
        const statusCode = result.success ? 200 : 400;
        
        res.status(statusCode).json({
            success: result.success,
            command: result.command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: result.duration,
            host: result.host,
            timestamp: new Date().toISOString(),
            ...(result.error && { error: result.error }),
            ...(result.code && { code: result.code })
        });
    } catch (error) {
        console.error('SSH response formatting error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to format SSH response',
            code: 'SSH_RESPONSE_ERROR'
        });
    }
};

/**
 * SSH History Middleware
 * Retrieves SSH command history for the user
 */
const getSSHHistory = (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const isAdmin = req.user.role === 'admin';
        const includeSystem = req.query.system === 'true' && isAdmin;
        
        let history;
        if (includeSystem) {
            history = sshAuthService.getSystemCommandHistory(limit);
        } else {
            history = sshAuthService.getCommandHistory(req.user.id, limit);
        }
        
        res.json({
            success: true,
            history,
            count: history.length,
            user: req.user.username,
            includeSystem
        });
    } catch (error) {
        console.error('SSH history retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve SSH history',
            code: 'SSH_HISTORY_ERROR'
        });
    }
};

/**
 * SSH Connectivity Test Middleware
 * Tests SSH connectivity to animatronic systems
 */
const testSSHConnectivity = async (req, res) => {
    try {
        const animatronicId = req.params.animatronicId || req.body.animatronicId;
        
        if (!animatronicId) {
            return res.status(400).json({
                success: false,
                error: 'Animatronic ID is required',
                code: 'MISSING_ANIMATRONIC_ID'
            });
        }
        
        const result = await sshAuthService.testConnectivity(animatronicId);
        
        const statusCode = result.success ? 200 : 400;
        res.status(statusCode).json({
            ...result,
            animatronic: animatronicId,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('SSH connectivity test error:', error);
        res.status(500).json({
            success: false,
            error: 'SSH connectivity test failed',
            code: 'SSH_CONNECTIVITY_TEST_ERROR'
        });
    }
};

module.exports = {
    requireSSHAccess,
    requireSSHAnimatronicAccess,
    validateSSHCommand,
    sshRateLimit,
    sshAdminRateLimit,
    executeSSHCommand,
    sendSSHResponse,
    getSSHHistory,
    testSSHConnectivity
};
