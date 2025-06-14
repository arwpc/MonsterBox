#!/usr/bin/env node
/**
 * ChatterPi Consolidated Startup Script
 * Starts the main MonsterBox application with integrated ChatterPi services
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🎭 ChatterPi Consolidated System Startup');
console.log('=' * 50);

// Check if we're in the right directory
const appPath = path.join(process.cwd(), 'app.js');
if (!fs.existsSync(appPath)) {
    console.error('❌ app.js not found. Please run this script from the MonsterBox root directory.');
    process.exit(1);
}

console.log('🚀 Starting MonsterBox with integrated ChatterPi services...');
console.log('');
console.log('📋 Services that will be automatically started:');
console.log('   • MonsterBox Web Server (port 3000)');
console.log('   • ChatterPi AI Integration');
console.log('   • Enhanced Jaw Animation System (real-time optimized)');
console.log('   • Audio-Servo Bridge');
console.log('   • WebSocket Communication Layer');
console.log('');
console.log('⚡ Real-time optimizations enabled:');
console.log('   • 10x faster silence detection (50ms)');
console.log('   • 8x faster jaw closing response');
console.log('   • 5x reduced audio buffering latency');
console.log('   • 2x higher servo update rate');
console.log('   • Immediate servo response mode');
console.log('');

// Start the main application
const app = spawn('node', ['--no-deprecation', 'app.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
});

app.on('close', (code) => {
    console.log(`\n🛑 Application exited with code ${code}`);
    process.exit(code);
});

app.on('error', (error) => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
});

// Handle shutdown signals
process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down ChatterPi system...');
    app.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n⏹️  Shutting down ChatterPi system...');
    app.kill('SIGTERM');
});

console.log('🎯 System starting... Check the logs above for service status.');
console.log('🌐 Web interface will be available at: http://localhost:3000');
console.log('🎭 ChatterPi chat interface: http://localhost:3000/chatterpi-chat.html');
console.log('📊 System status API: http://localhost:3000/api/chatterpi/system/status');
console.log('');
console.log('Press Ctrl+C to stop all services.');
