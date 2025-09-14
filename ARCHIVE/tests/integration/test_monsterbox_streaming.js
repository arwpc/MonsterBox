#!/usr/bin/env node
/**
 * Test MonsterBox streaming functionality
 */

console.log('🎭 Testing MonsterBox Streaming Integration...');

try {
    // Test basic requires
    const express = require('express');
    const path = require('path');
    const http = require('http');
    console.log('✅ Express modules loaded');

    // Test logger
    const logger = require('./scripts/logger');
    logger.info('Logger test successful');
    console.log('✅ Logger loaded');

    // Test services
    const characterService = require('./services/characterService');
    const webcamService = require('./services/webcamService');
    const streamingService = require('./services/streamingService');
    console.log('✅ Services loaded');

    // Test streaming routes
    const streamingRoutes = require('./routes/streamingRoutes');
    console.log('✅ Streaming routes loaded');

    // Create Express app
    const app = express();
    const server = http.createServer(app);
    
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Add basic routes
    app.get('/test', (req, res) => {
        res.json({ status: 'OK', message: 'MonsterBox streaming test server' });
    });
    
    // Add streaming routes
    app.use('/api/streaming', streamingRoutes);
    
    // Add webcam API routes
    app.use('/api/webcam', require('./routes/api/webcamApiRoutes'));
    
    console.log('✅ Routes configured');

    // Test character and webcam data
    async function testData() {
        try {
            const characters = await characterService.getAllCharacters();
            console.log(`✅ Found ${characters.length} characters`);
            
            const orlok = characters.find(c => c.id === 1);
            if (orlok) {
                console.log(`✅ Orlok found: ${orlok.char_name}`);
                
                const webcam = await webcamService.getWebcamByCharacter(1);
                if (webcam) {
                    console.log(`✅ Webcam found: ${webcam.name} (${webcam.devicePath})`);
                } else {
                    console.log('❌ No webcam found for Orlok');
                }
            } else {
                console.log('❌ Orlok not found');
            }
        } catch (error) {
            console.error('❌ Data test error:', error.message);
        }
    }

    // Start server
    const port = process.env.PORT || 3000;
    server.listen(port, async () => {
        console.log(`✅ Server started on port ${port}`);
        console.log(`🎥 Stream URL: http://localhost:${port}/api/streaming/stream/1`);
        console.log(`📊 Status URL: http://localhost:${port}/api/streaming/status/1`);
        
        // Test data
        await testData();
        
        console.log('\n🎉 MonsterBox streaming integration test complete!');
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });

} catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
}
