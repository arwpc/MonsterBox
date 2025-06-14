#!/usr/bin/env node

/**
 * Test WebSocket client for AI bridge
 */

const WebSocket = require('ws');

console.log('🧪 Testing AI WebSocket Bridge...');

const ws = new WebSocket('ws://127.0.0.1:8766');

ws.on('open', function open() {
    console.log('✅ Connected to AI WebSocket Bridge');
    
    // Set character to Count Orlok
    ws.send(JSON.stringify({
        type: 'set_character',
        character: 'orlok'
    }));
    
    // Send a test message after a short delay
    setTimeout(() => {
        console.log('📤 Sending test message...');
        ws.send(JSON.stringify({
            type: 'chat_message',
            text: 'Hello, Count Orlok. Tell me about your castle.'
        }));
    }, 1000);
});

ws.on('message', function message(data) {
    try {
        const msg = JSON.parse(data);
        console.log('📥 Received message:', msg.type);

        if (msg.type === 'conversation_result') {
            console.log('🎭 AI Response:', msg.data.aiResponse.text);
            console.log('🎪 Character:', msg.data.aiResponse.character);
            console.log('🔊 Voice:', msg.data.aiResponse.voice);
            console.log('🦴 Jaw Animation:', msg.data.aiResponse.jaw_animation ? 'Yes' : 'No');
            console.log('✅ Test completed successfully!');

            // Wait a moment for jaw animation to complete, then close
            setTimeout(() => {
                ws.close();
            }, 1000);
        } else if (msg.type === 'ai_error') {
            console.error('❌ AI Error:', msg.error);
            ws.close();
        } else if (msg.type === 'welcome') {
            console.log('👋 Welcome message received');
        } else if (msg.type === 'character_changed') {
            console.log('🎭 Character changed to:', msg.character);
        } else if (msg.type === 'processing_started') {
            console.log('⚙️ AI processing started...');
        } else {
            console.log('📋 Other message:', msg.type);
        }
    } catch (error) {
        console.error('❌ Error parsing message:', error);
        console.log('Raw message:', data.toString());
    }
});

ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
    console.log('🔌 WebSocket connection closed');
    process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
    console.log('⏰ Test timeout');
    ws.close();
    process.exit(1);
}, 30000);
