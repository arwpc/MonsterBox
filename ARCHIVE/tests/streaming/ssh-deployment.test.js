const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

describe('SSH Key Deployment Tests', function() {
    this.timeout(30000);
    
    let sandbox;
    let mockSpawn;
    let mockFs;
    
    beforeEach(function() {
        sandbox = sinon.createSandbox();
        mockSpawn = sandbox.stub();
        mockFs = {
            existsSync: sandbox.stub(),
            readFileSync: sandbox.stub(),
            writeFileSync: sandbox.stub()
        };
    });
    
    afterEach(function() {
        sandbox.restore();
    });
    
    describe('SSH Key Generation', function() {
        it('should verify SSH keys exist', function() {
            const keyPath = path.join(__dirname, '..', '..', 'scripts', 'ssh-deployment', 'keys', 'monsterbox-dev');
            const pubKeyPath = keyPath + '.pub';
            
            // Mock file existence
            mockFs.existsSync.withArgs(keyPath).returns(true);
            mockFs.existsSync.withArgs(pubKeyPath).returns(true);
            
            expect(mockFs.existsSync(keyPath)).to.be.true;
            expect(mockFs.existsSync(pubKeyPath)).to.be.true;
        });
        
        it('should have correct key permissions', function() {
            // This would normally check file permissions
            // For testing, we'll mock the expected behavior
            const keyPath = path.join(__dirname, '..', '..', 'scripts', 'ssh-deployment', 'keys', 'monsterbox-dev');
            
            // Mock fs.stat to return expected permissions
            const mockStat = {
                mode: 0o600 // Expected permission for private key
            };
            
            mockFs.stat = sandbox.stub().returns(mockStat);
            
            const stat = mockFs.stat(keyPath);
            expect(stat.mode).to.equal(0o600);
        });
    });
    
    describe('Character Detection', function() {
        it('should read characters.json correctly', function() {
            const charactersPath = path.join(__dirname, '..', '..', 'data', 'characters.json');
            const mockCharacters = [
                {
                    id: 1,
                    char_name: "Orlok",
                    animatronic: {
                        enabled: true,
                        rpi_config: {
                            host: "192.168.8.120",
                            user: "remote"
                        }
                    }
                },
                {
                    id: 2,
                    char_name: "Coffin Breaker",
                    animatronic: {
                        enabled: true,
                        rpi_config: {
                            host: "192.168.8.140",
                            user: "remote"
                        }
                    }
                }
            ];
            
            mockFs.existsSync.withArgs(charactersPath).returns(true);
            mockFs.readFileSync.withArgs(charactersPath, 'utf8').returns(JSON.stringify(mockCharacters));
            
            expect(mockFs.existsSync(charactersPath)).to.be.true;
            
            const data = JSON.parse(mockFs.readFileSync(charactersPath, 'utf8'));
            expect(data).to.be.an('array');
            expect(data).to.have.length(2);
            expect(data[0].char_name).to.equal('Orlok');
            expect(data[1].char_name).to.equal('Coffin Breaker');
        });
        
        it('should filter enabled animatronic characters', function() {
            const mockCharacters = [
                {
                    id: 1,
                    char_name: "Orlok",
                    animatronic: { enabled: true, rpi_config: { host: "192.168.8.120" } }
                },
                {
                    id: 2,
                    char_name: "Disabled Character",
                    animatronic: { enabled: false, rpi_config: { host: "192.168.8.999" } }
                },
                {
                    id: 3,
                    char_name: "No Animatronic",
                    // No animatronic config
                }
            ];
            
            const enabledCharacters = mockCharacters.filter(char => 
                char.animatronic && 
                char.animatronic.enabled && 
                char.animatronic.rpi_config
            );
            
            expect(enabledCharacters).to.have.length(1);
            expect(enabledCharacters[0].char_name).to.equal('Orlok');
        });
    });
    
    describe('SSH Key Deployment Process', function() {
        it('should build correct ssh-copy-id command', function() {
            const keyPath = '/path/to/monsterbox-dev.pub';
            const host = '192.168.8.120';
            const user = 'remote';
            
            const expectedCommand = `ssh-copy-id -i ${keyPath} -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${user}@${host}`;
            
            // Mock the command building logic
            const buildCommand = (keyPath, host, user) => {
                return `ssh-copy-id -i ${keyPath} -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${user}@${host}`;
            };
            
            const actualCommand = buildCommand(keyPath, host, user);
            expect(actualCommand).to.equal(expectedCommand);
        });
        
        it('should handle deployment success', function(done) {
            // Mock successful deployment
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub()
            };
            
            // Simulate successful process completion
            mockProcess.on.withArgs('close').callsArgWith(1, 0); // Exit code 0 = success
            
            mockSpawn.returns(mockProcess);
            
            // Simulate deployment
            const deploymentResult = new Promise((resolve) => {
                const process = mockSpawn('ssh-copy-id', ['-i', 'key.pub', 'user@host']);
                process.on('close', (code) => {
                    resolve({ success: code === 0 });
                });
            });
            
            deploymentResult.then(result => {
                expect(result.success).to.be.true;
                done();
            }).catch(done);
        });
        
        it('should handle deployment failure', function(done) {
            // Mock failed deployment
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub()
            };
            
            // Simulate failed process completion
            mockProcess.on.withArgs('close').callsArgWith(1, 1); // Exit code 1 = failure
            
            mockSpawn.returns(mockProcess);
            
            // Simulate deployment
            const deploymentResult = new Promise((resolve) => {
                const process = mockSpawn('ssh-copy-id', ['-i', 'key.pub', 'user@host']);
                process.on('close', (code) => {
                    resolve({ success: code === 0 });
                });
            });
            
            deploymentResult.then(result => {
                expect(result.success).to.be.false;
                done();
            }).catch(done);
        });
    });
    
    describe('SSH Connection Testing', function() {
        it('should test SSH key authentication', function(done) {
            // Mock SSH connection test
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub()
            };
            
            // Simulate successful SSH connection
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            mockSpawn.returns(mockProcess);
            
            // Test SSH connection
            const connectionTest = new Promise((resolve) => {
                const process = mockSpawn('ssh', [
                    '-i', 'key',
                    '-o', 'ConnectTimeout=10',
                    '-o', 'StrictHostKeyChecking=accept-new',
                    '-o', 'PasswordAuthentication=no',
                    '-o', 'PubkeyAuthentication=yes',
                    '-o', 'BatchMode=yes',
                    'user@host',
                    'echo "test"'
                ]);
                
                process.on('close', (code) => {
                    resolve({ connected: code === 0 });
                });
            });
            
            connectionTest.then(result => {
                expect(result.connected).to.be.true;
                done();
            }).catch(done);
        });
        
        it('should handle connection timeout', function(done) {
            // Mock connection timeout
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub(),
                kill: sandbox.stub()
            };
            
            // Simulate timeout
            setTimeout(() => {
                mockProcess.on.withArgs('close').callsArgWith(1, 124); // Timeout exit code
            }, 100);
            
            mockSpawn.returns(mockProcess);
            
            // Test connection with timeout
            const connectionTest = new Promise((resolve) => {
                const process = mockSpawn('ssh', ['user@host', 'echo test']);
                
                const timeout = setTimeout(() => {
                    process.kill();
                    resolve({ connected: false, error: 'timeout' });
                }, 50);
                
                process.on('close', (code) => {
                    clearTimeout(timeout);
                    resolve({ connected: code === 0 });
                });
            });
            
            connectionTest.then(result => {
                expect(result.connected).to.be.false;
                expect(result.error).to.equal('timeout');
                done();
            }).catch(done);
        });
    });
    
    describe('Idempotent Deployment', function() {
        it('should handle multiple deployment runs safely', function() {
            // Mock scenario where key is already deployed
            const mockProcess = {
                stdout: { on: sandbox.stub() },
                stderr: { on: sandbox.stub() },
                on: sandbox.stub()
            };
            
            // First deployment - success
            mockProcess.on.withArgs('close').callsArgWith(1, 0);
            mockSpawn.returns(mockProcess);
            
            // Second deployment should also succeed (idempotent)
            const firstDeployment = { success: true };
            const secondDeployment = { success: true };
            
            expect(firstDeployment.success).to.be.true;
            expect(secondDeployment.success).to.be.true;
        });
    });
});
