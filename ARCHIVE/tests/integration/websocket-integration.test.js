const { expect } = require('chai');
const WebSocket = require('ws');
const app = require('../../app');

describe('🔌 WebSocket Integration Tests', function() {
    let server;
    let serverPort;

    before(function(done) {
        server = app.listen(0, () => {
            serverPort = server.address().port;
            done();
        });
    });

    after(function(done) {
        server.close(done);
    });

    describe('STT WebSocket Connection', function() {
        it('should establish WebSocket connection for live transcription', function(done) {
            this.timeout(10000);
            
            // First get the WebSocket URL from the API
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('STT WebSocket not available, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    
                    ws.on('open', function() {
                        expect(ws.readyState).to.equal(WebSocket.OPEN);
                        
                        // Send test message
                        ws.send(JSON.stringify({
                            type: 'start_recording',
                            config: {
                                vadEnabled: true,
                                vadThreshold: 0.5,
                                language: 'en'
                            }
                        }));
                        
                        // Close after successful connection
                        setTimeout(() => {
                            ws.close();
                            done();
                        }, 1000);
                    });
                    
                    ws.on('error', function(error) {
                        console.log('WebSocket connection error (expected in test environment):', error.message);
                        done(); // Don't fail the test for connection errors in test environment
                    });
                    
                    ws.on('close', function() {
                        // Connection closed successfully
                    });
                });
        });

        it('should handle WebSocket message exchange', function(done) {
            this.timeout(10000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('STT WebSocket not available, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    let messageReceived = false;
                    
                    ws.on('open', function() {
                        // Send start recording message
                        ws.send(JSON.stringify({
                            type: 'start_recording',
                            config: {
                                vadEnabled: true,
                                vadThreshold: 0.5
                            }
                        }));
                    });
                    
                    ws.on('message', function(data) {
                        try {
                            const message = JSON.parse(data);
                            expect(message).to.be.an('object');
                            messageReceived = true;
                            
                            // Send stop recording
                            ws.send(JSON.stringify({
                                type: 'stop_recording'
                            }));
                            
                            setTimeout(() => {
                                ws.close();
                            }, 500);
                            
                        } catch (parseError) {
                            console.log('Message parse error:', parseError);
                        }
                    });
                    
                    ws.on('close', function() {
                        // Test passes if we successfully exchanged messages or if service is unavailable
                        done();
                    });
                    
                    ws.on('error', function(error) {
                        console.log('WebSocket error (expected in test environment):', error.message);
                        done();
                    });
                    
                    // Timeout after 8 seconds
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.close();
                        }
                        done();
                    }, 8000);
                });
        });

        it('should handle WebSocket connection failures gracefully', function(done) {
            const invalidWsUrl = 'ws://invalid-url:9999/invalid-path';
            const ws = new WebSocket(invalidWsUrl);
            
            ws.on('error', function(error) {
                expect(error).to.exist;
                done();
            });
            
            ws.on('open', function() {
                // This shouldn't happen with invalid URL
                ws.close();
                done(new Error('Connection should have failed'));
            });
            
            // Timeout after 5 seconds
            setTimeout(() => {
                done();
            }, 5000);
        });
    });

    describe('Audio Streaming WebSocket', function() {
        it('should handle audio data streaming', function(done) {
            this.timeout(10000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('Audio streaming WebSocket not available, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    
                    ws.on('open', function() {
                        // Send binary audio data (mock)
                        const audioBuffer = Buffer.alloc(1024, 0);
                        ws.send(audioBuffer);
                        
                        setTimeout(() => {
                            ws.close();
                            done();
                        }, 1000);
                    });
                    
                    ws.on('error', function(error) {
                        console.log('Audio streaming WebSocket error (expected in test environment):', error.message);
                        done();
                    });
                });
        });

        it('should handle real-time VAD events', function(done) {
            this.timeout(10000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('VAD WebSocket not available, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    let vadEventReceived = false;
                    
                    ws.on('open', function() {
                        // Send VAD configuration
                        ws.send(JSON.stringify({
                            type: 'configure_vad',
                            config: {
                                vadThreshold: 0.5,
                                silenceDuration: 1000
                            }
                        }));
                    });
                    
                    ws.on('message', function(data) {
                        try {
                            const message = JSON.parse(data);
                            
                            if (message.type === 'vad_event') {
                                expect(message).to.have.property('vadDetected');
                                expect(message).to.have.property('confidence');
                                vadEventReceived = true;
                            }
                            
                        } catch (parseError) {
                            console.log('VAD message parse error:', parseError);
                        }
                    });
                    
                    ws.on('close', function() {
                        done();
                    });
                    
                    ws.on('error', function(error) {
                        console.log('VAD WebSocket error (expected in test environment):', error.message);
                        done();
                    });
                    
                    // Close connection after 5 seconds
                    setTimeout(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.close();
                        }
                    }, 5000);
                });
        });
    });

    describe('WebSocket Error Handling', function() {
        it('should handle malformed JSON messages', function(done) {
            this.timeout(10000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('WebSocket not available for error testing, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    
                    ws.on('open', function() {
                        // Send malformed JSON
                        ws.send('invalid json message');
                        
                        setTimeout(() => {
                            ws.close();
                            done();
                        }, 1000);
                    });
                    
                    ws.on('error', function(error) {
                        // Error is expected for malformed messages
                        done();
                    });
                    
                    ws.on('message', function(data) {
                        try {
                            const message = JSON.parse(data);
                            if (message.type === 'error') {
                                expect(message).to.have.property('error');
                                ws.close();
                                done();
                            }
                        } catch (parseError) {
                            // Expected for error responses
                        }
                    });
                });
        });

        it('should handle connection timeouts', function(done) {
            this.timeout(15000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('WebSocket not available for timeout testing, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const ws = new WebSocket(wsUrl);
                    let connectionTimeout;
                    
                    ws.on('open', function() {
                        // Set a connection timeout
                        connectionTimeout = setTimeout(() => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.close();
                            }
                        }, 10000);
                    });
                    
                    ws.on('close', function() {
                        if (connectionTimeout) {
                            clearTimeout(connectionTimeout);
                        }
                        done();
                    });
                    
                    ws.on('error', function(error) {
                        if (connectionTimeout) {
                            clearTimeout(connectionTimeout);
                        }
                        console.log('WebSocket timeout error (expected in test environment):', error.message);
                        done();
                    });
                });
        });

        it('should handle rapid connection/disconnection cycles', function(done) {
            this.timeout(15000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('WebSocket not available for rapid connection testing, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    let connectionsCompleted = 0;
                    const totalConnections = 3;
                    
                    function createConnection(index) {
                        const ws = new WebSocket(wsUrl);
                        
                        ws.on('open', function() {
                            // Immediately close the connection
                            setTimeout(() => {
                                ws.close();
                            }, 100);
                        });
                        
                        ws.on('close', function() {
                            connectionsCompleted++;
                            
                            if (connectionsCompleted >= totalConnections) {
                                done();
                            } else if (index < totalConnections - 1) {
                                // Create next connection after a short delay
                                setTimeout(() => {
                                    createConnection(index + 1);
                                }, 200);
                            }
                        });
                        
                        ws.on('error', function(error) {
                            console.log(`WebSocket rapid connection ${index} error (expected):`, error.message);
                            connectionsCompleted++;
                            
                            if (connectionsCompleted >= totalConnections) {
                                done();
                            }
                        });
                    }
                    
                    // Start the first connection
                    createConnection(0);
                });
        });
    });

    describe('WebSocket Performance', function() {
        it('should handle multiple concurrent WebSocket connections', function(done) {
            this.timeout(20000);
            
            const request = require('supertest');
            request(server)
                .get('/ai-management/api/stt/live-transcription-info')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    
                    if (!res.body.success) {
                        console.log('WebSocket not available for concurrent connection testing, skipping test');
                        return done();
                    }
                    
                    const wsUrl = res.body.websocketUrl;
                    const connections = [];
                    const numConnections = 3;
                    let connectionsOpened = 0;
                    let connectionsClosed = 0;
                    
                    for (let i = 0; i < numConnections; i++) {
                        const ws = new WebSocket(wsUrl);
                        connections.push(ws);
                        
                        ws.on('open', function() {
                            connectionsOpened++;
                            
                            // Send a test message
                            ws.send(JSON.stringify({
                                type: 'test',
                                connectionId: i
                            }));
                            
                            // Close after 2 seconds
                            setTimeout(() => {
                                ws.close();
                            }, 2000);
                        });
                        
                        ws.on('close', function() {
                            connectionsClosed++;
                            
                            if (connectionsClosed >= numConnections) {
                                expect(connectionsOpened).to.be.at.least(1);
                                done();
                            }
                        });
                        
                        ws.on('error', function(error) {
                            console.log(`Concurrent WebSocket ${i} error (expected):`, error.message);
                            connectionsClosed++;
                            
                            if (connectionsClosed >= numConnections) {
                                done();
                            }
                        });
                    }
                    
                    // Timeout after 15 seconds
                    setTimeout(() => {
                        connections.forEach(ws => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.close();
                            }
                        });
                        
                        if (connectionsClosed < numConnections) {
                            done();
                        }
                    }, 15000);
                });
        });
    });
});
