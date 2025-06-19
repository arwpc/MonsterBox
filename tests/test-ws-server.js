const WebSocket = require('ws');

// Create a simple WebSocket server for testing
const wss = new WebSocket.Server({ 
    port: 8790,
    host: '0.0.0.0'
});

console.log('Test WebSocket server running on ws://0.0.0.0:8790');

wss.on('connection', function connection(ws, req) {
    console.log('✅ Client connected from:', req.socket.remoteAddress);
    console.log('Headers:', req.headers);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to test WebSocket server',
        timestamp: new Date().toISOString()
    }));
    
    ws.on('message', function incoming(message) {
        console.log('📨 Received:', message.toString());
        
        try {
            const data = JSON.parse(message);
            if (data.type === 'ping') {
                ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (e) {
            console.log('Non-JSON message received');
        }
    });
    
    ws.on('close', function close() {
        console.log('🔌 Client disconnected');
    });
    
    ws.on('error', function error(err) {
        console.log('❌ WebSocket error:', err);
    });
});

wss.on('error', function error(err) {
    console.log('❌ Server error:', err);
});

// Keep the server running
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down test WebSocket server...');
    wss.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
