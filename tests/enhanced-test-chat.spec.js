/**
 * Enhanced Test Chat Comprehensive Test Suite
 * Tests for ElevenLabs Conversational AI integration and Enhanced Chat functionality
 */

const { test, expect } = require('@playwright/test');

test.describe('Enhanced Test Chat - Comprehensive Test Suite', () => {
    test.beforeEach(async ({ page }) => {
        // Set up console logging for debugging
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log(`❌ Console Error: ${msg.text()}`);
            }
        });
        
        // Set up network monitoring
        page.on('response', response => {
            if (!response.ok() && response.url().includes('/api/')) {
                console.log(`❌ API Error: ${response.status()} ${response.url()}`);
            }
        });
    });

    test.describe('Page Loading and Basic Structure', () => {
        test('should load Enhanced Test Chat page successfully', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Check page title
            await expect(page).toHaveTitle(/Enhanced Test Chat/);
            
            // Check main container
            await expect(page.locator('.enhanced-test-chat')).toBeVisible();
            
            // Check subtitle
            await expect(page.locator('.subtitle')).toContainText('ElevenLabs Conversational AI Interface');
        });

        test('should display all essential UI elements', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Character selection
            await expect(page.locator('#characterSelect')).toBeVisible();
            await expect(page.locator('#assistantDisplay')).toBeVisible();
            
            // Voice controls
            await expect(page.locator('#elevenLabsToggle')).toBeVisible();
            await expect(page.locator('#ttsToggle')).toBeVisible();
            await expect(page.locator('#liveModeToggle')).toBeVisible();
            
            // Chat interface
            await expect(page.locator('#chatMessages')).toBeVisible();
            await expect(page.locator('#chatInput')).toBeVisible();
            await expect(page.locator('#sendButton')).toBeVisible();
            
            // Performance metrics
            await expect(page.locator('#voiceInputTime')).toBeVisible();
            await expect(page.locator('#agentTime')).toBeVisible();
            await expect(page.locator('#voiceOutputTime')).toBeVisible();
            
            // Connection status
            await expect(page.locator('.connection-status')).toBeVisible();
        });

        test('should display performance metrics with correct labels', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Check performance metric labels
            await expect(page.locator('.metric-label')).toContainText('Voice Input');
            await expect(page.locator('.metric-label')).toContainText('Agent');
            await expect(page.locator('.metric-label')).toContainText('Voice Output');
            
            // Check initial metric values
            await expect(page.locator('#voiceInputTime')).toContainText('0ms');
            await expect(page.locator('#agentTime')).toContainText('0ms');
            await expect(page.locator('#voiceOutputTime')).toContainText('0ms');
        });
    });

    test.describe('Character Selection Functionality', () => {
        test('should populate character dropdown with available characters', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Wait for characters to load
            await page.waitForTimeout(1000);
            
            // Check that character select has options
            const options = await page.locator('#characterSelect option').count();
            expect(options).toBeGreaterThan(1); // Should have at least default + one character
            
            // Check for default option
            await expect(page.locator('#characterSelect option[value=""]')).toContainText('Select a character...');
        });

        test('should update assistant display when character is selected', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Initially should be empty or placeholder
            const initialValue = await page.locator('#assistantDisplay').inputValue();
            expect(initialValue === '' || initialValue.includes('Select character')).toBe(true);
            
            // Select a character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            
            // Wait for update
            await page.waitForTimeout(1000);
            
            // Should update assistant display
            const updatedValue = await page.locator('#assistantDisplay').inputValue();
            expect(updatedValue).not.toBe(initialValue);
            expect(updatedValue.length).toBeGreaterThan(0);
        });

        test('should enable send button when character is selected and message is typed', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Initially send button should be disabled
            await expect(page.locator('#sendButton')).toBeDisabled();
            
            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(500);
            
            // Still disabled without message
            await expect(page.locator('#sendButton')).toBeDisabled();
            
            // Type message
            await page.fill('#chatInput', 'Hello test');
            
            // Now should be enabled
            await expect(page.locator('#sendButton')).toBeEnabled();
        });

        test('should show character-specific information in chat', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Select a character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            
            // Wait for character loading
            await page.waitForTimeout(2000);
            
            // Should show some character-related message in chat
            const chatContent = await page.locator('#chatMessages').textContent();
            expect(chatContent.length).toBeGreaterThan(0);
        });
    });

    test.describe('Voice Control Button Functionality', () => {
        test('should toggle ElevenLabs button state', async ({ page }) => {
            await page.goto('/test-chat');
            
            const elevenLabsToggle = page.locator('#elevenLabsToggle');
            
            // Check initial state
            const initialClass = await elevenLabsToggle.getAttribute('class');
            
            // Click toggle
            await elevenLabsToggle.click();
            await page.waitForTimeout(500);
            
            // Should change state
            const newClass = await elevenLabsToggle.getAttribute('class');
            expect(newClass).not.toBe(initialClass);
        });

        test('should toggle TTS button state', async ({ page }) => {
            await page.goto('/test-chat');
            
            const ttsToggle = page.locator('#ttsToggle');
            
            // Check initial state
            const initialClass = await ttsToggle.getAttribute('class');
            
            // Click toggle
            await ttsToggle.click();
            await page.waitForTimeout(500);
            
            // Should change state
            const newClass = await ttsToggle.getAttribute('class');
            expect(newClass).not.toBe(initialClass);
        });

        test('should toggle Live Mode button state', async ({ page }) => {
            await page.goto('/test-chat');
            
            const liveModeToggle = page.locator('#liveModeToggle');
            
            // Check initial state
            const initialClass = await liveModeToggle.getAttribute('class');
            
            // Click toggle
            await liveModeToggle.click();
            await page.waitForTimeout(500);
            
            // Should change state
            const newClass = await liveModeToggle.getAttribute('class');
            expect(newClass).not.toBe(initialClass);
        });

        test('should update connection status when toggling voice controls', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Monitor connection status changes
            const connectionStatus = page.locator('.connection-status');
            
            // Toggle ElevenLabs
            await page.click('#elevenLabsToggle');
            await page.waitForTimeout(1000);
            
            // Should show some status update
            const statusText = await connectionStatus.textContent();
            expect(statusText.length).toBeGreaterThan(0);
        });
    });

    test.describe('Text Chat Functionality', () => {
        test('should send and display user messages', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);
            
            // Type and send message
            const testMessage = 'Hello, this is a test message for the chat interface.';
            await page.fill('#chatInput', testMessage);
            await page.click('#sendButton');
            
            // Should display the message in chat
            await expect(page.locator('#chatMessages')).toContainText(testMessage);
            
            // Input should be cleared
            await expect(page.locator('#chatInput')).toHaveValue('');
        });

        test('should handle Enter key for sending messages', async ({ page }) => {
            await page.goto('/test-chat');
            
            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);
            
            // Type message and press Enter
            const testMessage = 'Testing Enter key functionality';
            await page.fill('#chatInput', testMessage);
            await page.press('#chatInput', 'Enter');
            
            // Should send the message
            await expect(page.locator('#chatMessages')).toContainText(testMessage);
        });

        test('should prevent sending empty messages', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            // Try to send empty message
            await page.click('#sendButton');

            // Should not add empty message to chat
            const messages = await page.locator('#chatMessages .message').count();
            expect(messages).toBeLessThanOrEqual(1); // Only system/greeting messages
        });

        test('should receive AI responses to user messages', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(2000);

            // Send a message
            await page.fill('#chatInput', 'Hello, how are you today?');
            await page.click('#sendButton');

            // Wait for AI response (extended timeout for AI processing)
            await page.waitForTimeout(15000);

            // Should have multiple messages (user + AI response)
            const messages = await page.locator('#chatMessages .message').count();
            expect(messages).toBeGreaterThanOrEqual(2);

            // Should have both user and bot messages
            await expect(page.locator('#chatMessages .message.user')).toBeVisible();
            await expect(page.locator('#chatMessages .message.bot')).toBeVisible();
        });
    });

    test.describe('WebSocket Connection Management', () => {
        test('should establish WebSocket connection to ElevenLabs service', async ({ page }) => {
            await page.goto('/test-chat');

            // Wait for WebSocket connection
            await page.waitForTimeout(3000);

            // Check connection status
            const connectionStatus = await page.locator('.connection-status').textContent();
            expect(connectionStatus).toContain('Connected');
        });

        test('should handle WebSocket connection errors gracefully', async ({ page }) => {
            await page.goto('/test-chat');

            // Monitor console for WebSocket errors
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error' && msg.text().includes('WebSocket')) {
                    errors.push(msg.text());
                }
            });

            // Wait for connection attempts
            await page.waitForTimeout(5000);

            // Should handle errors without crashing
            const criticalErrors = errors.filter(error =>
                error.includes('TypeError') || error.includes('ReferenceError')
            );
            expect(criticalErrors.length).toBe(0);
        });
    });

    test.describe('Live Voice Conversation Flow', () => {
        test('should request microphone permissions when Live Mode is activated', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character first
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            // Grant microphone permissions
            await page.context().grantPermissions(['microphone']);

            // Activate Live Mode
            await page.click('#liveModeToggle');

            // Should show Live Mode status
            await page.waitForTimeout(2000);
            const statusText = await page.locator('.connection-status').textContent();
            expect(statusText.toLowerCase()).toContain('live');
        });

        test('should handle microphone permission denial gracefully', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character first
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            // Try to activate Live Mode without permissions
            await page.click('#liveModeToggle');

            // Should handle gracefully and show appropriate message
            await page.waitForTimeout(2000);
            // The interface should still be functional
            await expect(page.locator('#chatInput')).toBeVisible();
        });
    });

    test.describe('Performance Metrics Tracking', () => {
        test('should update performance metrics during interactions', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            // Send a message
            await page.fill('#chatInput', 'Test message for metrics');
            await page.click('#sendButton');

            // Wait for processing
            await page.waitForTimeout(5000);

            // Check if any metrics were updated
            const agentTime = await page.locator('#agentTime').textContent();
            expect(agentTime).not.toBe('0ms');
        });

        test('should display metrics in correct format', async ({ page }) => {
            await page.goto('/test-chat');

            // All metrics should show "0ms" initially
            await expect(page.locator('#voiceInputTime')).toContainText('ms');
            await expect(page.locator('#agentTime')).toContainText('ms');
            await expect(page.locator('#voiceOutputTime')).toContainText('ms');
        });
    });

    test.describe('Error Handling and Edge Cases', () => {
        test('should handle API errors gracefully', async ({ page }) => {
            await page.goto('/test-chat');

            // Monitor for unhandled errors
            const errors = [];
            page.on('console', msg => {
                if (msg.type() === 'error') {
                    errors.push(msg.text());
                }
            });

            // Try various interactions
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            await page.fill('#chatInput', 'Test message');
            await page.click('#sendButton');
            await page.waitForTimeout(3000);

            // Should not have critical JavaScript errors
            const criticalErrors = errors.filter(error =>
                error.includes('TypeError') ||
                error.includes('ReferenceError') ||
                error.includes('SyntaxError')
            );
            expect(criticalErrors.length).toBe(0);
        });

        test('should maintain functionality after network interruptions', async ({ page }) => {
            await page.goto('/test-chat');

            // Select character
            await page.locator('#characterSelect').selectOption({ index: 1 });
            await page.waitForTimeout(1000);

            // Simulate network interruption by going offline
            await page.context().setOffline(true);
            await page.waitForTimeout(1000);

            // Go back online
            await page.context().setOffline(false);
            await page.waitForTimeout(2000);

            // Should still be able to interact
            await page.fill('#chatInput', 'Test after reconnection');
            await expect(page.locator('#sendButton')).toBeEnabled();
        });
    });

    test.describe('Responsive Design and Accessibility', () => {
        test('should work on mobile viewport', async ({ page }) => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/test-chat');

            // Should still display main elements
            await expect(page.locator('#characterSelect')).toBeVisible();
            await expect(page.locator('#chatInput')).toBeVisible();
            await expect(page.locator('#sendButton')).toBeVisible();

            // Voice controls should be accessible
            await expect(page.locator('#elevenLabsToggle')).toBeVisible();
        });

        test('should work on tablet viewport', async ({ page }) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            await page.goto('/test-chat');

            // Should display all controls
            await expect(page.locator('#elevenLabsToggle')).toBeVisible();
            await expect(page.locator('#ttsToggle')).toBeVisible();
            await expect(page.locator('#liveModeToggle')).toBeVisible();

            // Performance metrics should be visible
            await expect(page.locator('#voiceInputTime')).toBeVisible();
            await expect(page.locator('#agentTime')).toBeVisible();
            await expect(page.locator('#voiceOutputTime')).toBeVisible();
        });

        test('should have proper keyboard navigation', async ({ page }) => {
            await page.goto('/test-chat');

            // Tab through interactive elements
            await page.keyboard.press('Tab'); // Character select
            await page.keyboard.press('Tab'); // ElevenLabs toggle
            await page.keyboard.press('Tab'); // TTS toggle
            await page.keyboard.press('Tab'); // Live Mode toggle
            await page.keyboard.press('Tab'); // Chat input
            await page.keyboard.press('Tab'); // Send button

            // Should be able to focus on send button
            const focusedElement = await page.evaluate(() => document.activeElement.id);
            expect(focusedElement).toBe('sendButton');
        });
    });
});
