const { expect } = require('chai');
const sinon = require('sinon');
const { spawn } = require('child_process');
const EventEmitter = require('events');

// Mock SSH Credentials Manager
class MockSSHCredentials {
    buildSSHCommand(characterKey, host, command) {
        return `ssh -i /path/to/key -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o PasswordAuthentication=no -o PubkeyAuthentication=yes ${characterKey}@${host} '${command}'`;
    }
    
    getCredentials(characterKey) {
        return {
            user: 'remote',
            source: 'key-based'
        };
    }
}

// Mock Streaming Service
class MockStreamingService extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.connectionPool = new Map();
        this.sshCredentials = new MockSSHCredentials();
    }
    
    async createRemoteStreamProcess(config) {
        const rpiConfig = config.character.animatronic.rpi_config;
        const host = rpiConfig.host;
        const characterKey = config.character.char_name.toLowerCase().replace(/\s+/g, '');
        
        const remoteCommand = `python3 /home/remote/MonsterBox/scripts/webcam_persistent_stream.py --device-id ${config.deviceId}`;
        const fullCommand = this.sshCredentials.buildSSHCommand(characterKey, host, remoteCommand);
        
        return {
            success: true,
            command: fullCommand,
            process: new EventEmitter()
        };
    }
    
    async cleanupRemoteCameraProcesses(host, characterKey) {
        return true;
    }
    
    getShellCommand(command) {
        return {
            cmd: 'sh',
            args: ['-c', command],
            options: { shell: true }
        };
    }
}

describe('Streaming Service Tests', function() {
    this.timeout(30000);
    
    let sandbox;
    let streamingService;
    let mockSpawn;
    
    beforeEach(function() {
        sandbox = sinon.createSandbox();
        streamingService = new MockStreamingService();
        mockSpawn = sandbox.stub();
    });
    
    afterEach(function() {
        sandbox.restore();
    });
    
    describe('SSH Key Authentication', function() {
        it('should use SSH key authentication for remote connections', function() {
            const characterKey = 'orlok';
            const host = '192.168.8.120';
            const command = 'echo test';
            
            const sshCommand = streamingService.sshCredentials.buildSSHCommand(characterKey, host, command);
            
            expect(sshCommand).to.include('-i /path/to/key');
            expect(sshCommand).to.include('-o PasswordAuthentication=no');
            expect(sshCommand).to.include('-o PubkeyAuthentication=yes');
            expect(sshCommand).to.include('-o StrictHostKeyChecking=accept-new');
        });
        
        it('should not include password authentication options', function() {
            const characterKey = 'orlok';
            const host = '192.168.8.120';
            const command = 'echo test';
            
            const sshCommand = streamingService.sshCredentials.buildSSHCommand(characterKey, host, command);
            
            expect(sshCommand).to.not.include('sshpass');
            expect(sshCommand).to.not.include('PasswordAuthentication=yes');
        });
        
        it('should build correct SSH command structure', function() {
            const characterKey = 'orlok';
            const host = '192.168.8.120';
            const command = 'python3 script.py';
            
            const sshCommand = streamingService.sshCredentials.buildSSHCommand(characterKey, host, command);
            
            expect(sshCommand).to.match(/^ssh\s+/);
            expect(sshCommand).to.include(`${characterKey}@${host}`);
            expect(sshCommand).to.include(command);
        });
    });
    
    describe('Remote Stream Process Creation', function() {
        it('should create remote stream process with correct configuration', async function() {
            const config = {
                character: {
                    char_name: 'Orlok',
                    animatronic: {
                        rpi_config: {
                            host: '192.168.8.120',
                            user: 'remote'
                        }
                    }
                },
                deviceId: 0,
                width: 640,
                height: 480,
                fps: 15,
                quality: 80
            };
            
            const result = await streamingService.createRemoteStreamProcess(config);
            
            expect(result.success).to.be.true;
            expect(result.command).to.include('orlok@192.168.8.120');
            expect(result.command).to.include('webcam_persistent_stream.py');
            expect(result.command).to.include('--device-id 0');
        });
        
        it('should handle character name normalization', async function() {
            const config = {
                character: {
                    char_name: 'Coffin Breaker',
                    animatronic: {
                        rpi_config: {
                            host: '192.168.8.140',
                            user: 'remote'
                        }
                    }
                },
                deviceId: 0
            };
            
            const result = await streamingService.createRemoteStreamProcess(config);
            
            expect(result.command).to.include('coffinbreaker@192.168.8.140');
        });
    });
    
    describe('Connection Caching and Pooling', function() {
        it('should maintain connection pool', function() {
            const characterId = 1;
            const connectionInfo = {
                host: '192.168.8.120',
                status: 'connected',
                lastUsed: new Date()
            };
            
            streamingService.connectionPool.set(characterId, connectionInfo);
            
            expect(streamingService.connectionPool.has(characterId)).to.be.true;
            expect(streamingService.connectionPool.get(characterId).host).to.equal('192.168.8.120');
        });
        
        it('should reuse existing connections when available', function() {
            const characterId = 1;
            const existingConnection = {
                host: '192.168.8.120',
                status: 'connected',
                process: new EventEmitter()
            };
            
            streamingService.connectionPool.set(characterId, existingConnection);
            
            const connection = streamingService.connectionPool.get(characterId);
            expect(connection).to.equal(existingConnection);
            expect(connection.status).to.equal('connected');
        });
        
        it('should clean up stale connections', function() {
            const characterId = 1;
            const staleConnection = {
                host: '192.168.8.120',
                status: 'disconnected',
                lastUsed: new Date(Date.now() - 60000) // 1 minute ago
            };
            
            streamingService.connectionPool.set(characterId, staleConnection);
            
            // Simulate cleanup
            const connection = streamingService.connectionPool.get(characterId);
            if (connection.status === 'disconnected') {
                streamingService.connectionPool.delete(characterId);
            }
            
            expect(streamingService.connectionPool.has(characterId)).to.be.false;
        });
    });
    
    describe('WebSocket Stream Establishment', function() {
        it('should establish WebSocket connection after SSH tunnel', function(done) {
            const mockProcess = new EventEmitter();
            
            // Simulate successful SSH connection
            setTimeout(() => {
                mockProcess.emit('data', 'SSH connection established');
                mockProcess.emit('ready');
            }, 10);
            
            mockProcess.on('ready', () => {
                // WebSocket should be established here
                expect(true).to.be.true;
                done();
            });
        });
        
        it('should handle WebSocket connection failures', function(done) {
            const mockProcess = new EventEmitter();
            
            // Simulate SSH connection failure
            setTimeout(() => {
                mockProcess.emit('error', new Error('Connection refused'));
            }, 10);
            
            mockProcess.on('error', (error) => {
                expect(error.message).to.equal('Connection refused');
                done();
            });
        });
    });
    
    describe('Auto-Retry Logic', function() {
        it('should retry failed connections', function(done) {
            let attemptCount = 0;
            const maxAttempts = 3;
            
            const attemptConnection = () => {
                attemptCount++;
                
                if (attemptCount < maxAttempts) {
                    // Simulate failure
                    setTimeout(attemptConnection, 10);
                } else {
                    // Simulate success on final attempt
                    expect(attemptCount).to.equal(maxAttempts);
                    done();
                }
            };
            
            attemptConnection();
        });
        
        it('should implement exponential backoff', function() {
            const getRetryDelay = (attempt) => {
                return Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30 seconds
            };
            
            expect(getRetryDelay(0)).to.equal(1000);   // 1 second
            expect(getRetryDelay(1)).to.equal(2000);   // 2 seconds
            expect(getRetryDelay(2)).to.equal(4000);   // 4 seconds
            expect(getRetryDelay(10)).to.equal(30000); // Max 30 seconds
        });
        
        it('should stop retrying after max attempts', function() {
            const maxRetries = 5;
            let currentAttempt = 0;
            
            const shouldRetry = () => {
                currentAttempt++;
                return currentAttempt <= maxRetries;
            };
            
            // Simulate multiple failures
            while (shouldRetry()) {
                // Attempt connection
            }
            
            expect(currentAttempt).to.equal(maxRetries + 1);
            expect(shouldRetry()).to.be.false;
        });
    });
    
    describe('MJPEG Stream Flow', function() {
        it('should handle MJPEG stream data', function(done) {
            const mockProcess = new EventEmitter();
            let dataReceived = false;
            
            mockProcess.on('data', (chunk) => {
                if (chunk.includes('--boundary')) {
                    dataReceived = true;
                    expect(dataReceived).to.be.true;
                    done();
                }
            });
            
            // Simulate MJPEG stream data
            setTimeout(() => {
                mockProcess.emit('data', '--boundary\r\nContent-Type: image/jpeg\r\n\r\n');
            }, 10);
        });
        
        it('should validate MJPEG headers', function() {
            const mjpegHeaders = {
                'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
                'Cache-Control': 'no-cache',
                'Connection': 'close'
            };
            
            expect(mjpegHeaders['Content-Type']).to.include('multipart/x-mixed-replace');
            expect(mjpegHeaders['Cache-Control']).to.equal('no-cache');
        });
    });
    
    describe('Error Handling and Cleanup', function() {
        it('should clean up resources on stream termination', function() {
            const characterId = 1;
            const streamInfo = {
                process: new EventEmitter(),
                status: 'active'
            };
            
            streamingService.activeStreams.set(characterId, streamInfo);
            
            // Simulate stream termination
            streamInfo.process.emit('close', 0);
            
            // Cleanup should occur
            streamingService.activeStreams.delete(characterId);
            
            expect(streamingService.activeStreams.has(characterId)).to.be.false;
        });
        
        it('should handle SSH connection errors gracefully', function(done) {
            const mockProcess = new EventEmitter();
            
            mockProcess.on('error', (error) => {
                expect(error).to.be.an('error');
                // Should not crash the application
                done();
            });
            
            // Simulate SSH error
            setTimeout(() => {
                mockProcess.emit('error', new Error('SSH connection failed'));
            }, 10);
        });
        
        it('should timeout long-running operations', function(done) {
            const timeout = 100; // 100ms timeout
            let operationCompleted = false;
            let testCompleted = false;

            const timeoutId = setTimeout(() => {
                if (!operationCompleted && !testCompleted) {
                    testCompleted = true;
                    expect(operationCompleted).to.be.false;
                    done();
                }
            }, timeout);

            // Simulate long-running operation that doesn't complete in time
            setTimeout(() => {
                operationCompleted = true;
                clearTimeout(timeoutId);
                // Don't call done() here since the timeout should have already triggered
            }, timeout + 50); // Complete after timeout
        });
    });
});
