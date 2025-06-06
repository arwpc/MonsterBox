/**
 * RBAC System Tests for MonsterBox Secure Remote Access System
 * 
 * Comprehensive tests for Role-Based Access Control functionality,
 * permission validation, and authorization enforcement.
 */

const chai = require('chai');
const expect = chai.expect;
const fs = require('fs').promises;
const path = require('path');

// Import RBAC service
const rbacService = require('../services/auth/rbacService');

describe('RBAC System Tests', function() {
    this.timeout(10000);
    
    const testRoles = ['admin', 'operator', 'maintenance', 'viewer'];
    const testAnimatronics = ['orlok', 'coffin', 'pumpkinhead'];
    const testPermissions = [
        'view', 'control', 'configure', 'ssh', 'admin',
        'user_management', 'system_management', 'audit_access',
        'security_management', 'diagnostics', 'maintenance'
    ];
    
    before(async function() {
        console.log('🔧 Setting up RBAC system tests...');
        // Clear any cached data
        rbacService.clearCache();
        console.log('✅ RBAC test setup complete');
    });
    
    describe('📋 Role Configuration Tests', function() {
        
        it('should load RBAC configuration successfully', async function() {
            const config = await rbacService.loadRBACConfig();
            
            expect(config).to.exist;
            expect(config.roles).to.exist;
            expect(config.permissions).to.exist;
            expect(config.animatronics).to.exist;
        });
        
        it('should have all required roles defined', async function() {
            const roles = await rbacService.getAllRoles();
            
            testRoles.forEach(roleId => {
                expect(roles[roleId]).to.exist;
                expect(roles[roleId].id).to.equal(roleId);
                expect(roles[roleId].name).to.exist;
                expect(roles[roleId].permissions).to.be.an('array');
                expect(roles[roleId].animatronicAccess).to.be.an('array');
            });
        });
        
        it('should have all required permissions defined', async function() {
            const permissions = await rbacService.getAllPermissions();
            
            testPermissions.forEach(permissionId => {
                expect(permissions[permissionId]).to.exist;
                expect(permissions[permissionId].id).to.equal(permissionId);
                expect(permissions[permissionId].name).to.exist;
                expect(permissions[permissionId].category).to.exist;
            });
        });
        
        it('should have all animatronics defined', async function() {
            const animatronics = await rbacService.getAllAnimatronics();
            
            testAnimatronics.forEach(animatronicId => {
                expect(animatronics[animatronicId]).to.exist;
                expect(animatronics[animatronicId].id).to.equal(animatronicId);
                expect(animatronics[animatronicId].host).to.exist;
                expect(animatronics[animatronicId].status).to.exist;
            });
        });
    });
    
    describe('🔐 Permission Validation Tests', function() {
        
        it('should validate admin role permissions', async function() {
            const adminPermissions = ['view', 'control', 'configure', 'ssh', 'admin'];
            
            for (const permission of adminPermissions) {
                const hasPermission = await rbacService.hasPermission('admin', permission);
                expect(hasPermission).to.be.true;
            }
        });
        
        it('should validate operator role permissions', async function() {
            const operatorPermissions = ['view', 'control', 'configure'];
            const restrictedPermissions = ['ssh', 'admin', 'user_management'];
            
            for (const permission of operatorPermissions) {
                const hasPermission = await rbacService.hasPermission('operator', permission);
                expect(hasPermission).to.be.true;
            }
            
            for (const permission of restrictedPermissions) {
                const hasPermission = await rbacService.hasPermission('operator', permission);
                expect(hasPermission).to.be.false;
            }
        });
        
        it('should validate maintenance role permissions', async function() {
            const maintenancePermissions = ['view', 'control', 'configure', 'ssh', 'diagnostics', 'maintenance'];
            const restrictedPermissions = ['admin', 'user_management', 'security_management'];
            
            for (const permission of maintenancePermissions) {
                const hasPermission = await rbacService.hasPermission('maintenance', permission);
                expect(hasPermission).to.be.true;
            }
            
            for (const permission of restrictedPermissions) {
                const hasPermission = await rbacService.hasPermission('maintenance', permission);
                expect(hasPermission).to.be.false;
            }
        });
        
        it('should validate viewer role limitations', async function() {
            const allowedPermissions = ['view'];
            const restrictedPermissions = ['control', 'configure', 'ssh', 'admin'];
            
            for (const permission of allowedPermissions) {
                const hasPermission = await rbacService.hasPermission('viewer', permission);
                expect(hasPermission).to.be.true;
            }
            
            for (const permission of restrictedPermissions) {
                const hasPermission = await rbacService.hasPermission('viewer', permission);
                expect(hasPermission).to.be.false;
            }
        });
        
        it('should handle invalid role permissions', async function() {
            const hasPermission = await rbacService.hasPermission('invalid_role', 'view');
            expect(hasPermission).to.be.false;
        });
        
        it('should handle invalid permission checks', async function() {
            const hasPermission = await rbacService.hasPermission('admin', 'invalid_permission');
            expect(hasPermission).to.be.false;
        });
    });
    
    describe('🎯 Animatronic Access Tests', function() {
        
        it('should validate admin access to all animatronics', async function() {
            for (const animatronic of testAnimatronics) {
                const hasAccess = await rbacService.hasAnimatronicAccess('admin', animatronic);
                expect(hasAccess).to.be.true;
            }
        });
        
        it('should validate operator access to all animatronics', async function() {
            for (const animatronic of testAnimatronics) {
                const hasAccess = await rbacService.hasAnimatronicAccess('operator', animatronic);
                expect(hasAccess).to.be.true;
            }
        });
        
        it('should validate specialized operator access', async function() {
            const specializedRoles = [
                { role: 'orlok_operator', animatronic: 'orlok', shouldHaveAccess: true },
                { role: 'orlok_operator', animatronic: 'coffin', shouldHaveAccess: false },
                { role: 'coffin_operator', animatronic: 'coffin', shouldHaveAccess: true },
                { role: 'coffin_operator', animatronic: 'orlok', shouldHaveAccess: false }
            ];
            
            for (const test of specializedRoles) {
                const hasAccess = await rbacService.hasAnimatronicAccess(test.role, test.animatronic);
                expect(hasAccess).to.equal(test.shouldHaveAccess);
            }
        });
        
        it('should handle invalid animatronic access checks', async function() {
            const hasAccess = await rbacService.hasAnimatronicAccess('admin', 'invalid_animatronic');
            expect(hasAccess).to.be.false;
        });
    });
    
    describe('⚡ Action Authorization Tests', function() {
        
        it('should validate admin can perform all actions on all animatronics', async function() {
            const actions = ['view', 'control', 'configure', 'ssh'];
            
            for (const animatronic of testAnimatronics) {
                for (const action of actions) {
                    const canPerform = await rbacService.canPerformAction('admin', animatronic, action);
                    expect(canPerform).to.be.true;
                }
            }
        });
        
        it('should validate operator action limitations', async function() {
            const allowedActions = ['view', 'control', 'configure'];
            const restrictedActions = ['ssh'];
            
            for (const animatronic of testAnimatronics) {
                for (const action of allowedActions) {
                    const canPerform = await rbacService.canPerformAction('operator', animatronic, action);
                    expect(canPerform).to.be.true;
                }
                
                for (const action of restrictedActions) {
                    const canPerform = await rbacService.canPerformAction('operator', animatronic, action);
                    expect(canPerform).to.be.false;
                }
            }
        });
        
        it('should validate maintenance SSH access', async function() {
            for (const animatronic of testAnimatronics) {
                const canSSH = await rbacService.canPerformAction('maintenance', animatronic, 'ssh');
                expect(canSSH).to.be.true;
            }
        });
        
        it('should validate viewer action limitations', async function() {
            const allowedActions = ['view'];
            const restrictedActions = ['control', 'configure', 'ssh'];
            
            for (const animatronic of testAnimatronics) {
                for (const action of allowedActions) {
                    const canPerform = await rbacService.canPerformAction('viewer', animatronic, action);
                    expect(canPerform).to.be.true;
                }
                
                for (const action of restrictedActions) {
                    const canPerform = await rbacService.canPerformAction('viewer', animatronic, action);
                    expect(canPerform).to.be.false;
                }
            }
        });
    });
    
    describe('📊 Role Hierarchy Tests', function() {
        
        it('should validate role priority hierarchy', async function() {
            const hierarchy = await rbacService.getRoleHierarchy();
            
            expect(hierarchy).to.be.an('array');
            expect(hierarchy.length).to.be.greaterThan(0);
            
            // Check that roles are sorted by priority (highest first)
            for (let i = 1; i < hierarchy.length; i++) {
                expect(hierarchy[i-1].priority).to.be.greaterThanOrEqual(hierarchy[i].priority);
            }
            
            // Admin should have highest priority
            const adminRole = hierarchy.find(role => role.id === 'admin');
            expect(adminRole).to.exist;
            expect(adminRole.priority).to.equal(100);
        });
        
        it('should generate effective permissions correctly', async function() {
            const adminPermissions = await rbacService.getEffectivePermissions('admin');
            const operatorPermissions = await rbacService.getEffectivePermissions('operator');
            
            expect(adminPermissions).to.include('admin');
            expect(adminPermissions).to.include('ssh');
            expect(adminPermissions).to.include('view');
            
            expect(operatorPermissions).to.include('view');
            expect(operatorPermissions).to.include('control');
            expect(operatorPermissions).to.not.include('admin');
            expect(operatorPermissions).to.not.include('ssh');
        });
        
        it('should generate effective animatronic access correctly', async function() {
            const adminAccess = await rbacService.getEffectiveAnimatronicAccess('admin');
            const orlokOperatorAccess = await rbacService.getEffectiveAnimatronicAccess('orlok_operator');
            
            expect(adminAccess).to.include('orlok');
            expect(adminAccess).to.include('coffin');
            expect(adminAccess).to.include('pumpkinhead');
            
            expect(orlokOperatorAccess).to.include('orlok');
            expect(orlokOperatorAccess).to.not.include('coffin');
        });
    });
    
    describe('🔍 Authorization Summary Tests', function() {
        
        it('should generate comprehensive authorization summary for admin', async function() {
            const summary = await rbacService.getUserAuthorizationSummary('admin');
            
            expect(summary).to.exist;
            expect(summary.role.id).to.equal('admin');
            expect(summary.permissions).to.include('admin');
            expect(summary.animatronics).to.have.length(3);
            expect(summary.summary.canView).to.be.true;
            expect(summary.summary.canControl).to.be.true;
            expect(summary.summary.canSSH).to.be.true;
            expect(summary.summary.isAdmin).to.be.true;
        });
        
        it('should generate authorization summary for operator', async function() {
            const summary = await rbacService.getUserAuthorizationSummary('operator');
            
            expect(summary).to.exist;
            expect(summary.role.id).to.equal('operator');
            expect(summary.permissions).to.include('control');
            expect(summary.summary.canView).to.be.true;
            expect(summary.summary.canControl).to.be.true;
            expect(summary.summary.canSSH).to.be.false;
            expect(summary.summary.isAdmin).to.be.false;
        });
        
        it('should generate authorization summary for viewer', async function() {
            const summary = await rbacService.getUserAuthorizationSummary('viewer');
            
            expect(summary).to.exist;
            expect(summary.role.id).to.equal('viewer');
            expect(summary.summary.canView).to.be.true;
            expect(summary.summary.canControl).to.be.false;
            expect(summary.summary.canSSH).to.be.false;
            expect(summary.summary.isAdmin).to.be.false;
        });
        
        it('should handle invalid role in authorization summary', async function() {
            const summary = await rbacService.getUserAuthorizationSummary('invalid_role');
            expect(summary).to.be.null;
        });
    });
    
    describe('🔧 Role Validation Tests', function() {
        
        it('should validate existing roles', async function() {
            for (const roleId of testRoles) {
                const validation = await rbacService.validateRole(roleId);
                expect(validation.valid).to.be.true;
                expect(validation.role).to.exist;
            }
        });
        
        it('should reject invalid roles', async function() {
            const validation = await rbacService.validateRole('invalid_role');
            expect(validation.valid).to.be.false;
            expect(validation.code).to.equal('ROLE_NOT_FOUND');
        });
    });
    
    describe('🎮 Animatronic Status Tests', function() {
        
        it('should check animatronic operational status', async function() {
            const orlokOperational = await rbacService.isAnimatronicOperational('orlok');
            const coffinOperational = await rbacService.isAnimatronicOperational('coffin');
            
            expect(orlokOperational).to.be.true;
            expect(coffinOperational).to.be.true;
        });
        
        it('should handle non-operational animatronics', async function() {
            // Pumpkinhead is marked as maintenance in the configuration
            const pumpkinheadOperational = await rbacService.isAnimatronicOperational('pumpkinhead');
            expect(pumpkinheadOperational).to.be.false;
        });
        
        it('should handle invalid animatronic status checks', async function() {
            const invalidOperational = await rbacService.isAnimatronicOperational('invalid_animatronic');
            expect(invalidOperational).to.be.false;
        });
    });
    
    describe('💾 Cache Management Tests', function() {
        
        it('should cache RBAC configuration for performance', async function() {
            // Clear cache first
            rbacService.clearCache();
            
            // First load should read from file
            const start1 = Date.now();
            await rbacService.getAllRoles();
            const duration1 = Date.now() - start1;
            
            // Second load should use cache (should be faster)
            const start2 = Date.now();
            await rbacService.getAllRoles();
            const duration2 = Date.now() - start2;
            
            expect(duration2).to.be.lessThan(duration1);
        });
        
        it('should clear cache when requested', async function() {
            // Load data to populate cache
            await rbacService.getAllRoles();
            
            // Clear cache
            rbacService.clearCache();
            
            // Verify cache is cleared by checking internal state
            expect(rbacService.cache.roles).to.be.null;
        });
    });
});
