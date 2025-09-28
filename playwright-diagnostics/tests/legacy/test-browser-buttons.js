const { chromium } = require('playwright');

async function testMonsterBoxButtons() {
    console.log('🧪 Starting MonsterBox Browser Button Testing...\n');
    
    const browser = await chromium.launch({
        headless: true,  // Run headless since no X server
        slowMo: 500     // Slow down actions for stability
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Listen for console messages and errors
    page.on('console', msg => {
        console.log(`🖥️  Browser Console [${msg.type()}]: ${msg.text()}`);
    });
    
    page.on('pageerror', error => {
        console.log(`❌ Page Error: ${error.message}`);
    });
    
    try {
        // Test 1: Navigate to Characters page
        console.log('📋 Testing Characters List Page...');
        await page.goto('http://localhost:3000/characters');
        await page.waitForLoadState('networkidle');
        console.log('✅ Characters page loaded');
        
        // Take screenshot for debugging
        await page.screenshot({ path: 'characters-page.png' });
        
        // Test 2: Find and click Manage Parts button
        console.log('\n🔧 Testing Manage Parts Button...');
        
        // Look for the Manage Parts button
        const managePartsButton = await page.locator('a[href*="/parts"]:has-text("Manage Parts")').first();
        
        if (await managePartsButton.count() > 0) {
            console.log('✅ Manage Parts button found');
            
            // Click the button
            await managePartsButton.click();
            await page.waitForLoadState('networkidle');
            
            const currentUrl = page.url();
            console.log(`📍 Current URL: ${currentUrl}`);
            
            if (currentUrl.includes('/parts')) {
                console.log('✅ Manage Parts button works - navigated to parts page');
                
                // Check if it's showing HTML content (not JSON)
                const pageContent = await page.textContent('body');
                if (pageContent.includes('{') && pageContent.includes('"id"')) {
                    console.log('❌ Parts page is showing JSON instead of HTML interface');
                } else {
                    console.log('✅ Parts page is showing proper HTML interface');
                }
                
                await page.screenshot({ path: 'parts-page.png' });
            } else {
                console.log('❌ Manage Parts button failed - wrong URL');
            }
        } else {
            console.log('❌ Manage Parts button not found');
        }
        
        // Test 3: Navigate back and test AI buttons
        console.log('\n🧠 Testing AI Assignment Buttons...');
        await page.goto('http://localhost:3000/characters');
        await page.waitForLoadState('networkidle');
        
        // Look for AI assignment buttons
        const assignAIButton = await page.locator('a[href*="/ai"]:has-text("Assign AI")').first();
        const changeAIButton = await page.locator('a[href*="/ai"]:has-text("Change AI")').first();
        
        let aiButton = null;
        if (await assignAIButton.count() > 0) {
            aiButton = assignAIButton;
            console.log('✅ "Assign AI" button found');
        } else if (await changeAIButton.count() > 0) {
            aiButton = changeAIButton;
            console.log('✅ "Change AI" button found');
        }
        
        if (aiButton) {
            await aiButton.click();
            await page.waitForLoadState('networkidle');
            
            const currentUrl = page.url();
            console.log(`📍 Current URL: ${currentUrl}`);
            
            if (currentUrl.includes('/ai')) {
                console.log('✅ AI button works - navigated to AI page');
                await page.screenshot({ path: 'ai-page.png' });
                
                // Test AI assignment functionality
                await testAIAssignmentButtons(page);
            } else {
                console.log('❌ AI button failed - wrong URL');
            }
        } else {
            console.log('❌ No AI assignment buttons found');
        }
        
        // Final verification - check if AI was actually assigned
        console.log('\n🔍 Final Verification - Checking AI Assignment...');
        await page.goto('http://localhost:3000/characters');
        await page.waitForLoadState('networkidle');

        // Look for AI assignment status in the characters list
        const aiStatusElements = await page.locator('td:has-text("Count Orlok"), td:has-text("RoboChat"), td:has-text("Blackbeard")');
        const aiStatusCount = await aiStatusElements.count();

        if (aiStatusCount > 0) {
            console.log(`✅ AI assignments visible in character list (${aiStatusCount} AI instances found)`);
        } else {
            console.log('ℹ️ No AI assignments visible (may have been unassigned during test)');
        }

        console.log('\n🎯 Browser Button Testing Complete!');
        
    } catch (error) {
        console.error('❌ Error during testing:', error);
        await page.screenshot({ path: 'error-screenshot.png' });
    } finally {
        await browser.close();
    }
}

async function testAIAssignmentButtons(page) {
    console.log('\n🧪 Testing AI Assignment Page Buttons...');
    
    try {
        // Wait for the page to fully load
        await page.waitForSelector('table', { timeout: 10000 });
        
        // Look for assign buttons
        const assignButtons = await page.locator('button:has-text("Assign")');
        const assignButtonCount = await assignButtons.count();
        console.log(`📊 Found ${assignButtonCount} assign buttons`);
        
        if (assignButtonCount > 0) {
            console.log('🧪 Testing first assign button...');
            
            // Set up dialog handler for confirmation
            page.on('dialog', async dialog => {
                console.log(`📢 Dialog: ${dialog.message()}`);
                await dialog.accept();
            });
            
            // Click the first assign button
            await assignButtons.first().click();
            console.log('✅ Assign button clicked');
            
            // Wait for potential page reload or AJAX response
            await page.waitForTimeout(3000);
            
            // Check if page reloaded (indicating successful assignment)
            const newUrl = page.url();
            console.log(`📍 URL after assignment: ${newUrl}`);
            
            // Take screenshot after assignment
            await page.screenshot({ path: 'ai-after-assignment.png' });
        }
        
        // Look for unassign buttons
        const unassignButtons = await page.locator('button:has-text("Unassign")');
        const unassignButtonCount = await unassignButtons.count();
        console.log(`📊 Found ${unassignButtonCount} unassign buttons`);
        
        if (unassignButtonCount > 0) {
            console.log('🧪 Testing first unassign button...');
            await unassignButtons.first().click();
            console.log('✅ Unassign button clicked');
            await page.waitForTimeout(3000);
        }
        
        // Test other buttons
        const testButtons = await page.locator('button:has-text("Test")');
        const testButtonCount = await testButtons.count();
        console.log(`📊 Found ${testButtonCount} test buttons`);
        
        if (testButtonCount > 0) {
            console.log('🧪 Testing first test button...');
            await testButtons.first().click();
            console.log('✅ Test button clicked');
            await page.waitForTimeout(2000);
        }
        
    } catch (error) {
        console.error('❌ Error testing AI assignment buttons:', error);
    }
}

// Run the tests
testMonsterBoxButtons().catch(console.error);
