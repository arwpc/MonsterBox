#!/usr/bin/env node
/**
 * Comprehensive fix for jaw animation issues
 * Addresses all problems identified in the test page
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class JawAnimationFixer {
    constructor() {
        this.issues = [];
        this.fixes = [];
    }

    async runFixes() {
        console.log('🔧 Fixing Jaw Animation Issues');
        console.log('==============================\n');

        try {
            await this.fixPartsConfiguration();
            await this.fixRouteConfiguration();
            await this.fixWebSocketIssues();
            await this.fixCharacterSelection();
            await this.generateReport();
            
        } catch (error) {
            logger.error('Fix execution failed:', error);
            this.issues.push({
                type: 'CRITICAL_ERROR',
                message: error.message,
                stack: error.stack
            });
        }

        return { issues: this.issues, fixes: this.fixes };
    }

    /**
     * Fix parts.json configuration issues
     */
    async fixPartsConfiguration() {
        try {
            console.log('🔧 Fixing parts configuration...');
            
            const partsPath = path.join(process.cwd(), 'data', 'parts.json');
            const partsData = await fs.readFile(partsPath, 'utf8');
            const parts = JSON.parse(partsData);
            
            // Find Skulltalker jaw servo
            const jawServoIndex = parts.findIndex(p => 
                p.name === 'Jaw Servo' && p.characterId === 4
            );
            
            if (jawServoIndex === -1) {
                this.issues.push({
                    type: 'MISSING_JAW_SERVO',
                    message: 'Jaw servo not found for Skulltalker'
                });
                return;
            }
            
            const jawServo = parts[jawServoIndex];
            let needsUpdate = false;
            
            // Check and fix servo configuration
            if (jawServo.pin !== 18) {
                jawServo.pin = 18;
                needsUpdate = true;
                this.fixes.push('Updated jaw servo pin to GPIO18');
            }
            
            if (jawServo.usePCA9685 !== false) {
                jawServo.usePCA9685 = false;
                needsUpdate = true;
                this.fixes.push('Disabled PCA9685 for jaw servo');
            }
            
            if (jawServo.channel !== null) {
                jawServo.channel = null;
                needsUpdate = true;
                this.fixes.push('Set jaw servo channel to null');
            }
            
            // Remove PCA9685 settings if they exist
            if (jawServo.pca9685Settings) {
                delete jawServo.pca9685Settings;
                needsUpdate = true;
                this.fixes.push('Removed PCA9685 settings from jaw servo');
            }
            
            if (needsUpdate) {
                await fs.writeFile(partsPath, JSON.stringify(parts, null, 2));
                console.log('✅ Parts configuration updated');
            } else {
                console.log('✅ Parts configuration already correct');
            }
            
        } catch (error) {
            this.issues.push({
                type: 'PARTS_CONFIG_ERROR',
                message: `Failed to fix parts configuration: ${error.message}`
            });
        }
    }

    /**
     * Fix route configuration issues
     */
    async fixRouteConfiguration() {
        try {
            console.log('🔧 Checking route configuration...');
            
            // Check if jaw animation routes are properly configured
            const routesPath = path.join(process.cwd(), 'routes', 'jawAnimationRoutes.js');
            const routesExist = await fs.access(routesPath).then(() => true).catch(() => false);
            
            if (!routesExist) {
                this.issues.push({
                    type: 'MISSING_ROUTES',
                    message: 'Jaw animation routes file not found'
                });
                return;
            }
            
            // Check if routes are registered in app.js
            const appPath = path.join(process.cwd(), 'app.js');
            const appContent = await fs.readFile(appPath, 'utf8');
            
            if (!appContent.includes('jawAnimationRoutes') && !appContent.includes('/jaw-animation')) {
                this.issues.push({
                    type: 'ROUTES_NOT_REGISTERED',
                    message: 'Jaw animation routes not registered in app.js'
                });
            } else {
                console.log('✅ Routes configuration looks correct');
            }
            
        } catch (error) {
            this.issues.push({
                type: 'ROUTE_CONFIG_ERROR',
                message: `Failed to check route configuration: ${error.message}`
            });
        }
    }

    /**
     * Fix WebSocket issues
     */
    async fixWebSocketIssues() {
        try {
            console.log('🔧 Checking WebSocket configuration...');
            
            // Check WebSocket implementation
            const wsPath = path.join(process.cwd(), 'scripts', 'jaw-animation', 'websocket', 'jawWebSocket.js');
            const wsExists = await fs.access(wsPath).then(() => true).catch(() => false);
            
            if (!wsExists) {
                this.issues.push({
                    type: 'MISSING_WEBSOCKET',
                    message: 'WebSocket implementation not found'
                });
                return;
            }
            
            // Check if WebSocket is initialized in app.js
            const appPath = path.join(process.cwd(), 'app.js');
            const appContent = await fs.readFile(appPath, 'utf8');
            
            if (!appContent.includes('JawWebSocket') && !appContent.includes('jawWebSocket')) {
                this.issues.push({
                    type: 'WEBSOCKET_NOT_INITIALIZED',
                    message: 'WebSocket not initialized in app.js'
                });
            } else {
                console.log('✅ WebSocket configuration looks correct');
            }
            
        } catch (error) {
            this.issues.push({
                type: 'WEBSOCKET_CONFIG_ERROR',
                message: `Failed to check WebSocket configuration: ${error.message}`
            });
        }
    }

    /**
     * Fix character selection issues
     */
    async fixCharacterSelection() {
        try {
            console.log('🔧 Checking character selection...');
            
            // Check characters.json
            const charactersPath = path.join(process.cwd(), 'data', 'characters.json');
            const charactersData = await fs.readFile(charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);
            
            // Find Skulltalker character
            const skulltalker = characters.find(c => c.id === 4);
            
            if (!skulltalker) {
                this.issues.push({
                    type: 'MISSING_CHARACTER',
                    message: 'Skulltalker character not found in characters.json'
                });
                return;
            }
            
            // Check if character is properly configured
            if (!skulltalker.char_name || !skulltalker.char_name.includes('Skulltalker')) {
                this.issues.push({
                    type: 'CHARACTER_NAME_ISSUE',
                    message: 'Skulltalker character name not properly set'
                });
            }
            
            console.log('✅ Character configuration looks correct');
            
        } catch (error) {
            this.issues.push({
                type: 'CHARACTER_CONFIG_ERROR',
                message: `Failed to check character configuration: ${error.message}`
            });
        }
    }

    /**
     * Generate comprehensive report
     */
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            issues: this.issues,
            fixes: this.fixes,
            summary: {
                totalIssues: this.issues.length,
                totalFixes: this.fixes.length,
                status: this.issues.length === 0 ? 'ALL_GOOD' : 'ISSUES_FOUND'
            }
        };
        
        // Save report to file
        const reportPath = path.join(process.cwd(), 'logs', 'jaw-animation-fix-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📊 Fix Summary:');
        console.log(`Issues Found: ${report.summary.totalIssues}`);
        console.log(`Fixes Applied: ${report.summary.totalFixes}`);
        console.log(`Status: ${report.summary.status}`);
        
        if (this.issues.length > 0) {
            console.log('\n❌ Issues Found:');
            this.issues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue.type}: ${issue.message}`);
            });
        }
        
        if (this.fixes.length > 0) {
            console.log('\n✅ Fixes Applied:');
            this.fixes.forEach((fix, index) => {
                console.log(`${index + 1}. ${fix}`);
            });
        }
        
        console.log(`\n📄 Report saved to: ${reportPath}`);
        
        return report;
    }
}

// Run fixes if called directly
if (require.main === module) {
    const fixer = new JawAnimationFixer();
    fixer.runFixes()
        .then(results => {
            process.exit(results.issues.length > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('Fix execution failed:', error);
            process.exit(1);
        });
}

module.exports = JawAnimationFixer;
