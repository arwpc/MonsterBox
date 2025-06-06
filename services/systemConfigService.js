/**
 * MonsterBox System Configuration Service
 * 
 * Manages character-specific system configurations including servo settings,
 * hardware configurations, and RPI-specific settings
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const sshCredentials = require('../scripts/ssh-credentials');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class SystemConfigService {
    constructor() {
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.servosPath = path.join(process.cwd(), 'data', 'servos.json');
    }

    /**
     * Load character configurations
     */
    async loadCharacters() {
        try {
            const data = await fs.readFile(this.charactersPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load characters.json:', error.message);
            return [];
        }
    }

    /**
     * Save character configurations
     */
    async saveCharacters(characters) {
        try {
            await fs.writeFile(this.charactersPath, JSON.stringify(characters, null, 2));
            logger.info('Characters configuration saved successfully');
        } catch (error) {
            logger.error('Failed to save characters configuration:', error);
            throw error;
        }
    }

    /**
     * Load servo configurations
     */
    async loadServos() {
        try {
            const data = await fs.readFile(this.servosPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.warn('Could not load servos.json:', error.message);
            return { servos: [] };
        }
    }

    /**
     * Save servo configurations
     */
    async saveServos(servos) {
        try {
            await fs.writeFile(this.servosPath, JSON.stringify(servos, null, 2));
            logger.info('Servo configurations saved successfully');
        } catch (error) {
            logger.error('Failed to save servo configurations:', error);
            throw error;
        }
    }

    /**
     * Get character-specific servo configurations
     */
    async getCharacterServos(characterId) {
        const characters = await this.loadCharacters();
        const character = characters.find(c => c.id === parseInt(characterId));
        
        if (!character) {
            throw new Error('Character not found');
        }

        // Return servos assigned to this character
        const servos = await this.loadServos();
        const characterServos = servos.servos.filter(servo => 
            servo.characterId === parseInt(characterId)
        );

        return {
            character: character.char_name,
            servos: characterServos,
            availableServos: servos.servos.filter(servo => !servo.characterId)
        };
    }

    /**
     * Add servo configuration to a character
     */
    async addCharacterServo(characterId, servoConfig) {
        const servos = await this.loadServos();
        
        const newServo = {
            ...servoConfig,
            characterId: parseInt(characterId),
            id: Date.now(), // Simple ID generation
            createdAt: new Date().toISOString()
        };

        servos.servos.push(newServo);
        await this.saveServos(servos);

        logger.info(`Added servo configuration for character ${characterId}:`, newServo.name);
        return newServo;
    }

    /**
     * Update servo configuration for a character
     */
    async updateCharacterServo(characterId, servoId, updates) {
        const servos = await this.loadServos();
        const servoIndex = servos.servos.findIndex(s => 
            s.id === parseInt(servoId) && s.characterId === parseInt(characterId)
        );

        if (servoIndex === -1) {
            throw new Error('Servo not found for this character');
        }

        servos.servos[servoIndex] = {
            ...servos.servos[servoIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await this.saveServos(servos);
        logger.info(`Updated servo configuration for character ${characterId}:`, servos.servos[servoIndex].name);
        return servos.servos[servoIndex];
    }

    /**
     * Remove servo configuration from a character
     */
    async removeCharacterServo(characterId, servoId) {
        const servos = await this.loadServos();
        const servoIndex = servos.servos.findIndex(s => 
            s.id === parseInt(servoId) && s.characterId === parseInt(characterId)
        );

        if (servoIndex === -1) {
            throw new Error('Servo not found for this character');
        }

        const removedServo = servos.servos.splice(servoIndex, 1)[0];
        await this.saveServos(servos);

        logger.info(`Removed servo configuration for character ${characterId}:`, removedServo.name);
        return removedServo;
    }

    /**
     * Get character-specific system information from its RPI
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
            platform: 'uname -s',
            arch: 'uname -m',
            hostname: 'hostname',
            uptime: 'uptime -p',
            memory: 'free -h | grep Mem',
            disk: 'df -h / | tail -1',
            temperature: 'vcgencmd measure_temp 2>/dev/null || echo "temp=N/A°C"',
            voltage: 'vcgencmd measure_volts 2>/dev/null || echo "volt=N/A"',
            wifi: 'iwconfig wlan0 2>/dev/null | grep "Signal level" || cat /proc/net/wireless 2>/dev/null | tail -1 || echo "Signal level=N/A"'
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

        // Parse and format the system information
        const formattedInfo = this.formatSystemInfo(systemInfo);

        return {
            character: character.char_name,
            host: rpiConfig.host,
            systemInfo: formattedInfo,
            rawInfo: systemInfo,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format raw system information into readable format
     */
    formatSystemInfo(rawInfo) {
        const formatted = {};

        // Platform and architecture
        formatted.platform = rawInfo.platform || 'Unknown';
        formatted.arch = rawInfo.arch || 'Unknown';
        formatted.hostname = rawInfo.hostname || 'Unknown';

        // Uptime
        formatted.uptime = rawInfo.uptime || 'Unknown';

        // Memory parsing
        if (rawInfo.memory && !rawInfo.memory.startsWith('Error:')) {
            const memMatch = rawInfo.memory.match(/Mem:\s+(\S+)\s+(\S+)\s+(\S+)/);
            if (memMatch) {
                formatted.totalMem = memMatch[1];
                formatted.usedMem = memMatch[2];
                formatted.freeMem = memMatch[3];
            }
        } else {
            formatted.totalMem = 'N/A';
            formatted.usedMem = 'N/A';
            formatted.freeMem = 'N/A';
        }

        // Disk usage parsing
        if (rawInfo.disk && !rawInfo.disk.startsWith('Error:')) {
            const diskMatch = rawInfo.disk.match(/(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/);
            if (diskMatch) {
                formatted.diskTotal = diskMatch[1];
                formatted.diskUsed = diskMatch[2];
                formatted.diskFree = diskMatch[3];
                formatted.diskUsage = diskMatch[4];
            }
        } else {
            formatted.diskTotal = 'N/A';
            formatted.diskUsed = 'N/A';
            formatted.diskFree = 'N/A';
            formatted.diskUsage = 'N/A';
        }

        // Temperature parsing
        if (rawInfo.temperature && !rawInfo.temperature.startsWith('Error:')) {
            if (rawInfo.temperature.includes('temp=N/A°C')) {
                formatted.temperature = 'N/A';
            } else {
                const tempMatch = rawInfo.temperature.match(/temp=(\d+\.\d+)/);
                formatted.temperature = tempMatch ? `${tempMatch[1]}°C` : 'N/A';
            }
        } else {
            formatted.temperature = 'N/A';
        }

        // Voltage parsing
        if (rawInfo.voltage && !rawInfo.voltage.startsWith('Error:')) {
            if (rawInfo.voltage.includes('volt=N/A')) {
                formatted.voltage = 'N/A';
            } else {
                const voltMatch = rawInfo.voltage.match(/volt=(\d+\.\d+)/);
                formatted.voltage = voltMatch ? `${voltMatch[1]}V` : 'N/A';
            }
        } else {
            formatted.voltage = 'N/A';
        }

        // WiFi signal parsing
        if (rawInfo.wifi && !rawInfo.wifi.startsWith('Error:')) {
            if (rawInfo.wifi.includes('Signal level=N/A')) {
                formatted.wifiSignal = 'N/A';
            } else {
                // Try multiple patterns for WiFi signal
                let wifiMatch = rawInfo.wifi.match(/Signal level=(-?\d+)\s*dBm/);
                if (!wifiMatch) {
                    wifiMatch = rawInfo.wifi.match(/Signal level=(-?\d+)/);
                }
                if (!wifiMatch) {
                    // Try parsing from /proc/net/wireless format - look for pattern like "69. -41. -256"
                    wifiMatch = rawInfo.wifi.match(/\s+\d+\.\s+(-?\d+)\./);
                }
                formatted.wifiSignal = wifiMatch ? `${wifiMatch[1]} dBm` : 'N/A';
            }
        } else {
            formatted.wifiSignal = 'N/A';
        }

        return formatted;
    }

    /**
     * Reboot character's RPI system
     */
    async rebootCharacterSystem(characterId) {
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
        
        try {
            const sshCommand = sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, 'sudo reboot');
            await execAsync(sshCommand);
            
            logger.info(`Reboot command sent to ${character.char_name} (${rpiConfig.host})`);
            return {
                success: true,
                message: `Reboot command sent to ${character.char_name}`,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`Failed to reboot ${character.char_name}:`, error.message);
            throw new Error(`Failed to reboot system: ${error.message}`);
        }
    }

    /**
     * Update character's system configuration
     */
    async updateCharacterSystemConfig(characterId, config) {
        const characters = await this.loadCharacters();
        const characterIndex = characters.findIndex(c => c.id === parseInt(characterId));
        
        if (characterIndex === -1) {
            throw new Error('Character not found');
        }

        // Update character's system configuration
        if (!characters[characterIndex].systemConfig) {
            characters[characterIndex].systemConfig = {};
        }

        characters[characterIndex].systemConfig = {
            ...characters[characterIndex].systemConfig,
            ...config,
            updatedAt: new Date().toISOString()
        };

        await this.saveCharacters(characters);
        
        logger.info(`Updated system configuration for character ${characterId}`);
        return characters[characterIndex].systemConfig;
    }
}

module.exports = new SystemConfigService();
