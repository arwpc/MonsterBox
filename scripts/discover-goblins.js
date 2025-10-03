#!/usr/bin/env node
/**
 * MonsterBox Goblin Discovery Script
 * Automatically discovers and registers MonsterBox Goblins on the network
 */

import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class GoblinDiscovery {
    constructor() {
        this.monsterBoxUrl = 'http://localhost:3000';
        this.networkBase = '192.168.8';
        this.portRange = [3001, 3002, 3003, 3004, 3005];
        this.timeout = 2000;
    }

    async discoverGoblins() {
        console.log('🔍 Starting Goblin discovery...');
        
        const discovered = [];
        const promises = [];

        // Scan common IP ranges
        for (let i = 140; i <= 170; i++) {
            const ip = `${this.networkBase}.${i}`;
            
            for (const port of this.portRange) {
                promises.push(this.testGoblinAt(ip, port));
            }
        }

        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                discovered.push(result.value);
            }
        }

        console.log(`📡 Discovered ${discovered.length} potential goblins`);
        return discovered;
    }

    async testGoblinAt(ip, port) {
        try {
            const endpoint = `http://${ip}:${port}`;
            
            // Try multiple endpoints to detect goblin services
            const testEndpoints = [
                '/api/system/info',
                '/status',
                '/health',
                '/'
            ];

            for (const testPath of testEndpoints) {
                try {
                    const response = await axios.get(`${endpoint}${testPath}`, {
                        timeout: this.timeout,
                        validateStatus: () => true // Accept any status code
                    });

                    // Check if this looks like a goblin service
                    if (this.isGoblinService(response)) {
                        const goblinId = this.extractGoblinId(ip, response);
                        
                        return {
                            id: goblinId,
                            endpoint: endpoint,
                            ip: ip,
                            port: port,
                            detectedPath: testPath,
                            status: response.status,
                            data: response.data
                        };
                    }
                } catch (error) {
                    // Continue to next endpoint
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    isGoblinService(response) {
        const data = response.data;
        const headers = response.headers;
        
        // Check for goblin-specific indicators
        if (typeof data === 'object' && data.system) {
            return true;
        }
        
        // Check for HTML responses that might be goblin web interfaces
        if (typeof data === 'string' && data.includes('goblin')) {
            return true;
        }
        
        // Check for services running on goblin ports
        if (response.status === 200 && response.config.url.includes(':3001')) {
            return true;
        }

        return false;
    }

    extractGoblinId(ip, response) {
        // Try to extract goblin ID from response
        if (response.data && response.data.goblinId) {
            return response.data.goblinId;
        }
        
        // Generate ID from IP
        const lastOctet = ip.split('.').pop();
        return `goblin${lastOctet}`;
    }

    async registerGoblin(goblinInfo) {
        try {
            const registrationData = {
                goblinId: goblinInfo.id,
                endpoint: goblinInfo.endpoint,
                name: `Goblin ${goblinInfo.id.replace('goblin', '')}`,
                capabilities: ['video', 'audio'],
                platform: 'raspberry-pi',
                version: '1.0.0'
            };

            const response = await axios.post(
                `${this.monsterBoxUrl}/goblin-management/api/register`,
                registrationData,
                { timeout: 5000 }
            );

            if (response.data.success) {
                console.log(`✅ Registered ${goblinInfo.id} at ${goblinInfo.endpoint}`);
                return true;
            } else {
                console.log(`❌ Failed to register ${goblinInfo.id}: ${response.data.error}`);
                return false;
            }
        } catch (error) {
            console.log(`❌ Error registering ${goblinInfo.id}: ${error.message}`);
            return false;
        }
    }

    async getRegisteredGoblins() {
        try {
            const response = await axios.get(`${this.monsterBoxUrl}/goblin-management/api/goblins`);
            return response.data.goblins || [];
        } catch (error) {
            console.error('Error getting registered goblins:', error.message);
            return [];
        }
    }

    async run() {
        console.log('🎃 MonsterBox Goblin Discovery Tool');
        console.log('=====================================');
        
        try {
            // Get currently registered goblins
            const registered = await this.getRegisteredGoblins();
            console.log(`📋 Currently registered: ${registered.length} goblins`);
            
            // Discover new goblins
            const discovered = await this.discoverGoblins();
            
            if (discovered.length === 0) {
                console.log('🔍 No new goblins discovered');
                return;
            }

            console.log('\n📡 Discovered goblins:');
            discovered.forEach(goblin => {
                console.log(`  - ${goblin.id} at ${goblin.endpoint} (${goblin.detectedPath})`);
            });

            // Register new goblins
            console.log('\n🔧 Registering new goblins...');
            let registered_count = 0;
            
            for (const goblin of discovered) {
                const isAlreadyRegistered = registered.some(r => 
                    r.id === goblin.id || r.endpoint === goblin.endpoint
                );
                
                if (!isAlreadyRegistered) {
                    const success = await this.registerGoblin(goblin);
                    if (success) registered_count++;
                } else {
                    console.log(`⏭️  ${goblin.id} already registered`);
                }
            }

            console.log(`\n🎉 Discovery complete! Registered ${registered_count} new goblins`);
            
        } catch (error) {
            console.error('❌ Discovery failed:', error.message);
            process.exit(1);
        }
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const discovery = new GoblinDiscovery();
    discovery.run().catch(console.error);
}

export default GoblinDiscovery;
