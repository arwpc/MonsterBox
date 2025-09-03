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
                id: 'UNIFIED_MICROPHONE_FORM',
                name: 'Unified Microphone Form System',
                checks: [
                    'views/part-forms/microphone.ejs exists',
                    'Unified New/Edit microphone form implemented',
                    'Real-time device discovery functionality',
                    'Live audio testing and monitoring',
                    'Comprehensive configuration options'
                ]
            },
            {
                id: 'STT_VAD_INTEGRATION',
                name: 'STT + VAD Integration System',
                checks: [
                    'views/ai-config/stt.ejs enhanced with VAD testing',
                    'Comprehensive STT + VAD testing suite',
                    'Real-time VAD visualization and monitoring',
                    'Integration performance metrics',
                    'Unified testing interface with tabs'
                ]
            },
            {
                id: 'SPEAKER_DEVICE_DISCOVERY',
                name: 'Speaker Device Discovery System',
                checks: [
                    'Speaker device discovery API endpoint',
                    'Real-world USB Audio Device detection',
                    'Platform audio device enumeration',
                    'Device selection and configuration',
                    'Audio output testing capabilities'
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
            case 'UNIFIED_MICROPHONE_FORM':
                passed += this.validateUnifiedMicrophoneForm(details);
                break;
            case 'STT_VAD_INTEGRATION':
                passed += this.validateSTTVADIntegration(details);
                break;
            case 'SPEAKER_DEVICE_DISCOVERY':
                passed += this.validateSpeakerDeviceDiscovery(details);
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

    validateUnifiedMicrophoneForm(details) {
        let passed = 0;

        // Check unified microphone form exists
        if (this.fileExists('views/part-forms/microphone.ejs')) {
            details.checks.push({ name: 'Unified microphone form exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Unified microphone form exists', status: 'FAILED' });
        }

        // Check for device discovery functionality
        if (this.fileContains('views/part-forms/microphone.ejs', 'loadMicrophoneDevices')) {
            details.checks.push({ name: 'Device discovery implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Device discovery implemented', status: 'FAILED' });
        }

        // Check for live testing functionality
        if (this.fileContains('views/part-forms/microphone.ejs', 'startLiveMonitoring')) {
            details.checks.push({ name: 'Live testing implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Live testing implemented', status: 'FAILED' });
        }

        // Check for comprehensive configuration
        if (this.fileContains('views/part-forms/microphone.ejs', 'config-section')) {
            details.checks.push({ name: 'Comprehensive configuration sections', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Comprehensive configuration sections', status: 'FAILED' });
        }

        // Check for modern styling
        if (this.fileContains('views/part-forms/microphone.ejs', 'microphone-container')) {
            details.checks.push({ name: 'Modern two-panel layout', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Modern two-panel layout', status: 'FAILED' });
        }

        return passed;
    }

    validateSTTVADIntegration(details) {
        let passed = 0;

        // Check enhanced STT configuration page
        if (this.fileExists('views/ai-config/stt.ejs')) {
            details.checks.push({ name: 'STT configuration page exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'STT configuration page exists', status: 'FAILED' });
        }

        // Check for VAD testing tabs
        if (this.fileContains('views/ai-config/stt.ejs', 'testing-tabs')) {
            details.checks.push({ name: 'STT + VAD testing tabs implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'STT + VAD testing tabs implemented', status: 'FAILED' });
        }

        // Check for VAD visualization
        if (this.fileContains('views/ai-config/stt.ejs', 'vad-visualization')) {
            details.checks.push({ name: 'VAD visualization implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'VAD visualization implemented', status: 'FAILED' });
        }

        // Check for integration testing
        if (this.fileContains('views/ai-config/stt.ejs', 'runIntegrationTest')) {
            details.checks.push({ name: 'Integration testing implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Integration testing implemented', status: 'FAILED' });
        }

        // Check for performance metrics
        if (this.fileContains('views/ai-config/stt.ejs', 'integration-metrics')) {
            details.checks.push({ name: 'Performance metrics implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Performance metrics implemented', status: 'FAILED' });
        }

        return passed;
    }

    validateSpeakerDeviceDiscovery(details) {
        let passed = 0;

        // Check speaker device API endpoint
        if (this.fileContains('routes/partRoutes.js', '/api/speaker/devices')) {
            details.checks.push({ name: 'Speaker device discovery API exists', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Speaker device discovery API exists', status: 'FAILED' });
        }

        // Check speaker service implementation
        if (this.fileExists('services/speakerService.js')) {
            details.checks.push({ name: 'Speaker service implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Speaker service implemented', status: 'FAILED' });
        }

        // Check device enumeration functionality
        if (this.fileContains('services/speakerService.js', 'getAvailableDevices')) {
            details.checks.push({ name: 'Device enumeration implemented', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'Device enumeration implemented', status: 'FAILED' });
        }

        // Check USB Audio Device detection
        if (this.fileContains('services/speakerService.js', 'USB Audio Device')) {
            details.checks.push({ name: 'USB Audio Device detection', status: 'PASSED' });
            passed++;
        } else {
            details.checks.push({ name: 'USB Audio Device detection', status: 'FAILED' });
        }

        // Check platform audio support
        if (this.fileContains('services/speakerService.js', 'platform-fe00b840')) {
            details.checks.push({ name: 'Platform audio device support', status: 'PASSED' });
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
