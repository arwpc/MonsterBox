/**
 * Character Setup - Comprehensive CRUD and AI Agent Assignment Test
 * Tests the unified Character Setup page with integrated agent assignment
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Character Setup - Page Load and UI', () => {
  
  test('Page loads with all elements', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    // Check title
    await expect(page.locator('h1')).toContainText('Setup Characters');
    
    // Check create button
    await expect(page.locator('#createCharBtn')).toBeVisible();
    await expect(page.locator('#createCharBtn')).toContainText('Create Character');
    
    // Check table container
    await expect(page.locator('#charactersContainer')).toBeVisible();
    
    console.log('✅ Page loaded with all elements');
  });

  test('Characters table displays correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    // Wait for characters to load
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    // Check for table or empty message
    const hasTable = await page.locator('table').count() > 0;
    const hasEmptyMessage = await page.locator('#charactersContainer').textContent();
    
    if (hasTable) {
      // Verify table headers
      await expect(page.locator('th')).toContainText('Avatar');
      await expect(page.locator('th')).toContainText('Name');
      await expect(page.locator('th')).toContainText('AI Agent');
      await expect(page.locator('th')).toContainText('Status');
      await expect(page.locator('th')).toContainText('Actions');
      console.log('✅ Table displayed with headers');
    } else {
      expect(hasEmptyMessage).toContain('No characters');
      console.log('✅ Empty state displayed');
    }
  });

});

test.describe('Character Setup - Create Character', () => {
  
  test('Create character modal opens', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    // Click create button
    await page.click('#createCharBtn');
    
    // Wait for modal
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Check modal title
    await expect(page.locator('#characterModalLabel')).toContainText('Create Character');
    
    // Check form fields
    await expect(page.locator('#characterName')).toBeVisible();
    await expect(page.locator('#characterAgent')).toBeVisible();
    
    // Check buttons
    await expect(page.locator('#saveCharacterBtn')).toBeVisible();
    await expect(page.locator('#testAgentBtn')).toBeVisible();
    
    console.log('✅ Create modal opened with all fields');
  });

  test('Agent dropdown populates', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Check agent dropdown has options
    const agentOptions = await page.locator('#characterAgent option').count();
    expect(agentOptions).toBeGreaterThan(0);
    
    // First option should be "No agent assigned"
    const firstOption = await page.locator('#characterAgent option').first().textContent();
    expect(firstOption).toContain('No agent');
    
    console.log(`✅ Agent dropdown has ${agentOptions} options`);
  });

  test('Create character without agent', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Fill in name only
    const testName = `TestChar_${Date.now()}`;
    await page.fill('#characterName', testName);
    
    // Save
    await page.click('#saveCharacterBtn');
    
    // Wait for modal to close
    await page.waitForSelector('#characterModal', { state: 'hidden', timeout: 5000 });
    
    // Wait for table to update
    await page.waitForTimeout(1000);
    
    // Verify character appears in table
    await expect(page.locator('table')).toContainText(testName);
    
    // Verify "No Agent" badge
    const row = page.locator('tr').filter({ hasText: testName });
    await expect(row).toContainText('No Agent');
    
    console.log(`✅ Created character "${testName}" without agent`);
  });

  test('Create character with agent', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Fill in name
    const testName = `TestCharWithAgent_${Date.now()}`;
    await page.fill('#characterName', testName);
    
    // Select an agent (second option, first is "No agent")
    const agentOptions = await page.locator('#characterAgent option').all();
    if (agentOptions.length > 1) {
      const agentValue = await agentOptions[1].getAttribute('value');
      await page.selectOption('#characterAgent', agentValue);
      
      // Verify test button is enabled
      await expect(page.locator('#testAgentBtn')).toBeEnabled();
      
      // Verify status alert appears
      await expect(page.locator('#agentStatusAlert')).toBeVisible();
      
      // Save
      await page.click('#saveCharacterBtn');
      
      // Wait for modal to close
      await page.waitForSelector('#characterModal', { state: 'hidden', timeout: 5000 });
      
      // Wait for table to update
      await page.waitForTimeout(1000);
      
      // Verify character appears with "Agent Assigned" badge
      const row = page.locator('tr').filter({ hasText: testName });
      await expect(row).toContainText('Agent Assigned');
      
      console.log(`✅ Created character "${testName}" with agent`);
    } else {
      console.log('⚠️ No agents available to test with');
    }
  });

});

test.describe('Character Setup - Edit Character', () => {
  
  test('Edit modal opens with character data', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    // Wait for characters to load
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    // Find first edit button
    const editBtn = page.locator('button[onclick*="edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      
      // Wait for modal
      await page.waitForSelector('#characterModal.show', { timeout: 5000 });
      
      // Check modal title
      await expect(page.locator('#characterModalLabel')).toContainText('Edit Character');
      
      // Check name field is populated
      const nameValue = await page.locator('#characterName').inputValue();
      expect(nameValue).not.toBe('');
      
      console.log(`✅ Edit modal opened for character: ${nameValue}`);
    } else {
      console.log('⚠️ No characters to edit');
    }
  });

  test('Update character name', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    const editBtn = page.locator('button[onclick*="edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForSelector('#characterModal.show', { timeout: 5000 });
      
      // Get original name
      const originalName = await page.locator('#characterName').inputValue();
      
      // Update name
      const newName = `${originalName}_Updated`;
      await page.fill('#characterName', newName);
      
      // Save
      await page.click('#saveCharacterBtn');
      
      // Wait for modal to close
      await page.waitForSelector('#characterModal', { state: 'hidden', timeout: 5000 });
      
      // Wait for table to update
      await page.waitForTimeout(1000);
      
      // Verify new name appears
      await expect(page.locator('table')).toContainText(newName);
      
      console.log(`✅ Updated character name to "${newName}"`);
    } else {
      console.log('⚠️ No characters to edit');
    }
  });

  test('Assign agent to existing character', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    const editBtn = page.locator('button[onclick*="edit"]').first();
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await page.waitForSelector('#characterModal.show', { timeout: 5000 });
      
      // Select an agent
      const agentOptions = await page.locator('#characterAgent option').all();
      if (agentOptions.length > 1) {
        const agentValue = await agentOptions[1].getAttribute('value');
        await page.selectOption('#characterAgent', agentValue);
        
        // Verify test button enabled
        await expect(page.locator('#testAgentBtn')).toBeEnabled();
        
        // Save
        await page.click('#saveCharacterBtn');
        
        // Wait for modal to close
        await page.waitForSelector('#characterModal', { state: 'hidden', timeout: 5000 });
        
        // Wait for success message
        await page.waitForTimeout(1000);
        
        console.log('✅ Assigned agent to character');
      } else {
        console.log('⚠️ No agents available');
      }
    } else {
      console.log('⚠️ No characters to edit');
    }
  });

});

test.describe('Character Setup - Test Agent', () => {
  
  test('Test agent button disabled when no agent selected', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Test button should be disabled initially
    await expect(page.locator('#testAgentBtn')).toBeDisabled();
    
    console.log('✅ Test button disabled when no agent');
  });

  test('Test agent button enabled when agent selected', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Select an agent
    const agentOptions = await page.locator('#characterAgent option').all();
    if (agentOptions.length > 1) {
      const agentValue = await agentOptions[1].getAttribute('value');
      await page.selectOption('#characterAgent', agentValue);
      
      // Test button should be enabled
      await expect(page.locator('#testAgentBtn')).toBeEnabled();
      
      console.log('✅ Test button enabled when agent selected');
    } else {
      console.log('⚠️ No agents available');
    }
  });

  test('Test agent modal opens', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    await page.click('#createCharBtn');
    await page.waitForSelector('#characterModal.show', { timeout: 5000 });
    
    // Select an agent
    const agentOptions = await page.locator('#characterAgent option').all();
    if (agentOptions.length > 1) {
      const agentValue = await agentOptions[1].getAttribute('value');
      await page.selectOption('#characterAgent', agentValue);
      
      // Click test button
      await page.click('#testAgentBtn');
      
      // Wait for test modal
      await page.waitForSelector('#testAgentModal.show', { timeout: 5000 });
      
      // Check modal content
      await expect(page.locator('#testAgentModalLabel')).toContainText('Test AI Agent');
      await expect(page.locator('#testMessage')).toBeVisible();
      await expect(page.locator('#sendTestMessageBtn')).toBeVisible();
      
      console.log('✅ Test agent modal opened');
    } else {
      console.log('⚠️ No agents available');
    }
  });

});

test.describe('Character Setup - Delete Character', () => {
  
  test('Delete character with confirmation', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    // Count characters before delete
    const rowsBefore = await page.locator('tbody tr').count();
    
    if (rowsBefore > 0) {
      // Get name of first character
      const firstRowName = await page.locator('tbody tr').first().locator('td').nth(2).textContent();
      
      // Set up dialog handler
      page.on('dialog', dialog => dialog.accept());
      
      // Click delete button
      await page.locator('button[onclick*="remove"]').first().click();
      
      // Wait for table to update
      await page.waitForTimeout(1000);
      
      // Verify character is gone
      const rowsAfter = await page.locator('tbody tr').count();
      expect(rowsAfter).toBe(rowsBefore - 1);
      
      console.log(`✅ Deleted character "${firstRowName}"`);
    } else {
      console.log('⚠️ No characters to delete');
    }
  });

});

test.describe('Character Setup - Select Current Character', () => {
  
  test('Select character as current', async ({ page }) => {
    await page.goto(`${BASE_URL}/setup/characters`);
    
    await page.waitForFunction(() => {
      const container = document.getElementById('charactersContainer');
      return container && !container.textContent.includes('Loading');
    }, { timeout: 10000 });
    
    const selectBtn = page.locator('button[onclick*="select"]').first();
    if (await selectBtn.count() > 0) {
      await selectBtn.click();
      
      // Wait for update
      await page.waitForTimeout(1000);
      
      // Verify "Current" badge appears
      await expect(page.locator('.badge.bg-success')).toContainText('Current');
      
      console.log('✅ Selected character as current');
    } else {
      console.log('⚠️ No characters to select');
    }
  });

});

