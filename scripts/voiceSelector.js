class VoiceSelector {
    constructor() {
        this.voices = [];
        this.selectedVoice = null;
        this.recentlyUsed = new Set();
        this.filters = {
            gender: new Set(),
            style: new Set(),
            accent: new Set(),
            age: new Set()
        };
        this.wavesurfer = null;
        this.isPlaying = false;
        this.currentPreviewVoice = null;
        this.characterId = null;
        this.lastGeneratedAudio = null;

        // Only initialize voice-specific features if we're on the voice configuration page
        if (document.getElementById('voiceSelector')) {
            this.initializeWaveSurfer();
            this.setupEventListeners();
            this.loadVoices();
        }
    }

    showLoading(message = 'Loading...') {
        const overlay = document.querySelector('#loadingOverlay');
        if (overlay) {
            const text = overlay.querySelector('.loading-text');
            text.textContent = message;
            overlay.classList.add('active');
        }
    }

    hideLoading() {
        const overlay = document.querySelector('#loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    showError(message, isSuccess = false) {
        const statusElement = document.querySelector('#statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.style.backgroundColor = isSuccess ? '#4CAF50' : '#ff5252';
            statusElement.style.color = '#ffffff';
            statusElement.style.padding = '10px';
            statusElement.style.borderRadius = '4px';
            statusElement.style.marginBottom = '10px';
            statusElement.style.display = 'block';
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000);
        }
    }

    initializeWaveSurfer() {
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4a9eff',
            progressColor: '#1976d2',
            height: 60,
            barWidth: 2,
            barGap: 1,
            responsive: true,
            normalize: true
        });

        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButtonState();
        });

        this.wavesurfer.on('error', error => {
            console.error('WaveSurfer error:', error);
            this.showError('Error loading audio preview');
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilterDropdown(e.target.dataset.filter));
        });

        document.querySelectorAll('.filter-option input').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.applyFilters());
        });

        document.querySelector('#voiceSearch').addEventListener('input', (e) => {
            this.filterVoices(e.target.value);
        });

        document.querySelectorAll('th').forEach(header => {
            header.addEventListener('click', (e) => this.sortVoices(e.target));
        });

        // Handle Speed setting
        const speedInput = document.querySelector('#speed');
        if (speedInput) {
            const speedValueDisplay = speedInput.nextElementSibling;
            speedInput.addEventListener('input', (e) => {
                if (speedValueDisplay) speedValueDisplay.textContent = e.target.value;
                this.updatePreviewButtonState(); // Method to enable/disable preview btn if needed
            });
        }

        // Disable Pitch and Volume settings as they are not used for OpenAI TTS
        const pitchInput = document.querySelector('#pitch');
        if (pitchInput) {
            pitchInput.disabled = true;
            const pitchValueDisplay = pitchInput.nextElementSibling;
            if (pitchValueDisplay) pitchValueDisplay.textContent = 'N/A'; 
            // Optionally hide them: pitchInput.parentElement.style.display = 'none';
        }

        const volumeInput = document.querySelector('#volume');
        if (volumeInput) {
            volumeInput.disabled = true;
            const volumeValueDisplay = volumeInput.nextElementSibling;
            if (volumeValueDisplay) volumeValueDisplay.textContent = 'N/A';
            // Optionally hide them: volumeInput.parentElement.style.display = 'none';
        }

        // Hide less relevant filter sections for OpenAI voices
        const filtersToHide = ['gender', 'age', 'accent'];
        filtersToHide.forEach(filterType => {
            // Attempt to hide the button container if structured like: <div class="filter-group"> <button data-filter="gender">...</button> <div id="genderFilter">...</div> </div>
            // Or hide button and dropdown separately
            const filterButton = document.querySelector(`.filter-btn[data-filter='${filterType}']`);
            if (filterButton) {
                // Assuming the button's parent element is the group to hide
                if (filterButton.parentElement && filterButton.parentElement.classList.contains('filter-group')) {
                    filterButton.parentElement.style.display = 'none';
                } else {
                    filterButton.style.display = 'none'; // Hide button itself
                    const filterDropdown = document.querySelector(`#${filterType}Filter`);
                    if (filterDropdown) {
                        filterDropdown.style.display = 'none';
                    }
                }
            }
        });

        // Add event listener for the new Save Settings button
        const saveSettingsButton = document.querySelector('#saveVoiceSettings');
        if (saveSettingsButton) {
            saveSettingsButton.addEventListener('click', () => {
                if (this.selectedVoice && this.characterId) {
                    this.saveVoiceConfiguration();
                } else {
                    this.showError('Please select a voice before saving');
                }
            });
            // Disable initially until a voice is selected
            saveSettingsButton.disabled = !this.selectedVoice;
        }

        document.querySelector('#saveToLibrary').addEventListener('click', () => {
            if (this.lastGeneratedAudio) {
                this.saveToSoundLibrary();
            }
        });

        document.querySelector('#selectVoice').addEventListener('click', () => {
            if (this.selectedVoice && this.characterId) {
                this.saveVoiceConfiguration();
            }
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-btn') && !e.target.closest('.filter-dropdown')) {
                this.closeAllFilterDropdowns();
            }
        });
    }

    async loadVoices() {
        try {
            this.showLoading('Loading voices...');
            const response = await fetch('/api/voice/available');
            if (!response.ok) {
                let errorText = 'Failed to load voices';
                try {
                    const error = await response.json();
                    errorText = error.error || errorText;
                } catch (e) { /* Ignore if response is not JSON */ }
                throw new Error(errorText);
            }
            
            const voices = await response.json();
            // Voices from OpenAI will have: uuid, name, speaker_id (all being the OpenAI voice name like 'alloy')
            // and gender, age, accent set to 'unknown' by our openAIService.js
            this.voices = voices.map(v => ({
                ...v,
                description: v.description || `OpenAI Voice: ${v.name}`, // Add a default description
                gender: v.gender || 'N/A',
                age: v.age || 'N/A',
                accent: v.accent || 'N/A'
            }));
            
            // If we have a character ID, get the current voice settings
            if (this.characterId) {
                try {
                    const voiceSettingsResponse = await fetch(`/api/voice/settings/${this.characterId}`);
                    if (voiceSettingsResponse.ok) {
                        const voiceSettings = await voiceSettingsResponse.json();
                        if (voiceSettings && voiceSettings.speaker_id) {
                            this.selectedVoice = this.voices.find(v => v.speaker_id === voiceSettings.speaker_id);
                        }
                    }
                } catch (settingsError) {
                    console.warn('Could not load current voice settings:', settingsError);
                }
            }
            
            this.populateVoiceTable();
            await this.loadRecentlyUsed();
        } catch (error) {
            console.error('Error loading voices:', error);
            this.showError('Failed to load voices: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    getVoiceStyles(voice) {
        // OpenAI standard TTS voices don't have selectable styles like Replica's vox_2_0
        // We return a single 'default' style. The button generated will call previewVoice.
        // Or, we can return an empty array to not show any style buttons.
        // For now, let's provide a single button to trigger preview with current settings.
        if (voice.capabilities && voice.capabilities['tts.openai_v1']) {
            return [{ name: 'Preview', id: 'default_preview' }]; 
        }
        return []; // Default to no styles if not an OpenAI voice or no capability defined
    }

    populateVoiceTable(filteredVoices = null) {
        const tbody = document.querySelector('#voiceTableBody');
        tbody.innerHTML = '';

        const voicesToShow = filteredVoices || this.voices;
        voicesToShow.forEach(voice => {
            const row = document.createElement('tr');
            // Adjust to new voice structure (less metadata from OpenAI)
            row.innerHTML = `
                <td>${voice.name}</td>
                <td>${voice.description || 'N/A'}</td>
                <td>${voice.gender || 'N/A'}</td>
                <td>${voice.age || 'N/A'}</td>
                <td>${voice.accent || 'N/A'}</td>
                <td>
                    ${this.getVoiceStyles(voice).map(style => `
                        <button class="style-btn preview-btn" data-voice-id="${voice.uuid || voice.speaker_id}" data-style="${style.id}">
                            ${style.name}
                        </button>
                    `).join('')}
                </td>
            `;
            tbody.appendChild(row);

            // Add event listener for the new preview buttons
            row.querySelectorAll('.preview-btn').forEach(button => {
                button.addEventListener('click', (e) => {
                    const voiceId = e.target.dataset.voiceId;
                    // const style = e.target.dataset.style; // Style is less relevant for OpenAI
                    this.selectedVoice = this.voices.find(v => (v.uuid || v.speaker_id) === voiceId);
                    if (this.selectedVoice) {
                        this.updateSelectedVoiceInfo();
                        this.previewVoice(); // Directly preview with current settings
                        const saveSettingsButton = document.querySelector('#saveVoiceSettings');
                        if (saveSettingsButton) saveSettingsButton.disabled = false;
                    }
                });
            });
        });

        // Update filter options based on available voices (might be less diverse with OpenAI)
        this.updateFilterOptions(); 
    }

    updateSelectedVoiceInfo() {
        // Update selected voice info
    }

    async previewVoice() {
        if (!this.selectedVoice) {
            this.showError('Please select a voice first.');
            return;
        }

        const text = document.querySelector('#previewText').value.trim();
        if (!text) {
            this.showError('Please enter text to preview.');
            return;
        }

        this.showLoading('Generating preview...');
        this.isPlaying = false;
        this.updatePlayButtonState();
        document.querySelector('#saveToLibrary').disabled = true;

        try {
            const settings = this.getCurrentSettings(); // Gets speed, pitch, volume from UI
            const voiceId = this.selectedVoice.speaker_id || this.selectedVoice.uuid;

            // Call the generic generateSpeech endpoint
            const response = await fetch('/api/voice/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    speaker_id: voiceId,
                    text: text,
                    options: {
                        speed: settings.speed,
                        // Pitch and volume are not sent as they are not directly supported by OpenAI TTS API
                        // model: 'tts-1' // or 'tts-1-hd' - could be an option later
                    },
                    // characterId: this.characterId // Optional: if preview should affect history
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate preview audio');
            }

            const result = await response.json();
            this.lastGeneratedAudio = { url: result.filePath, text: text, voiceId: voiceId }; // Store filePath as url for wavesurfer
            
            if (this.wavesurfer && result.filePath) {
                this.wavesurfer.load(result.filePath); // Load the MP3 directly by its path
                document.querySelector('#playPausePreview').disabled = false;
                document.querySelector('#saveToLibrary').disabled = false;
            } else {
                throw new Error('Audio file path not received or WaveSurfer not initialized.');
            }

        } catch (error) {
            console.error('Error previewing voice:', error);
            this.showError('Error generating preview: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // Function to get current settings from UI (speed, pitch, volume)
    getCurrentSettings() {
        const speed = parseFloat(document.querySelector('#speed').value) || 1.0;
        // Pitch and Volume are no longer directly applicable for OpenAI TTS API
        // const pitch = parseFloat(document.querySelector('#pitch').value) || 0;
        // const volume = parseFloat(document.querySelector('#volume').value) || 0;
        return { speed /*, pitch, volume */ };
    }

    updatePlayButtonState() {
        // Update play button state
    }

    async saveVoiceConfiguration() {
        if (!this.selectedVoice || !this.characterId) {
            this.showError('No voice selected or character ID missing.');
            return;
        }

        this.showLoading('Saving voice configuration...');
        try {
            const settings = this.getCurrentSettings(); // Get speed from UI
            const voiceId = this.selectedVoice.speaker_id || this.selectedVoice.uuid;

            const response = await fetch(`/api/voice/settings/${this.characterId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    voiceId: voiceId, // This is the OpenAI speaker_id (e.g., 'alloy')
                    settings: {
                        speed: settings.speed,
                        // model: 'tts-1' // Example: if you add model selection later
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save voice configuration');
            }
            const savedData = await response.json();
            this.showError('Voice configuration saved successfully!', true);
            // Optionally, update UI to reflect saved state
            localStorage.setItem(`char_${this.characterId}_voice`, voiceId);
            this.addToRecentlyUsed(this.selectedVoice);

        } catch (error) {
            console.error('Error saving voice configuration:', error);
            this.showError('Error saving configuration: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async saveToSoundLibrary() {
        if (!this.lastGeneratedAudio || !this.lastGeneratedAudio.text) {
            this.showError('No text available from the last preview to save.');
            return;
        }
        if (!this.characterId) {
            this.showError('Character ID is not set. Cannot save to library.');
            return;
        }

        const textToSave = this.lastGeneratedAudio.text; // Use text from the preview

        this.showLoading('Saving to sound library...');
        try {
            // This endpoint uses the character's currently saved voice settings
            const response = await fetch('/api/voice/scene/generate-and-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: textToSave,
                    characterId: this.characterId
                    // The voice_id and settings (like speed) are fetched server-side 
                    // based on the characterId's saved configuration.
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save to sound library');
            }

            const result = await response.json();
            this.showError(`Successfully saved to sound library as '${result.filename}'. Sound ID: ${result.soundId}`, true);
            
            // Optionally, disable the button or give other feedback
            document.querySelector('#saveToLibrary').disabled = true; 

            // Consider if navigation or other UI update is needed here
            // e.g., redirecting to a sound library page or updating a list of sounds.

        } catch (error) {
            console.error('Error saving to sound library:', error);
            this.showError('Error saving to library: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async addToRecentlyUsed(voice) {
        // Add to recently used
    }

    async loadRecentlyUsed() {
        // Load recently used
    }

    setCharacterId(id) {
        this.characterId = id;
        if (this.selectedVoice) {
            document.querySelector('#selectVoice').disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('voiceSelector')) {
        window.voiceSelector = new VoiceSelector();
    }
});
