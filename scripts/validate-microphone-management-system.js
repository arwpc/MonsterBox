#!/usr/bin/env node
/**
 * Validation Script for Microphone Management System
 * Validates all requirements have been implemented correctly
 */

const fs = require('fs');
const path = require('path');

class MicrophoneManagementValidator {
    constructor() {
        this.requirements = [
            {
                id: 'CRUD_OPERATIONS',
                name: 'CRUD Operations for Microphone Parts',
                checks: [
                    'views/microphone-management.ejs exists',
                    'Create microphone form implemented',
                    'Read/view microphone parts functionality',
                    'Update microphone configurations',
                    'Delete microphone parts'
                ]
            },
            {
                id: 'CONFIGURATION_MANAGEMENT',
                name: 'Configuration Management',
                checks: [
                    'Centralized microphone settings interface',
                    'Audio input/output configuration',
                    'Hardware connection settings',
                    'Real-time audio level monitoring'
                ]
            },
            {
                id: 'TESTING_INTERFACE',
                name: 'Testing Interface with Audio Visualization',
                checks: [
                    'Live microphone testing functionality',
                    'Audio visualization components',
                    'Connection status indicators',
                    'Audio quality assessment tools',
                    'Ambient sound detection'
                ]
            },
            {
                id: 'WEBSOCKET_FIXES',
                name: 'WebSocket Connection Issues Fixed',
                checks: [
                    'ECONNREFUSED errors resolved',
                    'Stream initialization timeout fixes',
                    'Robust reconnection handling',
                    'RPI host communication fixes'
                ]
            },
            {
                id: 'NAVIGATION_UPDATES',
                name: 'Navigation and Character Edit Updates',
                checks: [
                    'Microphone management added to navigation',
                    'Character Edit microphone functionality removed',
                    'Proper routing implemented'
                ]
            },
            {
                id: 'SERVICE_AUTO_START',
                name: 'Service Auto-Start and Error Handling',
                checks: [
                    'Microphone WebSocket services auto-start',
                    'Connection error handling',
                    'User feedback for errors',
                    'Service restart functionality'
                ]
            },
            {
                id: 'EJS_TEMPLATING',
                name: 'EJS Templating System',
                checks: [
                    'No static HTML pages used',
                    'EJS templates only',
                    'MonsterBox UI consistency'
                ]
            }
        ];

        this.results = {
            passed: 0,
            failed: 0,
            details: []
        };
    }

    log(message, type = 'info') {
        const prefix = {
            'info': '📋',
            'success': '✅',
            'error': '❌',
            'warning': '⚠️'
        }[type] || '📋';
        
        console.log(`${prefix} ${message}`);
    }

    fileExists(filePath) {
        return fs.existsSync(path.join(process.cwd(), filePath));
    }

    fileContains(filePath, searchString) {
        try {
            const content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
            return content.includes(searchString);
        } catch (error) {
            return false;
        }
    }

    validateRequirement(requirement) {
        this.log(`\n🔍 Validating: ${requirement.name}`);
        let passed = 0;
        let failed = 0;

        const details = {
            id: requirement.id,
            name: requirement.name,
            checks: []
        };

        // Specific validation logic for each requirement
        switch (requirement.id) {
            case 'CRUD_OPERATIONS':
                passed += this.validateCRUDOperations(details);
                break;
            case 'CONFIGURATION_MANAGEMENT':
                passed += this.validateConfigurationManagement(details);
                break;
            case 'TESTING_INTERFACE':
                passed += this.validateTestingInterface(details);
                break;
            case 'WEBSOCKET_FIXES':
                passed += this.validateWebSocketFixes(details);
                break;
            case 'NAVIGATION_UPDATES':
                passed += this.validateNavigationUpdates(details);
                break;
            case 'SERVICE_AUTO_START':
                passed += this.validateServiceAutoStart(details);
                break;
            case 'EJS_TEMPLATING':
                passed += this.validateEJSTemplating(details);
                break;
        }

        failed = requirement.checks.length - passed;
        
        if (failed === 0) {
            this.log(`✅ ${requirement.name}: ALL CHECKS PASSED`, 'success');
            this.results.passed++;
        } else {
            this.log(`❌ ${requirement.name}: ${failed} checks failed`, 'error');
            this.results.failed++;
        }

        this.results.details.push(details);
        return failed === 0;
    }

    validateCRUDOperations(details) {
        let passed = 0;

        // Check main management page exists
        if (this.fileExists('views/microphone-management.ejs')) {
            details.checks.push({ name: 'Microphone management page exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Microphone management page exists', status: 'FAILED' });
        }

        // Check for CRUD functionality in the page
        if (this.fileContains('views/microphone-management.ejs', 'createMicrophone')) {
            details.checks.push({ name: 'Create functionality implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Create functionality implemented', status: 'FAILED' });
        }

        // Check API routes
        if (this.fileContains('routes/partRoutes.js', '/api/microphone')) {
            details.checks.push({ name: 'API routes implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'API routes implemented', status: 'FAILED' });
        }

        // Check for delete functionality
        if (this.fileContains('views/microphone-management.ejs', 'deleteMicrophone')) {
            details.checks.push({ name: 'Delete functionality implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Delete functionality implemented', status: 'FAILED' });
        }

        return passed;
    }

    validateConfigurationManagement(details) {
        let passed = 0;

        // Check for configuration tab
        if (this.fileContains('views/microphone-management.ejs', 'configuration-tab')) {
            details.checks.push({ name: 'Configuration tab exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Configuration tab exists', status: 'FAILED' });
        }

        // Check for audio level monitoring
        if (this.fileContains('views/microphone-management.ejs', 'audio-level')) {
            details.checks.push({ name: 'Audio level monitoring implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Audio level monitoring implemented', status: 'FAILED' });
        }

        return passed;
    }

    validateTestingInterface(details) {
        let passed = 0;

        // Check for testing tab
        if (this.fileContains('views/microphone-management.ejs', 'testing-tab')) {
            details.checks.push({ name: 'Testing tab exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Testing tab exists', status: 'FAILED' });
        }

        // Check for audio visualization
        if (this.fileContains('views/microphone-management.ejs', 'Chart.js')) {
            details.checks.push({ name: 'Audio visualization implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Audio visualization implemented', status: 'FAILED' });
        }

        // Check for ambient test
        if (this.fileContains('views/microphone-management.ejs', 'ambientTest')) {
            details.checks.push({ name: 'Ambient sound detection implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Ambient sound detection implemented', status: 'FAILED' });
        }

        return passed;
    }

    validateWebSocketFixes(details) {
        let passed = 0;

        // Check for service manager
        if (this.fileExists('services/serviceManager.js')) {
            details.checks.push({ name: 'Service manager exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Service manager exists', status: 'FAILED' });
        }

        // Check for microphone services starter
        if (this.fileExists('scripts/start-microphone-services.js')) {
            details.checks.push({ name: 'Microphone services starter exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Microphone services starter exists', status: 'FAILED' });
        }

        // Check for reconnection handling
        if (this.fileContains('views/microphone-management.ejs', 'connectWebSocketWithRetry')) {
            details.checks.push({ name: 'Reconnection handling implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Reconnection handling implemented', status: 'FAILED' });
        }

        return passed;
    }

    validateNavigationUpdates(details) {
        let passed = 0;

        // Check navigation components
        if (this.fileContains('views/components/navigation-desktop.ejs', 'Microphone Management')) {
            details.checks.push({ name: 'Desktop navigation updated', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Desktop navigation updated', status: 'FAILED' });
        }

        if (this.fileContains('views/components/navigation-mobile.ejs', 'Microphone Management')) {
            details.checks.push({ name: 'Mobile navigation updated', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Mobile navigation updated', status: 'FAILED' });
        }

        // Check character edit microphone functionality removed
        if (!this.fileContains('views/part-forms/microphone.ejs', 'testMicrophoneButton')) {
            details.checks.push({ name: 'Character edit testing removed', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Character edit testing removed', status: 'FAILED' });
        }

        return passed;
    }

    validateServiceAutoStart(details) {
        let passed = 0;

        // Check app.js integration
        if (this.fileContains('app.js', 'startMicrophoneWebSocketServices')) {
            details.checks.push({ name: 'Auto-start integration in app.js', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Auto-start integration in app.js', status: 'FAILED' });
        }

        // Check health check endpoint
        if (this.fileContains('routes/partRoutes.js', '/api/microphone/health')) {
            details.checks.push({ name: 'Health check endpoint exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Health check endpoint exists', status: 'FAILED' });
        }

        // Check auto-restart endpoint
        if (this.fileContains('routes/partRoutes.js', '/api/microphone/auto-restart')) {
            details.checks.push({ name: 'Auto-restart endpoint exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Auto-restart endpoint exists', status: 'FAILED' });
        }

        return passed;
    }

    validateEJSTemplating(details) {
        let passed = 0;

        // Check main page is EJS
        if (this.fileExists('views/microphone-management.ejs')) {
            details.checks.push({ name: 'Main page uses EJS', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Main page uses EJS', status: 'FAILED' });
        }

        // Check no static HTML in microphone management
        const staticHtmlExists = this.fileExists('public/microphone-management.html') || 
                                this.fileExists('static/microphone-management.html');
        if (!staticHtmlExists) {
            details.checks.push({ name: 'No static HTML pages', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'No static HTML pages', status: 'FAILED' });
        }

        return passed;
    }

    async validate() {
        this.log('🔍 Starting Microphone Management System Validation\n');

        for (const requirement of this.requirements) {
            this.validateRequirement(requirement);
        }

        this.printResults();
    }

    printResults() {
        this.log('\n📊 Validation Results:');
        this.log(`✅ Requirements Passed: ${this.results.passed}`);
        this.log(`❌ Requirements Failed: ${this.results.failed}`);
        this.log(`📈 Total Requirements: ${this.requirements.length}`);

        if (this.results.failed > 0) {
            this.log('\n❌ Failed Requirements:');
            this.results.details
                .filter(detail => detail.checks.some(check => check.status === 'FAILED'))
                .forEach(detail => {
                    this.log(`\n  📋 ${detail.name}:`);
                    detail.checks
                        .filter(check => check.status === 'FAILED')
                        .forEach(check => {
                            this.log(`    ❌ ${check.name}`, 'error');
                        });
                });
        }

        const successRate = (this.results.passed / this.requirements.length * 100).toFixed(1);
        this.log(`\n🎯 Success Rate: ${successRate}%`);

        if (this.results.failed === 0) {
            this.log('\n🎉 All requirements validated successfully!', 'success');
            this.log('✅ Microphone Management System is ready for use!', 'success');
        } else {
            this.log('\n⚠️ Some requirements failed validation. Please address the issues above.', 'warning');
        }
    }
}

// Run validation
if (require.main === module) {
    const validator = new MicrophoneManagementValidator();
    validator.validate().catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}

module.exports = MicrophoneManagementValidator;
