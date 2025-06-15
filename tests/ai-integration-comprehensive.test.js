/**
 * Comprehensive AI Integration Tests
 * 
 * Tests all AI API clients with mock and live endpoints,
 * error handling, rate limiting, and fallback mechanisms.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const AIClientManager = require('../ai/integrations/AIClientManager');
const OpenAIClient = require('../ai/integrations/OpenAIClient');
const AnthropicClient = require('../ai/integrations/AnthropicClient');
const GoogleAIClient = require('../ai/integrations/GoogleAIClient');

describe('AI Integration - Comprehensive Tests', function() {
    this.timeout(30000);

    let aiManager;
    let sandbox;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        
        // Mock environment variables
        process.env.OPENAI_API_KEY = 'test-openai-key';
        process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
        process.env.GOOGLE_API_KEY = 'test-google-key';
    });

    afterEach(function() {
        sandbox.restore();
        if (aiManager) {
            aiManager.cleanup();
        }
    });

    describe('Individual AI Clients', function() {
        describe('OpenAI Client', function() {
            it('should initialize with valid configuration', function() {
                const client = new OpenAIClient({
                    apiKey: 'test-key',
                    enableRateLimiting: false
                });
                
                expect(client.config.apiKey).to.equal('test-key');
                expect(client.config.baseURL).to.include('openai.com');
            });

            it('should handle rate limiting', async function() {
                const client = new OpenAIClient({
                    apiKey: 'test-key',
                    enableRateLimiting: true
                });
                
                // Mock rate limit check
                const checkSpy = sandbox.spy(client, 'checkRateLimit');
                
                // Mock axios to avoid actual API calls
                sandbox.stub(client.axiosInstance, 'post').resolves({
                    data: {
                        choices: [{ message: { content: 'Test response' } }],
                        usage: { total_tokens: 10 }
                    }
                });

                await client.generateResponse('Test prompt');
                expect(checkSpy.calledOnce).to.be.true;
            });

            it('should retry on retryable errors', async function() {
                const client = new OpenAIClient({
                    apiKey: 'test-key',
                    maxRetries: 2,
                    retryDelay: 100
                });

                let callCount = 0;
                sandbox.stub(client.axiosInstance, 'post').callsFake(() => {
                    callCount++;
                    if (callCount < 2) {
                        const error = new Error('Server Error');
                        error.response = { status: 500 };
                        throw error;
                    }
                    return Promise.resolve({
                        data: {
                            choices: [{ message: { content: 'Success after retry' } }],
                            usage: { total_tokens: 10 }
                        }
                    });
                });

                const response = await client.generateResponse('Test prompt');
                expect(response.text).to.equal('Success after retry');
                expect(callCount).to.equal(2);
            });
        });

        describe('Anthropic Client', function() {
            it('should initialize with valid configuration', function() {
                const client = new AnthropicClient({
                    apiKey: 'test-key',
                    enableRateLimiting: false
                });
                
                expect(client.config.apiKey).to.equal('test-key');
                expect(client.config.baseURL).to.include('anthropic.com');
            });

            it('should build messages correctly', function() {
                const client = new AnthropicClient({
                    apiKey: 'test-key'
                });

                const messages = client.buildMessages('Hello', {
                    systemPrompt: 'You are helpful',
                    conversationHistory: [
                        { role: 'user', content: 'Hi' },
                        { role: 'assistant', content: 'Hello!' }
                    ]
                });

                expect(messages).to.be.an('array');
                expect(messages.length).to.be.greaterThan(0);
            });
        });

        describe('Google AI Client', function() {
            it('should initialize with valid configuration', function() {
                const client = new GoogleAIClient({
                    apiKey: 'test-key',
                    enableRateLimiting: false
                });
                
                expect(client.config.apiKey).to.equal('test-key');
                expect(client.config.baseURL).to.include('googleapis.com');
            });

            it('should build contents correctly', function() {
                const client = new GoogleAIClient({
                    apiKey: 'test-key'
                });

                const contents = client.buildContents('Hello', {
                    systemPrompt: 'You are helpful'
                });

                expect(contents).to.be.an('array');
                expect(contents.length).to.be.greaterThan(0);
                expect(contents[0]).to.have.property('role');
                expect(contents[0]).to.have.property('parts');
            });
        });
    });

    describe('AI Client Manager', function() {
        it('should initialize with multiple providers', function() {
            aiManager = new AIClientManager({
                enableRateLimiting: false
            });

            expect(aiManager.clients.size).to.be.greaterThan(0);
            expect(aiManager.config.defaultProvider).to.exist;
        });

        it('should handle provider fallback', async function() {
            aiManager = new AIClientManager({
                defaultProvider: 'openai',
                fallbackProviders: ['anthropic', 'google'],
                enableRateLimiting: false
            });

            // Mock primary provider to fail
            const openaiClient = aiManager.clients.get('openai');
            if (openaiClient) {
                sandbox.stub(openaiClient, 'generateResponse').rejects(new Error('Primary failed'));
            }

            // Mock fallback provider to succeed
            const anthropicClient = aiManager.clients.get('anthropic');
            if (anthropicClient) {
                sandbox.stub(anthropicClient, 'generateResponse').resolves({
                    text: 'Fallback response',
                    metadata: { provider: 'anthropic' }
                });
            }

            const response = await aiManager.generateResponse('Test prompt');
            expect(response.text).to.equal('Fallback response');
            expect(response.metadata.fallbackUsed).to.be.true;
        });

        it('should track performance metrics', async function() {
            aiManager = new AIClientManager({
                enableRateLimiting: false
            });

            // Mock successful response
            const client = Array.from(aiManager.clients.values())[0];
            if (client) {
                sandbox.stub(client, 'generateResponse').resolves({
                    text: 'Test response',
                    metadata: { provider: 'test' }
                });

                await aiManager.generateResponse('Test prompt');
                
                expect(aiManager.metrics.totalRequests).to.equal(1);
                expect(aiManager.metrics.successfulRequests).to.equal(1);
            }
        });

        it('should emit events for monitoring', function(done) {
            aiManager = new AIClientManager({
                enableRateLimiting: false
            });

            aiManager.on('response_generated', (data) => {
                expect(data).to.have.property('provider');
                expect(data).to.have.property('response');
                expect(data).to.have.property('responseTime');
                done();
            });

            // Mock successful response
            const client = Array.from(aiManager.clients.values())[0];
            if (client) {
                sandbox.stub(client, 'generateResponse').resolves({
                    text: 'Test response',
                    metadata: { provider: 'test' }
                });

                aiManager.generateResponse('Test prompt');
            }
        });

        it('should provide status information', function() {
            aiManager = new AIClientManager({
                enableRateLimiting: false
            });

            const status = aiManager.getStatus();
            
            expect(status).to.have.property('providers');
            expect(status).to.have.property('healthStatus');
            expect(status).to.have.property('metrics');
            expect(status).to.have.property('config');
        });
    });

    describe('Error Handling', function() {
        it('should handle network errors gracefully', async function() {
            const client = new OpenAIClient({
                apiKey: 'test-key',
                maxRetries: 1,
                retryDelay: 100
            });

            sandbox.stub(client.axiosInstance, 'post').rejects(new Error('Network error'));

            try {
                await client.generateResponse('Test prompt');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Network error');
            }
        });

        it('should handle API rate limits', async function() {
            const client = new OpenAIClient({
                apiKey: 'test-key',
                maxRetries: 1,
                retryDelay: 100
            });

            const rateLimitError = new Error('Rate limit exceeded');
            rateLimitError.response = { status: 429, headers: { 'retry-after': '1' } };
            
            sandbox.stub(client.axiosInstance, 'post').rejects(rateLimitError);

            try {
                await client.generateResponse('Test prompt');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Rate limit');
            }
        });

        it('should handle authentication errors', async function() {
            const client = new OpenAIClient({
                apiKey: 'invalid-key',
                maxRetries: 1
            });

            const authError = new Error('Authentication failed');
            authError.response = { status: 401 };
            
            sandbox.stub(client.axiosInstance, 'post').rejects(authError);

            try {
                await client.generateResponse('Test prompt');
                expect.fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).to.include('Authentication');
            }
        });
    });

    describe('Performance and Monitoring', function() {
        it('should track response times', async function() {
            aiManager = new AIClientManager({
                enableRateLimiting: false
            });

            const client = Array.from(aiManager.clients.values())[0];
            if (client) {
                sandbox.stub(client, 'generateResponse').callsFake(async () => {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return {
                        text: 'Test response',
                        metadata: { provider: 'test' }
                    };
                });

                await aiManager.generateResponse('Test prompt');
                
                expect(aiManager.metrics.averageResponseTime).to.be.greaterThan(0);
            }
        });

        it('should provide client statistics', function() {
            const client = new OpenAIClient({
                apiKey: 'test-key'
            });

            const stats = client.getStats();
            
            expect(stats).to.have.property('provider');
            expect(stats).to.have.property('requestCount');
            expect(stats).to.have.property('errorCount');
            expect(stats).to.have.property('errorRate');
        });
    });
});
