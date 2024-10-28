const axios = require('axios');

async function testVoiceIntegration() {
    try {
        console.log('Starting voice integration test...');

        console.log('\n1. Testing voice listing...');
        const voicesResponse = await axios.get('http://localhost:3000/api/voice/available');
        const voices = voicesResponse.data;
        
        if (!voices || voices.length === 0) {
            throw new Error('No voices available');
        }

        console.log(`Found ${voices.length} voices`);
        const firstVoice = voices[0];
        console.log('Selected voice:', {
            name: firstVoice.name,
            gender: firstVoice.gender,
            age: firstVoice.age,
            accent: firstVoice.accent,
            speaker_id: firstVoice.speaker_id,
            capabilities: firstVoice.capabilities
        });

        console.log('\n2. Testing voice settings...');
        const settings = {
            speed: 1.0,
            pitch: 0,
            volume: 0
        };

        const settingsResponse = await axios.post('http://localhost:3000/api/voice/settings', {
            characterId: 'test-character',
            voiceId: firstVoice.speaker_id,
            settings
        });

        console.log('Settings saved successfully');

        console.log('\n3. Testing speech generation...');
        const response = await axios.post('http://localhost:3000/api/voice/generate', {
            speaker_id: firstVoice.speaker_id,
            text: "Hello, this is a test of the voice generation system.",
            options: settings
        });

        console.log('Speech generation successful!');
        console.log('Result:', {
            url: response.data.url,
            duration: response.data.duration,
            state: response.data.state
        });

        console.log('\nAll tests completed successfully!');

    } catch (error) {
        console.error('\nTest failed!');
        console.error('Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

testVoiceIntegration();
