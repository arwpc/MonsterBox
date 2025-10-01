#!/usr/bin/env node

/**
 * Test Goblin Registration Script
 * Simple script to register a test goblin with MonsterBox for Scene testing
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const http = require('http');

function generateId() {
    return 'test-goblin-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
}

const testGoblin = {
    goblinId: generateId(),
    name: 'Test Goblin for Scene Testing',
    endpoint: 'http://localhost:3002',
    capabilities: {
        video: ['mp4', 'avi', 'mkv', 'mov'],
        audio: ['mp3', 'wav', 'aac', 'ogg'],
        maxResolution: '1080p@30fps',
        concurrentAudio: true
    },
    hardware: {
        platform: 'test',
        arch: 'x64',
        memory: '1GB',
        storage: '10GB'
    },
    status: 'online',
    lastSeen: new Date().toISOString()
};

async function registerTestGoblin() {
    try {
        console.log('🎃 Registering test goblin with MonsterBox...');
        
        const postData = JSON.stringify(testGoblin);
        
        const options = {
            hostname: '127.0.0.1',
            port: 3000,
            path: '/goblin-management/api/register',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const response = await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
        
        if (response.success) {
            console.log('✅ Test goblin registered successfully:', response.goblin.id);
            console.log('🧪 Test goblin ready for Scene testing');
            
        } else {
            console.error('❌ Failed to register test goblin:', response.error);
        }
        
    } catch (error) {
        console.error('❌ Registration error:', error.message);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down test goblin...');
    process.exit(0);
});

// Start the test goblin
registerTestGoblin();