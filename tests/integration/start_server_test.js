#!/usr/bin/env node
/**
 * Simple server startup test for MonsterBox
 */

console.log('Starting MonsterBox server test...');

try {
    // Test basic requires
    console.log('Testing basic requires...');
    const express = require('express');
    const path = require('path');
    const http = require('http');
    console.log('✅ Basic modules loaded');

    // Test logger
    console.log('Testing logger...');
    const logger = require('./scripts/logger');
    logger.info('Logger test successful');
    console.log('✅ Logger loaded');

    // Test services
    console.log('Testing services...');
    const characterService = require('./services/characterService');
    const webcamService = require('./services/webcamService');
    const streamingService = require('./services/streamingService');
    console.log('✅ Services loaded');

    // Create simple express app
    console.log('Creating Express app...');
    const app = express();
    const server = http.createServer(app);
    
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Add basic route
    app.get('/test', (req, res) => {
        res.json({ status: 'OK', message: 'Server is running' });
    });
    
    // Add streaming routes
    app.use('/api/streaming', require('./routes/streamingRoutes'));
    
    console.log('✅ Express app configured');

    // Start server
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`✅ Server started on port ${port}`);
        console.log(`🎥 Webcam stream available at: http://localhost:${port}/api/streaming/stream/1`);
        console.log(`🧪 Test endpoint: http://localhost:${port}/test`);
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });

} catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
}
