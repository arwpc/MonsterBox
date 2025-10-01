/**
 * Enhanced Chat Test Script
 * Tests conversations with different characters to identify and fix issues
 */

const puppeteer = require('puppeteer');

class EnhancedChatTester {
    constructor() {
        this.browser = null;
        this.page = null;
        this.errors = [];
        this.testResults = [];
    }

    async initialize() {
        console.log('🚀 Initializing Enhanced Chat Tester...');
        
        this.browser = await puppeteer.launch({
            headless: false, // Set to true for headless testing
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--ignore-certificate-errors'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Listen for console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                console.error('❌ Browser Console Error:', msg.text());
                this.errors.push({
                    type: 'console_error',
                    message: msg.text(),
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Listen for page errors
        this.page.on('pageerror', error => {
            console.error('❌ Page Error:', error.message);
            this.errors.push({
                type: 'page_error',
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        });

        // Set viewport
        await this.page.setViewport({ width: 1280, height: 720 });
        
        console.log('✅ Enhanced Chat Tester initialized');
    }

    async navigateToEnhancedChat() {
        console.log('🌐 Navigating to Enhanced Chat page...');
        
        try {
            await this.page.goto('http://localhost:3000/ai-management/enhanced-test-chat', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            
            // Wait for the page to load completely
            await this.page.waitForSelector('#characterSelect', { timeout: 10000 });
            console.log('✅ Enhanced Chat page loaded successfully');
            
            return true;
        } catch (error) {
            console.error('❌ Failed to navigate to Enhanced Chat:', error.message);
            this.errors.push({
                type: 'navigation_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async testCharacterSelection(characterId, characterName) {
        console.log(`🎭 Testing character selection: ${characterName} (ID: ${characterId})`);
        
        try {
            // Select character from dropdown
            await this.page.select('#characterSelect', characterId.toString());
            
            // Wait for character to load
            await this.page.waitForTimeout(2000);
            
            // Check if character loaded successfully
            const selectedValue = await this.page.$eval('#characterSelect', el => el.value);
            
            if (selectedValue === characterId.toString()) {
                console.log(`✅ Character ${characterName} selected successfully`);
                return true;
            } else {
                console.error(`❌ Character selection failed for ${characterName}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error selecting character ${characterName}:`, error.message);
            this.errors.push({
                type: 'character_selection_error',
                character: characterName,
                characterId: characterId,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async testWebSocketConnection() {
        console.log('🔌 Testing WebSocket connection...');
        
        try {
            // Check connection status
            const connectionStatus = await this.page.$eval('#connectionStatus', el => el.textContent);
            console.log(`📡 Connection status: ${connectionStatus}`);
            
            // Wait for connection to establish
            await this.page.waitForTimeout(3000);
            
            const finalStatus = await this.page.$eval('#connectionStatus', el => el.textContent);
            console.log(`📡 Final connection status: ${finalStatus}`);
            
            if (finalStatus.includes('Connected') || finalStatus.includes('Ready')) {
                console.log('✅ WebSocket connection established');
                return true;
            } else {
                console.log('⚠️ WebSocket connection may have issues');
                return false;
            }
        } catch (error) {
            console.error('❌ Error testing WebSocket connection:', error.message);
            this.errors.push({
                type: 'websocket_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async testVoicePreview() {
        console.log('🔊 Testing voice preview...');
        
        try {
            // Click voice preview button if available
            const previewButton = await this.page.$('#testVoice');
            if (previewButton) {
                await previewButton.click();
                console.log('🔊 Voice preview button clicked');
                
                // Wait for audio to play
                await this.page.waitForTimeout(3000);
                
                console.log('✅ Voice preview test completed');
                return true;
            } else {
                console.log('⚠️ Voice preview button not found');
                return false;
            }
        } catch (error) {
            console.error('❌ Error testing voice preview:', error.message);
            this.errors.push({
                type: 'voice_preview_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async simulateConversation(characterName, testMessage) {
        console.log(`💬 Simulating conversation with ${characterName}: "${testMessage}"`);
        
        try {
            // Type message in input field
            const messageInput = await this.page.$('#messageInput');
            if (messageInput) {
                await messageInput.click();
                await messageInput.type(testMessage);
                
                // Send message
                const sendButton = await this.page.$('#sendMessage');
                if (sendButton) {
                    await sendButton.click();
                    console.log('📤 Message sent');
                    
                    // Wait for response
                    await this.page.waitForTimeout(5000);
                    
                    // Check for response in chat
                    const messages = await this.page.$$eval('.message', msgs => 
                        msgs.map(msg => msg.textContent)
                    );
                    
                    console.log(`📨 Total messages in chat: ${messages.length}`);
                    
                    return true;
                } else {
                    console.error('❌ Send button not found');
                    return false;
                }
            } else {
                console.error('❌ Message input not found');
                return false;
            }
        } catch (error) {
            console.error(`❌ Error simulating conversation with ${characterName}:`, error.message);
            this.errors.push({
                type: 'conversation_error',
                character: characterName,
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }

    async runFullTest() {
        console.log('🧪 Starting full Enhanced Chat test suite...');
        
        const testCharacters = [
            { id: 1, name: 'Orlok' },
            { id: 2, name: 'Coffin Breaker' },
            { id: 4, name: 'Skulltalker' }
        ];

        const testMessages = [
            "Hello, how are you today?",
            "Tell me about yourself.",
            "What's your favorite scary story?"
        ];

        // Navigate to page
        const navigationSuccess = await this.navigateToEnhancedChat();
        if (!navigationSuccess) {
            console.error('❌ Failed to navigate to Enhanced Chat page');
            return;
        }

        // Test each character
        for (let i = 0; i < testCharacters.length; i++) {
            const character = testCharacters[i];
            const message = testMessages[i];
            
            console.log(`\n🎭 === Testing Character ${i + 1}: ${character.name} ===`);
            
            // Select character
            const selectionSuccess = await this.testCharacterSelection(character.id, character.name);
            if (!selectionSuccess) continue;
            
            // Test WebSocket connection
            await this.testWebSocketConnection();
            
            // Test voice preview
            await this.testVoicePreview();
            
            // Simulate conversation
            await this.simulateConversation(character.name, message);
            
            // Record test result
            this.testResults.push({
                character: character.name,
                characterId: character.id,
                success: selectionSuccess,
                timestamp: new Date().toISOString()
            });
            
            // Wait between tests
            await this.page.waitForTimeout(2000);
        }
        
        console.log('\n📊 Test Results Summary:');
        this.testResults.forEach(result => {
            console.log(`${result.success ? '✅' : '❌'} ${result.character}: ${result.success ? 'PASSED' : 'FAILED'}`);
        });
        
        if (this.errors.length > 0) {
            console.log('\n❌ Errors Found:');
            this.errors.forEach((error, index) => {
                console.log(`${index + 1}. [${error.type}] ${error.message}`);
            });
        } else {
            console.log('\n✅ No errors found!');
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log('🧹 Browser closed');
        }
    }
}

// Run the test
async function runTest() {
    const tester = new EnhancedChatTester();
    
    try {
        await tester.initialize();
        await tester.runFullTest();
    } catch (error) {
        console.error('❌ Test suite failed:', error);
    } finally {
        await tester.cleanup();
    }
}

// Export for use as module or run directly
if (require.main === module) {
    runTest();
}

module.exports = EnhancedChatTester;
