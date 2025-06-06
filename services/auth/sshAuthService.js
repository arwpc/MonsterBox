/**
 * SSH Authentication Service for MonsterBox Secure Remote Access System
 * 
 * Integrates JWT authentication with existing SSH infrastructure to provide
 * secure remote command execution across animatronic systems.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const sshCredentials = require('../../scripts/ssh-credentials');
const rbacService = require('./rbacService');
const authService = require('./authService');

const execAsync = promisify(exec);

class SSHAuthService {
    constructor() {
        this.commandHistory = [];
        this.maxHistorySize = 1000;
        this.allowedCommands = [
            // System monitoring
            'uptime', 'free', 'df', 'ps', 'top', 'htop', 'iostat', 'vmstat',
            // Network diagnostics
            'ping', 'netstat', 'ss', 'ip', 'ifconfig',
            // File operations (restricted)
            'ls', 'cat', 'head', 'tail', 'find', 'grep',
            // MonsterBox specific
            'systemctl status monsterbox', 'journalctl -u monsterbox',
            // Hardware diagnostics
            'gpio', 'i2cdetect', 'lsusb', 'lscpu', 'lsblk',
            // Log collection
            'tail -f /var/log/monsterbox.log', 'cat /var/log/syslog'
        ];
    }
    
    /**
     * Execute SSH command with JWT authentication
     * @param {string} token - JWT access token
     * @param {string} animatronicId - Target animatronic ID
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Object} Execution result
     */
    async executeCommand(token, animatronicId, command, options = {}) {
        try {
            // Verify JWT token
            const tokenVerification = await authService.verifyAccessToken(token);
            if (!tokenVerification.success) {
                return {
                    success: false,
                    error: 'Invalid or expired token',
                    code: 'AUTH_FAILED'
                };
            }
            
            const user = tokenVerification.payload.user;
            const userRole = user.role;
            
            // Check SSH permission
            const hasSSHPermission = await rbacService.hasPermission(userRole, 'ssh');
            if (!hasSSHPermission) {
                await this.logSSHEvent('SSH_PERMISSION_DENIED', {
                    userId: user.id,
                    username: user.username,
                    animatronicId,
                    command,
                    reason: 'No SSH permission'
                });
                
                return {
                    success: false,
                    error: 'SSH access denied',
                    code: 'SSH_PERMISSION_DENIED'
                };
            }
            
            // Check animatronic access
            const hasAnimatronicAccess = await rbacService.hasAnimatronicAccess(userRole, animatronicId);
            if (!hasAnimatronicAccess) {
                await this.logSSHEvent('SSH_ANIMATRONIC_ACCESS_DENIED', {
                    userId: user.id,
                    username: user.username,
                    animatronicId,
                    command,
                    reason: 'No animatronic access'
                });
                
                return {
                    success: false,
                    error: `Access denied to ${animatronicId}`,
                    code: 'ANIMATRONIC_ACCESS_DENIED'
                };
            }
            
            // Validate command if security mode is enabled
            if (options.validateCommand !== false) {
                const commandValidation = this.validateCommand(command, userRole);
                if (!commandValidation.valid) {
                    await this.logSSHEvent('SSH_COMMAND_BLOCKED', {
                        userId: user.id,
                        username: user.username,
                        animatronicId,
                        command,
                        reason: commandValidation.reason
                    });
                    
                    return {
                        success: false,
                        error: commandValidation.reason,
                        code: 'COMMAND_BLOCKED'
                    };
                }
            }
            
            // Get animatronic information
            const animatronic = await rbacService.getAnimatronic(animatronicId);
            if (!animatronic) {
                return {
                    success: false,
                    error: 'Animatronic not found',
                    code: 'ANIMATRONIC_NOT_FOUND'
                };
            }
            
            // Execute SSH command
            const executionResult = await this.executeSSHCommand(
                animatronic.host,
                animatronicId,
                command,
                options
            );
            
            // Log successful execution
            await this.logSSHEvent('SSH_COMMAND_EXECUTED', {
                userId: user.id,
                username: user.username,
                animatronicId,
                host: animatronic.host,
                command,
                exitCode: executionResult.exitCode,
                duration: executionResult.duration
            });
            
            // Add to command history
            this.addToHistory({
                timestamp: new Date().toISOString(),
                userId: user.id,
                username: user.username,
                animatronicId,
                host: animatronic.host,
                command,
                exitCode: executionResult.exitCode,
                success: executionResult.success
            });
            
            return executionResult;
        } catch (error) {
            console.error('SSH command execution error:', error);
            return {
                success: false,
                error: 'SSH execution failed',
                code: 'SSH_EXECUTION_ERROR',
                details: error.message
            };
        }
    }
    
    /**
     * Execute SSH command on target host
     * @param {string} host - Target host IP
     * @param {string} animatronicId - Animatronic ID for credential lookup
     * @param {string} command - Command to execute
     * @param {Object} options - Execution options
     * @returns {Object} Execution result
     */
    async executeSSHCommand(host, animatronicId, command, options = {}) {
        const startTime = Date.now();
        
        try {
            // Get SSH credentials
            const credentials = sshCredentials.getCredentials(animatronicId);
            
            if (!credentials.user || !credentials.password) {
                return {
                    success: false,
                    error: 'SSH credentials not available',
                    code: 'CREDENTIALS_MISSING'
                };
            }
            
            // Build SSH command with timeout and security options
            const timeout = options.timeout || 30; // 30 seconds default
            const sshOptions = [
                '-o ConnectTimeout=10',
                '-o StrictHostKeyChecking=no',
                '-o PasswordAuthentication=yes',
                '-o PubkeyAuthentication=no',
                '-o UserKnownHostsFile=/dev/null',
                '-o LogLevel=ERROR'
            ].join(' ');
            
            // Escape command for SSH execution
            const escapedCommand = command.replace(/'/g, "'\"'\"'");
            
            // Use sshpass for password authentication (if available)
            let sshCommand;
            try {
                // Check if sshpass is available
                await execAsync('which sshpass');
                sshCommand = `sshpass -p '${credentials.password}' ssh ${sshOptions} ${credentials.user}@${host} '${escapedCommand}'`;
            } catch {
                // Fallback to expect script or manual password entry
                sshCommand = `ssh ${sshOptions} ${credentials.user}@${host} '${escapedCommand}'`;
            }
            
            // Execute command with timeout
            const { stdout, stderr } = await execAsync(sshCommand, {
                timeout: timeout * 1000,
                maxBuffer: 1024 * 1024 // 1MB buffer
            });
            
            const duration = Date.now() - startTime;
            
            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
                duration,
                host,
                command
            };
        } catch (error) {
            const duration = Date.now() - startTime;
            
            return {
                success: false,
                error: error.message,
                stderr: error.stderr || '',
                stdout: error.stdout || '',
                exitCode: error.code || 1,
                duration,
                host,
                command
            };
        }
    }
    
    /**
     * Validate command for security
     * @param {string} command - Command to validate
     * @param {string} userRole - User role
     * @returns {Object} Validation result
     */
    validateCommand(command, userRole) {
        // Admin users have fewer restrictions
        if (userRole === 'admin') {
            // Still block obviously dangerous commands
            const dangerousPatterns = [
                /rm\s+-rf\s+\//, // rm -rf /
                /dd\s+if=.*of=\/dev/, // dd to device
                /mkfs/, // format filesystem
                /fdisk/, // disk partitioning
                /shutdown/, // system shutdown
                /reboot/, // system reboot
                /halt/, // system halt
                /init\s+0/, // init 0
                /init\s+6/ // init 6
            ];
            
            for (const pattern of dangerousPatterns) {
                if (pattern.test(command)) {
                    return {
                        valid: false,
                        reason: 'Command blocked for security reasons'
                    };
                }
            }
            
            return { valid: true };
        }
        
        // For non-admin users, check against allowed commands
        const commandBase = command.split(' ')[0];
        const isAllowed = this.allowedCommands.some(allowedCmd => {
            if (allowedCmd.includes(' ')) {
                return command.startsWith(allowedCmd);
            }
            return commandBase === allowedCmd;
        });
        
        if (!isAllowed) {
            return {
                valid: false,
                reason: `Command '${commandBase}' is not in the allowed list`
            };
        }
        
        // Additional security checks
        if (command.includes('sudo') && userRole !== 'admin') {
            return {
                valid: false,
                reason: 'sudo commands require admin privileges'
            };
        }
        
        if (command.includes('..') || command.includes('/etc/passwd') || command.includes('/etc/shadow')) {
            return {
                valid: false,
                reason: 'Command contains potentially dangerous path traversal'
            };
        }
        
        return { valid: true };
    }
    
    /**
     * Get command history for user
     * @param {string} userId - User ID
     * @param {number} limit - Number of commands to return
     * @returns {Array} Command history
     */
    getCommandHistory(userId, limit = 50) {
        return this.commandHistory
            .filter(entry => entry.userId === userId)
            .slice(-limit)
            .reverse();
    }
    
    /**
     * Get system command history (admin only)
     * @param {number} limit - Number of commands to return
     * @returns {Array} Command history
     */
    getSystemCommandHistory(limit = 100) {
        return this.commandHistory
            .slice(-limit)
            .reverse();
    }
    
    /**
     * Add command to history
     * @param {Object} entry - History entry
     */
    addToHistory(entry) {
        this.commandHistory.push(entry);
        
        // Maintain history size limit
        if (this.commandHistory.length > this.maxHistorySize) {
            this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
        }
    }
    
    /**
     * Log SSH event for audit purposes
     * @param {string} event - Event type
     * @param {Object} data - Event data
     */
    async logSSHEvent(event, data) {
        try {
            await authService.logAuditEvent(`SSH_${event}`, {
                ...data,
                timestamp: new Date().toISOString(),
                source: 'ssh-auth-service'
            });
        } catch (error) {
            console.error('Error logging SSH event:', error);
        }
    }
    
    /**
     * Test SSH connectivity to animatronic
     * @param {string} animatronicId - Animatronic ID
     * @returns {Object} Connectivity test result
     */
    async testConnectivity(animatronicId) {
        try {
            const animatronic = await rbacService.getAnimatronic(animatronicId);
            if (!animatronic) {
                return {
                    success: false,
                    error: 'Animatronic not found'
                };
            }
            
            const result = await this.executeSSHCommand(
                animatronic.host,
                animatronicId,
                'echo "SSH_TEST_SUCCESS"',
                { timeout: 10 }
            );
            
            if (result.success && result.stdout.includes('SSH_TEST_SUCCESS')) {
                return {
                    success: true,
                    message: 'SSH connectivity confirmed',
                    host: animatronic.host,
                    duration: result.duration
                };
            } else {
                return {
                    success: false,
                    error: 'SSH test command failed',
                    details: result.error || result.stderr
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'SSH connectivity test failed',
                details: error.message
            };
        }
    }
}

module.exports = new SSHAuthService();
