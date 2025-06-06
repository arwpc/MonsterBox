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
const partService = require('./partService');
const execAsync = util.promisify(exec);

class SystemConfigService {
    constructor() {
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.servosPath = path.join(process.cwd(), 'data', 'servos.json');
    }

    /**
     * Get servo configurations (types)
     */
    getServoConfigs() {
        try {
            if (require('fs').existsSync(this.servosPath)) {
                const data = require('fs').readFileSync(this.servosPath, 'utf8');
                return JSON.parse(data).servos;
            }
            return [];
        } catch (error) {
            logger.error('Error reading servo configurations:', error);
            return [];
        }
    }

    /**
     * Load parts data
     */
    async loadParts() {
        try {
            return await partService.getAllParts();
        } catch (error) {
            logger.error('Error loading parts:', error);
            return [];
        }
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

        // Get servo configurations (types) and character-specific servos
        const servoConfigs = this.getServoConfigs();
        const parts = await this.loadParts();
        const characterServos = parts.filter(part =>
            part.type === 'servo' && part.characterId === parseInt(characterId)
        );

        return {
            character: character.char_name,
            servos: characterServos,
            availableServos: servoConfigs
        };
    }

    /**
     * Add servo configuration to a character
     */
    async addCharacterServo(characterId, servoConfig) {
        // Get servo type configuration
        const servoConfigs = this.getServoConfigs();
        const selectedServo = servoConfigs.find(s => s.name === servoConfig.servoType);

        const newServo = {
            name: servoConfig.name,
            type: 'servo',
            characterId: parseInt(characterId),
            pin: parseInt(servoConfig.pin) || 3,
            usePCA9685: servoConfig.usePCA9685 || false,
            channel: parseInt(servoConfig.channel) || null,
            servoType: servoConfig.servoType,
            minPulse: selectedServo ? selectedServo.min_pulse_width_us : 500,
            maxPulse: selectedServo ? selectedServo.max_pulse_width_us : 2500,
            defaultAngle: selectedServo ? selectedServo.default_angle_deg : 90,
            mode: selectedServo ? selectedServo.mode : ['Standard'],
            createdAt: new Date().toISOString()
        };

        const createdPart = await partService.createPart(newServo);
        logger.info(`Added servo configuration for character ${characterId}:`, createdPart.name);
        return createdPart;
    }

    /**
     * Update servo configuration for a character
     */
    async updateCharacterServo(characterId, servoId, updates) {
        const parts = await this.loadParts();
        const servo = parts.find(p =>
            p.id === parseInt(servoId) &&
            p.characterId === parseInt(characterId) &&
            p.type === 'servo'
        );

        if (!servo) {
            throw new Error('Servo not found for this character');
        }

        const updatedServo = {
            ...servo,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        const result = await partService.updatePart(servoId, updatedServo);
        logger.info(`Updated servo configuration for character ${characterId}:`, result.name);
        return result;
    }

    /**
     * Delete servo configuration for a character
     */
    async deleteCharacterServo(characterId, servoId) {
        const parts = await this.loadParts();
        const servo = parts.find(p =>
            p.id === parseInt(servoId) &&
            p.characterId === parseInt(characterId) &&
            p.type === 'servo'
        );

        if (!servo) {
            throw new Error('Servo not found for this character');
        }

        const deleted = await partService.deletePart(servoId);
        if (deleted) {
            logger.info(`Deleted servo configuration for character ${characterId}:`, servo.name);
            return { deleted: true, servo: servo };
        } else {
            throw new Error('Failed to delete servo');
        }
    }

    /**
     * Test servo for a character
     */
    async testCharacterServo(characterId, servoId, angle = 90, duration = 1.0) {
        const parts = await this.loadParts();
        const servo = parts.find(p =>
            p.id === parseInt(servoId) &&
            p.characterId === parseInt(characterId) &&
            p.type === 'servo'
        );

        if (!servo) {
            throw new Error('Servo not found for this character');
        }

        // Use the existing servo test functionality from servoRoutes
        const path = require('path');
        const { spawn } = require('child_process');

        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
        const controlType = servo.usePCA9685 ? 'pca9685' : 'gpio';
        const pinOrChannel = servo.usePCA9685 ? (servo.channel || '0') : (servo.pin || '3');

        const args = [
            'test',
            controlType,
            pinOrChannel,
            String(angle),
            String(duration),
            String(servo.servoType || 'Standard')
        ];

        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Servo test completed for character ${characterId}, servo ${servoId}`);
                    resolve({
                        success: true,
                        output: output.trim(),
                        servo: servo.name,
                        angle: angle,
                        duration: duration
                    });
                } else {
                    logger.error(`Servo test failed for character ${characterId}, servo ${servoId}:`, errorOutput);
                    reject(new Error(`Servo test failed: ${errorOutput || 'Unknown error'}`));
                }
            });

            pythonProcess.on('error', (error) => {
                logger.error(`Failed to start servo test for character ${characterId}, servo ${servoId}:`, error);
                reject(new Error(`Failed to start servo test: ${error.message}`));
            });
        });
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
