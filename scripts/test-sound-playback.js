const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Adjust this if your server runs on a different port
const CHARACTER_ID = 2; // Adjust this to match an existing character ID in your system

async function testSoundPlayback() {
    try {
        // 1. Fetch available scenes for the character
        const scenesResponse = await axios.get(`${BASE_URL}/active-mode/character/${CHARACTER_ID}/scenes`);
        const scenes = scenesResponse.data;

        if (scenes.length === 0) {
            console.log('No scenes available for this character. Please create a scene first.');
            return;
        }

        const sceneId = scenes[0].id; // Select the first available scene

        // 2. Arm the system (simulating the armSystem function)
        await axios.post(`${BASE_URL}/active-mode/arm`, { characterId: CHARACTER_ID });
        console.log('System armed');

        // 3. Start scene execution
        const eventSource = new EventSource(`${BASE_URL}/scenes/${sceneId}/play?characterId=${CHARACTER_ID}`);

        eventSource.onopen = () => {
            console.log('SSE connection opened');
        };

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Received message:', data);

            if (data.message === 'Playing test sound') {
                console.log('Test sound is being played');
            }
        };

        eventSource.onerror = (error) => {
            console.error('SSE Error:', error);
            eventSource.close();
        };

        eventSource.addEventListener('scene_end', (event) => {
            console.log('Scene execution completed');
            eventSource.close();
        });

        // Keep the script running for a while to allow the scene to execute
        setTimeout(() => {
            console.log('Test completed');
            process.exit(0);
        }, 30000); // Adjust this timeout as needed

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSoundPlayback();
