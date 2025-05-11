## ElevenLabs Integration

MonsterBox integrates ElevenLabs Text-to-Speech (TTS) to generate high-quality voice lines for animatronic characters. This integration allows users to select from a variety of voices, preview generated speech, and assign voices to characters or scenes.

### How ElevenLabs is Integrated
- ElevenLabs TTS is accessed via the MonsterBox web interface ("Configure Voice" button, scene editor, and sound management).
- The backend uses a Node.js API wrapper that communicates with the ElevenLabs API using a secret API key stored in environment variables.
- Voices are fetched via `/api/voice/available`, filtered for TTS capabilities, and displayed in the UI for selection.
- Voice generation (TTS) is triggered via `/api/voice/generate` and `/api/voice/generate-for-scene` endpoints.

### API Key Configuration
To use ElevenLabs, you must provide a valid API key. Set this in your `.env` file at the project root:

```env
ELEVENLABS_API_KEY=your_actual_api_key_here
```

Restart the application after changing the key.

### Listing and Using Voices
MonsterBox fetches the list of available voices and displays them in the "Configure Voice" interface. Users can filter by gender, style, accent, and age, and preview each voice with different styles (e.g., neutral, happy, sad).

#### Sample Code: Fetching Voices (Frontend)
```js
// scripts/voiceSelector.js (excerpt)
async loadVoices() {
    try {
        this.showLoading('Loading voices...');
        const response = await fetch('/api/voice/available');
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to load voices');
        }
        const voices = await response.json();
        this.voices = voices;
        this.populateVoiceTable();
        await this.loadRecentlyUsed();
    } catch (error) {
        console.error('Error loading voices:', error);
        this.showError('Failed to load voices: ' + error.message);
    } finally {
        this.hideLoading();
    }
}
```

#### Filtering for TTS Capabilities
```js
// scripts/voiceSelector.js (excerpt)
getVoiceStyles(voice) {
    const baseStyles = ['neutral'];
    if (voice.capabilities && voice.capabilities['tts.vox_2_0']) {
        baseStyles.push('happy', 'sad', 'angry', 'fearful');
    }
    return baseStyles;
}
```

#### Generating Speech (Preview)
```js
// scripts/voiceSelector.js (excerpt)
async generatePreview(style = 'neutral') {
    try {
        this.showLoading('Generating preview...');
        const previewText = document.querySelector('#previewText').value;
        const speakerId = this.currentPreviewVoice.speaker_id;
        if (!speakerId) throw new Error('No valid speaker ID found for this voice');
        const response = await fetch('/api/voice/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                speaker_id: speakerId,
                text: previewText,
                style,
                characterId: this.characterId,
                options: {
                    speed: parseFloat(document.querySelector('#speed').value),
                    pitch: parseInt(document.querySelector('#pitch').value),
                    volume: parseInt(document.querySelector('#volume').value)
                }
            })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate preview');
        }
        const data = await response.json();
        this.lastGeneratedAudio = data;
        // Play the audio preview...
    } catch (error) {
        // Handle errors
    } finally {
        this.hideLoading();
    }
}
```

### Typical Workflow
1. Go to "Configure Voice" in the MonsterBox web UI.
2. Browse and filter available voices (fetched from ElevenLabs).
3. Preview voices with different styles and settings.
4. Assign a selected voice to a character or scene.
5. When a scene is played, MonsterBox generates and plays the TTS audio using the selected voice.

### Security Note
Never share your ElevenLabs API key publicly. The example above is for documentation only. Always use your own key and keep it secret.
