#!/usr/bin/env node

/**
 * Quick test script to verify microphone WebSocket connection
 */

const WebSocket = require('ws');

console.log('🎤 Testing Microphone WebSocket Connection...');

// Test IPv4 connection (what the hardware service uses)
const ws = new WebSocket('ws://127.0.0.1:8776');

ws.on('open', function() {
    console.log('✅ Successfully connected to microphone service on 127.0.0.1:8776');
    
    // Send a test message
    ws.send(JSON.stringify({
        type: 'register_manager',
        client_id: 'connection_test'
    }));
    
    setTimeout(() => {
        ws.close();
        console.log('🔌 Connection test completed successfully');
        process.exit(0);
    }, 2000);
});

ws.on('message', function(data) {
    console.log('📨 Received message:', data.toString());
});

ws.on('error', function(error) {
    console.log('❌ Connection failed:', error.message);
    console.log('💡 Make sure the MonsterBox application is running first');
    process.exit(1);
});

ws.on('close', function() {
    console.log('🔌 Connection closed');
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('⏰ Connection test timed out');
    process.exit(1);
}, 10000);
