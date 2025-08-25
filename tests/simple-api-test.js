#!/usr/bin/env node

/**
 * Simple API Test - Tests basic API functionality without full app initialization
 */

require('dotenv').config();
const { expect } = require('chai');
const axios = require('axios');

describe('🔑 Simple API Key Tests', function() {
    this.timeout(30000);

    describe('🧠 OpenAI API', function() {
        it('should have a valid OpenAI API key', async function() {
            const apiKey = process.env.OPENAI_API_KEY;

            if (!apiKey || apiKey.includes('your_') || apiKey.includes('_here')) {
                this.skip('OpenAI API key not configured');
            }

            try {
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: 'Hello, this is a test.' }],
                    max_tokens: 10
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('choices');
                expect(response.data.choices).to.be.an('array');
                
                console.log('✅ OpenAI API key is valid and working');
                
            } catch (error) {
                console.error('❌ OpenAI API test failed:', error.message);
                throw new Error(`OpenAI API failed: ${error.response?.data?.error?.message || error.message}`);
            }
        });
    });

    describe('🎤 ElevenLabs API', function() {
        it('should have a valid ElevenLabs API key', async function() {
            const apiKey = process.env.ELEVENLABS_API_KEY;

            if (!apiKey || apiKey.includes('your_') || apiKey.includes('_here')) {
                this.skip('ElevenLabs API key not configured');
            }

            try {
                const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
                    headers: {
                        'xi-api-key': apiKey,
                        'Accept': 'application/json'
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('voices');
                expect(response.data.voices).to.be.an('array');

                console.log(`✅ ElevenLabs API key is valid (${response.data.voices.length} voices available)`);

            } catch (error) {
                console.error('❌ ElevenLabs API test failed:', error.message);
                throw new Error(`ElevenLabs API failed: ${error.response?.data?.detail || error.message}`);
            }
        });
    });

    describe('🤖 Anthropic API', function() {
        it('should have a valid Anthropic API key', async function() {
            const apiKey = process.env.ANTHROPIC_API_KEY;

            if (!apiKey || apiKey.includes('your_') || apiKey.includes('_here')) {
                this.skip('Anthropic API key not configured');
            }

            try {
                const response = await axios.post('https://api.anthropic.com/v1/messages', {
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'Hello, this is a test.' }]
                }, {
                    headers: {
                        'x-api-key': apiKey,
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01'
                    },
                    timeout: 15000
                });

                expect(response.status).to.equal(200);
                expect(response.data).to.have.property('content');
                expect(response.data.content).to.be.an('array');
                
                console.log('✅ Anthropic API key is valid and working');
                
            } catch (error) {
                console.error('❌ Anthropic API test failed:', error.message);
                throw new Error(`Anthropic API failed: ${error.response?.data?.error?.message || error.message}`);
            }
        });
    });
});
