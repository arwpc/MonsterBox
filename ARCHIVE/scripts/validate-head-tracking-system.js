#!/usr/bin/env node
/**
 * Head Tracking System Validation Script
 * Comprehensive validation of the complete head tracking implementation
 */

const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');

class HeadTrackingValidator {
    constructor() {
        this.validationResults = [];
        this.errors = [];
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    }

    async validate(name, testFunction) {
        this.log(`🔍 Validating: ${name}`);
        try {
            const result = await testFunction();
            this.validationResults.push({ name, success: true, result });
            this.log(`✅ ${name}: PASSED`);
            return true;
        } catch (error) {
            this.validationResults.push({ name, success: false, error: error.message });
            this.errors.push({ name, error: error.message });
            this.log(`❌ ${name}: FAILED - ${error.message}`, 'error');
            return false;
        }
    }

    async validateFileStructure() {
        const requiredFiles = [
            'scripts/hardware/head_tracking_websocket_service.py',
            'scripts/hardware/mcp_logger.py',
            'routes/headTrackingRoutes.js',
            'routes/api/headTrackingApiRoutes.js',
            'views/part-forms/head-tracking.ejs',
            'tests/head-tracking.test.js',
            'tests/head-tracking-hardware.test.js',
            'tests/head-tracking-integration.test.js'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, '..', file);
            try {
                await fs.access(filePath);
                this.log(`  ✓ ${file} exists`);
            } catch (error) {
                throw new Error(`Required file missing: ${file}`);
            }
        }

        return { filesChecked: requiredFiles.length };
    }

    async validatePackageJsonScripts() {
        const packagePath = path.join(__dirname, '..', 'package.json');
        const packageData = JSON.parse(await fs.readFile(packagePath, 'utf8'));
        
        const requiredScripts = [
            'test:head-tracking',
            'test:head-tracking-hardware',
            'test:head-tracking-integration',
            'test:head-tracking-complete'
        ];

        for (const script of requiredScripts) {
            if (!packageData.scripts[script]) {
                throw new Error(`Missing package.json script: ${script}`);
            }
            this.log(`  ✓ Script '${script}' defined`);
        }

        return { scriptsChecked: requiredScripts.length };
    }

    async validateServiceConfiguration() {
        // Check character service manager
        const managerPath = path.join(__dirname, '..', 'scripts', 'hardware', 'character_service_manager.py');
        const managerContent = await fs.readFile(managerPath, 'utf8');
        
        if (!managerContent.includes('head_tracking')) {
            throw new Error('Head tracking service not registered in character service manager');
        }

        // Check startup script
        const startupPath = path.join(__dirname, '..', 'scripts', 'hardware', 'start_hardware_services.py');
        const startupContent = await fs.readFile(startupPath, 'utf8');
        
        if (!startupContent.includes('8776')) {
            throw new Error('Head tracking port 8776 not configured in startup script');
        }

        return { serviceConfigured: true };
    }

    async validateUIIntegration() {
        // Check parts menu
        const partsPath = path.join(__dirname, '..', 'views', 'parts.ejs');
        const partsContent = await fs.readFile(partsPath, 'utf8');
        
        if (!partsContent.includes('head-tracking')) {
            throw new Error('Head tracking not added to parts menu');
        }

        // Check app.js routes
        const appPath = path.join(__dirname, '..', 'app.js');
        const appContent = await fs.readFile(appPath, 'utf8');
        
        if (!appContent.includes('headTrackingRoutes')) {
            throw new Error('Head tracking routes not registered in app.js');
        }

        return { uiIntegrated: true };
    }

    async validateHardwareMonitor() {
        const monitorPath = path.join(__dirname, '..', 'public', 'hardware-monitor.html');
        const monitorContent = await fs.readFile(monitorPath, 'utf8');
        
        const requiredElements = [
            'headTrackingServiceStatus',
            'startHeadTracking',
            'stopHeadTracking',
            'configureHeadTracking',
            '8776'
        ];

        for (const element of requiredElements) {
            if (!monitorContent.includes(element)) {
                throw new Error(`Hardware monitor missing element: ${element}`);
            }
        }

        return { monitorIntegrated: true };
    }

    async validateLegacyCodeRemoval() {
        const removedFiles = [
            'scripts/head_track.py',
            'scripts/motion_tracker.py',
            'scripts/webcam_persistent_stream.py',
            'scripts/camera_stream.py'
        ];

        for (const file of removedFiles) {
            const filePath = path.join(__dirname, '..', file);
            try {
                await fs.access(filePath);
                throw new Error(`Legacy file still exists: ${file}`);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    this.log(`  ✓ Legacy file removed: ${file}`);
                } else {
                    throw error;
                }
            }
        }

        return { legacyFilesRemoved: removedFiles.length };
    }

    async validateWebSocketService() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://localhost:8776');
            
            const timeout = setTimeout(() => {
                ws.close();
                reject(new Error('WebSocket service not responding on port 8776'));
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                this.log('  ✓ WebSocket service responding on port 8776');
                
                // Test basic message
                ws.send(JSON.stringify({ type: 'ping' }));
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    if (message.type === 'pong') {
                        ws.close();
                        resolve({ serviceResponding: true });
                    }
                } catch (error) {
                    // Ignore parsing errors
                }
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket service error: ${error.message}`));
            });
        });
    }

    async validateAPIEndpoints() {
        const baseURL = 'http://localhost:3000';
        
        try {
            // Test status endpoint
            const statusResponse = await axios.get(`${baseURL}/api/hardware/head-tracking/status`, {
                timeout: 5000
            });
            
            if (statusResponse.status !== 200) {
                throw new Error(`Status endpoint returned ${statusResponse.status}`);
            }

            // Test configurations endpoint
            const configResponse = await axios.get(`${baseURL}/api/hardware/head-tracking/configurations`, {
                timeout: 5000
            });
            
            if (configResponse.status !== 200) {
                throw new Error(`Configurations endpoint returned ${configResponse.status}`);
            }

            return { endpointsResponding: true };
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('MonsterBox server not running on port 3000');
            }
            throw error;
        }
    }

    async validateTestSuite() {
        // Check test files exist and are properly structured
        const testFiles = [
            'tests/head-tracking.test.js',
            'tests/head-tracking-hardware.test.js',
            'tests/head-tracking-integration.test.js'
        ];

        for (const testFile of testFiles) {
            const testPath = path.join(__dirname, '..', testFile);
            const testContent = await fs.readFile(testPath, 'utf8');
            
            if (!testContent.includes('describe(') || !testContent.includes('it(')) {
                throw new Error(`Test file ${testFile} is not properly structured`);
            }
            
            if (!testContent.includes('expect(')) {
                throw new Error(`Test file ${testFile} missing assertions`);
            }
        }

        return { testFilesValid: testFiles.length };
    }

    async runValidation() {
        this.log('🎯 Starting Head Tracking System Validation');
        this.log('=' .repeat(60));

        const validations = [
            ['File Structure', () => this.validateFileStructure()],
            ['Package.json Scripts', () => this.validatePackageJsonScripts()],
            ['Service Configuration', () => this.validateServiceConfiguration()],
            ['UI Integration', () => this.validateUIIntegration()],
            ['Hardware Monitor', () => this.validateHardwareMonitor()],
            ['Legacy Code Removal', () => this.validateLegacyCodeRemoval()],
            ['Test Suite', () => this.validateTestSuite()],
            ['WebSocket Service', () => this.validateWebSocketService()],
            ['API Endpoints', () => this.validateAPIEndpoints()]
        ];

        let passed = 0;
        let total = validations.length;

        for (const [name, testFn] of validations) {
            if (await this.validate(name, testFn)) {
                passed++;
            }
        }

        this.log('=' .repeat(60));
        this.log('📊 VALIDATION SUMMARY');
        this.log('=' .repeat(60));
        this.log(`Total Validations: ${total}`);
        this.log(`Passed: ${passed}`);
        this.log(`Failed: ${total - passed}`);
        this.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);

        if (this.errors.length > 0) {
            this.log('\n❌ FAILED VALIDATIONS:', 'error');
            this.errors.forEach(error => {
                this.log(`  - ${error.name}: ${error.error}`, 'error');
            });
        }

        if (passed === total) {
            this.log('\n🎉 ALL VALIDATIONS PASSED! Head Tracking System is ready for use.');
        } else {
            this.log('\n⚠️ Some validations failed. Please address the issues above.');
        }

        this.log('=' .repeat(60));
        
        return {
            success: passed === total,
            passed,
            total,
            errors: this.errors
        };
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new HeadTrackingValidator();
    validator.runValidation().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('❌ Validation failed:', error);
        process.exit(1);
    });
}

module.exports = HeadTrackingValidator;
