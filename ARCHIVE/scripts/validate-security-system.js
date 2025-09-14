#!/usr/bin/env node

/**
 * Security System Validation Script for MonsterBox
 * 
 * Comprehensive validation of the secure remote access system
 * to ensure all components are working correctly.
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class SecuritySystemValidator {
    constructor() {
        this.validationResults = {
            components: [],
            overall: 'UNKNOWN',
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Run complete system validation
     */
    async validate() {
        console.log('🔐 MonsterBox Security System Validation');
        console.log('=' .repeat(50));
        console.log();
        
        try {
            // Validate system components
            await this.validateComponents();
            
            // Run automated tests
            await this.runAutomatedTests();
            
            // Generate validation report
            await this.generateValidationReport();
            
            // Determine overall status
            this.determineOverallStatus();
            
            console.log(`\n🏁 Validation Complete - Status: ${this.validationResults.overall}`);
            
            return this.validationResults.overall === 'OPERATIONAL';
            
        } catch (error) {
            console.error('💥 Validation failed:', error.message);
            this.validationResults.overall = 'FAILED';
            return false;
        }
    }
    
    /**
     * Validate individual system components
     */
    async validateComponents() {
        console.log('🔍 Validating system components...');
        
        const components = [
            {
                name: 'JWT Configuration',
                validate: () => this.validateJWTConfig()
            },
            {
                name: 'Authentication Service',
                validate: () => this.validateAuthService()
            },
            {
                name: 'RBAC System',
                validate: () => this.validateRBACSystem()
            },
            {
                name: 'SSH Integration',
                validate: () => this.validateSSHIntegration()
            },
            {
                name: 'API Endpoints',
                validate: () => this.validateAPIEndpoints()
            },
            {
                name: 'Security Middleware',
                validate: () => this.validateSecurityMiddleware()
            },
            {
                name: 'Data Integrity',
                validate: () => this.validateDataIntegrity()
            }
        ];
        
        for (const component of components) {
            try {
                const result = await component.validate();
                this.validationResults.components.push({
                    name: component.name,
                    status: result.success ? 'PASS' : 'FAIL',
                    details: result.details || '',
                    issues: result.issues || []
                });
                
                const icon = result.success ? '✅' : '❌';
                console.log(`${icon} ${component.name}: ${result.success ? 'PASS' : 'FAIL'}`);
                
                if (result.issues && result.issues.length > 0) {
                    result.issues.forEach(issue => {
                        console.log(`   ⚠️  ${issue}`);
                    });
                }
                
            } catch (error) {
                this.validationResults.components.push({
                    name: component.name,
                    status: 'ERROR',
                    details: error.message,
                    issues: [error.message]
                });
                
                console.log(`❌ ${component.name}: ERROR - ${error.message}`);
            }
        }
        
        console.log();
    }
    
    /**
     * Validate JWT configuration
     */
    async validateJWTConfig() {
        const issues = [];
        
        // Check environment variables
        require('dotenv').config();
        
        if (!process.env.JWT_SECRET) {
            issues.push('JWT_SECRET not configured');
        } else if (process.env.JWT_SECRET.length < 32) {
            issues.push('JWT_SECRET is too short (minimum 32 characters)');
        }
        
        if (!process.env.JWT_REFRESH_SECRET) {
            issues.push('JWT_REFRESH_SECRET not configured');
        }
        
        // Check JWT config file
        try {
            const jwtConfig = require('../config/auth/jwt-config');
            if (!jwtConfig.jwtConfig) {
                issues.push('JWT configuration object not found');
            }
        } catch (error) {
            issues.push(`JWT config file error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'JWT configuration validation',
            issues
        };
    }
    
    /**
     * Validate authentication service
     */
    async validateAuthService() {
        const issues = [];
        
        try {
            const authService = require('../services/auth/authService');
            
            // Check required methods
            const requiredMethods = ['authenticate', 'verifyAccessToken', 'refreshAccessToken', 'logout'];
            for (const method of requiredMethods) {
                if (typeof authService[method] !== 'function') {
                    issues.push(`Missing method: ${method}`);
                }
            }
            
            // Check data files exist
            const dataFiles = [
                '../data/auth/users.json',
                '../data/auth/sessions.json',
                '../data/auth/audit.json'
            ];
            
            for (const file of dataFiles) {
                try {
                    await fs.access(path.join(__dirname, file));
                } catch {
                    issues.push(`Data file missing: ${file}`);
                }
            }
            
        } catch (error) {
            issues.push(`Service loading error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'Authentication service validation',
            issues
        };
    }
    
    /**
     * Validate RBAC system
     */
    async validateRBACSystem() {
        const issues = [];
        
        try {
            const rbacService = require('../services/auth/rbacService');
            
            // Load RBAC configuration
            const config = await rbacService.loadRBACConfig();
            
            // Check required roles
            const requiredRoles = ['admin', 'operator', 'maintenance', 'viewer'];
            for (const role of requiredRoles) {
                if (!config.roles[role]) {
                    issues.push(`Missing role: ${role}`);
                }
            }
            
            // Check required permissions
            const requiredPermissions = ['view', 'control', 'configure', 'ssh', 'admin'];
            for (const permission of requiredPermissions) {
                if (!config.permissions[permission]) {
                    issues.push(`Missing permission: ${permission}`);
                }
            }
            
            // Check animatronics
            const requiredAnimatronics = ['orlok', 'coffin', 'pumpkinhead'];
            for (const animatronic of requiredAnimatronics) {
                if (!config.animatronics[animatronic]) {
                    issues.push(`Missing animatronic: ${animatronic}`);
                }
            }
            
        } catch (error) {
            issues.push(`RBAC system error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'RBAC system validation',
            issues
        };
    }
    
    /**
     * Validate SSH integration
     */
    async validateSSHIntegration() {
        const issues = [];
        
        try {
            const sshAuthService = require('../services/auth/sshAuthService');
            
            // Check SSH service methods
            const requiredMethods = ['executeCommand', 'validateCommand', 'testConnectivity'];
            for (const method of requiredMethods) {
                if (typeof sshAuthService[method] !== 'function') {
                    issues.push(`Missing SSH method: ${method}`);
                }
            }
            
            // Check SSH credentials
            try {
                const sshCredentials = require('../scripts/ssh-credentials');
                const animatronics = ['orlok', 'coffin', 'pumpkinhead'];
                
                for (const animatronic of animatronics) {
                    const creds = sshCredentials.getCredentials(animatronic);
                    if (!creds.user || !creds.password) {
                        issues.push(`SSH credentials missing for ${animatronic}`);
                    }
                }
            } catch (error) {
                issues.push(`SSH credentials error: ${error.message}`);
            }
            
        } catch (error) {
            issues.push(`SSH integration error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'SSH integration validation',
            issues
        };
    }
    
    /**
     * Validate API endpoints
     */
    async validateAPIEndpoints() {
        const issues = [];
        
        try {
            // Check route files exist
            const routeFiles = [
                '../routes/auth/authRoutes.js',
                '../routes/auth/sshRoutes.js'
            ];
            
            for (const file of routeFiles) {
                try {
                    await fs.access(path.join(__dirname, file));
                    require(file); // Try to load the route
                } catch (error) {
                    issues.push(`Route file error: ${file} - ${error.message}`);
                }
            }
            
        } catch (error) {
            issues.push(`API endpoint validation error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'API endpoints validation',
            issues
        };
    }
    
    /**
     * Validate security middleware
     */
    async validateSecurityMiddleware() {
        const issues = [];
        
        try {
            // Check middleware files
            const middlewareFiles = [
                '../middleware/auth.js',
                '../middleware/rbac.js',
                '../middleware/sshAuth.js'
            ];
            
            for (const file of middlewareFiles) {
                try {
                    const middleware = require(file);
                    if (typeof middleware !== 'object') {
                        issues.push(`Invalid middleware export: ${file}`);
                    }
                } catch (error) {
                    issues.push(`Middleware error: ${file} - ${error.message}`);
                }
            }
            
        } catch (error) {
            issues.push(`Security middleware validation error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'Security middleware validation',
            issues
        };
    }
    
    /**
     * Validate data integrity
     */
    async validateDataIntegrity() {
        const issues = [];
        
        try {
            // Check roles.json structure
            const rolesPath = path.join(__dirname, '../data/auth/roles.json');
            const rolesData = await fs.readFile(rolesPath, 'utf8');
            const roles = JSON.parse(rolesData);
            
            if (!roles.roles || !roles.permissions || !roles.animatronics) {
                issues.push('Invalid roles.json structure');
            }
            
            // Check users.json if it exists
            try {
                const usersPath = path.join(__dirname, '../data/auth/users.json');
                const usersData = await fs.readFile(usersPath, 'utf8');
                const users = JSON.parse(usersData);
                
                if (!users.users || !Array.isArray(users.users)) {
                    issues.push('Invalid users.json structure');
                }
            } catch {
                // users.json might not exist yet, which is okay
            }
            
        } catch (error) {
            issues.push(`Data integrity error: ${error.message}`);
        }
        
        return {
            success: issues.length === 0,
            details: 'Data integrity validation',
            issues
        };
    }
    
    /**
     * Run automated tests
     */
    async runAutomatedTests() {
        console.log('🧪 Running automated tests...');
        
        try {
            const testResult = await this.runTestCommand();
            
            this.validationResults.testResults = {
                success: testResult.success,
                passed: testResult.passed,
                failed: testResult.failed,
                total: testResult.total
            };
            
            if (testResult.success) {
                console.log(`✅ Tests: ${testResult.passed}/${testResult.total} passed`);
            } else {
                console.log(`❌ Tests: ${testResult.failed}/${testResult.total} failed`);
            }
            
        } catch (error) {
            console.log(`⚠️  Test execution error: ${error.message}`);
            this.validationResults.testResults = {
                success: false,
                error: error.message
            };
        }
        
        console.log();
    }
    
    /**
     * Run test command
     */
    async runTestCommand() {
        return new Promise((resolve) => {
            const testProcess = spawn('npm', ['run', 'test:security'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.join(__dirname, '..')
            });
            
            let output = '';
            
            testProcess.stdout.on('data', (data) => output += data.toString());
            testProcess.stderr.on('data', (data) => output += data.toString());
            
            testProcess.on('close', (code) => {
                const success = code === 0;
                
                // Parse test results from output
                const passingMatch = output.match(/(\d+) passing/);
                const failingMatch = output.match(/(\d+) failing/);
                
                const passed = passingMatch ? parseInt(passingMatch[1]) : 0;
                const failed = failingMatch ? parseInt(failingMatch[1]) : 0;
                
                resolve({
                    success,
                    passed,
                    failed,
                    total: passed + failed
                });
            });
        });
    }
    
    /**
     * Generate validation report
     */
    async generateValidationReport() {
        const reportPath = path.join(__dirname, '../reports/security-validation-report.json');
        
        try {
            await fs.mkdir(path.dirname(reportPath), { recursive: true });
            await fs.writeFile(reportPath, JSON.stringify(this.validationResults, null, 2));
            console.log(`📄 Validation report saved: ${reportPath}`);
        } catch (error) {
            console.log(`⚠️  Could not save validation report: ${error.message}`);
        }
    }
    
    /**
     * Determine overall system status
     */
    determineOverallStatus() {
        const componentFailures = this.validationResults.components.filter(c => c.status !== 'PASS');
        const testFailures = this.validationResults.testResults && !this.validationResults.testResults.success;
        
        if (componentFailures.length === 0 && !testFailures) {
            this.validationResults.overall = 'OPERATIONAL';
        } else if (componentFailures.some(c => c.status === 'ERROR')) {
            this.validationResults.overall = 'CRITICAL';
        } else {
            this.validationResults.overall = 'DEGRADED';
        }
    }
}

// Run validation if this script is executed directly
if (require.main === module) {
    const validator = new SecuritySystemValidator();
    validator.validate().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(error => {
        console.error('Validation error:', error);
        process.exit(1);
    });
}

module.exports = SecuritySystemValidator;
