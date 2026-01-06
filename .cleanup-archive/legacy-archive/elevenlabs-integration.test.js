/**
 * ElevenLabs Conversational AI Integration Tests
 * Comprehensive testing for all updated AI management pages
 */

const { test, expect } = require('@playwright/test');

test.describe('ElevenLabs Conversational AI Integration', () => {
    
    test.beforeEach(async ({ page }) => {
        // Set up test environment
        await page.goto('/');
        
        // Wait for page to load
        await page.waitForLoadState('networkidle');
    });

    test.describe('AI Management Dashboard', () => {
        test('should display ElevenLabs dashboard with correct title', async ({ page }) => {
            await page.goto('/ai-management');
            
            // Check page title
            await expect(page).toHaveTitle(/ElevenLabs Conversational AI Dashboard/);
            
            // Check main heading
            await expect(page.locator('h1')).toContainText('ElevenLabs Conversational AI Dashboard');
            
            // Check breadcrumb
            await expect(page.locator('.breadcrumb-item.active')).toContainText('Conversational AI');
        });

        test('should show ElevenLabs service status', async ({ page }) => {
            await page.goto('/ai-management');
            
            // Check for ElevenLabs status indicators
            await expect(page.locator('.ai-system-card')).toContainText('ElevenLabs Conversational AI');
            await expect(page.locator('.ai-system-card')).toContainText('Voice Configuration');
            await expect(page.locator('.ai-system-card')).toContainText('Conversation Settings');
        });

        test('should have working test buttons', async ({ page }) => {
            await page.goto('/ai-management');
            
            // Test ElevenLabs connection button
            const testButton = page.locator('button:has-text("Test")').first();
            await testButton.click();
            
            // Should show modal or status update
            await expect(page.locator('.modal, .message')).toBeVisible({ timeout: 5000 });
        });

        test('should display updated navigation links', async ({ page }) => {
            await page.goto('/ai-management');
            
            // Check navigation section
            await expect(page.locator('.nav-section')).toContainText('Conversational AI');
            await expect(page.locator('a[href="/ai-management/agents"]')).toContainText('ElevenLabs Agents');
            await expect(page.locator('a[href="/ai-management/voices"]')).toContainText('Voice Configuration');
            await expect(page.locator('a[href="/ai-management/conversation"]')).toContainText('Conversation Settings');
        });
    });

    test.describe('Voice Activity Detection Configuration', () => {
        test('should display VAD configuration page', async ({ page }) => {
            await page.goto('/ai-management/stt');
            
            // Check page title
            await expect(page).toHaveTitle(/Voice Activity Detection Configuration/);
            
            // Check main heading
            await expect(page.locator('h2')).toContainText('ElevenLabs Voice Activity Detection');
            
            // Check for ElevenLabs-specific form fields
            await expect(page.locator('#vadType')).toBeVisible();
            await expect(page.locator('#vadThreshold')).toBeVisible();
            await expect(page.locator('#prefixPadding')).toBeVisible();
            await expect(page.locator('#silenceDuration')).toBeVisible();
        });

        test('should have working VAD configuration form', async ({ page }) => {
            await page.goto('/ai-management/stt');
            
            // Fill out VAD configuration
            await page.selectOption('#vadType', 'server_vad');
            await page.fill('#vadThreshold', '0.6');
            await page.fill('#prefixPadding', '400');
            await page.fill('#silenceDuration', '300');
            
            // Submit form
            await page.click('button[type="submit"]');
            
            // Should show success message
            await expect(page.locator('.message')).toContainText('configuration saved', { timeout: 5000 });
        });

        test('should have working test buttons', async ({ page }) => {
            await page.goto('/ai-management/stt');
            
            // Test ElevenLabs connection
            await page.click('button:has-text("Test ElevenLabs Connection")');
            await expect(page.locator('.message, .modal')).toBeVisible({ timeout: 5000 });
            
            // Test voice detection
            await page.click('button:has-text("Test Voice Detection")');
            await expect(page.locator('.message, .modal')).toBeVisible({ timeout: 5000 });
        });
    });

    test.describe('ElevenLabs Agents Management', () => {
        test('should display agents configuration page', async ({ page }) => {
            await page.goto('/ai-management/agents');
            
            // Check page title
            await expect(page).toHaveTitle(/ElevenLabs Agents Configuration/);
            
            // Check main heading
            await expect(page.locator('h1')).toContainText('ElevenLabs Agents Configuration');
            
            // Check for agents section
            await expect(page.locator('.config-section')).toContainText('ElevenLabs Agents');
        });

        test('should have Add Agent functionality', async ({ page }) => {
            await page.goto('/ai-management/agents');
            
            // Click Add Agent button
            await page.click('button:has-text("Add Agent")');
            
            // Should open modal
            await expect(page.locator('#personalityModal')).toBeVisible();
            await expect(page.locator('#modalTitle')).toContainText('Create New ElevenLabs Agent');
        });

        test('should load ElevenLabs voices in dropdowns', async ({ page }) => {
            await page.goto('/ai-management/agents');
            
            // Open Add Agent modal
            await page.click('button:has-text("Add Agent")');
            
            // Wait for voices to load
            await page.waitForTimeout(2000);
            
            // Check that voice dropdown has options
            const voiceOptions = await page.locator('#voiceId option').count();
            expect(voiceOptions).toBeGreaterThan(1); // Should have at least the placeholder + voices
        });
    });

    test.describe('ElevenLabs Voice Configuration', () => {
        test('should display voice configuration page', async ({ page }) => {
            await page.goto('/ai-management/voices');
            
            // Check page title
            await expect(page).toHaveTitle(/ElevenLabs Voice Configuration/);
            
            // Check main heading
            await expect(page.locator('h1')).toContainText('ElevenLabs Voice Configuration');
            
            // Check for ElevenLabs-specific settings
            await expect(page.locator('#defaultStability')).toBeVisible();
            await expect(page.locator('#defaultSimilarity')).toBeVisible();
            await expect(page.locator('#defaultStyle')).toBeVisible();
        });

        test('should have working voice settings form', async ({ page }) => {
            await page.goto('/ai-management/voices');
            
            // Adjust voice settings
            await page.fill('#defaultStability', '0.7');
            await page.fill('#defaultSimilarity', '0.8');
            await page.fill('#defaultStyle', '0.2');
            await page.selectOption('#outputFormat', 'mp3_44100_128');
            await page.selectOption('#modelId', 'eleven_multilingual_v2');
            
            // Save settings
            await page.click('button:has-text("Save Global Settings")');
            
            // Should show success message
            await expect(page.locator('.message')).toContainText('saved successfully', { timeout: 5000 });
        });

        test('should have working voice test functionality', async ({ page }) => {
            await page.goto('/ai-management/voices');
            
            // Test voice generation
            await page.fill('#testText', 'Hello, this is a test of ElevenLabs voice synthesis.');
            await page.click('button:has-text("Generate")');
            
            // Should show processing or result
            await expect(page.locator('.message, .modal')).toBeVisible({ timeout: 10000 });
        });
    });

    test.describe('Enhanced Test Chat Interface', () => {
        test('should display updated test chat interface', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Check for ElevenLabs integration
            await expect(page.locator('.subtitle')).toContainText('ElevenLabs Conversational AI Interface');
            
            // Check performance metrics labels
            await expect(page.locator('.metric-label')).toContainText('Voice Input');
            await expect(page.locator('.metric-label')).toContainText('Agent');
            await expect(page.locator('.metric-label')).toContainText('Voice Output');
        });

        test('should have working character selection', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Select a character
            const characterSelect = page.locator('#characterSelect');
            await characterSelect.selectOption({ index: 1 }); // Select first non-empty option
            
            // Should update assistant display
            await expect(page.locator('#assistantDisplay')).not.toHaveValue('');
        });

        test('should have working message input', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Select a character first
            await page.locator('#characterSelect').selectOption({ index: 1 });
            
            // Type a message
            await page.fill('#chatInput', 'Hello, this is a test message.');
            
            // Send message
            await page.click('#sendButton');
            
            // Should show message in chat
            await expect(page.locator('#chatMessages')).toContainText('Hello, this is a test message.');
        });
    });

    test.describe('Conversational AI Route Integration', () => {
        test('should access conversational AI interface', async ({ page }) => {
            await page.goto('/conversational-ai');
            
            // Check page loads correctly
            await expect(page).toHaveTitle(/Voice Chat - ElevenLabs Conversational AI/);
            
            // Check for character selection
            await expect(page.locator('#character-select')).toBeVisible();
            
            // Check for voice controls
            await expect(page.locator('#voice-btn')).toBeVisible();
        });

        test('should have working character switching', async ({ page }) => {
            await page.goto('/conversational-ai');
            
            // Wait for characters to load
            await page.waitForTimeout(2000);
            
            // Select a character
            const characterButtons = page.locator('.character-card');
            const firstCharacter = characterButtons.first();
            await firstCharacter.click();
            
            // Should show character as selected
            await expect(firstCharacter).toHaveClass(/selected|active/);
        });

        test('should preserve conversation starters', async ({ page }) => {
            await page.goto('/conversational-ai');
            
            // Select a character
            await page.locator('.character-card').first().click();
            
            // Wait for conversation starters to load
            await page.waitForTimeout(2000);
            
            // Should show conversation starters
            const starters = page.locator('#starters-container .starter-btn');
            const starterCount = await starters.count();
            expect(starterCount).toBeGreaterThan(0);
        });
    });

    test.describe('API Endpoint Integration', () => {
        test('should have working ElevenLabs status endpoint', async ({ page }) => {
            const response = await page.request.get('/ai-management/api/status');
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data).toHaveProperty('success');
            expect(data).toHaveProperty('status');
            expect(data.status).toHaveProperty('elevenlabs');
        });

        test('should have working ElevenLabs test endpoints', async ({ page }) => {
            // Test ElevenLabs connection
            const elevenLabsResponse = await page.request.post('/ai-management/api/test/elevenlabs');
            expect(elevenLabsResponse.ok()).toBeTruthy();
            
            // Test voices endpoint
            const voicesResponse = await page.request.post('/ai-management/api/test/voices');
            expect(voicesResponse.ok()).toBeTruthy();
            
            // Test conversation endpoint
            const conversationResponse = await page.request.post('/ai-management/api/test/conversation');
            expect(conversationResponse.ok()).toBeTruthy();
        });

        test('should have working ElevenLabs voices API', async ({ page }) => {
            const response = await page.request.get('/ai-management/api/elevenlabs/voices');
            expect(response.ok()).toBeTruthy();
            
            const data = await response.json();
            expect(data).toHaveProperty('success');
            if (data.success) {
                expect(data).toHaveProperty('voices');
                expect(Array.isArray(data.voices)).toBeTruthy();
            }
        });
    });

    test.describe('Backward Compatibility', () => {
        test('should redirect old ChatterPi routes', async ({ page }) => {
            // This test would check if old routes redirect properly
            // Implementation depends on whether redirects are set up
            const response = await page.request.get('/chatterpi');
            
            // Should either redirect or show the new interface
            expect(response.status()).toBeLessThan(500);
        });

        test('should preserve existing character data', async ({ page }) => {
            await page.goto('/conversational-ai');
            
            // Should load existing characters
            await page.waitForTimeout(2000);
            const characterCards = page.locator('.character-card');
            const characterCount = await characterCards.count();
            expect(characterCount).toBeGreaterThan(0);
        });
    });
});
