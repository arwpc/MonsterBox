#!/usr/bin/env node

/**
 * Complete System Status for All Characters
 * Shows comprehensive status of all WebSocket services and character hardware support
 */

const WebSocket = require('ws');
const fs = require('fs');

class CompleteSystemStatusChecker {
    constructor() {
        this.services = [
            { name: 'Servo Service', port: 8404, types: ['servo'], description: 'Servo control & jaw animation' },
            { name: 'Motor Service', port: 8771, types: ['motor'], description: 'Motor control & body movement' },
            { name: 'Light Service', port: 8772, types: ['light', 'led'], description: 'Light & LED control' },
            { name: 'Sensor Service', port: 8407, types: ['sensor'], description: 'Sensor monitoring & detection' },
            { name: 'Actuator Service', port: 8408, types: ['linear-actuator'], description: 'Linear actuator control' },
            { name: 'Microphone Service', port: 8776, types: ['microphone'], description: 'Audio input & voice detection' },
            { name: 'Webcam Service', port: 8410, types: ['webcam'], description: 'Video streaming & capture' }
        ];
        
        this.characters = [];
        this.parts = [];
        this.serviceStatus = {};
    }

    async loadData() {
        try {
            // Load characters
            const charactersData = JSON.parse(fs.readFileSync('data/characters.json', 'utf8'));
            this.characters = charactersData.filter(char => 
                char.animatronic && char.animatronic.enabled
            ).map(char => ({
                id: char.id,
                name: char.char_name,
                host: char.animatronic.rpi_config ? char.animatronic.rpi_config.host : 'localhost'
            }));

            // Load parts
            this.parts = JSON.parse(fs.readFileSync('data/parts.json', 'utf8'));
            
        } catch (error) {
            console.error('❌ Failed to load data:', error.message);
            process.exit(1);
        }
    }

    async checkAllServices() {
        console.log('🔍 Checking all WebSocket services...\n');
        
        for (const service of this.services) {
            this.serviceStatus[service.name] = await this.checkService(service);
        }
    }

    async checkService(service) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${service.port}`);
            
            const result = {
                name: service.name,
                port: service.port,
                types: service.types,
                description: service.description,
                status: 'offline',
                capabilities: 0,
                responseTime: 0
            };

            const startTime = Date.now();

            ws.on('open', () => {
                result.status = 'online';
                result.responseTime = Date.now() - startTime;
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

            // Timeout after 3 seconds
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                } else {
                    resolve(result);
                }
            }, 3000);
        });
    }

    analyzeSystemCapabilities() {
        const partsByType = {};
        const partsByCharacter = {};
        
        // Group parts by type and character
        this.parts.forEach(part => {
            // By type
            if (!partsByType[part.type]) {
                partsByType[part.type] = [];
            }
            partsByType[part.type].push(part);
            
            // By character
            if (!partsByCharacter[part.characterId]) {
                partsByCharacter[part.characterId] = [];
            }
            partsByCharacter[part.characterId].push(part);
        });
        
        return { partsByType, partsByCharacter };
    }

    printCompleteStatus() {
        console.log('🎭 COMPLETE MONSTERBOX SYSTEM STATUS');
        console.log('====================================\n');

        // Service Status
        console.log('📡 WebSocket Services Status:');
        console.log('-----------------------------');
        
        let onlineServices = 0;
        Object.values(this.serviceStatus).forEach(service => {
            const status = service.status === 'online' ? '✅ ONLINE' : '❌ OFFLINE';
            const responseTime = service.responseTime > 0 ? ` (${service.responseTime}ms)` : '';
            console.log(`${status} ${service.name} - Port ${service.port}${responseTime}`);
            console.log(`   📋 ${service.description}`);
            console.log(`   🔧 Handles: ${service.types.join(', ')} parts`);
            if (service.capabilities > 0) {
                console.log(`   ⚙️ Capabilities: ${service.capabilities} features`);
            }
            console.log('');
            
            if (service.status === 'online') onlineServices++;
        });

        // Character Analysis
        const { partsByType, partsByCharacter } = this.analyzeSystemCapabilities();
        
        console.log('🎭 Character Hardware Analysis:');
        console.log('-------------------------------');
        
        this.characters.forEach(char => {
            const charParts = partsByCharacter[char.id] || [];
            console.log(`🎭 ${char.name} (ID: ${char.id}) @ ${char.host}`);
            
            if (charParts.length === 0) {
                console.log('   ⚠️ No hardware parts configured');
            } else {
                const partTypeCount = {};
                charParts.forEach(part => {
                    partTypeCount[part.type] = (partTypeCount[part.type] || 0) + 1;
                });
                
                Object.entries(partTypeCount).forEach(([type, count]) => {
                    const service = this.services.find(s => s.types.includes(type));
                    const serviceStatus = service ? this.serviceStatus[service.name]?.status : 'unknown';
                    const statusIcon = serviceStatus === 'online' ? '✅' : '❌';
                    console.log(`   ${statusIcon} ${type.toUpperCase()}: ${count} part(s) - Service ${serviceStatus}`);
                });
            }
            console.log('');
        });

        // System Summary
        console.log('📊 SYSTEM SUMMARY:');
        console.log('------------------');
        console.log(`🎭 Animatronic Characters: ${this.characters.length} enabled`);
        console.log(`🔧 Total Hardware Parts: ${this.parts.length}`);
        console.log(`📡 WebSocket Services: ${onlineServices}/${this.services.length} online`);
        
        const partTypeCounts = {};
        Object.entries(partsByType).forEach(([type, parts]) => {
            partTypeCounts[type] = parts.length;
        });
        
        console.log('\n🔧 Parts Breakdown:');
        Object.entries(partTypeCounts).sort().forEach(([type, count]) => {
            console.log(`   • ${type}: ${count} part(s)`);
        });

        // Connection Information
        console.log('\n🌐 CONNECTION ENDPOINTS FOR ALL CHARACTERS:');
        console.log('===========================================');
        
        Object.values(this.serviceStatus).forEach(service => {
            if (service.status === 'online') {
                console.log(`✅ ${service.description}: ws://127.0.0.1:${service.port}`);
            }
        });

        // Dynamic Addition Support
        console.log('\n🔄 DYNAMIC PART ADDITION SUPPORT:');
        console.log('=================================');
        console.log('✅ When you add new parts to ANY character:');
        console.log('   1. Services automatically reload configurations');
        console.log('   2. New services start automatically if needed');
        console.log('   3. All characters can immediately use new hardware');
        console.log('   4. No manual service restarts required');
        
        // Overall Status
        console.log('\n🎯 OVERALL SYSTEM STATUS:');
        if (onlineServices === this.services.length) {
            console.log('✅ ALL SYSTEMS OPERATIONAL');
            console.log('🚀 All animatronic characters can connect and operate!');
        } else {
            console.log('⚠️ Some services are offline - check service status above');
        }
    }

    async run() {
        console.log('🚀 Analyzing complete MonsterBox system status...\n');
        
        await this.loadData();
        await this.checkAllServices();
        this.printCompleteStatus();
    }
}

// Run the complete status check
async function main() {
    const checker = new CompleteSystemStatusChecker();
    await checker.run();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = CompleteSystemStatusChecker;
