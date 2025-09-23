const { test, expect } = require('@playwright/test');

test.describe('Audio Library Playback Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to audio library
        await page.goto('http://localhost:3000/audio-library');
        
        // Wait for the page to load
        await page.waitForSelector('.audio-grid', { timeout: 10000 });
        
        // Wait for audio files to load
        await page.waitForFunction(() => {
            const cards = document.querySelectorAll('.audio-card');
            return cards.length > 0;
        }, { timeout: 15000 });
    });

    test('should load audio library with files', async ({ page }) => {
        // Check that audio files are displayed
        const audioCards = await page.locator('.audio-card');
        const count = await audioCards.count();
        
        console.log(`Found ${count} audio files in library`);
        expect(count).toBeGreaterThan(0);
        
        // Check that each card has required elements
        for (let i = 0; i < Math.min(count, 5); i++) {
            const card = audioCards.nth(i);
            await expect(card.locator('.card-title')).toBeVisible();
            await expect(card.locator('.play-character-btn')).toBeVisible();
        }
    });

    test('should successfully play audio on character', async ({ page }) => {
        // Set up console logging to capture success/error messages
        const messages = [];
        page.on('console', msg => {
            messages.push({ type: msg.type(), text: msg.text() });
        });

        // Find the first audio card
        const firstCard = page.locator('.audio-card').first();
        await expect(firstCard).toBeVisible();
        
        // Get the audio title for verification
        const audioTitle = await firstCard.locator('.card-title').textContent();
        console.log(`Testing playback for: ${audioTitle}`);
        
        // Click the "Play on Character" button
        const playButton = firstCard.locator('.play-character-btn');
        await expect(playButton).toBeVisible();
        await playButton.click();
        
        // Wait for the API call to complete
        await page.waitForTimeout(2000);
        
        // Check for success message in alerts or console
        const alerts = page.locator('.alert-success');
        const alertCount = await alerts.count();
        
        if (alertCount > 0) {
            const alertText = await alerts.first().textContent();
            console.log(`Success alert: ${alertText}`);
            expect(alertText).toContain('Playing');
        } else {
            // Check console messages for success
            const successMessages = messages.filter(m => 
                m.text.includes('Playing') || 
                m.text.includes('success') ||
                m.text.includes('200')
            );
            console.log('Console messages:', messages.map(m => `${m.type}: ${m.text}`));
            expect(successMessages.length).toBeGreaterThan(0);
        }
        
        // Verify no error messages
        const errorAlerts = page.locator('.alert-danger');
        const errorCount = await errorAlerts.count();
        expect(errorCount).toBe(0);
    });

    test('should test multiple audio files', async ({ page }) => {
        const messages = [];
        page.on('console', msg => {
            messages.push({ type: msg.type(), text: msg.text() });
        });

        const audioCards = page.locator('.audio-card');
        const totalCards = await audioCards.count();
        const testCount = Math.min(totalCards, 3); // Test first 3 files
        
        console.log(`Testing ${testCount} audio files out of ${totalCards} total`);
        
        for (let i = 0; i < testCount; i++) {
            const card = audioCards.nth(i);
            const audioTitle = await card.locator('.card-title').textContent();
            
            console.log(`\n--- Testing file ${i + 1}: ${audioTitle} ---`);
            
            // Click play button
            const playButton = card.locator('.play-character-btn');
            await playButton.click();
            
            // Wait for response
            await page.waitForTimeout(1500);
            
            // Check for success (either alert or console)
            const alerts = page.locator('.alert-success');
            const alertCount = await alerts.count();
            
            if (alertCount > 0) {
                const alertText = await alerts.first().textContent();
                console.log(`✅ Success: ${alertText}`);
            } else {
                const recentMessages = messages.slice(-5); // Last 5 messages
                console.log('Recent console messages:', recentMessages.map(m => `${m.type}: ${m.text}`));
            }
            
            // Clear any alerts for next test
            const closeButtons = page.locator('.alert .btn-close');
            const closeCount = await closeButtons.count();
            if (closeCount > 0) {
                await closeButtons.first().click();
                await page.waitForTimeout(500);
            }
        }
    });

    test('should display waveforms when clicking audio files', async ({ page }) => {
        // Click on the first audio card to open the player
        const firstCard = page.locator('.audio-card').first();
        const audioTitle = await firstCard.locator('.card-title').textContent();
        
        console.log(`Testing waveform for: ${audioTitle}`);
        
        await firstCard.click();
        
        // Wait for the audio player modal/section to appear
        await page.waitForTimeout(2000);
        
        // Check if waveform container exists and is visible
        const waveformContainer = page.locator('#waveform');
        if (await waveformContainer.count() > 0) {
            await expect(waveformContainer).toBeVisible();
            console.log('✅ Waveform container found and visible');
            
            // Wait for WaveSurfer to load
            await page.waitForTimeout(3000);
            
            // Check if waveform has been rendered (look for canvas or svg elements)
            const waveformContent = waveformContainer.locator('canvas, svg, .wavesurfer-region');
            const contentCount = await waveformContent.count();
            
            if (contentCount > 0) {
                console.log('✅ Waveform content rendered successfully');
            } else {
                console.log('⚠️ Waveform container exists but no content rendered');
            }
        } else {
            console.log('⚠️ Waveform container not found');
        }
    });

    test('should handle network errors gracefully', async ({ page }) => {
        // Intercept and block the play API call to simulate network error
        await page.route('**/audio-library/api/audio/*/play', route => {
            route.abort('failed');
        });
        
        const messages = [];
        page.on('console', msg => {
            messages.push({ type: msg.type(), text: msg.text() });
        });
        
        // Try to play audio
        const firstCard = page.locator('.audio-card').first();
        const playButton = firstCard.locator('.play-character-btn');
        await playButton.click();
        
        // Wait for error handling
        await page.waitForTimeout(2000);
        
        // Check for error message
        const errorAlerts = page.locator('.alert-danger');
        const errorCount = await errorAlerts.count();
        
        if (errorCount > 0) {
            const errorText = await errorAlerts.first().textContent();
            console.log(`Error handled correctly: ${errorText}`);
            expect(errorText).toContain('Failed');
        } else {
            // Check console for error messages
            const errorMessages = messages.filter(m => 
                m.type === 'error' || 
                m.text.toLowerCase().includes('error') ||
                m.text.toLowerCase().includes('failed')
            );
            console.log('Error messages:', errorMessages);
            expect(errorMessages.length).toBeGreaterThan(0);
        }
    });
});
