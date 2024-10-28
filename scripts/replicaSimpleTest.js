const axios = require('axios');

async function simpleTest() {
    const apiKey = 'f64f3f2e-f575-494d-a1b2-bbfb60e3f558';
    const baseURL = 'https://api.replicastudios.com/v2';

    try {
        console.log('Testing Replica API connection...');
        
        const response = await axios.get(`${baseURL}/library/voices`, {
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        console.log('Connection successful!');
        console.log(`Found ${response.data.items.length} voices`);
        console.log('First voice:', JSON.stringify(response.data.items[0], null, 2));
        
    } catch (error) {
        console.error('Test failed!');
        console.error('Status:', error.response?.status);
        console.error('Error:', error.response?.data || error.message);
    }
}

simpleTest();
