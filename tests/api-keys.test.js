const chai = require('chai');
const axios = require('axios');
const logger = require('../scripts/logger');
require('dotenv').config();

const { expect } = chai;

describe('API Keys Integration Tests', function() {
    // Increase timeout for API calls
    this.timeout(30000);

    before(function() {
        logger.info('Starting API Keys Integration Tests');
        console.log('\n🔑 Testing API Key Integrations...\n');
    });

    after(function() {
        logger.info('Completed API Keys Integration Tests');
        console.log('\n✅ API Key Integration Tests Complete\n');
    });

    describe('🤖 Anthropic Claude API', function() {
        it('should connect to Anthropic API with valid key', async function() {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            
            if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
                this.skip('Anthropic API key not configured');
            }

            try {
                const response = await axios.post('https://api.anthropic.com/v1/messages', {
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 10,
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello'
                        }
                    ]
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('content');
                expect(response.data.content).to.be.an('array');
                
                logger.info('✅ Anthropic API connection successful');
                console.log('   ✅ Anthropic Claude API - Connected');
                
            } catch (error) {
                logger.error('❌ Anthropic API test failed', { 
                    error: error.message,
                    status: error.response?.status,
                    data: error.response?.data 
                });
                throw new Error(`Anthropic API failed: ${error.response?.data?.error?.message || error.message}`);
            }
        });
    });

    describe('🧠 OpenAI GPT API', function() {
        it('should connect to OpenAI API with valid key', async function() {
            const apiKey = process.env.OPENAI_API_KEY;
            
            if (!apiKey || apiKey === 'your_openai_api_key_here') {
                this.skip('OpenAI API key not configured');
            }

            try {
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello'
                        }
                    ],
                    max_tokens: 10
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('choices');
                expect(response.data.choices).to.be.an('array');
                expect(response.data.choices[0]).to.have.property('message');
                
                logger.info('✅ OpenAI API connection successful');
                console.log('   ✅ OpenAI GPT API - Connected');
                
            } catch (error) {
                logger.error('❌ OpenAI API test failed', { 
                    error: error.message,
                    status: error.response?.status,
                    data: error.response?.data 
                });
                throw new Error(`OpenAI API failed: ${error.response?.data?.error?.message || error.message}`);
            }
        });
    });

    describe('🔍 Google Gemini API', function() {
        it('should connect to Google Gemini API with valid key', async function() {
            const apiKey = process.env.GOOGLE_API_KEY;
            
            if (!apiKey || apiKey === 'your_google_api_key_here') {
                this.skip('Google API key not configured');
            }

            try {
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                    {
                        contents: [
                            {
                                parts: [
                                    {
                                        text: 'Hello'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000
                    }
                );

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('candidates');
                expect(response.data.candidates).to.be.an('array');
                
                logger.info('✅ Google Gemini API connection successful');
                console.log('   ✅ Google Gemini API - Connected');
                
            } catch (error) {
                logger.error('❌ Google Gemini API test failed', { 
                    error: error.message,
                    status: error.response?.status,
                    data: error.response?.data 
                });
                throw new Error(`Google Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
            }
        });
    });

    describe('🎤 Replica Studios API', function() {
        it('should connect to Replica Studios API with valid key', async function() {
            const apiKey = process.env.REPLICA_API_KEY;

            if (!apiKey || apiKey === 'your_replica_api_key_here') {
                this.skip('Replica API key not configured');
            }

            try {
                const response = await axios.get('https://api.replicastudios.com/v2/library/voices', {
                    headers: {
                        'X-Api-Key': apiKey,
                        'Accept': 'application/json'
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('items');
                expect(response.data.items).to.be.an('array');

                logger.info('✅ Replica Studios API connection successful', {
                    voiceCount: response.data.items.length
                });
                console.log(`   ✅ Replica Studios API - Connected (${response.data.items.length} voices available)`);

            } catch (error) {
                logger.error('❌ Replica Studios API test failed', {
                    error: error.message,
                    status: error.response?.status,
                    data: error.response?.data
                });
                throw new Error(`Replica Studios API failed: ${error.response?.data?.error || error.message}`);
            }
        });

        it('should test Replica API integration through MonsterBox service', async function() {
            const apiKey = process.env.REPLICA_API_KEY;

            if (!apiKey || apiKey === 'your_replica_api_key_here') {
                this.skip('Replica API key not configured');
            }

            const ReplicaAPI = require('../scripts/replicaAPI');

            try {
                const replicaAPI = new ReplicaAPI();
                const voices = await replicaAPI.getVoices();

                expect(voices).to.be.an('array');
                expect(voices.length).to.be.above(0);

                // Test voice structure
                const firstVoice = voices[0];
                expect(firstVoice).to.have.property('uuid');
                expect(firstVoice).to.have.property('name');
                expect(firstVoice).to.have.property('speaker_id');

                logger.info('✅ MonsterBox Replica API integration working', {
                    voiceCount: voices.length,
                    firstVoiceName: firstVoice.name
                });
                console.log(`   ✅ MonsterBox Replica Integration - Working (${voices.length} voices)`);

            } catch (error) {
                logger.error('❌ MonsterBox Replica API integration test failed', {
                    error: error.message
                });
                throw new Error(`MonsterBox Replica integration failed: ${error.message}`);
            }
        });
    });

    describe('🔧 Environment Variables', function() {
        it('should have SESSION_SECRET configured', function() {
            const sessionSecret = process.env.SESSION_SECRET;
            
            expect(sessionSecret).to.exist;
            expect(sessionSecret).to.not.equal('your-session-secret-key-here');
            expect(sessionSecret.length).to.be.at.least(16);
            
            logger.info('✅ SESSION_SECRET is properly configured');
            console.log('   ✅ SESSION_SECRET - Configured');
        });

        it('should have PORT configured', function() {
            const port = process.env.PORT;

            expect(port).to.exist;
            const portNumber = parseInt(port, 10);
            expect(portNumber).to.be.a('number');
            expect(portNumber).to.not.be.NaN;
            expect(portNumber).to.be.above(0);
            expect(portNumber).to.be.below(65536);

            logger.info('✅ PORT is properly configured', { port });
            console.log(`   ✅ PORT - Configured (${port})`);
        });

        it('should have NODE_ENV configured', function() {
            const nodeEnv = process.env.NODE_ENV;
            
            expect(nodeEnv).to.exist;
            expect(['development', 'production', 'test']).to.include(nodeEnv);
            
            logger.info('✅ NODE_ENV is properly configured', { nodeEnv });
            console.log(`   ✅ NODE_ENV - Configured (${nodeEnv})`);
        });
    });

    describe('📋 Optional API Keys Status', function() {
        const optionalKeys = [
            { name: 'PERPLEXITY_API_KEY', service: 'Perplexity AI' },
            { name: 'MISTRAL_API_KEY', service: 'Mistral AI' },
            { name: 'XAI_API_KEY', service: 'xAI' },
            { name: 'AZURE_OPENAI_API_KEY', service: 'Azure OpenAI' },
            { name: 'OLLAMA_API_KEY', service: 'Ollama' }
        ];

        optionalKeys.forEach(({ name, service }) => {
            it(`should report ${service} API key status`, function() {
                const apiKey = process.env[name];
                const isConfigured = apiKey && !apiKey.includes('your_') && !apiKey.includes('_here');
                
                if (isConfigured) {
                    logger.info(`✅ ${service} API key is configured`);
                    console.log(`   ✅ ${service} - Configured`);
                } else {
                    logger.info(`⚠️  ${service} API key is not configured (optional)`);
                    console.log(`   ⚠️  ${service} - Not configured (optional)`);
                }
                
                // This test always passes, it's just for reporting
                expect(true).to.be.true;
            });
        });
    });
});
