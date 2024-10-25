const ReplicaAPI = require('./replicaAPI');

async function testReplicaAPI() {
    const replicaAPI = new ReplicaAPI();

    try {
        console.log('Testing getVoices...');
        const voices = await replicaAPI.getVoices();
        console.log('Available voices:', voices.length);
        
        // Print some details about the first voice
        if (voices.length > 0) {
            const firstVoice = voices[0];
            console.log('\nFirst voice details:');
            console.log('  UUID:', firstVoice.uuid);
            console.log('  Name:', firstVoice.name);
            console.log('  Default Style:', firstVoice.default_style?.speaker_id);

            // Use the speaker_id from default_style or uuid as fallback
            const testVoiceId = firstVoice.default_style?.speaker_id || firstVoice.uuid;
            console.log('\nTesting textToSpeech with voice:', testVoiceId);
            
            const speech = await replicaAPI.textToSpeech({
                text: "Hello, this is a test",
                voiceId: testVoiceId
            });
            
            console.log('Speech generation successful:', speech);
        }
    } catch (error) {
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
        } else {
            console.error('Test failed:', error);
        }
    }
}

testReplicaAPI();