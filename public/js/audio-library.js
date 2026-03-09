/**
 * Audio Library Frontend JavaScript
 * Handles UI interactions, drag & drop, search, filtering, and audio playback
 */

class AudioLibrary {
    constructor() {
        this.audioFiles = [];
        this.categories = [];
        this.selectedFiles = [];
        this.currentCharacter = null;
        this.searchTimeout = null;
        this.bulkSelectMode = false;
        this.selectedAudioIds = new Set();
        // Speaker selection state
        this.speakers = [];
        this.selectedSpeakerPartId = null;

        // View toggle state
        this.currentView = 'grid';
        this.listSortColumn = null;
        this.listSortDirection = 'asc';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        await this.loadCurrentCharacter();
        await this.loadSpeakers();
        this.renderSpeakerSelector();
        await this.loadAudioLibrary();
        this.populateCategoryFilters();
        this.initViewToggle();
    }

    setupEventListeners() {
        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.filterAudioFiles();
            }, 300);
        });

        // Filter controls
        document.getElementById('categoryFilter').addEventListener('change', () => this.filterAudioFiles());
        document.getElementById('formatFilter').addEventListener('change', () => this.filterAudioFiles());
        document.getElementById('sortBy').addEventListener('change', () => this.filterAudioFiles());
        document.getElementById('favoritesOnly').addEventListener('change', () => this.filterAudioFiles());

        // File input
        document.getElementById('audioFileInput').addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Upload button
        document.getElementById('uploadBtn').addEventListener('click', () => {
            this.uploadFiles();
        });

        // Modal events
        document.getElementById('uploadModal').addEventListener('hidden.bs.modal', () => {
            this.resetUploadForm();
        });
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('dragDropZone');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(file =>
                file.type.startsWith('audio/')
            );

            if (files.length > 0) {
                this.handleFileSelection(files);
            }
        });

        // Click to browse
        dropZone.addEventListener('click', (e) => {
            if (e.target === dropZone || e.target.closest('.mb-drop-zone')) {
                document.getElementById('audioFileInput').click();
            }
        });
    }

    async loadCurrentCharacter() {
        try {
            // Use server-provided character ID from master layout
            var charId = window.__MB_CHAR_ID || null;
            if (!charId) {
                try { var cl = document.getElementById('charLabel'); if (cl && cl.dataset.charId) charId = cl.dataset.charId; } catch (e) {}
            }
            if (!charId) {
                const response = await fetch('/setup/characters/api/current');
                const data = await response.json();
                charId = (data.success && data.selectedCharacter) ? data.selectedCharacter : null;
            }

            if (charId) {
                // Get character details
                const charResponse = await fetch(`/setup/characters/api/characters/${charId}`);
                const charData = await charResponse.json();

                if (charData.success && charData.character) {
                    this.currentCharacter = charData.character;
                } else {
                    this.currentCharacter = { id: charId, name: `Character ${charId}` };
                }
            } else {
                this.currentCharacter = { id: 1, name: 'Default' };
            }
        } catch (e) {
            console.error('Error loading current character:', e);
            this.currentCharacter = { id: 1, name: 'Default' };
        }
    }

    async loadSpeakers() {
        try {
            // Fetch all speaker parts and filter by current character
            const res = await fetch('/api/parts?type=speaker');
            const data = await res.json();
            if (data && data.success && Array.isArray(data.parts)) {
                const cid = this.currentCharacter && this.currentCharacter.id;
                // Prefer current character's speakers; fall back to all if none
                const byCharacter = data.parts.filter(p => String(p.characterId) === String(cid));
                this.speakers = byCharacter.length ? byCharacter : data.parts;
                this.selectedSpeakerPartId = (this.speakers[0] && this.speakers[0].id) || null;
            } else {
                this.speakers = [];
                this.selectedSpeakerPartId = null;
            }
        } catch (e) {
            console.error('Error loading speakers:', e);
            this.speakers = [];
            this.selectedSpeakerPartId = null;
        }
    }

    renderSpeakerSelector() {
        const sel = document.getElementById('speakerSelect');
        if (!sel) return;
        sel.innerHTML = '';
        if (!this.speakers || this.speakers.length === 0) {
            const opt = new Option('Default System Output', '');
            sel.appendChild(opt);
            sel.disabled = true;
            return;
        }
        this.speakers.forEach(sp => {
            const label = `${sp.name || 'Speaker ' + sp.id}${sp.characterId ? ' (Char ' + sp.characterId + ')' : ''}`;
            const opt = new Option(label, sp.id);
            sel.appendChild(opt);
        });
        if (this.selectedSpeakerPartId) sel.value = String(this.selectedSpeakerPartId);
        sel.disabled = false;
        sel.addEventListener('change', (e) => {
            this.selectedSpeakerPartId = e.target.value || null;
        });
    }


    async loadAudioLibrary() {
        try {
            const response = await fetch('/audio-library/api/library');
            const data = await response.json();

            if (data.success) {
                this.audioFiles = data.audio;
                this.categories = data.categories;
                this.updateStats(data);
                this.renderCurrentView();
            }
        } catch (error) {
            console.error('Error loading audio library:', error);
            this.showError('Failed to load audio library');
        }
    }

    updateStats(data) {
        document.getElementById('totalFiles').textContent = data.totalFiles;
        document.getElementById('totalSize').textContent = this.formatFileSize(data.totalSize);
        document.getElementById('totalCategories').textContent = data.categories.length;

        const favorites = this.audioFiles.filter(audio => audio.favorite).length;
        document.getElementById('totalFavorites').textContent = favorites;
    }

    populateCategoryFilters() {
        const categoryFilter = document.getElementById('categoryFilter');
        const uploadCategory = document.getElementById('uploadCategory');

        // Clear existing options (except "All Categories")
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        uploadCategory.innerHTML = '';

        this.categories.forEach(category => {
            const option1 = new Option(this.capitalizeFirst(category), category);
            const option2 = new Option(this.capitalizeFirst(category), category);

            categoryFilter.appendChild(option1);
            uploadCategory.appendChild(option2);
        });
    }

    renderAudioGrid() {
        const grid = document.getElementById('audioGrid');
        const emptyState = document.getElementById('emptyState');

        if (this.audioFiles.length === 0) {
            grid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        grid.style.display = 'flex';
        emptyState.style.display = 'none';

        grid.innerHTML = this.audioFiles.map(audio => this.createAudioCard(audio)).join('');

        // Add event listeners to cards
        this.audioFiles.forEach(audio => {
            const card = document.getElementById(`audio-${audio.id}`);
            if (card) {
                this.setupAudioCardEvents(card, audio);
            }
        });

        // Add bulk checkbox listeners
        if (this.bulkSelectMode) {
            document.querySelectorAll('.bulk-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const audioId = e.target.dataset.audioId;
                    if (e.target.checked) {
                        this.selectedAudioIds.add(audioId);
                    } else {
                        this.selectedAudioIds.delete(audioId);
                    }
                    this.updateSelectedCount();
                });
            });
        }
    }

    createAudioCard(audio) {
        var tags = Array.isArray(audio.tags) ? audio.tags : [];
        var tagsHTML = tags.map(function(tag) {
            return '<span class="mb-tag-badge badge bg-secondary">' + tag + '</span>';
        }).join('');
        var format = audio.format || 'audio';
        var fileSize = audio.fileSize || 0;
        var uploadedAt = audio.uploadedAt || audio.addedAt || '';

        var bulkCheckbox = this.bulkSelectMode ? '\
            <div class="position-absolute top-0 start-0 p-2">\
                <input type="checkbox" class="form-check-input bulk-checkbox"\
                       data-audio-id="' + audio.id + '"\
                       ' + (this.selectedAudioIds.has(audio.id) ? 'checked' : '') + '>\
            </div>\
        ' : '';

        return '\
            <div class="col-lg-3 col-md-4 col-sm-6 mb-4">\
                <div class="card mb-media-card h-100" id="audio-' + audio.id + '">\
                    <div class="position-relative">\
                        ' + bulkCheckbox + '\
                        <div class="mb-waveform">\
                            <div class="mb-waveform-placeholder">\
                                <i class="bi bi-soundwave"></i>\
                                <span class="ms-2">' + this.formatDuration(audio.duration) + '</span>\
                            </div>\
                            <div class="mb-media-controls">\
                                <button class="btn btn-primary btn-sm me-1 play-btn" data-audio-id="' + audio.id + '">\
                                    <i class="bi bi-play-fill"></i>\
                                </button>\
                                <button class="btn btn-info btn-sm edit-btn" data-audio-id="' + audio.id + '">\
                                    <i class="bi bi-pencil"></i>\
                                </button>\
                            </div>\
                        </div>\
                        <button class="mb-favorite-btn ' + (audio.favorite ? 'active' : '') + '" data-audio-id="' + audio.id + '">\
                            <i class="bi bi-heart' + (audio.favorite ? '-fill' : '') + '"></i>\
                        </button>\
                    </div>\
                    <div class="card-body">\
                        <h6 class="card-title mb-2">' + (audio.title || 'Untitled') + '</h6>\
                        <p class="card-text small text-muted mb-2">' + (audio.description || 'No description') + '</p>\
                        <div class="mb-2">' + tagsHTML + '</div>\
                        <div class="d-flex justify-content-between align-items-center small text-muted">\
                            <span>\
                                <i class="bi bi-file-earmark"></i>\
                                ' + format.toUpperCase() + '\
                            </span>\
                            <span>\
                                <i class="bi bi-hdd"></i>\
                                ' + this.formatFileSize(fileSize) + '\
                            </span>\
                        </div>\
                        <div class="d-flex justify-content-between align-items-center small text-muted mt-1">\
                            <span>\
                                <i class="bi bi-play"></i>\
                                ' + (audio.playCount || 0) + ' plays\
                            </span>\
                            <span>\
                                <i class="bi bi-calendar"></i>\
                                ' + this.formatDate(uploadedAt) + '\
                            </span>\
                        </div>\
                    </div>\
                    <div class="card-footer">\
                        <div class="btn-group w-100" role="group">\
                            <button class="btn btn-outline-primary btn-sm play-character-btn" data-audio-id="' + audio.id + '">\
                                <i class="bi bi-speaker"></i> Play on Character\
                            </button>\
                            <button class="btn btn-outline-secondary btn-sm" onclick="window.open(\'/audio-library/api/audio/' + audio.id + '/download\')">\
                                <i class="bi bi-download"></i>\
                            </button>\
                            <button class="btn btn-outline-danger btn-sm delete-btn" data-audio-id="' + audio.id + '">\
                                <i class="bi bi-trash"></i>\
                            </button>\
                        </div>\
                    </div>\
                </div>\
            </div>\
        ';
    }

    setupAudioCardEvents(card, audio) {
        // Play button
        card.querySelector('.play-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.openAudioPlayer(audio);
        });

        // Play on character button
        card.querySelector('.play-character-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.playOnCharacter(audio.id);
        });

        // Favorite button
        card.querySelector('.mb-favorite-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFavorite(audio.id);
        });

        // Edit button
        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.editAudio(audio);
        });

        // Delete button
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteAudio(audio.id, audio.title);
        });
    }

    async filterAudioFiles() {
        const search = document.getElementById('searchInput').value;
        const category = document.getElementById('categoryFilter').value;
        const format = document.getElementById('formatFilter').value;
        const sortBy = document.getElementById('sortBy').value;
        const favoritesOnly = document.getElementById('favoritesOnly').checked;

        try {
            const params = new URLSearchParams({
                search: search,
                category: category,
                format: format,
                sortBy: sortBy,
                favorite: favoritesOnly
            });

            const response = await fetch(`/audio-library/api/library?${params}`);
            const data = await response.json();

            if (data.success) {
                this.audioFiles = data.audio;
                this.renderCurrentView();
            }
        } catch (error) {
            console.error('Error filtering audio files:', error);
        }
    }

    handleFileSelection(files) {
        this.selectedFiles = Array.from(files);
        this.displaySelectedFiles();
        document.getElementById('uploadBtn').disabled = this.selectedFiles.length === 0;
    }

    displaySelectedFiles() {
        const filesList = document.getElementById('filesList');
        const selectedFilesList = document.getElementById('selectedFilesList');

        if (this.selectedFiles.length === 0) {
            selectedFilesList.style.display = 'none';
            return;
        }

        selectedFilesList.style.display = 'block';
        filesList.innerHTML = this.selectedFiles.map((file, index) => `
            <div class="d-flex justify-content-between align-items-center py-1">
                <span>
                    <i class="bi bi-music-note"></i>
                    ${file.name} (${this.formatFileSize(file.size)})
                </span>
                <button class="btn btn-sm btn-outline-danger" onclick="audioLibrary.removeSelectedFile(${index})">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `).join('');
    }

    removeSelectedFile(index) {
        this.selectedFiles.splice(index, 1);
        this.displaySelectedFiles();
        document.getElementById('uploadBtn').disabled = this.selectedFiles.length === 0;
    }

    async uploadFiles() {
        if (this.selectedFiles.length === 0) return;

        const formData = new FormData();
        const form = document.getElementById('uploadForm');
        const formDataObj = new FormData(form);

        // Add form data
        for (let [key, value] of formDataObj.entries()) {
            formData.append(key, value);
        }

        // Add files
        this.selectedFiles.forEach(file => {
            formData.append('audioFiles', file);
        });

        this.showUploadProgress();
        this.updateUploadStatus('Preparing upload...');

        try {
            // Create XMLHttpRequest for progress tracking
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    this.updateUploadProgress(percentComplete);
                    this.updateUploadStatus(`Uploading... ${Math.round(percentComplete)}%`);
                }
            });

            // Handle completion
            xhr.addEventListener('load', async () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);

                    if (data.success) {
                        this.updateUploadProgress(100);
                        this.updateUploadStatus('Processing files...');

                        // Show detailed results
                        let message = `Successfully uploaded ${data.uploaded.length} file(s)`;
                        if (data.errors && data.errors.length > 0) {
                            message += `\n${data.errors.length} file(s) failed to upload`;
                        }

                        this.showSuccess(message);
                        this.hideUploadProgress();
                        bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
                        await this.loadAudioLibrary();
                    } else {
                        this.showError(data.error || 'Upload failed');
                        this.hideUploadProgress();
                    }
                } else {
                    this.showError('Upload failed with status: ' + xhr.status);
                    this.hideUploadProgress();
                }
            });

            // Handle errors
            xhr.addEventListener('error', () => {
                this.showError('Upload failed due to network error');
                this.hideUploadProgress();
            });

            // Start upload
            xhr.open('POST', '/audio-library/api/upload');
            xhr.send(formData);

        } catch (error) {
            console.error('Upload error:', error);
            this.showError('Upload failed');
            this.hideUploadProgress();
        }
    }

    updateUploadProgress(percent) {
        const progressBar = document.querySelector('.upload-progress .progress-bar');
        progressBar.style.width = percent + '%';
        progressBar.setAttribute('aria-valuenow', percent);
    }

    updateUploadStatus(status) {
        document.getElementById('uploadStatus').textContent = status;
    }

    async playOnCharacter(audioId) {
        try {
            const response = await fetch(`/audio-library/api/audio/${audioId}/play`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    characterId: this.currentCharacter.id,
                    volume: 80,
                    speakerPartId: this.selectedSpeakerPartId || undefined
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Playing "${data.audio.title}" on ${this.currentCharacter.name || 'Character ' + this.currentCharacter.id}`);
            } else {
                this.showError(data.error || 'Failed to play audio');
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            this.showError('Failed to play audio');
        }
    }

    async toggleFavorite(audioId) {
        const audio = this.audioFiles.find(a => a.id === audioId);
        if (!audio) return;

        try {
            const response = await fetch(`/audio-library/api/audio/${audioId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    favorite: !audio.favorite
                })
            });

            const data = await response.json();

            if (data.success) {
                audio.favorite = data.audio.favorite;
                const btn = document.querySelector(`[data-audio-id="${audioId}"].mb-favorite-btn`);
                const icon = btn.querySelector('i');

                if (audio.favorite) {
                    btn.classList.add('active');
                    icon.className = 'bi bi-heart-fill';
                } else {
                    btn.classList.remove('active');
                    icon.className = 'bi bi-heart';
                }

                this.updateStats({ totalFiles: this.audioFiles.length, totalSize: 0, categories: this.categories });
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    async deleteAudio(audioId, title) {
        if (!confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/audio-library/api/audio/${audioId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess(`Deleted "${title}"`);
                await this.loadAudioLibrary();
            } else {
                this.showError(data.error || 'Failed to delete audio');
            }
        } catch (error) {
            console.error('Error deleting audio:', error);
            this.showError('Failed to delete audio');
        }
    }

    openAudioPlayer(audio) {
        const modal = new bootstrap.Modal(document.getElementById('audioPlayerModal'));
        document.getElementById('playerTitle').innerHTML = `
            <i class="bi bi-play-circle"></i> ${audio.title}
        `;

        // Initialize advanced audio player
        if (window.advancedPlayer) {
            window.advancedPlayer.destroy();
        }

        // Load the advanced player script if not already loaded
        if (!window.AdvancedAudioPlayer) {
            const script = document.createElement('script');
            script.src = '/js/audio-player.js';
            script.onload = () => {
                window.advancedPlayer = new AdvancedAudioPlayer('audioPlayerContainer');
                window.advancedPlayer.loadAudio(audio);
            };
            document.head.appendChild(script);
        } else {
            window.advancedPlayer = new AdvancedAudioPlayer('audioPlayerContainer');
            window.advancedPlayer.loadAudio(audio);
        }

        modal.show();
    }

    editAudio(audio) {
        this.openEditModal(audio);
    }

    openEditModal(audio) {
        // Create edit modal if it doesn't exist
        if (!document.getElementById('editAudioModal')) {
            this.createEditModal();
        }

        // Populate form with current audio data
        document.getElementById('editTitle').value = audio.title || '';
        document.getElementById('editDescription').value = audio.description || '';
        document.getElementById('editCategory').value = audio.category || 'other';
        document.getElementById('editTags').value = Array.isArray(audio.tags) ? audio.tags.join(', ') : '';
        document.getElementById('editFavorite').checked = audio.favorite || false;

        // Store current audio ID
        document.getElementById('editAudioModal').dataset.audioId = audio.id;

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('editAudioModal'));
        modal.show();
    }

    createEditModal() {
        const modalHTML = `
            <div class="modal fade" id="editAudioModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-pencil"></i> Edit Audio File
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editAudioForm">
                                <div class="mb-3">
                                    <label class="form-label">Title</label>
                                    <input type="text" class="form-control" id="editTitle" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" id="editDescription" rows="3"></textarea>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Category</label>
                                    <select class="form-select" id="editCategory">
                                        ${this.categories.map(cat =>
            `<option value="${cat}">${this.capitalizeFirst(cat)}</option>`
        ).join('')}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Tags (comma separated)</label>
                                    <input type="text" class="form-control" id="editTags"
                                           placeholder="spooky, halloween, monster">
                                </div>
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="editFavorite">
                                        <label class="form-check-label" for="editFavorite">
                                            Mark as Favorite
                                        </label>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="audioLibrary.saveAudioEdit()">
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    async saveAudioEdit() {
        const modal = document.getElementById('editAudioModal');
        const audioId = modal.dataset.audioId;

        const updates = {
            title: document.getElementById('editTitle').value,
            description: document.getElementById('editDescription').value,
            category: document.getElementById('editCategory').value,
            tags: document.getElementById('editTags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
            favorite: document.getElementById('editFavorite').checked
        };

        try {
            const response = await fetch(`/audio-library/api/audio/${audioId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Audio file updated successfully');
                bootstrap.Modal.getInstance(modal).hide();
                await this.loadAudioLibrary();
            } else {
                this.showError(data.error || 'Failed to update audio file');
            }
        } catch (error) {
            console.error('Error updating audio:', error);
            this.showError('Failed to update audio file');
        }
    }

    showUploadProgress() {
        document.querySelector('.upload-progress').style.display = 'block';
        document.getElementById('uploadBtn').disabled = true;
    }

    hideUploadProgress() {
        document.querySelector('.upload-progress').style.display = 'none';
        document.getElementById('uploadBtn').disabled = false;
    }

    resetUploadForm() {
        document.getElementById('uploadForm').reset();
        document.getElementById('audioFileInput').value = '';
        this.selectedFiles = [];
        document.getElementById('selectedFilesList').style.display = 'none';
        document.getElementById('uploadBtn').disabled = true;
        this.hideUploadProgress();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown';
        var d = new Date(dateString);
        if (isNaN(d.getTime())) return 'Unknown';
        return d.toLocaleDateString();
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).replace('-', ' ');
    }

    showSuccess(message) {
        if (window.showToast) {
            window.showToast(message, 'success');
        }
    }

    showError(message) {
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }

    // Advanced search methods
    applyAdvancedSearch() {
        const form = document.getElementById('advancedSearchForm');
        const formData = new FormData(form);

        const filters = {
            search: document.getElementById('searchInput').value,
            category: document.getElementById('categoryFilter').value,
            format: document.getElementById('formatFilter').value,
            sortBy: document.getElementById('sortBy').value,
            favorite: document.getElementById('favoritesOnly').checked,
            artist: formData.get('artist'),
            genre: formData.get('genre'),
            minDuration: formData.get('minDuration') ? parseFloat(formData.get('minDuration')) : undefined,
            maxDuration: formData.get('maxDuration') ? parseFloat(formData.get('maxDuration')) : undefined,
            minFileSize: formData.get('minFileSize') ? parseFloat(formData.get('minFileSize')) * 1024 * 1024 : undefined,
            maxFileSize: formData.get('maxFileSize') ? parseFloat(formData.get('maxFileSize')) * 1024 * 1024 : undefined,
            uploadedAfter: formData.get('uploadedAfter'),
            uploadedBefore: formData.get('uploadedBefore'),
            tags: formData.get('specificTags') ? formData.get('specificTags').split(',').map(tag => tag.trim()) : []
        };

        this.performAdvancedSearch(filters);
        bootstrap.Modal.getInstance(document.getElementById('advancedSearchModal')).hide();
    }

    async performAdvancedSearch(filters) {
        try {
            const response = await fetch('/audio-library/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(filters)
            });

            const data = await response.json();

            if (data.success) {
                this.audioFiles = data.audio;
                this.renderCurrentView();
                this.updateStats(data);

                // Show search results info
                const resultCount = data.audio.length;
                const totalCount = data.totalFiles;
                this.showSuccess(`Found ${resultCount} audio file(s) matching your search criteria`);
            }
        } catch (error) {
            console.error('Error performing advanced search:', error);
            this.showError('Advanced search failed');
        }
    }

    clearAdvancedSearch() {
        document.getElementById('advancedSearchForm').reset();
        document.getElementById('searchInput').value = '';
        document.getElementById('categoryFilter').value = 'all';
        document.getElementById('formatFilter').value = '';
        document.getElementById('sortBy').value = 'uploadedAt';
        document.getElementById('favoritesOnly').checked = false;

        this.loadAudioLibrary();
        bootstrap.Modal.getInstance(document.getElementById('advancedSearchModal')).hide();
    }

    // ─── View Toggle ──────────────────────────────────────────────────

    initViewToggle() {
        var saved = localStorage.getItem('monsterbox_audio_library_view');
        if (saved === 'list' || saved === 'grid') {
            this.currentView = saved;
        }
        this.applyView();
        this.setupListSortHandlers();
    }

    setView(viewName) {
        this.currentView = viewName;
        localStorage.setItem('monsterbox_audio_library_view', viewName);
        this.applyView();
        this.renderCurrentView();
    }

    applyView() {
        var gridEl = document.getElementById('audioGrid');
        var listEl = document.getElementById('audioListContainer');
        var btnGrid = document.getElementById('viewGrid');
        var btnList = document.getElementById('viewList');

        if (this.currentView === 'list') {
            gridEl.style.display = 'none';
            listEl.style.display = 'block';
            btnGrid.className = 'btn btn-outline-secondary btn-sm';
            btnList.className = 'btn btn-primary btn-sm';
        } else {
            gridEl.style.display = 'flex';
            listEl.style.display = 'none';
            btnGrid.className = 'btn btn-primary btn-sm';
            btnList.className = 'btn btn-outline-secondary btn-sm';
        }
    }

    renderCurrentView() {
        if (this.currentView === 'list') {
            this.renderAudioList();
        } else {
            this.renderAudioGrid();
        }
    }

    renderAudioList() {
        var tbody = document.getElementById('audioListBody');
        var emptyState = document.getElementById('emptyState');
        var listContainer = document.getElementById('audioListContainer');

        if (this.audioFiles.length === 0) {
            listContainer.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        if (this.currentView === 'list') {
            listContainer.style.display = 'block';
        }

        var self = this;
        var bulkMode = this.bulkSelectMode;
        var selectedIds = this.selectedAudioIds;

        tbody.innerHTML = this.audioFiles.map(function(audio) {
            var format = audio.format || 'audio';
            var fileSize = audio.fileSize || 0;
            var uploadedAt = audio.uploadedAt || audio.addedAt || '';
            var checkboxCell = '';
            if (bulkMode) {
                checkboxCell = '<input type="checkbox" class="form-check-input bulk-checkbox" data-audio-id="' + audio.id + '"' +
                    (selectedIds.has(audio.id) ? ' checked' : '') + '>';
            }

            return '<tr data-audio-id="' + audio.id + '">' +
                '<td>' + checkboxCell + '</td>' +
                '<td><button class="list-fav-btn mb-favorite-btn" data-audio-id="' + audio.id + '" title="Toggle favorite">' +
                    '<i class="bi bi-heart' + (audio.favorite ? '-fill' : '') + '"></i>' +
                '</button></td>' +
                '<td class="title-cell" title="' + self.escapeAttr(audio.title || 'Untitled') + '">' + self.escapeHtml(audio.title || 'Untitled') + '</td>' +
                '<td><span class="badge bg-secondary">' + self.capitalizeFirst(audio.category || 'other') + '</span></td>' +
                '<td><span class="badge bg-info">' + format.toUpperCase() + '</span></td>' +
                '<td>' + self.formatDuration(audio.duration) + '</td>' +
                '<td>' + self.formatFileSize(fileSize) + '</td>' +
                '<td>' + (audio.playCount || 0) + '</td>' +
                '<td>' + self.formatDate(uploadedAt) + '</td>' +
                '<td>' +
                    '<div class="btn-group btn-group-sm" role="group">' +
                        '<button class="btn btn-outline-primary btn-sm play-btn" data-audio-id="' + audio.id + '" title="Play">' +
                            '<i class="bi bi-play-fill"></i>' +
                        '</button>' +
                        '<button class="btn btn-outline-info btn-sm play-character-btn" data-audio-id="' + audio.id + '" title="Play on Character">' +
                            '<i class="bi bi-speaker"></i>' +
                        '</button>' +
                        '<button class="btn btn-outline-secondary btn-sm" onclick="window.open(\'/audio-library/api/audio/' + audio.id + '/download\')" title="Download">' +
                            '<i class="bi bi-download"></i>' +
                        '</button>' +
                        '<button class="btn btn-outline-danger btn-sm delete-btn" data-audio-id="' + audio.id + '" title="Delete">' +
                            '<i class="bi bi-trash"></i>' +
                        '</button>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        }).join('');

        this.setupAudioListEvents();
    }

    setupAudioListEvents() {
        var self = this;
        var tbody = document.getElementById('audioListBody');

        // Play buttons
        tbody.querySelectorAll('.play-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var audioId = btn.dataset.audioId;
                var audio = self.audioFiles.find(function(a) { return a.id === audioId; });
                if (audio) self.openAudioPlayer(audio);
            });
        });

        // Play on character buttons
        tbody.querySelectorAll('.play-character-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.playOnCharacter(btn.dataset.audioId);
            });
        });

        // Favorite buttons
        tbody.querySelectorAll('.mb-favorite-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.toggleFavorite(btn.dataset.audioId);
            });
        });

        // Delete buttons
        tbody.querySelectorAll('.delete-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var audioId = btn.dataset.audioId;
                var audio = self.audioFiles.find(function(a) { return a.id === audioId; });
                if (audio) self.deleteAudio(audioId, audio.title);
            });
        });

        // Bulk checkboxes
        if (this.bulkSelectMode) {
            tbody.querySelectorAll('.bulk-checkbox').forEach(function(checkbox) {
                checkbox.addEventListener('change', function(e) {
                    var audioId = e.target.dataset.audioId;
                    if (e.target.checked) {
                        self.selectedAudioIds.add(audioId);
                    } else {
                        self.selectedAudioIds.delete(audioId);
                    }
                    self.updateSelectedCount();
                });
            });
        }
    }

    setupListSortHandlers() {
        var self = this;
        var headers = document.querySelectorAll('#audioListTable th[data-sort]');
        headers.forEach(function(th) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', function() {
                var col = th.dataset.sort;
                if (self.listSortColumn === col) {
                    self.listSortDirection = self.listSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    self.listSortColumn = col;
                    self.listSortDirection = 'asc';
                }
                self.sortAudioList();
                self.updateSortIndicators();
            });
        });
    }

    sortAudioList() {
        var col = this.listSortColumn;
        var dir = this.listSortDirection === 'asc' ? 1 : -1;

        this.audioFiles.sort(function(a, b) {
            var valA, valB;
            switch (col) {
                case 'title':
                    valA = (a.title || '').toLowerCase();
                    valB = (b.title || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'category':
                    valA = (a.category || '').toLowerCase();
                    valB = (b.category || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'format':
                    valA = (a.format || '').toLowerCase();
                    valB = (b.format || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'duration':
                    return ((a.duration || 0) - (b.duration || 0)) * dir;
                case 'fileSize':
                    return ((a.fileSize || 0) - (b.fileSize || 0)) * dir;
                case 'playCount':
                    return ((a.playCount || 0) - (b.playCount || 0)) * dir;
                case 'uploadedAt':
                    valA = new Date(a.uploadedAt || 0).getTime();
                    valB = new Date(b.uploadedAt || 0).getTime();
                    return (valA - valB) * dir;
                case 'favorite':
                    valA = a.favorite ? 1 : 0;
                    valB = b.favorite ? 1 : 0;
                    return (valB - valA) * dir;
                default:
                    return 0;
            }
        });

        this.renderAudioList();
    }

    updateSortIndicators() {
        var col = this.listSortColumn;
        var dir = this.listSortDirection;
        var headers = document.querySelectorAll('#audioListTable th[data-sort]');

        headers.forEach(function(th) {
            var icon = th.querySelector('.sort-icon');
            th.classList.remove('sorted');
            if (icon) icon.innerHTML = '';

            if (th.dataset.sort === col) {
                th.classList.add('sorted');
                if (icon) {
                    icon.innerHTML = dir === 'asc'
                        ? '<i class="bi bi-caret-up-fill"></i>'
                        : '<i class="bi bi-caret-down-fill"></i>';
                }
            }
        });
    }

    escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Bulk operations
    toggleBulkSelect() {
        this.bulkSelectMode = !this.bulkSelectMode;
        const btn = document.getElementById('bulkSelectBtn');
        const bulkActions = document.getElementById('bulkActions');

        if (this.bulkSelectMode) {
            btn.innerHTML = '<i class="bi bi-x-square"></i> Cancel Select';
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-warning');
            bulkActions.style.display = 'block';
        } else {
            btn.innerHTML = '<i class="bi bi-check-square"></i> Bulk Select';
            btn.classList.remove('btn-warning');
            btn.classList.add('btn-outline-secondary');
            bulkActions.style.display = 'none';
            this.selectedAudioIds.clear();
        }

        this.renderCurrentView();
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        document.getElementById('selectedCount').textContent = this.selectedAudioIds.size;
    }

    async bulkFavorite(favorite) {
        if (this.selectedAudioIds.size === 0) {
            this.showError('No audio files selected');
            return;
        }

        const promises = Array.from(this.selectedAudioIds).map(audioId =>
            fetch(`/audio-library/api/audio/${audioId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ favorite })
            })
        );

        try {
            await Promise.all(promises);
            this.showSuccess(`${favorite ? 'Favorited' : 'Unfavorited'} ${this.selectedAudioIds.size} audio file(s)`);
            this.selectedAudioIds.clear();
            this.toggleBulkSelect();
            await this.loadAudioLibrary();
        } catch (error) {
            this.showError('Failed to update favorites');
        }
    }

    async bulkChangeCategory() {
        if (this.selectedAudioIds.size === 0) {
            this.showError('No audio files selected');
            return;
        }

        const category = prompt('Enter new category:', 'other');
        if (!category) return;

        const promises = Array.from(this.selectedAudioIds).map(audioId =>
            fetch(`/audio-library/api/audio/${audioId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category })
            })
        );

        try {
            await Promise.all(promises);
            this.showSuccess(`Changed category for ${this.selectedAudioIds.size} audio file(s)`);
            this.selectedAudioIds.clear();
            this.toggleBulkSelect();
            await this.loadAudioLibrary();
        } catch (error) {
            this.showError('Failed to change category');
        }
    }

    async bulkDelete() {
        if (this.selectedAudioIds.size === 0) {
            this.showError('No audio files selected');
            return;
        }

        if (!confirm(`Are you sure you want to delete ${this.selectedAudioIds.size} audio file(s)? This action cannot be undone.`)) {
            return;
        }

        const promises = Array.from(this.selectedAudioIds).map(audioId =>
            fetch(`/audio-library/api/audio/${audioId}`, { method: 'DELETE' })
        );

        try {
            await Promise.all(promises);
            this.showSuccess(`Deleted ${this.selectedAudioIds.size} audio file(s)`);
            this.selectedAudioIds.clear();
            this.toggleBulkSelect();
            await this.loadAudioLibrary();
        } catch (error) {
            this.showError('Failed to delete audio files');
        }
    }
}

// Initialize the audio library when the page loads
let audioLibrary;
document.addEventListener('DOMContentLoaded', () => {
    audioLibrary = new AudioLibrary();
});
