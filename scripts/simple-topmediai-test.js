#!/usr/bin/env node

require('dotenv').config();
const axios = require('axios');

async function testTopMediaiAPI() {
    console.log('Testing TopMediai API directly...');
    
    const apiKey = process.env.TOPMEDIAI_API_KEY;
    console.log('API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT FOUND');
    
    try {
        // Test 1: Get voices
        console.log('\n1. Testing voice list...');
        const voicesResponse = await axios.get('https://api.topmediai.com/v1/voices_list', {
            headers: {
                'x-api-key': apiKey
            }
        });
        
        console.log('Voices response status:', voicesResponse.status);
        console.log('Number of voices:', voicesResponse.data?.Voice?.length || 0);
        
        if (voicesResponse.data?.Voice?.length > 0) {
            const firstVoice = voicesResponse.data.Voice[0];
            console.log('First voice:', {
                name: firstVoice.name,
                speaker: firstVoice.speaker,
                language: firstVoice.Languagename
            });
            
            // Test 2: Generate speech with different auth methods
            console.log('\n2. Testing speech generation...');

            // Try method 1: x-api-key header
            try {
                console.log('Trying x-api-key header...');
                const ttsResponse = await axios.post('https://api.topmediai.com/v1/text2speech', {
                    text: 'Hello world',
                    speaker: firstVoice.speaker,
                    emotion: 'Neutral'
                }, {
                    headers: {
                        'x-api-key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                });
                console.log('✅ x-api-key method worked!');
                console.log('TTS response status:', ttsResponse.status);
                console.log('Audio data size:', ttsResponse.data.byteLength, 'bytes');
                return;
            } catch (e1) {
                console.log('❌ x-api-key failed:', e1.response?.status, e1.response?.statusText);
            }

            // Try method 2: Authorization Bearer header
            try {
                console.log('Trying Authorization Bearer header...');
                const ttsResponse = await axios.post('https://api.topmediai.com/v1/text2speech', {
                    text: 'Hello world',
                    speaker: firstVoice.speaker,
                    emotion: 'Neutral'
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                });
                console.log('✅ Bearer method worked!');
                console.log('TTS response status:', ttsResponse.status);
                console.log('Audio data size:', ttsResponse.data.byteLength, 'bytes');
                return;
            } catch (e2) {
                console.log('❌ Bearer failed:', e2.response?.status, e2.response?.statusText);
            }

            // Try method 3: API key in query params
            try {
                console.log('Trying API key in query params...');
                const ttsResponse = await axios.post(`https://api.topmediai.com/v1/text2speech?api_key=${apiKey}`, {
                    text: 'Hello world',
                    speaker: firstVoice.speaker,
                    emotion: 'Neutral'
                }, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer'
                });
                console.log('✅ Query param method worked!');
                console.log('TTS response status:', ttsResponse.status);
                console.log('Audio data size:', ttsResponse.data.byteLength, 'bytes');
                return;
            } catch (e3) {
                console.log('❌ Query param failed:', e3.response?.status, e3.response?.statusText);
            }

            console.log('❌ All authentication methods failed');
            
            console.log('TTS response status:', ttsResponse.status);
            console.log('Audio data size:', ttsResponse.data.byteLength, 'bytes');
            console.log('✅ Success!');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Status Text:', error.response.statusText);
            if (error.response.data) {
                try {
                    const errorText = Buffer.from(error.response.data).toString();
                    console.error('Error Response:', errorText);
                } catch (e) {
                    console.error('Raw Error Data:', error.response.data);
                }
            }
        }
    }
}

testTopMediaiAPI();
