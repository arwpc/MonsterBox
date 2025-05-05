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
        const errorElement = document.querySelector('#errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.backgroundColor = isSuccess ? '#4CAF50' : '#ff5252';
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
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

        ['speed', 'pitch', 'volume'].forEach(setting => {
            const input = document.querySelector(`#${setting}`);
            const value = input.nextElementSibling;
            input.addEventListener('input', (e) => {
                value.textContent = e.target.value;
                this.updatePreviewButtonState();
            });
        });

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

    getVoiceStyles(voice) {
        const baseStyles = ['neutral'];
        if (voice.capabilities && voice.capabilities['tts.vox_2_0']) {
            baseStyles.push('happy', 'sad', 'angry', 'fearful');
        }
        return baseStyles;
    }

    populateVoiceTable(filteredVoices = null) {
        const tbody = document.querySelector('#voiceTableBody');
        tbody.innerHTML = '';

        const voicesToShow = filteredVoices || this.voices;
        voicesToShow.forEach(voice => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${voice.name}</td>
                <td>${voice.gender || 'Unknown'}</td>
                <td>${voice.age || 'Unknown'}</td>
                <td>${voice.accent || 'None'}</td>
                <td>
                    ${this.getVoiceStyles(voice).map(style => `
                        <button class="style-btn" data-voice-id="${voice.uuid}" data-style="${style}">
                            <i class="fas fa-play"></i> ${style}
                        </button>
                    `).join('')}
                </td>
                <td>
                    <button class="action-btn favorite-btn" title="Add to favorites">
                        <i class="far fa-star"></i>
                    </button>
                </td>
            `;

            row.addEventListener('click', () => this.selectVoice(voice));
            if (this.selectedVoice?.uuid === voice.uuid) {
                row.classList.add('selected');
            }

            tbody.appendChild(row);
        });

        this.setupVoiceRowHandlers();
    }

    setupVoiceRowHandlers() {
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const voiceId = btn.dataset.voiceId;
                const style = btn.dataset.style;
                const voice = this.voices.find(v => v.uuid === voiceId);
                if (voice) {
                    this.currentPreviewVoice = voice;
                    this.generatePreview(style);
                }
            });
        });

        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('tr');
                const voice = this.voices.find(v => v.name === row.cells[0].textContent);
                this.toggleFavorite(voice, btn);
            });
        });
    }

    async toggleFavorite(voice, button) {
        try {
            const isFavorite = button.querySelector('i').classList.contains('fas');
            const metadata = { favorited: !isFavorite };

            const response = await fetch(`/api/voice/metadata/${this.characterId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ metadata })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update favorite status');
            }

            button.querySelector('i').classList.toggle('far');
            button.querySelector('i').classList.toggle('fas');
        } catch (error) {
            console.error('Error updating favorite status:', error);
            this.showError('Failed to update favorite status: ' + error.message);
        }
    }

    async generatePreview(style = 'neutral') {
        try {
            this.showLoading('Generating preview...');
            const previewText = document.querySelector('#previewText').value;

            // Use the speaker_id from the voice data
            const speakerId = this.currentPreviewVoice.speaker_id;
            if (!speakerId) {
                throw new Error('No valid speaker ID found for this voice');
            }

            const response = await fetch('/api/voice/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
            
            if (data.url) {
                // Convert relative URL to absolute URL
                const absoluteUrl = new URL(data.url, window.location.origin).href;
                this.wavesurfer.load(absoluteUrl);
                this.wavesurfer.on('ready', () => {
                    this.wavesurfer.play();
                    this.isPlaying = true;
                    document.querySelector('#saveToLibrary').disabled = false;
                });
            }
            
            // Show success message
            this.showError('Voice generated successfully', true);
        } catch (error) {
            console.error('Error generating preview:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }

    async saveToSoundLibrary() {
        if (!this.lastGeneratedAudio || !this.lastGeneratedAudio.url) {
            this.showError('No audio available to save');
            return;
        }

        try {
            this.showLoading('Saving to sound library...');
            const previewText = document.querySelector('#previewText').value;

            const response = await fetch('/api/voice/save-to-sounds', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    audioUrl: this.lastGeneratedAudio.url,
                    text: previewText,
                    characterId: this.characterId || null
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save to sound library');
            }

            const data = await response.json();
            this.showError('Successfully saved to sound library. View in Sound Library.', true);
            
            // After a short delay, redirect to the sounds page
            setTimeout(() => {
                window.location.href = `/sounds?characterId=${this.characterId}`;
            }, 2000);
        } catch (error) {
            console.error('Error saving to sound library:', error);
            this.showError('Failed to save to sound library: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    updatePlayButtonState() {
        document.querySelector('#saveToLibrary').disabled = !this.lastGeneratedAudio;
    }

    selectVoice(voice) {
        this.selectedVoice = voice;
        this.currentPreviewVoice = voice;
        
        document.querySelectorAll('#voiceTableBody tr').forEach(row => {
            row.classList.toggle('selected', row.cells[0].textContent === voice.name);
        });
        
        document.querySelector('#selectVoice').disabled = !this.characterId;
        this.updatePlayButtonState();
        
        // Generate preview automatically when voice is selected
        this.generatePreview('neutral');
    }

    async saveVoiceConfiguration() {
        if (this.selectedVoice && this.characterId) {
            try {
                const settings = {
                    speed: parseFloat(document.querySelector('#speed').value),
                    pitch: parseInt(document.querySelector('#pitch').value),
                    volume: parseInt(document.querySelector('#volume').value)
                };

                // Use the speaker_id from the voice data
                const speakerId = this.selectedVoice.speaker_id;
                if (!speakerId) {
                    throw new Error('No valid speaker ID found for this voice');
                }

                const response = await fetch('/api/voice/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        characterId: this.characterId,
                        voiceId: speakerId,
                        settings
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to save voice configuration');
                }

                this.addToRecentlyUsed(this.selectedVoice);
                // Show success message and redirect to sounds page
                this.showError('Voice settings saved successfully. Redirecting to Sound Library...', true);
                setTimeout(() => {
                    window.location.href = `/sounds?characterId=${this.characterId}`;
                }, 2000);
            } catch (error) {
                console.error('Error saving voice configuration:', error);
                this.showError('Failed to save voice configuration: ' + error.message);
            }
        }
    }

    filterVoices(searchTerm) {
        const filtered = this.voices.filter(voice => {
            const matchesSearch = searchTerm ? 
                voice.name.toLowerCase().includes(searchTerm.toLowerCase()) :
                true;

            const matchesFilters = this.checkFilters(voice);

            return matchesSearch && matchesFilters;
        });

        this.populateVoiceTable(filtered);
    }

    checkFilters(voice) {
        const { gender, style, accent, age } = this.filters;
        
        if (gender.size > 0 && !gender.has(voice.gender?.toLowerCase())) return false;
        if (accent.size > 0 && !accent.has(voice.accent?.toLowerCase())) return false;
        if (age.size > 0 && !age.has(this.getAgeGroup(voice.age))) return false;
        if (style.size > 0 && !Array.from(style).some(s => this.getVoiceStyles(voice).includes(s))) return false;

        return true;
    }

    getAgeGroup(age) {
        if (!age) return 'unknown';
        if (age.includes('Young') || (age >= 18 && age <= 34)) return 'young';
        if (age.includes('Middle') || (age >= 35 && age <= 54)) return 'middle';
        if (age.includes('Senior') || age >= 55) return 'senior';
        return 'unknown';
    }

    toggleFilterDropdown(filterType) {
        const dropdown = document.querySelector(`#${filterType}Filter`);
        const isVisible = dropdown.style.display === 'block';
        
        this.closeAllFilterDropdowns();
        
        if (!isVisible) {
            dropdown.style.display = 'block';
        }
    }

    closeAllFilterDropdowns() {
        document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
            dropdown.style.display = 'none';
        });
    }

    applyFilters() {
        Object.keys(this.filters).forEach(key => this.filters[key].clear());

        document.querySelectorAll('.filter-option input:checked').forEach(checkbox => {
            const filterType = checkbox.closest('.filter-dropdown').id.replace('Filter', '');
            this.filters[filterType].add(checkbox.value);
        });

        this.filterVoices(document.querySelector('#voiceSearch').value);
    }

    sortVoices(header) {
        const column = header.textContent.toLowerCase().trim();
        const currentDirection = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
        
        document.querySelectorAll('th').forEach(th => {
            th.dataset.sortDirection = '';
            th.querySelector('i').className = 'fas fa-sort';
        });

        header.dataset.sortDirection = currentDirection;
        header.querySelector('i').className = `fas fa-sort-${currentDirection === 'asc' ? 'up' : 'down'}`;

        const sortedVoices = [...this.voices].sort((a, b) => {
            let valueA = a[column] || '';
            let valueB = b[column] || '';

            if (column === 'styles') {
                valueA = this.getVoiceStyles(a).length;
                valueB = this.getVoiceStyles(b).length;
            }

            return currentDirection === 'asc' ? 
                (valueA > valueB ? 1 : -1) : 
                (valueA < valueB ? 1 : -1);
        });

        this.populateVoiceTable(sortedVoices);
    }

    async addToRecentlyUsed(voice) {
        let recent = JSON.parse(localStorage.getItem('recentlyUsedVoices') || '[]');
        recent = [voice, ...recent.filter(v => v.uuid !== voice.uuid)].slice(0, 5);
        localStorage.setItem('recentlyUsedVoices', JSON.stringify(recent));
        await this.loadRecentlyUsed();
    }

    async loadRecentlyUsed() {
        const recentContainer = document.querySelector('#recentlyUsedVoices');
        const recent = JSON.parse(localStorage.getItem('recentlyUsedVoices') || '[]');
        
        recentContainer.innerHTML = recent.map(voice => `
            <div class="voice-chip" data-voice-id="${voice.uuid}">
                ${voice.name}
            </div>
        `).join('');

        document.querySelectorAll('.voice-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const voice = this.voices.find(v => v.uuid === chip.dataset.voiceId);
                if (voice) {
                    this.selectVoice(voice);
                }
            });
        });
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
