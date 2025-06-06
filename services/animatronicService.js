/**
 * MonsterBox Animatronic Service
 * 
 * Provides core animatronic management functionality for the web interface
 * Extracted from the standalone animatronic-manager.js CLI tool
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const sshCredentials = require('../scripts/ssh-credentials');

class AnimatronicService {
    constructor() {
        this.configPath = path.join(process.cwd(), 'data', 'animatronics.json');
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
    }

    /**
     * Load animatronic configurations from data/animatronics.json
     */
    async loadAnimatronics() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load animatronics.json, returning empty config:', error.message);
            return { animatronics: {}, settings: {} };
        }
    }

    /**
     * Load character configurations from data/characters.json
     */
    async loadCharacters() {
        try {
            const data = await fs.readFile(this.charactersPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load characters.json, returning empty array:', error.message);
            return [];
        }
    }

    /**
     * Get all animatronic-enabled characters with their configurations
     */
    async getAnimatronicCharacters() {
        const characters = await this.loadCharacters();
        return characters.filter(char => 
            char.animatronic && 
            char.animatronic.enabled && 
            char.animatronic.rpi_config &&
            char.animatronic.rpi_config.host
        );
    }

    /**
     * Test connection to a specific animatronic character
     */
    async testCharacterConnection(characterId) {
        const characters = await this.loadCharacters();
        const character = characters.find(c => c.id === parseInt(characterId));
        
        if (!character || !character.animatronic || !character.animatronic.enabled) {
            throw new Error('Character not found or animatronic not enabled');
        }

        const rpiConfig = character.animatronic.rpi_config;
        if (!rpiConfig || !rpiConfig.host) {
            throw new Error('RPI configuration not found for character');
        }

        const result = {
            character: character.char_name,
            host: rpiConfig.host,
            user: rpiConfig.user,
            timestamp: new Date().toISOString(),
            tests: {
                ping: { passed: false, message: '', duration: 0 },
                ssh: { passed: false, message: '', duration: 0 },
                logs: { passed: false, message: '', duration: 0, sampleLogs: '' }
            }
        };

        // Test 1: Ping connectivity
        logger.info(`Testing ping connectivity to ${character.char_name} (${rpiConfig.host})`);
        const pingStart = Date.now();
        
        try {
            await execAsync(`ping -n 1 -w 5000 ${rpiConfig.host}`);
            result.tests.ping.passed = true;
            result.tests.ping.message = 'Host is reachable';
            result.tests.ping.duration = Date.now() - pingStart;
            logger.info(`Ping test successful for ${character.char_name}`);
        } catch (error) {
            result.tests.ping.message = 'Host is not reachable';
            result.tests.ping.duration = Date.now() - pingStart;
            logger.error(`Ping test failed for ${character.char_name}:`, error.message);
            return result; // Skip further tests if ping fails
        }

        // Test 2: SSH connection
        logger.info(`Testing SSH connection to ${character.char_name}`);
        const sshStart = Date.now();

        try {
            const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
            const sshCommand = sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, "echo 'SSH test successful'");
            const { stdout } = await execAsync(sshCommand);
            
            if (stdout.includes('SSH test successful')) {
                result.tests.ssh.passed = true;
                result.tests.ssh.message = 'SSH connection successful';
                result.tests.ssh.duration = Date.now() - sshStart;
                logger.info(`SSH test successful for ${character.char_name}`);
            } else {
                result.tests.ssh.message = 'SSH test command failed';
                result.tests.ssh.duration = Date.now() - sshStart;
                logger.error(`SSH test command failed for ${character.char_name}`);
            }
        } catch (error) {
            result.tests.ssh.message = `SSH connection failed: ${error.message}`;
            result.tests.ssh.duration = Date.now() - sshStart;
            logger.error(`SSH connection failed for ${character.char_name}:`, error.message);
            return result; // Skip log test if SSH fails
        }

        // Test 3: Log collection
        if (result.tests.ssh.passed) {
            logger.info(`Testing log collection for ${character.char_name}`);
            const logStart = Date.now();

            try {
                const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
                const logCommand = sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, "sudo journalctl -n 5 --no-pager");
                const { stdout } = await execAsync(logCommand);
                
                if (stdout && stdout.trim().length > 0) {
                    result.tests.logs.passed = true;
                    result.tests.logs.message = 'Log collection successful';
                    result.tests.logs.sampleLogs = stdout.trim();
                    result.tests.logs.duration = Date.now() - logStart;
                    logger.info(`Log collection successful for ${character.char_name}`);
                } else {
                    result.tests.logs.message = 'No logs returned';
                    result.tests.logs.duration = Date.now() - logStart;
                    logger.warn(`No logs returned for ${character.char_name}`);
                }
            } catch (error) {
                result.tests.logs.message = `Log collection failed: ${error.message}`;
                result.tests.logs.duration = Date.now() - logStart;
                logger.error(`Log collection failed for ${character.char_name}:`, error.message);
            }
        }

        return result;
    }

    /**
     * Collect logs from a specific animatronic character
     */
    async collectCharacterLogs(characterId, options = {}) {
        const { lines = 100, since = null, logTypes = ['system', 'auth', 'kernel'] } = options;
        
        const characters = await this.loadCharacters();
        const character = characters.find(c => c.id === parseInt(characterId));
        
        if (!character || !character.animatronic || !character.animatronic.enabled) {
            throw new Error('Character not found or animatronic not enabled');
        }

        const rpiConfig = character.animatronic.rpi_config;
        if (!rpiConfig || !rpiConfig.host) {
            throw new Error('RPI configuration not found for character');
        }

        const logs = {};
        const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');

        for (const logType of logTypes) {
            try {
                let command;
                switch (logType) {
                    case 'system':
                        command = `sudo journalctl -u systemd -n ${lines} --no-pager`;
                        break;
                    case 'auth':
                        command = `sudo journalctl -u ssh -n ${lines} --no-pager`;
                        break;
                    case 'kernel':
                        command = `sudo journalctl -k -n ${lines} --no-pager`;
                        break;
                    case 'daemon':
                        command = `sudo journalctl --system -n ${lines} --no-pager`;
                        break;
                    default:
                        command = `sudo journalctl -n ${lines} --no-pager`;
                }

                if (since) {
                    command += ` --since="${since}"`;
                }

                const sshCommand = sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, command);
                const { stdout } = await execAsync(sshCommand);
                
                logs[logType] = {
                    success: true,
                    data: stdout.trim(),
                    timestamp: new Date().toISOString()
                };
                
                logger.info(`Collected ${logType} logs for ${character.char_name}`);
            } catch (error) {
                logs[logType] = {
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                
                logger.error(`Failed to collect ${logType} logs for ${character.char_name}:`, error.message);
            }
        }

        return {
            character: character.char_name,
            host: rpiConfig.host,
            logs: logs,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Setup SSH keys for a specific animatronic character
     */
    async setupCharacterSSH(characterId) {
        const characters = await this.loadCharacters();
        const character = characters.find(c => c.id === parseInt(characterId));
        
        if (!character || !character.animatronic || !character.animatronic.enabled) {
            throw new Error('Character not found or animatronic not enabled');
        }

        const rpiConfig = character.animatronic.rpi_config;
        if (!rpiConfig || !rpiConfig.host) {
            throw new Error('RPI configuration not found for character');
        }

        return {
            character: character.char_name,
            host: rpiConfig.host,
            user: rpiConfig.user,
            instructions: [
                `ssh-copy-id ${rpiConfig.user}@${rpiConfig.host}`,
                `ssh ${rpiConfig.user}@${rpiConfig.host} "echo 'SSH setup successful'"`
            ],
            message: `SSH key setup instructions for ${character.char_name}. Run these commands in your terminal.`
        };
    }

    /**
     * Get system information for a specific animatronic character
     */
    async getCharacterSystemInfo(characterId) {
        const characters = await this.loadCharacters();
        const character = characters.find(c => c.id === parseInt(characterId));
        
        if (!character || !character.animatronic || !character.animatronic.enabled) {
            throw new Error('Character not found or animatronic not enabled');
        }

        const rpiConfig = character.animatronic.rpi_config;
        if (!rpiConfig || !rpiConfig.host) {
            throw new Error('RPI configuration not found for character');
        }

        const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
        const commands = {
            uptime: 'uptime',
            memory: 'free -h',
            disk: 'df -h',
            temperature: 'vcgencmd measure_temp',
            voltage: 'vcgencmd measure_volts'
        };

        const systemInfo = {};

        for (const [key, command] of Object.entries(commands)) {
            try {
                const sshCommand = sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, command);
                const { stdout } = await execAsync(sshCommand);
                systemInfo[key] = stdout.trim();
            } catch (error) {
                systemInfo[key] = `Error: ${error.message}`;
                logger.error(`Failed to get ${key} for ${character.char_name}:`, error.message);
            }
        }

        return {
            character: character.char_name,
            host: rpiConfig.host,
            systemInfo: systemInfo,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new AnimatronicService();
