const ReplicaAPI = require('./replicaAPI');

// Example usage of the Replica Studios API
async function replicaExample() {
    // Initialize the API
    const replicaAPI = new ReplicaAPI();

    try {
        // Get available voices
        console.log('Fetching available voices...');
        const voices = await replicaAPI.getVoices();
        console.log(`Found ${voices.length} available voices`);

        // Find a specific voice by name
        const voiceName = 'Freya'; // Example voice name - this voice is mentioned in the docs
        console.log(`\nLooking for voice: ${voiceName}`);
        const voice = await replicaAPI.getVoiceByName(voiceName);
        
        if (!voice) {
            throw new Error(`Voice "${voiceName}" not found`);
        }

        console.log('Found voice:', {
            name: voice.name,
            id: voice.uuid,
            accent: voice.metadata?.accent,
            gender: voice.metadata?.gender,
            characteristics: voice.characteristics
        });

        // Example of basic text to speech using the Freya voice
        console.log('\nTesting text-to-speech...');
        const speechResponse = await replicaAPI.textToSpeech({
            text: "Welcome to Replica Studios.",
            voiceId: "9b1f5c24-a18b-4b9e-a785-b3a3b3b8751a", // Freya's speaker ID from docs
            options: {
                speaking_rate: 1.0,
                volume: 1.0
            }
        });
        console.log('Speech generated:', speechResponse);

        // Example of SSML usage for more control
        console.log('\nTesting SSML text-to-speech...');
        const ssmlResponse = await replicaAPI.textToSpeechSSML({
            ssml: '<?xml version="1.0"?><speak>Welcome to Replica Studios.<break time="1s"/>This is an SSML test with Freya\'s voice.</speak>',
            voiceId: "9b1f5c24-a18b-4b9e-a785-b3a3b3b8751a", // Freya's speaker ID
        });
        console.log('SSML Speech generated:', ssmlResponse);

    } catch (error) {
        console.error('Error in Replica API example:', error);
    }
}

// Run the example
replicaExample();