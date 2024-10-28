const axios = require('axios');

async function testTTS() {
    const apiKey = 'f64f3f2e-f575-494d-a1b2-bbfb60e3f558';
    const baseURL = 'https://api.replicastudios.com/v2';

    try {
        console.log('Getting available voices...');
        
        const voicesResponse = await axios.get(`${baseURL}/library/voices`, {
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        const firstVoice = voicesResponse.data.items[0];
        const speakerId = firstVoice.default_style.speaker_id;
        
        console.log(`Using voice: ${firstVoice.name}`);
        console.log(`Speaker ID: ${speakerId}`);
        
        console.log('\nGenerating speech...');
        
        const ttsResponse = await axios.post(`${baseURL}/speech/tts`, {
            speaker_id: speakerId,
            text: "Hello, this is a test of the Replica Studios voice API.",
            extensions: ['mp3'],
            model_chain: 'vox_2_0',
            language_code: 'en',
            sample_rate: 44100,
            bit_rate: 128,
            global_pace: 1.0,
            global_pitch: 0,
            auto_pitch: true,
            global_volume: 0
        }, {
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        const jobId = ttsResponse.data.uuid;
        console.log('Speech job created:', jobId);
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30;
        let jobStatus;
        
        do {
            console.log('Checking job status...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            jobStatus = await axios.get(`${baseURL}/speech/${jobId}`, {
                headers: {
                    'X-Api-Key': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            
            attempts++;
            console.log('Status:', jobStatus.data.state);
            
            if (attempts >= maxAttempts) {
                throw new Error('Speech generation timed out');
            }
        } while (jobStatus.data.state === 'PENDING');

        if (jobStatus.data.state === 'SUCCESS') {
            console.log('\nSpeech generation successful!');
            console.log('Audio URL:', jobStatus.data.url);
            console.log('Duration:', jobStatus.data.duration, 'seconds');
        } else {
            throw new Error(`Speech generation failed: ${jobStatus.data.state}`);
        }
        
    } catch (error) {
        console.error('Test failed!');
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
            console.error('Status:', error.response.status);
        } else {
            console.error('Error:', error.message);
        }
    }
}

console.log('Starting TTS test...');
testTTS();
