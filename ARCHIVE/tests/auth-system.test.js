/**
 * Authentication System Tests for MonsterBox Secure Remote Access
 * 
 * Tests JWT authentication, RBAC, and SSH integration functionality
 */

const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

chai.use(chaiHttp);

// Import the app
const app = require('../app');

// Import services for direct testing
const authService = require('../services/auth/authService');
const rbacService = require('../services/auth/rbacService');
const sshAuthService = require('../services/auth/sshAuthService');

describe('MonsterBox Secure Remote Access System', function() {
    this.timeout(10000); // 10 second timeout for tests
    
    let adminToken = null;
    let operatorToken = null;
    
    before(async function() {
        // Wait for app initialization
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
    
    describe('Authentication Service', function() {
        
        it('should authenticate admin user with correct credentials', async function() {
            const result = await authService.authenticate('admin', 'MonsterBox2024!', {
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent'
            });
            
            expect(result.success).to.be.true;
            expect(result.user).to.exist;
            expect(result.user.username).to.equal('admin');
            expect(result.user.role).to.equal('admin');
            expect(result.tokens).to.exist;
            expect(result.tokens.accessToken).to.exist;
            
            adminToken = result.tokens.accessToken;
        });
        
        it('should reject invalid credentials', async function() {
            const result = await authService.authenticate('admin', 'wrongpassword', {
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent'
            });
            
            expect(result.success).to.be.false;
            expect(result.error).to.equal('Invalid credentials');
        });
        
        it('should verify valid JWT token', async function() {
            if (!adminToken) {
                this.skip();
            }
            
            const result = await authService.verifyAccessToken(adminToken);
            
            expect(result.success).to.be.true;
            expect(result.payload).to.exist;
            expect(result.payload.user.username).to.equal('admin');
        });
        
        it('should reject invalid JWT token', async function() {
            const result = await authService.verifyAccessToken('invalid.token.here');
            
            expect(result.success).to.be.false;
            expect(result.error).to.exist;
        });
    });
    
    describe('RBAC Service', function() {
        
        it('should load RBAC configuration', async function() {
            const roles = await rbacService.getAllRoles();
            
            expect(roles).to.exist;
            expect(roles.admin).to.exist;
            expect(roles.operator).to.exist;
            expect(roles.maintenance).to.exist;
            expect(roles.viewer).to.exist;
        });
        
        it('should validate admin role permissions', async function() {
            const hasSSH = await rbacService.hasPermission('admin', 'ssh');
            const hasAdmin = await rbacService.hasPermission('admin', 'admin');
            const hasView = await rbacService.hasPermission('admin', 'view');
            
            expect(hasSSH).to.be.true;
            expect(hasAdmin).to.be.true;
            expect(hasView).to.be.true;
        });
        
        it('should validate viewer role limitations', async function() {
            const hasSSH = await rbacService.hasPermission('viewer', 'ssh');
            const hasAdmin = await rbacService.hasPermission('viewer', 'admin');
            const hasView = await rbacService.hasPermission('viewer', 'view');
            
            expect(hasSSH).to.be.false;
            expect(hasAdmin).to.be.false;
            expect(hasView).to.be.true;
        });
        
        it('should validate animatronic access', async function() {
            const adminAccess = await rbacService.hasAnimatronicAccess('admin', 'orlok');
            const viewerAccess = await rbacService.hasAnimatronicAccess('viewer', 'orlok');
            
            expect(adminAccess).to.be.true;
            expect(viewerAccess).to.be.true; // Viewer can view all animatronics
        });
        
        it('should generate user authorization summary', async function() {
            const summary = await rbacService.getUserAuthorizationSummary('admin');
            
            expect(summary).to.exist;
            expect(summary.role.id).to.equal('admin');
            expect(summary.permissions).to.include('ssh');
            expect(summary.permissions).to.include('admin');
            expect(summary.animatronics).to.have.length.greaterThan(0);
        });
    });
    
    describe('SSH Authentication Service', function() {
        
        it('should validate SSH commands for admin users', function() {
            const validation = sshAuthService.validateCommand('ls -la', 'admin');
            
            expect(validation.valid).to.be.true;
        });
        
        it('should block dangerous commands for admin users', function() {
            const validation = sshAuthService.validateCommand('rm -rf /', 'admin');
            
            expect(validation.valid).to.be.false;
            expect(validation.reason).to.include('security');
        });
        
        it('should validate allowed commands for operator users', function() {
            const validation = sshAuthService.validateCommand('uptime', 'operator');
            
            expect(validation.valid).to.be.true;
        });
        
        it('should block unauthorized commands for operator users', function() {
            const validation = sshAuthService.validateCommand('rm', 'operator');
            
            expect(validation.valid).to.be.false;
            expect(validation.reason).to.include('allowed list');
        });
    });
    
    describe('Authentication API Endpoints', function() {
        
        it('should provide authentication status', function(done) {
            chai.request(app)
                .get('/auth/status')
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.status).to.equal('operational');
                    expect(res.body.features.jwt).to.be.true;
                    expect(res.body.features.rbac).to.be.true;
                    done();
                });
        });
        
        it('should authenticate via API', function(done) {
            chai.request(app)
                .post('/auth/login')
                .send({
                    username: 'admin',
                    password: 'MonsterBox2024!'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.accessToken).to.exist;
                    expect(res.body.user.username).to.equal('admin');
                    
                    adminToken = res.body.accessToken;
                    done();
                });
        });
        
        it('should verify token via API', function(done) {
            if (!adminToken) {
                this.skip();
            }
            
            chai.request(app)
                .get('/auth/verify')
                .set('Authorization', `Bearer ${adminToken}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.valid).to.be.true;
                    done();
                });
        });
        
        it('should reject requests without authentication', function(done) {
            chai.request(app)
                .get('/auth/me')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    expect(res.body.success).to.be.false;
                    done();
                });
        });
    });
    
    describe('SSH API Endpoints', function() {
        
        it('should provide SSH status for authenticated admin', function(done) {
            if (!adminToken) {
                this.skip();
            }
            
            chai.request(app)
                .get('/ssh/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.sshService.status).to.equal('operational');
                    expect(res.body.user.sshPermission).to.be.true;
                    done();
                });
        });
        
        it('should provide allowed commands list', function(done) {
            if (!adminToken) {
                this.skip();
            }
            
            chai.request(app)
                .get('/ssh/commands')
                .set('Authorization', `Bearer ${adminToken}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    expect(res.body.success).to.be.true;
                    expect(res.body.userRole).to.equal('admin');
                    expect(res.body.allowedCommands).to.exist;
                    done();
                });
        });
        
        it('should validate SSH commands', function(done) {
            if (!adminToken) {
                this.skip();
            }
            
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
        
        it('should reject SSH requests without authentication', function(done) {
            chai.request(app)
                .get('/ssh/status')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    expect(res.body.success).to.be.false;
                    done();
                });
        });
    });
});
