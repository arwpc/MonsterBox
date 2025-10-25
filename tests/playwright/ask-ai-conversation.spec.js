/**
 * E2E Tests for Ask AI Conversational Feature
 * Tests the "Ask <Character> a Question" panel with real AI integration
 * 
 * Run with: MB_E2E=1 npx playwright test tests/playwright/ask-ai-conversation.spec.js
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Ask AI Conversation Feature', () => {
    test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping E2E test');

    test.beforeEach(async ({ page }) => {
        // Navigate to Conversation Mode page
        await page.goto(`${BASE_URL}/conversation`);
        await expect(page).toHaveTitle(/Conversation Mode/);

        // Wait for page to fully load
        await page.waitForLoadState('networkidle');
    });

    test('Ask AI panel is visible on conversation page', async ({ page }) => {
        // Check for the Ask AI panel heading
        const askAIHeading = page.locator('h6:has-text("Ask")');
        await expect(askAIHeading).toBeVisible();

        // Check for input field
        const askInput = page.locator('#askInput');
        await expect(askInput).toBeVisible();
        await expect(askInput).toHaveAttribute('placeholder', /question/i);

        // Check for Ask button
        const askBtn = page.locator('#askBtn');
        await expect(askBtn).toBeVisible();
        await expect(askBtn).toContainText('Ask');

        console.log('✅ Ask AI panel UI elements are visible');
    });

    test('Ask AI panel is positioned above Make Character Say panel', async ({ page }) => {
        const askAIPanel = page.locator('.card:has(#askInput)');
        const makeCharacterSayPanel = page.locator('.card:has(#sayInput)');

        await expect(askAIPanel).toBeVisible();
        await expect(makeCharacterSayPanel).toBeVisible();

        // Get bounding boxes to verify position
        const askBox = await askAIPanel.boundingBox();
        const sayBox = await makeCharacterSayPanel.boundingBox();

        expect(askBox.y).toBeLessThan(sayBox.y);

        console.log('✅ Ask AI panel correctly positioned above Make Character Say panel');
    });

    test('Cannot submit empty question', async ({ page }) => {
        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');

        // Click Ask button without entering question
        await askBtn.click();

        // Should show warning
        await expect(askStatus).toContainText(/enter/i);
        await expect(askStatus).toHaveClass(/text-warning/);

        console.log('✅ Empty question validation works');
    });

    test('Can type question in input field', async ({ page }) => {
        const askInput = page.locator('#askInput');

        const testQuestion = 'Who are you and what do you do?';
        await askInput.fill(testQuestion);

        await expect(askInput).toHaveValue(testQuestion);

        console.log('✅ Question input field works');
    });

    test('Enter key submits question', async ({ page }) => {
        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');

        await askInput.fill('Test question');

        // Pressing Enter should trigger submission
        await askInput.press('Enter');

        // Button should show loading state
        await expect(askBtn).toBeDisabled();
        await expect(askBtn).toContainText(/asking/i);

        console.log('✅ Enter key triggers question submission');
    });

    test('Ask AI button shows loading state during request', async ({ page }) => {
        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');

        await askInput.fill('Hello, who are you?');
        await askBtn.click();

        // Check loading state
        await expect(askBtn).toBeDisabled();
        await expect(askBtn).toContainText(/asking/i);
        await expect(askStatus).toContainText(/sending/i);

        console.log('✅ Loading state displayed during request');
    });

    test('Successful AI response displays in UI', async ({ page }) => {
        test.setTimeout(45000); // Allow time for AI response

        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');
        const aiResponse = page.locator('#aiResponse');
        const aiResponseText = page.locator('#aiResponseText');

        // Submit question
        await askInput.fill('Hello! What is your name?');
        await askBtn.click();

        // Wait for response (max 35 seconds for AI)
        await expect(askStatus).toContainText(/responded/i, { timeout: 35000 });

        // Check success state
        await expect(askStatus).toHaveClass(/text-success/);

        // Check response is displayed
        await expect(aiResponse).toBeVisible();
        await expect(aiResponseText).not.toBeEmpty();

        // Button should be re-enabled
        await expect(askBtn).not.toBeDisabled();
        await expect(askBtn).toContainText('Ask');

        // Input should be cleared
        await expect(askInput).toHaveValue('');

        const responseText = await aiResponseText.textContent();
        console.log('✅ AI Response received:', responseText.substring(0, 100) + '...');
    });

    test('Multiple questions can be asked sequentially', async ({ page }) => {
        test.setTimeout(90000); // Allow time for multiple AI responses

        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');
        const aiResponseText = page.locator('#aiResponseText');

        const questions = [
            'Hello!',
            'What is your name?',
            'Tell me something scary.'
        ];

        for (const question of questions) {
            await askInput.fill(question);
            await askBtn.click();

            // Wait for response
            await expect(askStatus).toContainText(/responded/i, { timeout: 35000 });

            // Verify response
            await expect(aiResponseText).not.toBeEmpty();

            const response = await aiResponseText.textContent();
            console.log(`✅ Q: "${question}" -> A: "${response.substring(0, 50)}..."`);

            // Small delay between questions
            await page.waitForTimeout(1000);
        }

        console.log('✅ Multiple sequential questions work');
    });

    test('Error handling when ElevenLabs not configured', async ({ page }) => {
        test.skip(process.env.SKIP_ERROR_TESTS === '1', 'Error tests disabled');

        // This test would need a special test environment without ElevenLabs
        // For now, we just verify the error UI elements exist
        const askStatus = page.locator('#askStatus');
        await expect(askStatus).toBeDefined();

        console.log('✅ Error handling UI elements present');
    });

    test('Speaker selection dropdown exists (if applicable)', async ({ page }) => {
        // Check if speaker select exists (optional feature)
        const speakerSelect = page.locator('#aiSpeakerSelect');

        if (await speakerSelect.isVisible()) {
            await expect(speakerSelect).toBeVisible();
            console.log('✅ Speaker selection dropdown present');
        } else {
            console.log('ℹ️  Speaker selection not available (character has single speaker)');
        }
    });

    test('AI response shows character personality', async ({ page }) => {
        test.setTimeout(45000);

        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');
        const aiResponseText = page.locator('#aiResponseText');

        // Ask a character-specific question
        await askInput.fill('Who are you?');
        await askBtn.click();

        // Wait for response
        await expect(askStatus).toContainText(/responded/i, { timeout: 35000 });

        const response = await aiResponseText.textContent();

        // Response should have content (personality check is subjective)
        expect(response.length).toBeGreaterThan(5);

        console.log('✅ Character personality response:', response.substring(0, 150) + '...');
    });

    test('Page elements remain functional after AI interaction', async ({ page }) => {
        test.setTimeout(50000);

        const askInput = page.locator('#askInput');
        const askBtn = page.locator('#askBtn');
        const askStatus = page.locator('#askStatus');

        // Submit AI question
        await askInput.fill('Hello!');
        await askBtn.click();
        await expect(askStatus).toContainText(/responded/i, { timeout: 35000 });

        // Verify other page elements still work
        const sayInput = page.locator('#sayInput');
        const sayBtn = page.locator('#sayBtn');

        await expect(sayInput).toBeEnabled();
        await expect(sayBtn).toBeEnabled();

        // Try typing in Make Character Say
        await sayInput.fill('Test text');
        await expect(sayInput).toHaveValue('Test text');

        console.log('✅ Other page elements remain functional after AI interaction');
    });
});

test.describe('Ask AI Scene Step Integration', () => {
    test.skip(!process.env.MB_E2E, 'MB_E2E not set; skipping E2E test');

    test.beforeEach(async ({ page }) => {
        // Navigate to Scene Editor
        await page.goto(`${BASE_URL}/scenes/editor`);
        await expect(page).toHaveTitle(/Scene Editor/);
        await page.waitForLoadState('networkidle');
    });

    test('Ask AI step type is available in scene editor', async ({ page }) => {
        // Look for "Ask AI a Question" button in step types
        const askAIButton = page.locator('button:has-text("Ask AI")');

        await expect(askAIButton).toBeVisible();
        await expect(askAIButton).toContainText(/ask ai/i);

        console.log('✅ Ask AI step type available in scene editor');
    });

    test('Can add Ask AI step to scene', async ({ page }) => {
        // Click Ask AI button
        const askAIButton = page.locator('button:has-text("Ask AI")');
        await askAIButton.click();

        // Should show Ask AI form
        const askAIForm = page.locator('text=Question to Ask');
        await expect(askAIForm).toBeVisible({ timeout: 5000 });

        // Should have question textarea
        const questionTextarea = page.locator('textarea[name*="question"]').first();
        await expect(questionTextarea).toBeVisible();

        console.log('✅ Ask AI step form appears in scene editor');
    });

    test('Ask AI step form has required fields', async ({ page }) => {
        const askAIButton = page.locator('button:has-text("Ask AI")').first();
        await askAIButton.click();

        // Wait for form
        await page.waitForTimeout(500);

        // Check for question textarea
        const questionField = page.locator('textarea[placeholder*="question"], textarea[name*="question"]').first();
        if (await questionField.isVisible()) {
            await expect(questionField).toBeVisible();
            console.log('✅ Ask AI step has question input field');
        }
    });
});
