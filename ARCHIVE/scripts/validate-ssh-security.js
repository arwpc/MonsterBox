#!/usr/bin/env node

/**
 * SSH Security Validation Script
 * Validates SSH key-based authentication implementation for MonsterBox animatronic network
 * Performs comprehensive security and functionality checks
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

class SSHSecurityValidator {
    constructor() {
        this.monsterboxRoot = path.join(__dirname, '..');
        this.charactersPath = path.join(this.monsterboxRoot, 'data', 'characters.json');
        this.keyPath = path.join(this.monsterboxRoot, 'scripts', 'ssh-deployment', 'keys', 'monsterbox-dev');
        this.deployScriptPath = path.join(this.monsterboxRoot, 'scripts', 'ssh-deployment', 'deploy-keys-to-characters.sh');
        
        this.validationResults = {
            keyValidation: [],
            characterValidation: [],
            connectionTests: [],
            securityChecks: [],
            streamingTests: []
        };
    }

    /**
     * Run comprehensive SSH security validation
     */
    async runValidation() {
        logger.info('🔒 Starting SSH Security Validation for MonsterBox...');
        console.log('');

        try {
            // Step 1: Validate SSH keys
            await this.validateSSHKeys();
            
            // Step 2: Validate character configuration
            await this.validateCharacterConfiguration();
            
            // Step 3: Test SSH connections
            await this.testSSHConnections();
            
            // Step 4: Perform security checks
            await this.performSecurityChecks();
            
            // Step 5: Test streaming functionality
            await this.testStreamingFunctionality();
            
            // Generate final report
            this.generateValidationReport();
            
        } catch (error) {
            logger.error('❌ SSH Security Validation failed:', error);
            process.exit(1);
        }
    }

    /**
     * Validate SSH key files and permissions
     */
    async validateSSHKeys() {
        logger.info('🔑 Validating SSH keys...');
        
        const checks = [
            {
                name: 'Private key exists',
                test: () => fs.existsSync(this.keyPath),
                critical: true
            },
            {
                name: 'Public key exists',
                test: () => fs.existsSync(this.keyPath + '.pub'),
                critical: true
            },
            {
                name: 'Private key permissions (600)',
                test: () => {
                    if (!fs.existsSync(this.keyPath)) return false;
                    const stats = fs.statSync(this.keyPath);
                    return (stats.mode & parseInt('777', 8)) === parseInt('600', 8);
                },
                critical: true
            },
            {
                name: 'Public key permissions (644)',
                test: () => {
                    if (!fs.existsSync(this.keyPath + '.pub')) return false;
                    const stats = fs.statSync(this.keyPath + '.pub');
                    return (stats.mode & parseInt('777', 8)) === parseInt('644', 8);
                },
                critical: false
            },
            {
                name: 'Key file size validation',
                test: () => {
                    if (!fs.existsSync(this.keyPath)) return false;
                    const stats = fs.statSync(this.keyPath);
                    return stats.size > 100 && stats.size < 10000; // Reasonable key size
                },
                critical: true
            }
        ];

        for (const check of checks) {
            const result = check.test();
            this.validationResults.keyValidation.push({
                name: check.name,
                passed: result,
                critical: check.critical
            });
            
            if (result) {
                logger.info(`  ✅ ${check.name}`);
            } else {
                const level = check.critical ? 'error' : 'warn';
                logger[level](`  ${check.critical ? '❌' : '⚠️'} ${check.name}`);
            }
        }
    }

    /**
     * Validate character configuration
     */
    async validateCharacterConfiguration() {
        logger.info('👥 Validating character configuration...');
        
        if (!fs.existsSync(this.charactersPath)) {
            logger.error('❌ Characters file not found');
            this.validationResults.characterValidation.push({
                name: 'Characters file exists',
                passed: false,
                critical: true
            });
            return;
        }

        try {
            const charactersData = JSON.parse(fs.readFileSync(this.charactersPath, 'utf8'));
            const animatronics = charactersData.filter(char => 
                char.animatronic && 
                char.animatronic.enabled && 
                char.animatronic.rpi_config
            );

            logger.info(`  📊 Found ${animatronics.length} enabled animatronic characters`);

            for (const character of animatronics) {
                const checks = [
                    {
                        name: `${character.char_name} - Has valid host IP`,
                        test: () => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(character.animatronic.rpi_config.host)
                    },
                    {
                        name: `${character.char_name} - Has user configured`,
                        test: () => character.animatronic.rpi_config.user && character.animatronic.rpi_config.user.trim() !== ''
                    },
                    {
                        name: `${character.char_name} - No password stored (security)`,
                        test: () => !character.animatronic.rpi_config.password || character.animatronic.rpi_config.password.trim() === ''
                    }
                ];

                for (const check of checks) {
                    const result = check.test();
                    this.validationResults.characterValidation.push({
                        name: check.name,
                        passed: result,
                        character: character.char_name
                    });
                    
                    if (result) {
                        logger.info(`    ✅ ${check.name}`);
                    } else {
                        logger.warn(`    ⚠️ ${check.name}`);
                    }
                }
            }

        } catch (error) {
            logger.error('❌ Error parsing characters.json:', error.message);
            this.validationResults.characterValidation.push({
                name: 'Characters file parsing',
                passed: false,
                critical: true,
                error: error.message
            });
        }
    }

    /**
     * Test SSH connections to all animatronics
     */
    async testSSHConnections() {
        logger.info('🔗 Testing SSH connections...');
        
        // Test deployment script functionality
        const deployScriptExists = fs.existsSync(this.deployScriptPath);
        this.validationResults.connectionTests.push({
            name: 'Deployment script exists',
            passed: deployScriptExists,
            critical: true
        });

        if (deployScriptExists) {
            logger.info('  ✅ Deployment script exists');
            
            // Test script execution (list command)
            try {
                const result = await this.executeCommand(this.deployScriptPath, ['list']);
                const success = result.exitCode === 0;
                
                this.validationResults.connectionTests.push({
                    name: 'Deployment script execution',
                    passed: success,
                    output: result.output
                });
                
                if (success) {
                    logger.info('  ✅ Deployment script executes successfully');
                } else {
                    logger.warn('  ⚠️ Deployment script execution failed');
                }
                
            } catch (error) {
                logger.error('  ❌ Error executing deployment script:', error.message);
                this.validationResults.connectionTests.push({
                    name: 'Deployment script execution',
                    passed: false,
                    error: error.message
                });
            }
        } else {
            logger.error('  ❌ Deployment script not found');
        }
    }

    /**
     * Perform security checks
     */
    async performSecurityChecks() {
        logger.info('🛡️ Performing security checks...');
        
        const securityChecks = [
            {
                name: 'No hardcoded passwords in code',
                test: async () => {
                    // Check for password patterns in key files
                    const filesToCheck = [
                        'services/streamingService.js',
                        'services/webcamService.js',
                        'services/animatronicService.js',
                        'scripts/ssh-credentials.js'
                    ];
                    
                    for (const file of filesToCheck) {
                        const filePath = path.join(this.monsterboxRoot, file);
                        if (fs.existsSync(filePath)) {
                            const content = fs.readFileSync(filePath, 'utf8');
                            if (content.includes('sshpass') || content.includes('PasswordAuthentication=yes')) {
                                return false;
                            }
                        }
                    }
                    return true;
                }
            },
            {
                name: 'SSH key-based authentication enforced',
                test: async () => {
                    const sshCredentialsPath = path.join(this.monsterboxRoot, 'scripts', 'ssh-credentials.js');
                    if (fs.existsSync(sshCredentialsPath)) {
                        const content = fs.readFileSync(sshCredentialsPath, 'utf8');
                        return content.includes('PasswordAuthentication=no') && 
                               content.includes('PubkeyAuthentication=yes');
                    }
                    return false;
                }
            },
            {
                name: 'Proper SSH client options configured',
                test: async () => {
                    const sshCredentialsPath = path.join(this.monsterboxRoot, 'scripts', 'ssh-credentials.js');
                    if (fs.existsSync(sshCredentialsPath)) {
                        const content = fs.readFileSync(sshCredentialsPath, 'utf8');
                        return content.includes('StrictHostKeyChecking=accept-new') && 
                               content.includes('ConnectTimeout=10') &&
                               content.includes('BatchMode=yes');
                    }
                    return false;
                }
            }
        ];

        for (const check of securityChecks) {
            try {
                const result = await check.test();
                this.validationResults.securityChecks.push({
                    name: check.name,
                    passed: result
                });
                
                if (result) {
                    logger.info(`  ✅ ${check.name}`);
                } else {
                    logger.warn(`  ⚠️ ${check.name}`);
                }
            } catch (error) {
                logger.error(`  ❌ Error checking ${check.name}:`, error.message);
                this.validationResults.securityChecks.push({
                    name: check.name,
                    passed: false,
                    error: error.message
                });
            }
        }
    }

    /**
     * Test streaming functionality
     */
    async testStreamingFunctionality() {
        logger.info('📹 Testing streaming functionality...');
        
        // Test SSH credentials manager
        try {
            const sshCredentials = require(path.join(this.monsterboxRoot, 'scripts', 'ssh-credentials'));
            
            // Test character loading
            const characters = sshCredentials.loadCharacterData();
            const characterCount = characters.length;
            
            this.validationResults.streamingTests.push({
                name: 'SSH credentials manager loads characters',
                passed: characterCount > 0,
                details: `Found ${characterCount} characters`
            });
            
            if (characterCount > 0) {
                logger.info(`  ✅ SSH credentials manager loads ${characterCount} characters`);
                
                // Test SSH command building
                try {
                    const testCommand = sshCredentials.buildSSHCommand('orlok', '192.168.8.120', 'echo test');
                    const isKeyBased = testCommand.includes('-i ') && 
                                     testCommand.includes('PasswordAuthentication=no');
                    
                    this.validationResults.streamingTests.push({
                        name: 'SSH command building uses key authentication',
                        passed: isKeyBased
                    });
                    
                    if (isKeyBased) {
                        logger.info('  ✅ SSH command building uses key authentication');
                    } else {
                        logger.warn('  ⚠️ SSH command building may not use key authentication');
                    }
                    
                } catch (error) {
                    logger.error('  ❌ Error building SSH command:', error.message);
                    this.validationResults.streamingTests.push({
                        name: 'SSH command building',
                        passed: false,
                        error: error.message
                    });
                }
                
            } else {
                logger.warn('  ⚠️ No characters found for testing');
            }
            
        } catch (error) {
            logger.error('  ❌ Error testing SSH credentials manager:', error.message);
            this.validationResults.streamingTests.push({
                name: 'SSH credentials manager loading',
                passed: false,
                error: error.message
            });
        }
    }

    /**
     * Execute a command and return results
     */
    async executeCommand(command, args = []) {
        return new Promise((resolve) => {
            const process = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            
            let output = '';
            let errorOutput = '';
            
            process.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            process.on('close', (code) => {
                resolve({
                    exitCode: code,
                    output: output,
                    error: errorOutput
                });
            });
            
            process.on('error', (error) => {
                resolve({
                    exitCode: -1,
                    output: '',
                    error: error.message
                });
            });
        });
    }

    /**
     * Generate comprehensive validation report
     */
    generateValidationReport() {
        console.log('');
        logger.info('📋 SSH Security Validation Report');
        console.log('=====================================');
        
        const sections = [
            { name: 'SSH Key Validation', results: this.validationResults.keyValidation },
            { name: 'Character Configuration', results: this.validationResults.characterValidation },
            { name: 'Connection Tests', results: this.validationResults.connectionTests },
            { name: 'Security Checks', results: this.validationResults.securityChecks },
            { name: 'Streaming Tests', results: this.validationResults.streamingTests }
        ];
        
        let totalTests = 0;
        let passedTests = 0;
        let criticalFailures = 0;
        
        for (const section of sections) {
            console.log(`\n${section.name}:`);
            console.log('-'.repeat(section.name.length + 1));
            
            for (const result of section.results) {
                totalTests++;
                if (result.passed) {
                    passedTests++;
                    console.log(`  ✅ ${result.name}`);
                } else {
                    if (result.critical) {
                        criticalFailures++;
                        console.log(`  ❌ ${result.name} (CRITICAL)`);
                    } else {
                        console.log(`  ⚠️ ${result.name}`);
                    }
                    
                    if (result.error) {
                        console.log(`     Error: ${result.error}`);
                    }
                    if (result.details) {
                        console.log(`     Details: ${result.details}`);
                    }
                }
            }
        }
        
        console.log('\n=====================================');
        console.log(`Summary: ${passedTests}/${totalTests} tests passed`);
        
        if (criticalFailures > 0) {
            console.log(`❌ ${criticalFailures} critical failures detected`);
            logger.error('SSH Security Validation FAILED - Critical issues must be resolved');
            process.exit(1);
        } else if (passedTests === totalTests) {
            console.log('✅ All tests passed - SSH security implementation is valid');
            logger.info('SSH Security Validation PASSED');
        } else {
            console.log(`⚠️ ${totalTests - passedTests} non-critical warnings`);
            logger.warn('SSH Security Validation PASSED with warnings');
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new SSHSecurityValidator();
    validator.runValidation().catch(error => {
        logger.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = SSHSecurityValidator;
