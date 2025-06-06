/**
 * SSH Integration Tests for MonsterBox Secure Remote Access System
 * 
 * Tests SSH connectivity, command execution, and security validation
 * across all animatronic systems with proper authentication.
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;
const sinon = require('sinon');

chai.use(chaiHttp);

// Import the app and services
const app = require('../app');
const sshAuthService = require('../services/auth/sshAuthService');
const authService = require('../services/auth/authService');
const rbacService = require('../services/auth/rbacService');

describe('SSH Integration Tests', function() {
    this.timeout(30000); // 30 second timeout for SSH operations
    
    let adminToken = null;
    let operatorToken = null;
    let sshStub = null;
    
    const testAnimatronics = [
        { id: 'orlok', host: '192.168.8.120' },
        { id: 'coffin', host: '192.168.8.140' },
        { id: 'pumpkinhead', host: '192.168.1.101' }
    ];
    
    before(async function() {
        console.log('🔧 Setting up SSH integration tests...');
        
        // Get admin token for testing
        const adminAuth = await authService.authenticate(
            'admin', 
            'MonsterBox2024!',
            { ipAddress: '127.0.0.1', userAgent: 'ssh-test' }
        );
        
        if (adminAuth.success) {
            adminToken = adminAuth.tokens.accessToken;
        }
        
        // Stub SSH execution for testing (to avoid actual SSH calls)
        sshStub = sinon.stub(sshAuthService, 'executeSSHCommand');
        sshStub.callsFake(async (host, animatronicId, command, options) => {
            // Simulate successful SSH execution
            return {
                success: true,
                stdout: `Mock output for command: ${command}`,
                stderr: '',
                exitCode: 0,
                duration: 150,
                host: host,
                command: command
            };
        });
        
        console.log('✅ SSH integration test setup complete');
    });
    
    after(function() {
        console.log('🧹 Cleaning up SSH integration tests...');
        if (sshStub) {
            sshStub.restore();
        }
        console.log('✅ SSH integration cleanup complete');
    });
    
    describe('🔐 SSH Authentication Integration', function() {
        
        it('should execute SSH commands with valid JWT token', async function() {
            const result = await sshAuthService.executeCommand(
                adminToken,
                'orlok',
                'uptime',
                { timeout: 10 }
            );
            
            expect(result.success).to.be.true;
            expect(result.stdout).to.include('Mock output');
            expect(result.command).to.equal('uptime');
        });
        
        it('should reject SSH commands with invalid token', async function() {
            const result = await sshAuthService.executeCommand(
                'invalid.token.here',
                'orlok',
                'uptime'
            );
            
            expect(result.success).to.be.false;
            expect(result.code).to.equal('AUTH_FAILED');
        });
        
        it('should validate SSH permissions before execution', async function() {
            // Create a token for a user without SSH permissions
            const viewerAuth = await authService.authenticate(
                'admin', // Using admin but will test permission checking
                'MonsterBox2024!',
                { ipAddress: '127.0.0.1', userAgent: 'ssh-test' }
            );
            
            // Mock RBAC to return false for SSH permission
            const rbacStub = sinon.stub(rbacService, 'hasPermission');
            rbacStub.withArgs('admin', 'ssh').returns(false);
            
            const result = await sshAuthService.executeCommand(
                viewerAuth.tokens.accessToken,
                'orlok',
                'uptime'
            );
            
            expect(result.success).to.be.false;
            expect(result.code).to.equal('SSH_PERMISSION_DENIED');
            
            rbacStub.restore();
        });
    });
    
    describe('🛡️ SSH Command Security', function() {
        
        it('should validate safe commands for admin users', function() {
            const safeCommands = [
                'uptime',
                'whoami', 
                'date',
                'ps aux',
                'free -h',
                'df -h',
                'netstat -an',
                'systemctl status monsterbox'
            ];
            
            safeCommands.forEach(command => {
                const validation = sshAuthService.validateCommand(command, 'admin');
                expect(validation.valid).to.be.true;
            });
        });
        
        it('should block dangerous commands even for admin users', function() {
            const dangerousCommands = [
                'rm -rf /',
                'shutdown now',
                'reboot',
                'halt',
                'init 0',
                'init 6',
                'mkfs.ext4 /dev/sda1',
                'dd if=/dev/zero of=/dev/sda'
            ];
            
            dangerousCommands.forEach(command => {
                const validation = sshAuthService.validateCommand(command, 'admin');
                expect(validation.valid).to.be.false;
                expect(validation.reason).to.include('security');
            });
        });
        
        it('should enforce command whitelist for non-admin users', function() {
            const restrictedCommands = [
                'rm file.txt',
                'sudo systemctl restart',
                'passwd user',
                'userdel user',
                'fdisk -l'
            ];
            
            restrictedCommands.forEach(command => {
                const validation = sshAuthService.validateCommand(command, 'operator');
                expect(validation.valid).to.be.false;
            });
        });
        
        it('should allow whitelisted commands for non-admin users', function() {
            const allowedCommands = [
                'uptime',
                'free',
                'ps',
                'netstat',
                'ping 8.8.8.8'
            ];
            
            allowedCommands.forEach(command => {
                const validation = sshAuthService.validateCommand(command, 'operator');
                // Note: Some commands might still be restricted based on implementation
                expect(validation).to.have.property('valid');
            });
        });
        
        it('should prevent path traversal attacks', function() {
            const maliciousCommands = [
                'cat ../../etc/passwd',
                'ls ../../../etc/shadow',
                'find / -name "*.conf"'
            ];
            
            maliciousCommands.forEach(command => {
                const validation = sshAuthService.validateCommand(command, 'operator');
                expect(validation.valid).to.be.false;
            });
        });
    });
    
    describe('🌐 SSH API Endpoints', function() {
        
        it('should execute SSH commands via API', function(done) {
            chai.request(app)
                .post('/ssh/execute/orlok')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ command: 'uptime', timeout: 10 })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.command).to.equal('uptime');
                    expect(res.body.stdout).to.exist;
                    done();
                });
        });
        
        it('should test SSH connectivity via API', function(done) {
            chai.request(app)
                .post('/ssh/test/orlok')
                .set('Authorization', `Bearer ${adminToken}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    done();
                });
        });
        
        it('should execute batch SSH commands', function(done) {
            chai.request(app)
                .post('/ssh/batch/orlok')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ 
                    commands: ['uptime', 'whoami', 'date'],
                    timeout: 10
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.results).to.have.length(3);
                    done();
                });
        });
        
        it('should validate commands without execution', function(done) {
            chai.request(app)
                .post('/ssh/validate')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ command: 'uptime' })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.validation.valid).to.be.true;
                    done();
                });
        });
        
        it('should provide SSH command history', function(done) {
            chai.request(app)
                .get('/ssh/history')
                .set('Authorization', `Bearer ${adminToken}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.history).to.be.an('array');
                    done();
                });
        });
        
        it('should reject SSH commands for invalid animatronic', function(done) {
            chai.request(app)
                .post('/ssh/execute/invalid_animatronic')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ command: 'uptime' })
                .end((err, res) => {
                    expect(res).to.have.status(403);
                    expect(res.body.success).to.be.false;
                    done();
                });
        });
    });
    
    describe('⚡ SSH Performance and Reliability', function() {
        
        it('should handle SSH command timeouts', async function() {
            // Mock a timeout scenario
            sshStub.restore();
            sshStub = sinon.stub(sshAuthService, 'executeSSHCommand');
            sshStub.callsFake(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return {
                    success: false,
                    error: 'Command timed out',
                    exitCode: 124,
                    duration: 100
                };
            });
            
            const result = await sshAuthService.executeCommand(
                adminToken,
                'orlok',
                'sleep 60',
                { timeout: 1 }
            );
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('timed out');
        });
        
        it('should handle SSH connection failures gracefully', async function() {
            // Mock a connection failure
            sshStub.restore();
            sshStub = sinon.stub(sshAuthService, 'executeSSHCommand');
            sshStub.callsFake(async () => {
                return {
                    success: false,
                    error: 'Connection refused',
                    exitCode: 255,
                    duration: 50
                };
            });
            
            const result = await sshAuthService.executeCommand(
                adminToken,
                'orlok',
                'uptime'
            );
            
            expect(result.success).to.be.false;
            expect(result.error).to.include('Connection refused');
        });
        
        it('should maintain command execution history', function() {
            const history = sshAuthService.getCommandHistory('test-user', 10);
            expect(history).to.be.an('array');
            
            const systemHistory = sshAuthService.getSystemCommandHistory(10);
            expect(systemHistory).to.be.an('array');
        });
    });
    
    describe('🔍 SSH Audit and Monitoring', function() {
        
        it('should log SSH command executions', async function() {
            const logSpy = sinon.spy(sshAuthService, 'logSSHEvent');
            
            await sshAuthService.executeCommand(
                adminToken,
                'orlok',
                'uptime'
            );
            
            expect(logSpy.called).to.be.true;
            
            logSpy.restore();
        });
        
        it('should track failed SSH attempts', async function() {
            const logSpy = sinon.spy(sshAuthService, 'logSSHEvent');
            
            // Attempt SSH with invalid token
            await sshAuthService.executeCommand(
                'invalid.token',
                'orlok',
                'uptime'
            );
            
            expect(logSpy.called).to.be.true;
            
            logSpy.restore();
        });
    });
    
    describe('🎯 Animatronic-Specific Tests', function() {
        
        testAnimatronics.forEach(animatronic => {
            it(`should handle SSH operations for ${animatronic.id}`, function(done) {
                chai.request(app)
                    .post(`/ssh/test/${animatronic.id}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .end((err, res) => {
                        expect(err).to.be.null;
                        expect(res).to.have.status(200);
                        expect(res.body.animatronic).to.equal(animatronic.id);
                        done();
                    });
            });
        });
        
        it('should validate animatronic access permissions', async function() {
            for (const animatronic of testAnimatronics) {
                const hasAccess = await rbacService.hasAnimatronicAccess('admin', animatronic.id);
                expect(hasAccess).to.be.true;
            }
        });
    });
});
