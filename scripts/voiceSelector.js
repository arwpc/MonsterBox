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

        this.initializeWaveSurfer();
        this.setupEventListeners();
        this.loadVoices();
    }

    initializeWaveSurfer() {
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: '#4a9eff',
            progressColor: '#1976d2',
            height: 60,
            barWidth: 2,
            barGap: 1
        });

        this.wavesurfer.on('finish', () => {
            this.isPlaying = false;
            this.updatePlayButtonState();
        });
    }

    setupEventListeners() {
        // Modal controls
        document.querySelector('#selectVoiceBtn').addEventListener('click', () => {
            this.openModal();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleFilterDropdown(e.target.dataset.filter));
        });

        // Filter checkboxes
        document.querySelectorAll('.filter-option input').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.applyFilters());
        });

        // Search input
        document.querySelector('#voiceSearch').addEventListener('input', (e) => {
            this.filterVoices(e.target.value);
        });

        // Sort headers
        document.querySelectorAll('th').forEach(header => {
            header.addEventListener('click', (e) => this.sortVoices(e.target));
        });

        // Preview button
        document.querySelector('#previewPlay').addEventListener('click', () => {
            if (this.currentPreviewVoice) {
                this.playPreview(this.currentPreviewVoice);
            }
        });

        // Select voice button
        document.querySelector('#selectVoice').addEventListener('click', () => {
            if (this.selectedVoice) {
                this.confirmVoiceSelection();
            }
        });

        // Window click for closing dropdowns
        window.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-btn') && !e.target.closest('.filter-dropdown')) {
                this.closeAllFilterDropdowns();
            }
        });
    }

    async loadVoices() {
        try {
            const response = await fetch('/api/voice/available');
            const voices = await response.json();
            this.voices = voices.map(voice => ({
                ...voice,
                styles: this.getVoiceStyles(voice)
            }));
            this.populateVoiceTable();
            this.loadRecentlyUsed();
        } catch (error) {
            console.error('Error loading voices:', error);
        }
    }

    getVoiceStyles(voice) {
        // Define available styles based on voice characteristics
        const baseStyles = ['neutral'];
        if (voice.capabilities?.includes('expressive')) {
            baseStyles.push('happy', 'sad', 'angry');
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
                    ${voice.styles.map(style => `
                        <button class="style-btn" data-voice-id="${voice.uuid}" data-style="${style}">
                            <i class="fas fa-play"></i> ${style}
                        </button>
                    `).join('')}
                </td>
            `;

            row.addEventListener('click', () => this.selectVoice(voice));
            if (this.selectedVoice?.uuid === voice.uuid) {
                row.classList.add('selected');
            }

            tbody.appendChild(row);
        });

        // Add style button click handlers
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const voiceId = btn.dataset.voiceId;
                const style = btn.dataset.style;
                const voice = this.voices.find(v => v.uuid === voiceId);
                if (voice) {
                    this.playPreview(voice, style);
                }
            });
        });
    }

    async playPreview(voice, style = 'neutral') {
        if (this.isPlaying) {
            this.wavesurfer.stop();
            this.isPlaying = false;
            this.updatePlayButtonState();
            if (this.currentPreviewVoice?.uuid === voice.uuid) {
                return;
            }
        }

        this.currentPreviewVoice = voice;
        const previewText = document.querySelector('#previewText').value;

        try {
            const response = await fetch('/api/voice/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    speaker_id: voice.uuid,
                    text: previewText,
                    style: style,
                    options: {
                        modelId: 'vox_2_0',
                        pitch: parseInt(document.querySelector('#pitch').value || 0),
                        speed: parseFloat(document.querySelector('#speed').value || 1.0),
                        volume: parseInt(document.querySelector('#volume').value || 0),
                        sampleRate: 44100,
                        bitRate: 128
                    }
                })
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error);
            }

            if (data.url) {
                this.wavesurfer.load(data.url);
                this.wavesurfer.on('ready', () => {
                    this.wavesurfer.play();
                    this.isPlaying = true;
                    this.updatePlayButtonState();
                });
            }
        } catch (error) {
            console.error('Error generating preview:', error);
            alert('Error generating preview: ' + error.message);
        }
    }

    updatePlayButtonState() {
        const playButton = document.querySelector('#previewPlay');
        playButton.innerHTML = this.isPlaying ? 
            '<i class="fas fa-stop"></i> Stop' : 
            '<i class="fas fa-play"></i> Preview';
    }

    selectVoice(voice) {
        this.selectedVoice = voice;
        document.querySelectorAll('#voiceTableBody tr').forEach(row => {
            row.classList.toggle('selected', row.cells[0].textContent === voice.name);
        });
        this.currentPreviewVoice = voice;
        document.querySelector('#selectVoice').disabled = false;
    }

    confirmVoiceSelection() {
        if (this.selectedVoice) {
            // Create a custom event with the selected voice data
            const event = new CustomEvent('voiceSelected', {
                detail: this.selectedVoice
            });
            document.dispatchEvent(event);
            this.addToRecentlyUsed(this.selectedVoice);
            this.closeModal();
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
        if (style.size > 0 && !Array.from(style).some(s => voice.styles.includes(s))) return false;

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
        // Reset filters
        Object.keys(this.filters).forEach(key => this.filters[key].clear());

        // Collect active filters
        document.querySelectorAll('.filter-option input:checked').forEach(checkbox => {
            const filterType = checkbox.closest('.filter-dropdown').id.replace('Filter', '');
            this.filters[filterType].add(checkbox.value);
        });

        this.filterVoices(document.querySelector('#voiceSearch').value);
    }

    sortVoices(header) {
        const column = header.textContent.toLowerCase().trim();
        const currentDirection = header.dataset.sortDirection === 'asc' ? 'desc' : 'asc';
        
        // Reset all sort indicators
        document.querySelectorAll('th').forEach(th => {
            th.dataset.sortDirection = '';
            th.querySelector('i').className = 'fas fa-sort';
        });

        // Update sort indicator
        header.dataset.sortDirection = currentDirection;
        header.querySelector('i').className = `fas fa-sort-${currentDirection === 'asc' ? 'up' : 'down'}`;

        // Sort voices
        const sortedVoices = [...this.voices].sort((a, b) => {
            let valueA = a[column] || '';
            let valueB = b[column] || '';

            if (column === 'styles') {
                valueA = a.styles.length;
                valueB = b.styles.length;
            }

            if (currentDirection === 'asc') {
                return valueA > valueB ? 1 : -1;
            } else {
                return valueA < valueB ? 1 : -1;
            }
        });

        this.populateVoiceTable(sortedVoices);
    }

    addToRecentlyUsed(voice) {
        // Get stored recently used voices
        let recent = JSON.parse(localStorage.getItem('recentlyUsedVoices') || '[]');
        
        // Add new voice to the beginning
        recent = [voice, ...recent.filter(v => v.uuid !== voice.uuid)].slice(0, 5);
        
        // Save back to localStorage
        localStorage.setItem('recentlyUsedVoices', JSON.stringify(recent));
        
        this.loadRecentlyUsed();
    }

    loadRecentlyUsed() {
        const recentContainer = document.querySelector('#recentlyUsedVoices');
        const recent = JSON.parse(localStorage.getItem('recentlyUsedVoices') || '[]');
        
        recentContainer.innerHTML = recent.map(voice => `
            <div class="voice-chip" data-voice-id="${voice.uuid}">
                ${voice.name}
            </div>
        `).join('');

        // Add click handlers
        document.querySelectorAll('.voice-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const voice = this.voices.find(v => v.uuid === chip.dataset.voiceId);
                if (voice) {
                    this.selectVoice(voice);
                }
            });
        });
    }

    openModal() {
        const voiceSelectorModal = document.getElementById('voiceModal');
        if (voiceSelectorModal) {
            voiceSelectorModal.style.display = 'block';
        } else {
            console.error('Voice selector modal not found');
        }
    }

    closeModal() {
        const voiceSelectorModal = document.getElementById('voiceModal');
        if (voiceSelectorModal) {
            voiceSelectorModal.style.display = 'none';
        }
        if (this.isPlaying) {
            this.wavesurfer.stop();
            this.isPlaying = false;
            this.updatePlayButtonState();
        }
    }
}

// Initialize voice selector when document is ready
document.addEventListener('DOMContentLoaded', () => {
    window.voiceSelector = new VoiceSelector();
});