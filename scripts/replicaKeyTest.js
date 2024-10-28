const axios = require('axios');

async function testReplicaApiKey() {
    const apiKey = process.env.REPLICA_API_KEY || 'f64f3f2e-f575-494d-a1b2-bbfb60e3f558';
    const baseURL = 'https://api.replicastudios.com/v2';

    // Create axios instance with the API key
    const client = axios.create({
        baseURL: baseURL,
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
        }
    });

    try {
        // Test the authentication by getting available voices
        const response = await client.get('/library/voices');
        console.log('API Key verification successful!');
        console.log('Number of available voices:', response.data.items.length);
        console.log('First voice details:', response.data.items[0]);
        return true;
    } catch (error) {
        console.error('API Key verification failed:', error.response?.data || error.message);
        console.error('Status:', error.response?.status);
        console.error('Headers:', error.response?.headers);
        return false;
    }
}

// Run the test
testReplicaApiKey();
