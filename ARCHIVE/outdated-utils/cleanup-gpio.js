#!/usr/bin/env node
/**
 * Manual GPIO Cleanup Script
 * Run this if you encounter GPIO conflicts before starting the app
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧹 ChatterPi GPIO Cleanup Tool');
console.log('=' * 40);

async function runCleanup() {
    try {
        const cleanupScript = path.join(process.cwd(), 'scripts/chatterpi/gpio_cleanup.py');
        
        console.log('🔄 Running GPIO cleanup...');
        
        const cleanupProcess = spawn('python3', [cleanupScript], {
            stdio: 'inherit'
        });
        
        await new Promise((resolve, reject) => {
            cleanupProcess.on('close', (code) => {
                if (code === 0) {
                    console.log('\n✅ GPIO cleanup completed successfully');
                    console.log('You can now run: npm start');
                    resolve();
                } else {
                    console.log(`\n⚠️ GPIO cleanup exited with code ${code}`);
                    console.log('You may still be able to run: npm start');
                    resolve();
                }
            });
            
            cleanupProcess.on('error', (error) => {
                console.error('❌ Cleanup process error:', error);
                reject(error);
            });
        });
        
    } catch (error) {
        console.error('❌ Failed to run cleanup:', error);
        process.exit(1);
    }
}

runCleanup().then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
});
