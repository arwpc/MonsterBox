/**
 * Browser Helper - Determines correct hostname for opening browsers
 */

const os = require('os');

class BrowserHelper {
    constructor() {
        this.hostname = this.determineHostname();
    }
    
    determineHostname() {
        const currentHostname = os.hostname();
        
        // If we're running on the remote system, use localhost
        if (currentHostname === 'skulltalker' || currentHostname.includes('skulltalker')) {
            return 'localhost';
        }
        
        // If we're running remotely (like through VS Code), use the remote hostname
        return 'skulltalker';
    }
    
    getUrl(path = '', port = 80) {
        // Ensure path starts with /
        if (path && !path.startsWith('/')) {
            path = '/' + path;
        }
        
        return `http://${this.hostname}:${port}${path}`;
    }
    
    getChatterPiUrls() {
        return {
            aiChat: this.getUrl('/chatterpi-ai-chat.html'),
            basicChat: this.getUrl('/chatterpi-chat.html'),
            main: this.getUrl('/'),
            jawWebSocket: `ws://${this.hostname}:8765`,
            aiWebSocket: `ws://${this.hostname}:8766`
        };
    }
    
    logUrls() {
        const urls = this.getChatterPiUrls();
        console.log('🌐 ChatterPi URLs:');
        console.log(`   AI Chat: ${urls.aiChat}`);
        console.log(`   Basic Chat: ${urls.basicChat}`);
        console.log(`   Main App: ${urls.main}`);
        console.log(`   Jaw WebSocket: ${urls.jawWebSocket}`);
        console.log(`   AI WebSocket: ${urls.aiWebSocket}`);
    }
}

module.exports = BrowserHelper;
