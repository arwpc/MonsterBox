/**
 * Port Management Interface Tests
 * 
 * Comprehensive tests for the port management configuration interface
 */

const { test, expect } = require('@playwright/test');

test.describe('Port Management Interface', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the port management page
        await page.goto('/system-config/port-management');
        
        // Wait for the page to load
        await page.waitForLoadState('networkidle');
    });
    
    test('should load port management page successfully', async ({ page }) => {
        // Check page title
        await expect(page).toHaveTitle(/Port Management System/);
        
        // Check main heading
        await expect(page.locator('h1, .page-title')).toContainText('Port Management System');
        
        // Check that main tabs are present
        await expect(page.locator('#portManagementTabs')).toBeVisible();
        await expect(page.locator('#services-tab')).toBeVisible();
        await expect(page.locator('#ports-tab')).toBeVisible();
        await expect(page.locator('#monitoring-tab')).toBeVisible();
        await expect(page.locator('#configuration-tab')).toBeVisible();
        await expect(page.locator('#diagnostics-tab')).toBeVisible();
        await expect(page.locator('#api-tab')).toBeVisible();
    });
    
    test('should display system status overview', async ({ page }) => {
        // Check system status card
        await expect(page.locator('.card-header')).toContainText('System Status');
        
        // Check status metrics
        await expect(page.locator('#totalServices')).toBeVisible();
        await expect(page.locator('#runningServices')).toBeVisible();
        await expect(page.locator('#allocatedPorts')).toBeVisible();
        await expect(page.locator('#activeConnections')).toBeVisible();
        
        // Check refresh button
        await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
    });
    
    test('should display services tab content', async ({ page }) => {
        // Services tab should be active by default
        await expect(page.locator('#services-tab')).toHaveClass(/active/);
        
        // Check service management controls
        await expect(page.locator('button:has-text("Start All")')).toBeVisible();
        await expect(page.locator('button:has-text("Stop All")')).toBeVisible();
        await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
        
        // Check service filters
        await expect(page.locator('#serviceTypeFilter')).toBeVisible();
        await expect(page.locator('#serviceStatusFilter')).toBeVisible();
        await expect(page.locator('#serviceSearchFilter')).toBeVisible();
        
        // Check services table
        await expect(page.locator('#servicesTable')).toBeVisible();
        await expect(page.locator('#servicesTableBody')).toBeVisible();
    });
    
    test('should navigate between tabs correctly', async ({ page }) => {
        // Test Port Allocation tab
        await page.click('#ports-tab');
        await expect(page.locator('#ports')).toHaveClass(/active/);
        await expect(page.locator('#portRangeChart')).toBeVisible();
        await expect(page.locator('#portTypeChart')).toBeVisible();
        
        // Test Monitoring tab
        await page.click('#monitoring-tab');
        await expect(page.locator('#monitoring')).toHaveClass(/active/);
        await expect(page.locator('#healthStatusChart')).toBeVisible();
        await expect(page.locator('#connectionStatsChart')).toBeVisible();
        
        // Test Configuration tab
        await page.click('#configuration-tab');
        await expect(page.locator('#configuration')).toHaveClass(/active/);
        await expect(page.locator('#environmentConfigForm')).toBeVisible();
        await expect(page.locator('#servicePriorities')).toBeVisible();
        
        // Test Diagnostics tab
        await page.click('#diagnostics-tab');
        await expect(page.locator('#diagnostics')).toHaveClass(/active/);
        await expect(page.locator('button:has-text("Run Full Validation")')).toBeVisible();
        await expect(page.locator('button:has-text("Run Health Check")')).toBeVisible();
        
        // Test API Testing tab
        await page.click('#api-tab');
        await expect(page.locator('#api')).toHaveClass(/active/);
        await expect(page.locator('#apiEndpointSelect')).toBeVisible();
        await expect(page.locator('#apiMethodSelect')).toBeVisible();
    });
    
    test('should handle service filtering', async ({ page }) => {
        // Wait for services to load
        await page.waitForTimeout(2000);
        
        // Test type filter
        await page.selectOption('#serviceTypeFilter', 'hardware');
        await page.waitForTimeout(500);
        
        // Test status filter
        await page.selectOption('#serviceStatusFilter', 'running');
        await page.waitForTimeout(500);
        
        // Test search filter
        await page.fill('#serviceSearchFilter', 'microphone');
        await page.waitForTimeout(500);
        
        // Clear filters
        await page.selectOption('#serviceTypeFilter', '');
        await page.selectOption('#serviceStatusFilter', '');
        await page.fill('#serviceSearchFilter', '');
    });
    
    test('should display port allocation information', async ({ page }) => {
        // Navigate to ports tab
        await page.click('#ports-tab');
        
        // Check port range table
        await expect(page.locator('#portRangesTableBody')).toBeVisible();
        
        // Check chart containers
        await expect(page.locator('#portRangeChart')).toBeVisible();
        await expect(page.locator('#portTypeChart')).toBeVisible();
    });
    
    test('should display monitoring information', async ({ page }) => {
        // Navigate to monitoring tab
        await page.click('#monitoring-tab');
        
        // Check health status chart
        await expect(page.locator('#healthStatusChart')).toBeVisible();
        
        // Check connection stats
        await expect(page.locator('#connectionStatsChart')).toBeVisible();
        
        // Check system metrics
        await expect(page.locator('#cpuUsage')).toBeVisible();
        await expect(page.locator('#memoryUsage')).toBeVisible();
        await expect(page.locator('#networkConnections')).toBeVisible();
        await expect(page.locator('#systemUptime')).toBeVisible();
    });
    
    test('should display configuration options', async ({ page }) => {
        // Navigate to configuration tab
        await page.click('#configuration-tab');
        
        // Check environment configuration
        await expect(page.locator('#environmentSelect')).toBeVisible();
        await expect(page.locator('#healthCheckInterval')).toBeVisible();
        await expect(page.locator('#connectionTimeout')).toBeVisible();
        
        // Check service priorities section
        await expect(page.locator('#servicePriorities')).toBeVisible();
        
        // Check save button
        await expect(page.locator('button:has-text("Save Configuration")')).toBeVisible();
    });
    
    test('should provide diagnostic tools', async ({ page }) => {
        // Navigate to diagnostics tab
        await page.click('#diagnostics-tab');
        
        // Check validation section
        await expect(page.locator('button:has-text("Run Full Validation")')).toBeVisible();
        await expect(page.locator('#validationResults')).toBeVisible();
        
        // Check health check section
        await expect(page.locator('button:has-text("Run Health Check")')).toBeVisible();
        await expect(page.locator('#healthCheckResults')).toBeVisible();
        
        // Check logs section
        await expect(page.locator('#systemLogs')).toBeVisible();
        await expect(page.locator('#logLevelFilter')).toBeVisible();
        await expect(page.locator('button:has-text("Refresh")')).toBeVisible();
        await expect(page.locator('button:has-text("Clear")')).toBeVisible();
    });
    
    test('should provide API testing interface', async ({ page }) => {
        // Navigate to API testing tab
        await page.click('#api-tab');
        
        // Check endpoint selection
        await expect(page.locator('#apiEndpointSelect')).toBeVisible();
        await expect(page.locator('#apiMethodSelect')).toBeVisible();
        
        // Check test button
        await expect(page.locator('button:has-text("Test Endpoint")')).toBeVisible();
        
        // Check response area
        await expect(page.locator('#apiResponse')).toBeVisible();
    });
    
    test('should handle API method change', async ({ page }) => {
        // Navigate to API testing tab
        await page.click('#api-tab');
        
        // Check that body section is hidden for GET
        await expect(page.locator('#apiBodySection')).toBeHidden();
        
        // Change to POST method
        await page.selectOption('#apiMethodSelect', 'POST');
        
        // Check that body section is now visible
        await expect(page.locator('#apiBodySection')).toBeVisible();
        await expect(page.locator('#apiRequestBody')).toBeVisible();
    });
    
    test('should test API endpoints', async ({ page }) => {
        // Navigate to API testing tab
        await page.click('#api-tab');
        
        // Select status endpoint
        await page.selectOption('#apiEndpointSelect', '/api/service-management/status');
        
        // Click test button
        await page.click('button:has-text("Test Endpoint")');
        
        // Wait for response
        await page.waitForTimeout(2000);
        
        // Check that response is displayed
        const responseContent = await page.locator('#apiResponse').textContent();
        expect(responseContent).not.toBe('API response will appear here...');
    });
    
    test('should run health check', async ({ page }) => {
        // Navigate to diagnostics tab
        await page.click('#diagnostics-tab');
        
        // Click health check button
        await page.click('button:has-text("Run Health Check")');
        
        // Wait for health check to complete
        await page.waitForTimeout(3000);
        
        // Check that results are displayed
        const resultsContent = await page.locator('#healthCheckResults').textContent();
        expect(resultsContent).toContain('Health Status');
    });
    
    test('should run system validation', async ({ page }) => {
        // Navigate to diagnostics tab
        await page.click('#diagnostics-tab');
        
        // Click validation button
        await page.click('button:has-text("Run Full Validation")');
        
        // Wait for validation to complete
        await page.waitForTimeout(3000);
        
        // Check that results are displayed
        const resultsContent = await page.locator('#validationResults').textContent();
        expect(resultsContent).toContain('Validation Complete');
    });
    
    test('should refresh system status', async ({ page }) => {
        // Click refresh button
        await page.click('button:has-text("Refresh")');
        
        // Wait for refresh to complete
        await page.waitForTimeout(1000);
        
        // Check that status badge is updated
        await expect(page.locator('#systemStatusBadge')).not.toContainText('Loading...');
    });
    
    test('should handle service detail modal', async ({ page }) => {
        // Wait for services to load
        await page.waitForTimeout(2000);
        
        // Check if there are any service info buttons
        const infoButtons = page.locator('button:has(.fa-info)');
        const count = await infoButtons.count();
        
        if (count > 0) {
            // Click the first info button
            await infoButtons.first().click();
            
            // Check that modal is displayed
            await expect(page.locator('#serviceDetailModal')).toBeVisible();
            await expect(page.locator('#serviceDetailContent')).toBeVisible();
            
            // Close modal
            await page.click('.btn-close');
            await expect(page.locator('#serviceDetailModal')).toBeHidden();
        }
    });
    
    test('should be responsive on different screen sizes', async ({ page }) => {
        // Test mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);
        
        // Check that main elements are still visible
        await expect(page.locator('#portManagementTabs')).toBeVisible();
        await expect(page.locator('#systemStatusBadge')).toBeVisible();
        
        // Test tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(500);
        
        // Check that layout adapts
        await expect(page.locator('#portManagementTabs')).toBeVisible();
        
        // Reset to desktop
        await page.setViewportSize({ width: 1920, height: 1080 });
    });
    
    test('should handle errors gracefully', async ({ page }) => {
        // Mock a failed API request
        await page.route('/api/service-management/status', route => {
            route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Internal server error' })
            });
        });
        
        // Refresh the page to trigger the error
        await page.reload();
        await page.waitForTimeout(2000);
        
        // Check that error is handled gracefully
        await expect(page.locator('#systemStatusBadge')).toContainText('Error');
    });
});
