/**
 * SSH Routes for MonsterBox Secure Remote Access System
 * 
 * Provides secure SSH command execution endpoints with JWT authentication
 * and role-based access control integration.
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../middleware/auth');
const { requireSSH } = require('../../middleware/rbac');
const {
    requireSSHAccess,
    requireSSHAnimatronicAccess,
    validateSSHCommand,
    sshRateLimit,
    sshAdminRateLimit,
    executeSSHCommand,
    sendSSHResponse,
    getSSHHistory,
    testSSHConnectivity
} = require('../../middleware/sshAuth');

/**
 * POST /ssh/execute/:animatronicId
 * Execute SSH command on specific animatronic
 */
router.post('/execute/:animatronicId',
    authenticateJWT,
    requireSSHAccess,
    sshRateLimit,
    sshAdminRateLimit,
    requireSSHAnimatronicAccess('animatronicId'),
    validateSSHCommand,
    executeSSHCommand,
    sendSSHResponse
);

/**
 * POST /ssh/test/:animatronicId
 * Test SSH connectivity to specific animatronic
 */
router.post('/test/:animatronicId',
    authenticateJWT,
    requireSSHAccess,
    requireSSHAnimatronicAccess('animatronicId'),
    testSSHConnectivity
);

/**
 * GET /ssh/test/:animatronicId
 * Test SSH connectivity to specific animatronic (GET version)
 */
router.get('/test/:animatronicId',
    authenticateJWT,
    requireSSHAccess,
    requireSSHAnimatronicAccess('animatronicId'),
    testSSHConnectivity
);

/**
 * GET /ssh/history
 * Get SSH command history for current user
 */
router.get('/history',
    authenticateJWT,
    requireSSHAccess,
    getSSHHistory
);

/**
 * POST /ssh/batch/:animatronicId
 * Execute multiple SSH commands in sequence
 */
router.post('/batch/:animatronicId',
    authenticateJWT,
    requireSSHAccess,
    sshRateLimit,
    sshAdminRateLimit,
    requireSSHAnimatronicAccess('animatronicId'),
    async (req, res) => {
        try {
            const { commands, timeout = 30, validateCommands = true } = req.body;
            
            if (!Array.isArray(commands) || commands.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Commands array is required',
                    code: 'INVALID_COMMANDS'
                });
            }
            
            if (commands.length > 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum 10 commands allowed in batch',
                    code: 'TOO_MANY_COMMANDS'
                });
            }
            
            const token = req.headers.authorization?.substring(7);
            const animatronicId = req.params.animatronicId;
            const results = [];
            
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                
                if (!command || typeof command !== 'string') {
                    results.push({
                        command: command,
                        success: false,
                        error: 'Invalid command',
                        index: i
                    });
                    continue;
                }
                
                const sshAuthService = require('../../services/auth/sshAuthService');
                const result = await sshAuthService.executeCommand(
                    token,
                    animatronicId,
                    command.trim(),
                    { timeout, validateCommand: validateCommands }
                );
                
                results.push({
                    ...result,
                    index: i
                });
                
                // Stop on first failure if requested
                if (!result.success && req.body.stopOnFailure) {
                    break;
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            const overallSuccess = successCount === commands.length;
            
            res.json({
                success: overallSuccess,
                results,
                summary: {
                    total: commands.length,
                    successful: successCount,
                    failed: commands.length - successCount
                },
                animatronic: animatronicId,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('SSH batch execution error:', error);
            res.status(500).json({
                success: false,
                error: 'Batch SSH execution failed',
                code: 'SSH_BATCH_ERROR'
            });
        }
    }
);

/**
 * GET /ssh/status
 * Get SSH service status and capabilities
 */
router.get('/status',
    authenticateJWT,
    requireSSHAccess,
    async (req, res) => {
        try {
            const rbacService = require('../../services/auth/rbacService');
            const animatronics = await rbacService.getAllAnimatronics();
            
            // Test connectivity to all accessible animatronics
            const connectivityTests = [];
            const userRole = req.user.role;
            
            for (const [id, animatronic] of Object.entries(animatronics)) {
                const hasAccess = await rbacService.hasAnimatronicAccess(userRole, id);
                if (hasAccess) {
                    const sshAuthService = require('../../services/auth/sshAuthService');
                    const testResult = await sshAuthService.testConnectivity(id);
                    connectivityTests.push({
                        animatronic: id,
                        host: animatronic.host,
                        status: animatronic.status,
                        sshConnectivity: testResult.success,
                        duration: testResult.duration,
                        error: testResult.error
                    });
                }
            }
            
            res.json({
                success: true,
                sshService: {
                    status: 'operational',
                    version: '1.0.0',
                    features: {
                        jwtAuthentication: true,
                        rbacIntegration: true,
                        commandValidation: true,
                        auditLogging: true,
                        rateLimiting: true,
                        batchExecution: true
                    }
                },
                user: {
                    username: req.user.username,
                    role: req.user.role,
                    sshPermission: true
                },
                animatronics: connectivityTests,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('SSH status check error:', error);
            res.status(500).json({
                success: false,
                error: 'SSH status check failed',
                code: 'SSH_STATUS_ERROR'
            });
        }
    }
);

/**
 * GET /ssh/commands
 * Get list of allowed SSH commands for current user role
 */
router.get('/commands',
    authenticateJWT,
    requireSSHAccess,
    (req, res) => {
        try {
            const userRole = req.user.role;
            const sshAuthService = require('../../services/auth/sshAuthService');
            
            // Get allowed commands based on role
            let allowedCommands;
            if (userRole === 'admin') {
                allowedCommands = [
                    'Most commands allowed for admin users',
                    'Dangerous commands like rm -rf /, shutdown, reboot are blocked',
                    'Use with caution and follow security best practices'
                ];
            } else {
                allowedCommands = sshAuthService.allowedCommands || [];
            }
            
            res.json({
                success: true,
                userRole,
                allowedCommands,
                commandValidation: userRole !== 'admin',
                securityLevel: userRole === 'admin' ? 'elevated' : 'restricted',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('SSH commands list error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve SSH commands',
                code: 'SSH_COMMANDS_ERROR'
            });
        }
    }
);

/**
 * POST /ssh/validate
 * Validate SSH command without executing it
 */
router.post('/validate',
    authenticateJWT,
    requireSSHAccess,
    (req, res) => {
        try {
            const { command } = req.body;
            
            if (!command || typeof command !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Command is required',
                    code: 'MISSING_COMMAND'
                });
            }
            
            const sshAuthService = require('../../services/auth/sshAuthService');
            const validation = sshAuthService.validateCommand(command, req.user.role);
            
            res.json({
                success: true,
                command,
                validation: {
                    valid: validation.valid,
                    reason: validation.reason || 'Command is valid',
                    userRole: req.user.role
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            console.error('SSH command validation error:', error);
            res.status(500).json({
                success: false,
                error: 'Command validation failed',
                code: 'SSH_VALIDATION_ERROR'
            });
        }
    }
);

module.exports = router;
