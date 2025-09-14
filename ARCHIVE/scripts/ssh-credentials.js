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
            },
            'coffinbreaker': {
                userVar: 'COFFIN_SSH_USER',
                passwordVar: 'COFFIN_SSH_PASSWORD'
            },
            'skulltalker': {
                userVar: 'SKULLTALKER_SSH_USER',
                passwordVar: 'SKULLTALKER_SSH_PASSWORD'
            }
        };

        // Legacy fallback credentials
        this.fallbackUser = process.env.RPI_SSH_USER || 'remote';
        this.fallbackPassword = process.env.RPI_SSH_PASSWORD;

        // Cache for character data
        this.characterCache = null;
        this.cacheTimestamp = 0;
        this.cacheTimeout = 30000; // 30 seconds
    }

    /**
     * Load character data from characters.json
     * @returns {Array} Array of character objects
     */
    loadCharacterData() {
        const fs = require('fs');
        const path = require('path');

        // Use cached data if still valid
        const now = Date.now();
        if (this.characterCache && (now - this.cacheTimestamp) < this.cacheTimeout) {
            return this.characterCache;
        }

        try {
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));

            // Cache the data
            this.characterCache = charactersData;
            this.cacheTimestamp = now;

            return charactersData;
        } catch (error) {
            console.error('Error loading characters.json:', error);
            return [];
        }
    }

    /**
     * Get character by name (case-insensitive)
     * @param {string} characterName - Character name
     * @returns {Object|null} Character object or null if not found
     */
    getCharacterByName(characterName) {
        const characters = this.loadCharacterData();
        const normalizedName = characterName.toLowerCase().replace(/\s+/g, '');

        return characters.find(char => {
            const charName = char.char_name.toLowerCase().replace(/\s+/g, '');
            return charName === normalizedName;
        });
    }

    /**
     * Get character by host IP
     * @param {string} host - Host IP address
     * @returns {Object|null} Character object or null if not found
     */
    getCharacterByHost(host) {
        const characters = this.loadCharacterData();

        return characters.find(char => {
            return char.animatronic &&
                   char.animatronic.enabled &&
                   char.animatronic.rpi_config &&
                   char.animatronic.rpi_config.host === host;
        });
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
        // Find character by host IP dynamically
        const character = this.getCharacterByHost(host);

        if (character) {
            const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
            return this.getCredentials(characterKey);
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
        const os = require('os');

        // Detect platform and use appropriate SSH method
        if (os.platform() === 'win32') {
            // Windows: Use PowerShell script for SSH automation
            return this.buildWindowsSSHCommand(animatronicId, host, command, credentials, options);
        } else {
            // Linux/Unix: Use sshpass for SSH automation
            return this.buildLinuxSSHCommand(animatronicId, host, command, credentials, options);
        }
    }

    /**
     * Build SSH command for Windows using key-based authentication
     */
    buildWindowsSSHCommand(animatronicId, host, command, credentials, options = {}) {
        const path = require('path');
        const fs = require('fs');

        // Escape special characters for Windows command line
        const escapedCommand = command.replace(/"/g, '\\"');

        // Use MonsterBox SSH keys (development key for streaming)
        const keyPath = path.join(__dirname, 'ssh-deployment', 'keys', 'monsterbox-dev');

        if (!fs.existsSync(keyPath)) {
            throw new Error(`SSH private key not found: ${keyPath}. Please run SSH key deployment first.`);
        }

        // Build SSH command with key-based authentication for Windows
        const sshOptions = [
            `-i "${keyPath}"`,
            '-o ConnectTimeout=10',
            '-o StrictHostKeyChecking=accept-new',
            '-o PasswordAuthentication=no',
            '-o PubkeyAuthentication=yes',
            '-o BatchMode=yes',
            '-o UserKnownHostsFile=NUL',
            '-o LogLevel=ERROR'
        ].join(' ');

        return `ssh ${sshOptions} ${credentials.user}@${host} "${escapedCommand}"`;
    }

    /**
     * Build SSH command for Linux/Unix with key-based authentication only
     */
    buildLinuxSSHCommand(animatronicId, host, command, credentials, options = {}) {
        const path = require('path');
        const fs = require('fs');

        // Escape special characters for bash
        const escapedCommand = command.replace(/'/g, "'\"'\"'");

        // Use MonsterBox SSH keys (development key for streaming)
        const keyPath = path.join(__dirname, 'ssh-deployment', 'keys', 'monsterbox-dev');

        if (!fs.existsSync(keyPath)) {
            throw new Error(`SSH private key not found: ${keyPath}. Please run SSH key deployment first.`);
        }

        // Build SSH command with key-based authentication only
        const sshOptions = [
            `-i ${keyPath}`,
            '-o ConnectTimeout=10',
            '-o StrictHostKeyChecking=accept-new',
            '-o PasswordAuthentication=no',
            '-o PubkeyAuthentication=yes',
            '-o BatchMode=yes',
            '-o UserKnownHostsFile=/dev/null',
            '-o LogLevel=ERROR'
        ].join(' ');

        return `ssh ${sshOptions} ${credentials.user}@${host} '${escapedCommand}'`;
    }

    /**
     * Build SSH command by host IP address
     * @param {string} host - The host IP address
     * @param {string} command - The command to execute
     * @param {object} options - SSH options
     * @returns {string} Complete SSH command
     */
    buildSSHCommandByHost(host, command, options = {}) {
        // Find character by host IP dynamically
        const character = this.getCharacterByHost(host);

        if (character) {
            const animatronicId = character.char_name.toLowerCase().replace(/\s+/g, '');
            return this.buildSSHCommand(animatronicId, host, command, options);
        }

        // Unknown host, use fallback
        return this.buildSSHCommand('unknown', host, command, options);
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
     * Build SCP command for file transfer
     * @param {string} animatronicId - The animatronic ID
     * @param {string} host - The host IP address
     * @param {string} sourcePath - Source file path (remote)
     * @param {string} destPath - Destination path (local)
     * @param {object} options - SCP options
     * @returns {string} Complete SCP command
     */
    buildSCPCommand(animatronicId, host, sourcePath, destPath, options = {}) {
        const credentials = this.getCredentials(animatronicId);

        // Linux-only system: Use sshpass for SCP automation
        return this.buildLinuxSCPCommand(animatronicId, host, sourcePath, destPath, credentials, options);
    }



    /**
     * Build SCP command for Linux/Unix using sshpass
     */
    buildLinuxSCPCommand(animatronicId, host, sourcePath, destPath, credentials, options = {}) {
        // Escape special characters for bash
        const escapedPassword = credentials.password.replace(/'/g, "'\"'\"'");
        const recursiveFlag = options.recursive ? '-r' : '';

        // Use sshpass for SCP
        const scpCommand = `scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no ${recursiveFlag} ${credentials.user}@${host}:${sourcePath} '${destPath}'`;

        return `sshpass -p '${escapedPassword}' ${scpCommand}`;
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
