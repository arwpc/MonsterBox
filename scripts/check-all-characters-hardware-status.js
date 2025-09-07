#!/usr/bin/env node

/**
 * Check All Characters Hardware Status
 * Shows which characters have which hardware parts and WebSocket service status
 */

const WebSocket = require('ws');
const fs = require('fs');

class AllCharactersHardwareStatusChecker {
    constructor() {
        this.characters = [];
        this.parts = [];
        this.services = [
            { name: 'Servo Service', port: 8404 },
            { name: 'Microphone Service', port: 8776 },
            { name: 'Webcam Service', port: 8410 }
        ];
        this.serviceStatus = {};
    }

    async loadData() {
        try {
            // Load characters
            const charactersData = JSON.parse(fs.readFileSync('data/characters.json', 'utf8'));
            this.characters = charactersData.map(char => ({
                id: char.id,
                name: char.char_name,
                enabled: char.animatronic && char.animatronic.enabled,
                host: char.animatronic && char.animatronic.rpi_config ? char.animatronic.rpi_config.host : null
            }));

            // Load parts
            this.parts = JSON.parse(fs.readFileSync('data/parts.json', 'utf8'));
            
            console.log('📋 Data loaded successfully\n');
        } catch (error) {
            console.error('❌ Failed to load data:', error.message);
            process.exit(1);
        }
    }

    async checkServiceStatus(service) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${service.port}`);
            
            const result = {
                name: service.name,
                port: service.port,
                status: 'offline',
                capabilities: 0
            };

            ws.on('open', () => {
                result.status = 'online';
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'welcome' && message.capabilities) {
                        result.capabilities = Object.keys(message.capabilities).length;
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', () => {
                result.status = 'offline';
            });

            ws.on('close', () => {
                resolve(result);
            });

            // Timeout after 2 seconds
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                } else {
                    resolve(result);
                }
            }, 2000);
        });
    }

    async checkAllServices() {
        console.log('🔍 Checking WebSocket Services Status...');
        
        for (const service of this.services) {
            this.serviceStatus[service.name] = await this.checkServiceStatus(service);
        }
        
        console.log('✅ Service status check complete\n');
    }

    analyzeCharacterHardware() {
        const characterHardware = {};
        
        // Initialize character hardware tracking
        this.characters.forEach(char => {
            characterHardware[char.id] = {
                name: char.name,
                enabled: char.enabled,
                host: char.host,
                parts: {
                    servo: [],
                    microphone: [],
                    webcam: [],
                    motor: [],
                    light: [],
                    led: [],
                    sensor: [],
                    'linear-actuator': [],
                    speaker: []
                }
            };
        });

        // Group parts by character
        this.parts.forEach(part => {
            const charId = part.characterId;
            if (characterHardware[charId] && characterHardware[charId].parts[part.type]) {
                characterHardware[charId].parts[part.type].push({
                    id: part.id,
                    name: part.name,
                    details: this.getPartDetails(part)
                });
            }
        });

        return characterHardware;
    }

    getPartDetails(part) {
        switch (part.type) {
            case 'servo':
                return `${part.servoType || 'Standard'} - ${part.usePCA9685 ? 'PCA9685' : 'GPIO'} Pin ${part.pin}`;
            case 'microphone':
                return `Device: ${part.deviceId || 'default'}`;
            case 'webcam':
                return `${part.resolution || '1280x720'} @ ${part.fps || 30}fps`;
            case 'motor':
                return `Dir: ${part.directionPin}, PWM: ${part.pwmPin}`;
            case 'light':
            case 'led':
                return `GPIO Pin ${part.gpioPin}`;
            case 'sensor':
                return `${part.sensorType || 'unknown'} - GPIO Pin ${part.gpioPin}`;
            case 'linear-actuator':
                return `Dir: ${part.directionPin}, PWM: ${part.pwmPin}`;
            case 'speaker':
                return `Output: ${part.outputDevice || 'default'}`;
            default:
                return 'Standard configuration';
        }
    }

    printReport() {
        console.log('🎭 ALL CHARACTERS HARDWARE STATUS REPORT');
        console.log('========================================\n');

        // Print service status
        console.log('📡 WebSocket Services Status:');
        Object.values(this.serviceStatus).forEach(service => {
            const status = service.status === 'online' ? '✅ ONLINE' : '❌ OFFLINE';
            console.log(`   ${status} ${service.name} (port ${service.port}) - ${service.capabilities} capabilities`);
        });
        console.log('');

        // Print character hardware
        const characterHardware = this.analyzeCharacterHardware();
        
        Object.values(characterHardware).forEach(char => {
            const enabledStatus = char.enabled ? '✅ ENABLED' : '⚠️ DISABLED';
            const hostInfo = char.host ? ` @ ${char.host}` : '';
            
            console.log(`🎭 ${char.name} (ID: ${Object.keys(characterHardware).find(id => characterHardware[id] === char)}) ${enabledStatus}${hostInfo}`);
            
            let hasHardware = false;
            Object.entries(char.parts).forEach(([partType, parts]) => {
                if (parts.length > 0) {
                    hasHardware = true;
                    console.log(`   📍 ${partType.toUpperCase()}: ${parts.length} part(s)`);
                    parts.forEach(part => {
                        console.log(`      • ${part.name} - ${part.details}`);
                    });
                }
            });
            
            if (!hasHardware) {
                console.log('   ⚠️ No hardware parts configured');
            }
            
            console.log('');
        });

        // Print summary
        const enabledCharacters = Object.values(characterHardware).filter(char => char.enabled);
        const totalParts = this.parts.length;
        const servoCount = this.parts.filter(p => p.type === 'servo').length;
        
        console.log('📊 SUMMARY:');
        console.log(`   🎭 Total Characters: ${this.characters.length} (${enabledCharacters.length} enabled)`);
        console.log(`   🔧 Total Hardware Parts: ${totalParts}`);
        console.log(`   🎛️ Servo Parts: ${servoCount}`);
        
        const onlineServices = Object.values(this.serviceStatus).filter(s => s.status === 'online').length;
        console.log(`   📡 WebSocket Services: ${onlineServices}/${this.services.length} online`);
        
        if (onlineServices === this.services.length) {
            console.log('\n✅ ALL SERVICES ONLINE - All animatronic characters can connect!');
        } else {
            console.log('\n❌ Some services are offline - Check service status above');
        }
    }

    async run() {
        await this.loadData();
        await this.checkAllServices();
        this.printReport();
    }
}

// Run the status check
async function main() {
    const checker = new AllCharactersHardwareStatusChecker();
    await checker.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = AllCharactersHardwareStatusChecker;
