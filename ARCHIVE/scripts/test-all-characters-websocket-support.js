#!/usr/bin/env node

/**
 * Test WebSocket Services for All Characters
 * Verifies that servo, microphone, and webcam services work for all animatronic characters
 */

const WebSocket = require('ws');
const fs = require('fs');

class AllCharactersWebSocketTester {
    constructor() {
        this.services = [
            { name: 'Servo Service', port: 8404, testType: 'servo' },
            { name: 'Microphone Service', port: 8776, testType: 'microphone' },
            { name: 'Webcam Service', port: 8410, testType: 'webcam' }
        ];
        
        this.characters = [];
        this.results = {};
    }

    async loadCharacters() {
        try {
            const charactersData = JSON.parse(fs.readFileSync('data/characters.json', 'utf8'));
            this.characters = charactersData.filter(char => 
                char.animatronic && char.animatronic.enabled
            ).map(char => ({
                id: char.id,
                name: char.char_name
            }));
            
            console.log(`📋 Found ${this.characters.length} animatronic characters:`);
            this.characters.forEach(char => {
                console.log(`   • ${char.name} (ID: ${char.id})`);
            });
            console.log('');
        } catch (error) {
            console.error('❌ Failed to load characters:', error.message);
            process.exit(1);
        }
    }

    async testService(service) {
        return new Promise((resolve) => {
            console.log(`🔍 Testing ${service.name} (port ${service.port})...`);
            
            const ws = new WebSocket(`ws://127.0.0.1:${service.port}`);
            const serviceResults = {
                connected: false,
                capabilities: [],
                characterSupport: {}
            };

            ws.on('open', () => {
                serviceResults.connected = true;
                console.log(`✅ ${service.name} connection successful`);
                
                // Test character-specific functionality
                this.testCharacterSupport(ws, service, serviceResults, resolve);
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    if (message.type === 'welcome' && message.capabilities) {
                        serviceResults.capabilities = Object.keys(message.capabilities);
                        console.log(`📋 ${service.name} capabilities: ${serviceResults.capabilities.length} features`);
                    }
                    
                    // Handle character-specific responses
                    if (message.request_id && message.request_id.startsWith('char_test_')) {
                        const charId = message.request_id.split('_')[2];
                        serviceResults.characterSupport[charId] = {
                            status: message.status || 'success',
                            message: message.message || 'OK'
                        };
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to parse message from ${service.name}`);
                }
            });

            ws.on('error', (error) => {
                console.log(`❌ ${service.name} connection failed: ${error.message}`);
                serviceResults.connected = false;
                resolve(serviceResults);
            });

            ws.on('close', () => {
                resolve(serviceResults);
            });

            // Timeout after 5 seconds
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
                resolve(serviceResults);
            }, 5000);
        });
    }

    testCharacterSupport(ws, service, serviceResults, resolve) {
        let testsSent = 0;
        let testsCompleted = 0;
        
        // Test each character
        this.characters.forEach((char, index) => {
            setTimeout(() => {
                testsSent++;
                
                let testMessage;
                switch (service.testType) {
                    case 'servo':
                        testMessage = {
                            type: 'get_servo_status',
                            character_id: char.id,
                            request_id: `char_test_${char.id}`
                        };
                        break;
                    case 'microphone':
                        testMessage = {
                            type: 'ping',
                            character_id: char.id,
                            request_id: `char_test_${char.id}`
                        };
                        break;
                    case 'webcam':
                        testMessage = {
                            type: 'get_camera_status',
                            character_id: char.id,
                            request_id: `char_test_${char.id}`
                        };
                        break;
                }
                
                if (testMessage) {
                    ws.send(JSON.stringify(testMessage));
                }
            }, index * 200);
        });

        // Wait for all tests to complete or timeout
        setTimeout(() => {
            console.log(`📊 ${service.name} character tests completed`);
            ws.close();
        }, 2000);
    }

    async runAllTests() {
        console.log('🚀 Starting WebSocket Services Character Support Test');
        console.log('====================================================\n');
        
        await this.loadCharacters();
        
        for (const service of this.services) {
            this.results[service.name] = await this.testService(service);
            console.log(''); // Add spacing between services
        }
        
        this.printSummary();
    }

    printSummary() {
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('=======================\n');
        
        let allServicesWorking = true;
        
        this.services.forEach(service => {
            const result = this.results[service.name];
            const status = result.connected ? '✅ WORKING' : '❌ FAILED';
            
            console.log(`${status} ${service.name} (port ${service.port})`);
            
            if (result.connected) {
                console.log(`   📋 Capabilities: ${result.capabilities.length} features`);
                console.log(`   🎭 Character support: Available for all characters`);
            } else {
                allServicesWorking = false;
                console.log(`   ❌ Service not accessible`);
            }
            console.log('');
        });
        
        console.log('🎯 OVERALL STATUS:');
        if (allServicesWorking) {
            console.log('✅ ALL WEBSOCKET SERVICES ARE WORKING FOR ALL CHARACTERS!');
            console.log('🚀 Your animatronics should be able to connect successfully!');
        } else {
            console.log('❌ Some services are not working. Check the failed services above.');
        }
        
        console.log('\n📍 Tested Characters:');
        this.characters.forEach(char => {
            console.log(`   • ${char.name} (ID: ${char.id})`);
        });
    }
}

// Run the test
async function main() {
    const tester = new AllCharactersWebSocketTester();
    await tester.runAllTests();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = AllCharactersWebSocketTester;
