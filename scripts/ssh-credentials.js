#!/usr/bin/env node

/**
 * MonsterBox SSH Credentials Manager
 * 
 * Manages individual SSH credentials for each animatronic RPI.
 * Supports per-animatronic credentials with fallback to legacy shared credentials.
 * 
 * Used for:
 * - MCP (Model Context Protocol) log collection and monitoring
 * - Development work using Augment AI assistant in VS Code
 * - NOT for runtime MonsterBox application functionality
 */

// Load environment variables
require('dotenv').config();

class SSHCredentialsManager {
    constructor() {
        // Define animatronic ID to environment variable mapping
        this.credentialMap = {
            'orlok': {
                userVar: 'ORLOK_SSH_USER',
                passwordVar: 'ORLOK_SSH_PASSWORD'
            },
            'pumpkinhead': {
                userVar: 'PUMPKINHEAD_SSH_USER', 
                passwordVar: 'PUMPKINHEAD_SSH_PASSWORD'
            },
            'coffin': {
                userVar: 'COFFIN_SSH_USER',
                passwordVar: 'COFFIN_SSH_PASSWORD'
            }
        };

        // Legacy fallback credentials
        this.fallbackUser = process.env.RPI_SSH_USER || 'remote';
        this.fallbackPassword = process.env.RPI_SSH_PASSWORD;
    }

    /**
     * Get SSH credentials for a specific animatronic
     * @param {string} animatronicId - The animatronic ID (orlok, pumpkinhead, coffin)
     * @returns {object} SSH credentials {user, password}
     */
    getCredentials(animatronicId) {
        const id = animatronicId.toLowerCase();
        const mapping = this.credentialMap[id];

        if (!mapping) {
            // Unknown animatronic, use fallback credentials
            return {
                user: this.fallbackUser,
                password: this.fallbackPassword,
                source: 'fallback'
            };
        }

        // Try to get specific credentials for this animatronic
        const user = process.env[mapping.userVar];
        const password = process.env[mapping.passwordVar];

        if (user && password) {
            return {
                user: user,
                password: password,
                source: 'specific'
            };
        }

        // Fall back to legacy shared credentials
        return {
            user: this.fallbackUser,
            password: this.fallbackPassword,
            source: 'fallback'
        };
    }

    /**
     * Get SSH credentials by host IP address
     * @param {string} host - The host IP address
     * @returns {object} SSH credentials {user, password}
     */
    getCredentialsByHost(host) {
        // Map known hosts to animatronic IDs
        const hostMap = {
            '192.168.8.120': 'orlok',
            '192.168.1.101': 'pumpkinhead',
            '192.168.8.140': 'coffin'
        };

        const animatronicId = hostMap[host];
        if (animatronicId) {
            return this.getCredentials(animatronicId);
        }

        // Unknown host, use fallback credentials
        return {
            user: this.fallbackUser,
            password: this.fallbackPassword,
            source: 'fallback'
        };
    }

    /**
     * Build SSH command for a specific animatronic
     * @param {string} animatronicId - The animatronic ID
     * @param {string} host - The host IP address
     * @param {string} command - The command to execute
     * @param {object} options - SSH options
     * @returns {string} Complete SSH command
     */
    buildSSHCommand(animatronicId, host, command, options = {}) {
        const credentials = this.getCredentials(animatronicId);
        const sshOptions = {
            connectTimeout: options.connectTimeout || 10,
            batchMode: options.batchMode !== false, // Default to true
            ...options
        };

        let sshCmd = 'ssh';
        
        if (sshOptions.connectTimeout) {
            sshCmd += ` -o ConnectTimeout=${sshOptions.connectTimeout}`;
        }
        
        if (sshOptions.batchMode) {
            sshCmd += ' -o BatchMode=yes';
        }

        sshCmd += ` ${credentials.user}@${host} "${command}"`;
        
        return sshCmd;
    }

    /**
     * Build SSH command by host IP address
     * @param {string} host - The host IP address
     * @param {string} command - The command to execute
     * @param {object} options - SSH options
     * @returns {string} Complete SSH command
     */
    buildSSHCommandByHost(host, command, options = {}) {
        const credentials = this.getCredentialsByHost(host);
        const sshOptions = {
            connectTimeout: options.connectTimeout || 10,
            batchMode: options.batchMode !== false,
            ...options
        };

        let sshCmd = 'ssh';
        
        if (sshOptions.connectTimeout) {
            sshCmd += ` -o ConnectTimeout=${sshOptions.connectTimeout}`;
        }
        
        if (sshOptions.batchMode) {
            sshCmd += ' -o BatchMode=yes';
        }

        sshCmd += ` ${credentials.user}@${host} "${command}"`;
        
        return sshCmd;
    }

    /**
     * Get all configured animatronics with their credentials
     * @returns {object} All animatronic credentials
     */
    getAllCredentials() {
        const result = {};
        
        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            result[id] = this.getCredentials(id);
        }

        return result;
    }

    /**
     * Validate that all required credentials are configured
     * @returns {object} Validation result
     */
    validateCredentials() {
        const validation = {
            valid: true,
            missing: [],
            configured: [],
            fallbackAvailable: !!(this.fallbackUser && this.fallbackPassword)
        };

        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            const user = process.env[mapping.userVar];
            const password = process.env[mapping.passwordVar];

            if (user && password) {
                validation.configured.push(id);
            } else {
                validation.missing.push(id);
                if (!validation.fallbackAvailable) {
                    validation.valid = false;
                }
            }
        }

        return validation;
    }

    /**
     * Get setup instructions for missing credentials
     * @returns {string} Setup instructions
     */
    getSetupInstructions() {
        const validation = this.validateCredentials();
        
        if (validation.valid && validation.missing.length === 0) {
            return 'All animatronic SSH credentials are properly configured.';
        }

        let instructions = 'SSH Credentials Setup Instructions:\n\n';
        
        if (validation.missing.length > 0) {
            instructions += 'Missing specific credentials for:\n';
            validation.missing.forEach(id => {
                const mapping = this.credentialMap[id];
                instructions += `  - ${id.toUpperCase()}: Set ${mapping.userVar} and ${mapping.passwordVar} in .env file\n`;
            });
            instructions += '\n';
        }

        if (!validation.fallbackAvailable) {
            instructions += 'Missing fallback credentials:\n';
            instructions += '  - Set RPI_SSH_USER and RPI_SSH_PASSWORD in .env file\n\n';
        }

        instructions += 'Example .env configuration:\n';
        instructions += '# Individual animatronic credentials\n';
        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            instructions += `${mapping.userVar}="remote"\n`;
            instructions += `${mapping.passwordVar}="your_password_here"\n`;
        }
        instructions += '\n# Fallback credentials\n';
        instructions += 'RPI_SSH_USER="remote"\n';
        instructions += 'RPI_SSH_PASSWORD="your_password_here"\n';

        return instructions;
    }
}

// Export singleton instance
const sshCredentials = new SSHCredentialsManager();

module.exports = sshCredentials;
