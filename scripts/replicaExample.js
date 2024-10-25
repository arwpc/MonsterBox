// Initialize the API and UI elements
document.addEventListener('DOMContentLoaded', async () => {
    const voiceSelect = document.getElementById('voiceSelect');
    const textInput = document.getElementById('textInput');
    const convertButton = document.getElementById('convertButton');
    const statusMessage = document.getElementById('statusMessage');
    const audioContainer = document.getElementById('audioContainer');

    // Add a default option to the voice select
    const defaultOption = document.createElement('option');
    defaultOption.value = '9b1f5c24-a18b-4b9e-a785-b3a3b3b8751a';
    defaultOption.textContent = 'Default Voice (Freya)';
    voiceSelect.appendChild(defaultOption);

    // Handle text-to-speech conversion
    async function convertTextToSpeech() {
        const text = textInput.value.trim();

        if (!text) {
            statusMessage.textContent = 'Please enter some text to convert';
            return;
        }

        try {
            statusMessage.textContent = 'Processing...';
            convertButton.disabled = true;

            // Create a new audio element
            const audioElement = document.createElement('audio');
            audioElement.controls = true;
            audioElement.src = 'sample.mp3';

            // Create a wrapper div for this audio instance
            const wrapper = document.createElement('div');
            wrapper.style.marginBottom = '10px';
            
            // Add a timestamp and the text that was converted
            const timestamp = new Date().toLocaleTimeString();
            const details = document.createElement('p');
            details.style.margin = '5px 0';
            details.style.fontSize = '0.9em';
            details.textContent = `${timestamp} - "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`;
            
            wrapper.appendChild(details);
            wrapper.appendChild(audioElement);

            // Add the new audio element at the top of the container
            audioContainer.insertBefore(wrapper, audioContainer.firstChild);

            statusMessage.textContent = 'Done! You can now play the audio.';
        } catch (error) {
            statusMessage.textContent = 'Error: ' + error.message;
            console.error('Error:', error);
        } finally {
            convertButton.disabled = false;
        }
    }

    // Set up event listeners
    convertButton.addEventListener('click', convertTextToSpeech);
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            convertTextToSpeech();
        }
    });
});