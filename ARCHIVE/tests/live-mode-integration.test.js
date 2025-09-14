const { expect } = require('chai');
const puppeteer = require('puppeteer');

describe('🎙️ Live Mode Integration Tests', function() {
    this.timeout(60000);
    
    let browser;
    let page;
    
    before(async function() {
        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream']
        });
        page = await browser.newPage();
        
        // Grant microphone permissions
        await page.evaluateOnNewDocument(() => {
            navigator.mediaDevices.getUserMedia = () => Promise.resolve({
                getTracks: () => [{ stop: () => {} }]
            });
        });
        
        await page.goto('http://localhost:3000/test-chat');
        await page.waitForSelector('#liveModeToggle');
    });
    
    after(async function() {
        if (browser) {
            await browser.close();
        }
    });
    
    describe('Live Mode UI Components', function() {
        
        it('should display Live Mode button', async function() {
            const liveModeButton = await page.$('#liveModeToggle');
            expect(liveModeButton).to.not.be.null;
            
            const buttonText = await page.$eval('#liveModeToggle', el => el.textContent);
            expect(buttonText).to.include('Live Mode');
            expect(buttonText).to.include('OFF');
        });
        
        it('should display Live Mode button with correct styling', async function() {
            const buttonClasses = await page.$eval('#liveModeToggle', el => el.className);
            expect(buttonClasses).to.include('voice-toggle');
            expect(buttonClasses).to.include('live-mode-toggle');
        });
        
        it('should have microphone icon', async function() {
            const icon = await page.$eval('#liveModeToggle .voice-icon', el => el.textContent);
            expect(icon).to.equal('🎙️');
        });
    });
    
    describe('Live Mode State Management', function() {
        
        beforeEach(async function() {
            // Select a character with AI capabilities
            await page.select('#characterSelect', '4'); // Skulltalker has AI
            await page.waitForTimeout(1000);
        });
        
        it('should require character selection before activation', async function() {
            // First deselect character
            await page.select('#characterSelect', '');
            await page.waitForTimeout(500);
            
            // Try to activate Live Mode
            await page.click('#liveModeToggle');
            
            // Should show alert
            const alertText = await page.evaluate(() => {
                return new Promise((resolve) => {
                    const originalAlert = window.alert;
                    window.alert = (message) => {
                        window.alert = originalAlert;
                        resolve(message);
                    };
                    setTimeout(() => resolve(null), 1000);
                });
            });
            
            expect(alertText).to.equal('Please select a character first');
        });
        
        it('should require AI-enabled character', async function() {
            // Select character without AI
            await page.select('#characterSelect', '1'); // Orlok has no AI
            await page.waitForTimeout(1000);
            
            // Try to activate Live Mode
            await page.click('#liveModeToggle');
            
            // Should show alert about AI requirement
            const alertText = await page.evaluate(() => {
                return new Promise((resolve) => {
                    const originalAlert = window.alert;
                    window.alert = (message) => {
                        window.alert = originalAlert;
                        resolve(message);
                    };
                    setTimeout(() => resolve(null), 1000);
                });
            });
            
            expect(alertText).to.equal('Live Mode requires a character with AI capabilities');
        });
        
        it('should activate Live Mode with AI-enabled character', async function() {
            // Select AI-enabled character
            await page.select('#characterSelect', '4'); // Skulltalker has AI
            await page.waitForTimeout(1000);
            
            // Activate Live Mode
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
            
            // Check if Live Mode is active
            const buttonClasses = await page.$eval('#liveModeToggle', el => el.className);
            const statusText = await page.$eval('#liveModeStatus', el => el.textContent);
            
            expect(buttonClasses).to.include('active');
            expect(statusText).to.not.equal('OFF');
        });
    });
    
    describe('Live Mode Audio Integration', function() {
        
        beforeEach(async function() {
            // Select AI-enabled character
            await page.select('#characterSelect', '4');
            await page.waitForTimeout(1000);
        });
        
        it('should enable TTS automatically when Live Mode starts', async function() {
            // Activate Live Mode
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
            
            // Check if TTS is automatically enabled
            const ttsClasses = await page.$eval('#ttsToggle', el => el.className);
            const ttsStatus = await page.$eval('#ttsStatus', el => el.textContent);
            
            expect(ttsClasses).to.include('active');
            expect(ttsStatus).to.equal('ON');
        });
        
        it('should clear chat history when Live Mode starts', async function() {
            // Add some messages first
            await page.type('#chatInput', 'Test message');
            await page.click('#sendButton');
            await page.waitForTimeout(1000);
            
            // Activate Live Mode
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
            
            // Check if chat was cleared and shows Live Mode message
            const messages = await page.$$eval('.message', els => els.map(el => el.textContent));
            expect(messages.length).to.equal(1);
            expect(messages[0]).to.include('Live Mode activated');
        });
    });
    
    describe('Live Mode Deactivation', function() {
        
        beforeEach(async function() {
            // Select AI-enabled character and activate Live Mode
            await page.select('#characterSelect', '4');
            await page.waitForTimeout(1000);
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
        });
        
        it('should deactivate Live Mode when clicked again', async function() {
            // Deactivate Live Mode
            await page.click('#liveModeToggle');
            await page.waitForTimeout(1000);
            
            // Check if Live Mode is deactivated
            const buttonClasses = await page.$eval('#liveModeToggle', el => el.className);
            const statusText = await page.$eval('#liveModeStatus', el => el.textContent);
            
            expect(buttonClasses).to.not.include('active');
            expect(statusText).to.equal('OFF');
        });
    });
    
    describe('Live Mode Conflict Prevention', function() {
        
        beforeEach(async function() {
            // Select AI-enabled character
            await page.select('#characterSelect', '4');
            await page.waitForTimeout(1000);
        });
        
        it('should prevent STT toggle when Live Mode is active', async function() {
            // Activate Live Mode first
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
            
            // Try to toggle STT
            await page.click('#sttToggle');
            
            // Should show alert
            const alertText = await page.evaluate(() => {
                return new Promise((resolve) => {
                    const originalAlert = window.alert;
                    window.alert = (message) => {
                        window.alert = originalAlert;
                        resolve(message);
                    };
                    setTimeout(() => resolve(null), 1000);
                });
            });
            
            expect(alertText).to.equal('Cannot toggle STT while Live Mode is active');
        });
        
        it('should stop regular STT when Live Mode is activated', async function() {
            // Activate STT first
            await page.click('#sttToggle');
            await page.waitForTimeout(1000);
            
            // Verify STT is active
            let sttClasses = await page.$eval('#sttToggle', el => el.className);
            expect(sttClasses).to.include('active');
            
            // Activate Live Mode
            await page.click('#liveModeToggle');
            await page.waitForTimeout(2000);
            
            // STT should be stopped
            sttClasses = await page.$eval('#sttToggle', el => el.className);
            expect(sttClasses).to.not.include('active');
        });
    });
});
