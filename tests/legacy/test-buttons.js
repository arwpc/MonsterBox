const puppeteer = require('puppeteer');

async function testMonsterBoxButtons() {
    console.log('🧪 Starting MonsterBox Button Testing...\n');
    
    const browser = await puppeteer.launch({
        headless: false, // Show browser for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });
    
    try {
        // Test 1: Characters List Page
        console.log('📋 Testing Characters List Page...');
        await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle2' });
        
        // Wait for page to load
        await page.waitForSelector('table', { timeout: 10000 });
        console.log('✅ Characters page loaded');
        
        // Test Manage Parts button
        console.log('🔧 Testing Manage Parts button...');
        const managePartsButton = await page.$('a[href*="/parts"]:not([href*="/ai"])');
        if (managePartsButton) {
            console.log('✅ Manage Parts button found');
            await managePartsButton.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            
            const currentUrl = page.url();
            if (currentUrl.includes('/parts')) {
                console.log('✅ Manage Parts navigation successful:', currentUrl);
            } else {
                console.log('❌ Manage Parts navigation failed. Current URL:', currentUrl);
            }
        } else {
            console.log('❌ Manage Parts button not found');
        }
        
        // Go back to characters page
        await page.goto('http://localhost:3000/characters', { waitUntil: 'networkidle2' });
        
        // Test Assign AI button
        console.log('🧠 Testing Assign AI button...');
        const assignAIButton = await page.$('a[href*="/ai"]');
        if (assignAIButton) {
            console.log('✅ Assign AI button found');
            await assignAIButton.click();
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            
            const currentUrl = page.url();
            if (currentUrl.includes('/ai')) {
                console.log('✅ Assign AI navigation successful:', currentUrl);
                
                // Test AI Assignment functionality
                await testAIAssignmentPage(page);
            } else {
                console.log('❌ Assign AI navigation failed. Current URL:', currentUrl);
            }
        } else {
            console.log('❌ Assign AI button not found');
        }
        
        console.log('\n🎯 Button Testing Complete!');
        
    } catch (error) {
        console.error('❌ Error during testing:', error);
    } finally {
        await browser.close();
    }
}

async function testAIAssignmentPage(page) {
    console.log('🧠 Testing AI Assignment Page functionality...');
    
    try {
        // Wait for the AI assignment page to load
        await page.waitForSelector('table', { timeout: 10000 });
        console.log('✅ AI assignment page loaded');
        
        // Check for available AI instances
        const assignButtons = await page.$$('button[onclick*="assignAI"]');
        console.log(`📊 Found ${assignButtons.length} assign buttons`);
        
        if (assignButtons.length > 0) {
            console.log('🧪 Testing AI assignment button click...');
            
            // Listen for console errors
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    console.log('❌ Browser console error:', msg.text());
                }
            });
            
            // Listen for dialog (confirm/alert)
            page.on('dialog', async dialog => {
                console.log('📢 Dialog appeared:', dialog.message());
                await dialog.accept(); // Accept the confirmation
            });
            
            // Click the first assign button
            await assignButtons[0].click();
            console.log('✅ Assign button clicked');
            
            // Wait a moment for any AJAX requests
            await page.waitForTimeout(2000);
            
            // Check if page reloaded (successful assignment)
            const newUrl = page.url();
            console.log('📍 Current URL after assignment:', newUrl);
            
        } else {
            console.log('ℹ️ No assign buttons found (all AIs may already be assigned)');
        }
        
        // Test unassign buttons if any exist
        const unassignButtons = await page.$$('button[onclick*="unassignAI"]');
        console.log(`📊 Found ${unassignButtons.length} unassign buttons`);
        
        if (unassignButtons.length > 0) {
            console.log('🧪 Testing AI unassign button click...');
            await unassignButtons[0].click();
            console.log('✅ Unassign button clicked');
            await page.waitForTimeout(2000);
        }
        
    } catch (error) {
        console.error('❌ Error testing AI assignment page:', error);
    }
}

// Run the tests
testMonsterBoxButtons().catch(console.error);
