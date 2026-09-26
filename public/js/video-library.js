/**
 * Video Control — page script.
 * The Goblin board (what each display is showing, hand it a video one by one),
 * the Send panel (one video to many Goblins: play once, loop, stop, resume), and
 * the library of uploads below with upload, search, filtering and deploy.
 */

class VideoLibrary {
    constructor() {
        this.videoFiles = [];
        this.goblins = [];
        this.categories = [];
        this.selectedFiles = [];
        this.searchTimeout = null;
        this.bulkSelectMode = false;
        this.selectedVideoIds = new Set();
        this.deploymentInProgress = false;
        // Video Control board state: GET /video-library/api/goblins/board
        this.board = [];
        this.sendSelection = null;      // { kind: 'goblin'|'library', filename, id?, title? }
        this.sendGoblinIds = new Set(); // ticked Goblins in the Send panel
        this.boardTimer = null;

        // View toggle state
        this.currentView = 'grid';
        this.listSortColumn = null;
        this.listSortDirection = 'asc';

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        await this.loadVideoLibrary();
        await this.loadGoblins();
        this.populateCategoryFilters();
        this.updateStats();
        this.initViewToggle();
        await this.loadBoard(true);
        this.startBoardPolling();
    }

    setupEventListeners() {
        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.filterVideoFiles();
            }, 300);
        });

        // Filter controls
        document.getElementById('categoryFilter').addEventListener('change', () => this.filterVideoFiles());
        document.getElementById('sortBy').addEventListener('change', () => this.filterVideoFiles());

        // File input
        document.getElementById('videoFileInput').addEventListener('change', (e) => {
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

        document.getElementById('goblinDeployModal').addEventListener('show.bs.modal', () => {
            this.populateDeploymentModal();
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
                file.type.startsWith('video/')
            );

            if (files.length > 0) {
                this.handleFileSelection(files);
            }
        });

        // Click to browse
        dropZone.addEventListener('click', (e) => {
            if (e.target === dropZone || e.target.closest('.mb-drop-zone')) {
                document.getElementById('videoFileInput').click();
            }
        });
    }

    async loadVideoLibrary() {
        try {
            const response = await fetch('/video-library/api/library');
            const data = await response.json();
            
            if (data.success) {
                this.videoFiles = data.videos;
                this.categories = data.categories || [];
                this.renderCurrentView();
                this.updateStats();
            } else {
                console.error('Failed to load video library:', data.error);
                this.showError('Failed to load video library');
            }
        } catch (error) {
            console.error('Error loading video library:', error);
            this.showError('Network error loading video library');
        }
    }

    async loadGoblins() {
        try {
            const response = await fetch('/goblin-management/api/goblins');
            const data = await response.json();
            
            if (data.success) {
                this.goblins = data.goblins;
                this.updateStats();
            }
        } catch (error) {
            console.error('Error loading Goblins:', error);
        }
    }

    populateCategoryFilters() {
        const categoryFilter = document.getElementById('categoryFilter');
        const uploadCategory = document.getElementById('uploadCategory');
        
        // Clear existing options (except "All Categories")
        categoryFilter.innerHTML = '<option value="all">All Categories</option>';
        
        this.categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
            categoryFilter.appendChild(option);
        });
    }

    renderVideoGrid() {
        const grid = document.getElementById('videoGrid');
        const emptyState = document.getElementById('emptyState');

        if (!this.videoFiles.length) {
            grid.innerHTML = '';
            emptyState.classList.remove('vid-hidden');
            return;
        }

        emptyState.classList.add('vid-hidden');

        grid.innerHTML = this.videoFiles.map(video => `
            <div class="col-12 mb-2">
                <div class="mb-media-card card position-relative" data-video-id="${video.id}" onclick="videoLibrary.sendFromLibrary('${video.id}')">
                    ${this.bulkSelectMode ? `
                        <div class="position-absolute top-0 start-0 p-2 vid-bulk-overlay">
                            <input type="checkbox" class="video-select-checkbox" title="Select this video for bulk actions"
                                   data-video-id="${video.id}" onclick="event.stopPropagation(); videoLibrary.toggleVideoSelection('${video.id}')"
                                   ${this.selectedVideoIds.has(video.id) ? 'checked' : ''}>
                        </div>
                    ` : ''}
                    
                    <div class="position-relative">
                        ${video.thumbnailPath ? `
                            <img src="/video-library/api/video/${video.id}/thumbnail" class="mb-media-thumbnail" alt="${video.title}">
                        ` : `
                            <div class="mb-media-thumbnail d-flex align-items-center justify-content-center">
                                <i class="bi bi-camera-video fs-1 text-white"></i>
                            </div>
                        `}
                        
                        <div class="mb-media-overlay"></div>
                        
                        <div class="mb-media-controls">
                            <button class="mb-btn mb-btn-primary btn-lg rounded-circle" title="Pick this video in Send to Goblins">
                                <i class="bi bi-play-fill"></i>
                            </button>
                        </div>
                        
                        <div class="mb-media-duration mb-mono">${this.formatDuration(video.duration || 0)}</div>

                        <button class="mb-favorite-btn ${video.favorite ? 'text-warning' : ''}" title="Toggle favorite"
                                onclick="event.stopPropagation(); videoLibrary.toggleFavorite('${video.id}')">
                            <i class="bi bi-heart${video.favorite ? '-fill' : ''}"></i>
                        </button>
                    </div>
                    
                    <div class="card-body p-2">
                        <h6 class="card-title mb-1 text-truncate" title="${video.title}">${video.title}</h6>
                        <small class="text-muted d-block mb-1 mb-mono">
                            ${video.format?.toUpperCase() || 'VIDEO'} • ${this.formatFileSize(video.fileSize || 0)}
                        </small>
                        ${video.tags && video.tags.length ? `
                            <div class="mb-1">
                                ${video.tags.slice(0, 2).map(tag => `
                                    <span class="mb-tag-badge badge bg-secondary">${tag}</span>
                                `).join('')}
                                ${video.tags.length > 2 ? `<span class="badge bg-secondary tag-badge">+${video.tags.length - 2}</span>` : ''}
                            </div>
                        ` : ''}
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${this.timeAgo(video.uploadedAt)}</small>
                            <span class="btn-group btn-group-sm">
                                <button class="mb-btn mb-btn-sm mb-btn-primary" title="Play this video on a Goblin (copies it there first if needed)" onclick="event.stopPropagation(); videoLibrary.playOnGoblin('${video.id}')">
                                    <i class="bi bi-tv"></i>
                                </button>
                                <button class="mb-btn mb-btn-sm mb-btn-secondary" title="Copy this video onto a Goblin" onclick="event.stopPropagation(); videoLibrary.quickDeploy('${video.id}')">
                                    <i class="bi bi-broadcast"></i>
                                </button>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async toggleFavorite(videoId) {
        try {
            const response = await fetch(`/video-library/api/video/${videoId}/favorite`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update local data
                const video = this.videoFiles.find(v => v.id === videoId);
                if (video) {
                    video.favorite = data.favorite;
                    this.renderCurrentView();
                    this.updateStats();
                }
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        }
    }

    async incrementPlayCount(videoId) {
        try {
            await fetch(`/video-library/api/video/${videoId}/play`, { method: 'POST' });
        } catch (error) {
            console.error('Error incrementing play count:', error);
        }
    }

    // File handling methods
    handleFileSelection(files) {
        this.selectedFiles = Array.from(files).filter(file => 
            file.type.startsWith('video/') && file.size <= 500 * 1024 * 1024 // 500MB limit
        );

        if (this.selectedFiles.length === 0) {
            this.showError('No valid video files selected. Please select video files under 500MB.');
            return;
        }

        this.displaySelectedFiles();
        document.getElementById('uploadBtn').disabled = false;
    }

    displaySelectedFiles() {
        const container = document.getElementById('selectedFilesList');
        const list = document.getElementById('filesList');

        container.classList.remove('vid-hidden');

        list.innerHTML = this.selectedFiles.map(file => `
            <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                <div>
                    <strong>${file.name}</strong>
                    <small class="text-muted d-block mb-mono">${this.formatFileSize(file.size)} • ${file.type}</small>
                </div>
                <button class="mb-btn mb-btn-sm mb-btn-danger" title="Remove this file from the upload" onclick="videoLibrary.removeSelectedFile('${file.name}')">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `).join('');
    }

    removeSelectedFile(filename) {
        this.selectedFiles = this.selectedFiles.filter(f => f.name !== filename);
        
        if (this.selectedFiles.length === 0) {
            document.getElementById('selectedFilesList').classList.add('vid-hidden');
            document.getElementById('uploadBtn').disabled = true;
        } else {
            this.displaySelectedFiles();
        }
    }

    async uploadFiles() {
        if (!this.selectedFiles.length) return;

        const uploadBtn = document.getElementById('uploadBtn');
        const progressContainer = document.querySelector('.upload-progress');
        const progressBar = progressContainer.querySelector('.progress-bar');
        const statusElement = document.getElementById('uploadStatus');

        // Disable upload button and show progress
        uploadBtn.disabled = true;
        progressContainer.classList.remove('vid-hidden');

        const formData = new FormData();
        
        // Add files (field name must match multer config: 'videoFiles')
        this.selectedFiles.forEach(file => {
            formData.append('videoFiles', file);
        });

        // Add form data
        const form = document.getElementById('uploadForm');
        const formDataObj = new FormData(form);
        for (let [key, value] of formDataObj.entries()) {
            formData.append(key, value);
        }

        try {
            const xhr = new XMLHttpRequest();

            // Upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressBar.style.width = percentComplete + '%';
                    statusElement.textContent = `Uploading... ${Math.round(percentComplete)}%`;
                }
            });

            // Upload complete
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const result = JSON.parse(xhr.responseText);
                    if (result.success) {
                        statusElement.textContent = `Successfully uploaded ${result.videos.length} video(s)`;
                        setTimeout(() => {
                            this.resetUploadForm();
                            bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide();
                            this.loadVideoLibrary(); // Refresh library
                        }, 1500);
                    } else {
                        throw new Error(result.error);
                    }
                } else {
                    throw new Error(`Upload failed with status ${xhr.status}`);
                }
            });

            // Upload error
            xhr.addEventListener('error', () => {
                throw new Error('Upload failed due to network error');
            });

            xhr.open('POST', '/video-library/api/upload');
            xhr.send(formData);

        } catch (error) {
            console.error('Upload error:', error);
            statusElement.textContent = `Upload failed: ${error.message}`;
            uploadBtn.disabled = false;
        }
    }

    resetUploadForm() {
        this.selectedFiles = [];
        document.getElementById('uploadForm').reset();
        document.getElementById('selectedFilesList').classList.add('vid-hidden');
        document.querySelector('.upload-progress').classList.add('vid-hidden');
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('videoFileInput').value = '';
    }

    filterVideoFiles() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;
        const sortBy = document.getElementById('sortBy').value;

        let filtered = this.videoFiles;

        // Apply filters
        if (searchTerm) {
            filtered = filtered.filter(video => 
                video.title.toLowerCase().includes(searchTerm) ||
                (video.tags && video.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
                (video.description && video.description.toLowerCase().includes(searchTerm))
            );
        }

        if (categoryFilter && categoryFilter !== 'all') {
            filtered = filtered.filter(video => video.category === categoryFilter);
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'duration':
                    return (b.duration || 0) - (a.duration || 0);
                case 'fileSize':
                    return (b.fileSize || 0) - (a.fileSize || 0);
                case 'uploadedAt':
                default:
                    return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
            }
        });

        // Temporarily store filtered results and re-render
        const originalFiles = this.videoFiles;
        this.videoFiles = filtered;
        this.renderCurrentView();
        this.videoFiles = originalFiles;
    }

    // Goblin deployment methods

    /**
     * Let the operator choose a Goblin. One online Goblin → chosen without asking.
     * Resolves to the goblin object or null on dismiss.
     */
    selectGoblin(goblins, title) {
        if (goblins.length === 1) return Promise.resolve(goblins[0]);
        return new Promise((resolve) => {
            const modalEl = document.getElementById('goblinPickModal');
            const list = document.getElementById('goblinPickList');
            document.getElementById('goblinPickTitle').textContent = title || 'Which Goblin?';
            list.innerHTML = goblins.map(g => `
                <button type="button" class="mb-btn mb-btn-secondary w-100 mb-2 text-start" data-goblin-id="${this.escapeAttr(g.id)}" title="Use ${this.escapeAttr(g.name)}">
                    <strong class="mb-serif">${this.escapeHtml(g.name)}</strong>
                    <br><small class="mb-text-muted mb-mono">${this.escapeHtml(g.endpoint || '')}</small>
                </button>`).join('');
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            let picked = null;
            const onHidden = () => { modalEl.removeEventListener('hidden.bs.modal', onHidden); resolve(picked); };
            modalEl.addEventListener('hidden.bs.modal', onHidden);
            list.querySelectorAll('button[data-goblin-id]').forEach(btn => {
                btn.addEventListener('click', () => {
                    picked = goblins.find(g => g.id === btn.dataset.goblinId) || null;
                    modal.hide();
                });
            });
            modal.show();
        });
    }

    availableGoblins() {
        return this.goblins.filter(g => g.status === 'online' && !g.locked);
    }

    async quickDeploy(videoId) {
        const goblins = this.availableGoblins();
        if (!goblins.length) {
            this.showError('No Goblin is online to deploy to');
            return;
        }
        const goblin = await this.selectGoblin(goblins, 'Copy onto which Goblin?');
        if (goblin) await this.deployToGoblin(videoId, goblin.id);
    }

    /**
     * Copy a library video onto a Goblin's disk. Resolves to the server result.
     */
    async deployToGoblin(videoId, goblinId, { quiet = false } = {}) {
        const video = this.videoFiles.find(v => v.id === videoId);
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!video || !goblin) {
            this.showError('Video or Goblin not found');
            return { success: false, error: 'Video or Goblin not found' };
        }
        try {
            if (!quiet) this.showSuccess(`Copying "${video.title}" to ${goblin.name} (${this.formatFileSize(video.fileSize || 0)})…`);
            const response = await fetch('/video-library/api/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId, goblinId })
            });
            const result = await response.json();
            if (result.success) {
                if (!quiet) {
                    this.showSuccess(result.transferred === 0
                        ? `${goblin.name} already had "${result.filename}"`
                        : `Copied "${result.filename}" to ${goblin.name} in ${Math.round((result.elapsedMs || 0) / 1000)} s`);
                }
                await this.loadVideoLibrary();
                this.loadBoard(true);
            } else if (!quiet) {
                this.showError(`Copy to ${goblin.name} failed: ${result.error}`);
            }
            return result;
        } catch (error) {
            console.error('Deployment error:', error);
            if (!quiet) this.showError('Copy failed: network error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Play a library video on a Goblin now. The server copies it there first if the
     * Goblin does not have it, and only reports success once the device says mpv is
     * showing that file.
     */
    async playOnGoblin(videoId, mode = 'once') {
        const goblins = this.availableGoblins();
        if (!goblins.length) {
            this.showError('No Goblin is online to play on');
            return;
        }
        const goblin = await this.selectGoblin(goblins, mode === 'loop' ? 'Loop on which Goblin?' : 'Play on which Goblin?');
        if (!goblin) return;
        const video = this.videoFiles.find(v => v.id === videoId);
        if (!video) return;
        try {
            this.showSuccess(`Sending "${video.title}" to ${goblin.name}… (copies it first if the Goblin does not have it)`);
            const response = await fetch(`/video-library/api/video/${videoId}/play-on-goblin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goblinId: goblin.id, mode })
            });
            const result = await response.json();
            if (result.success) {
                this.showSuccess(`${goblin.name} is ${mode === 'loop' ? 'looping' : 'playing'} "${result.filename}"${result.deployed ? ' (copied first)' : ''}`);
                await this.loadVideoLibrary();
                this.loadBoard(true);
            } else {
                this.showError(`${goblin.name}: ${result.error}`);
            }
        } catch (error) {
            console.error('Play on Goblin error:', error);
            this.showError('Play on Goblin failed: network error');
        }
    }

    populateDeploymentModal() {
        // Populate video list
        const videoList = document.getElementById('deployVideoList');
        videoList.innerHTML = this.videoFiles.map(video => `
            <label class="mb-check vid-pick-row" for="deployVideo${video.id}">
                <input type="checkbox" value="${video.id}" id="deployVideo${video.id}" title="Include this video in the deployment">
                <span>
                    <strong>${this.escapeHtml(video.title)}</strong>
                    <br><small class="mb-text-muted mb-mono">${video.format?.toUpperCase()} • ${this.formatFileSize(video.fileSize)}${video.deployments && Object.keys(video.deployments).length ? ' • on ' + Object.values(video.deployments).map(d => this.escapeHtml(d.goblinName || '')).filter(Boolean).join(', ') : ''}</small>
                </span>
            </label>
        `).join('');

        // Populate Goblin list
        const goblinList = document.getElementById('deployGoblinList');
        const availableGoblins = this.goblins.filter(g => g.status === 'online');

        goblinList.innerHTML = availableGoblins.length ? availableGoblins.map(goblin => `
            <label class="mb-check vid-pick-row" for="deployGoblin${goblin.id}">
                <input type="checkbox" value="${goblin.id}" id="deployGoblin${goblin.id}" title="Deploy to this Goblin"
                       ${goblin.locked ? 'disabled' : ''}>
                <span>
                    <strong class="mb-serif">${this.escapeHtml(goblin.name)}</strong>
                    <span class="mb-status-badge ${goblin.status}">${goblin.status}</span>
                    ${goblin.locked ? '<br><small class="mb-text-warning">Locked</small>' : ''}
                    <br><small class="mb-text-muted mb-mono">${this.escapeHtml(goblin.endpoint || '')}</small>
                </span>
            </label>
        `).join('') : '<small class="mb-text-muted">No Goblin is online.</small>';
    }

    async executeDeployment() {
        const selectedVideos = Array.from(document.querySelectorAll('#deployVideoList input:checked')).map(cb => cb.value);
        const selectedGoblins = Array.from(document.querySelectorAll('#deployGoblinList input:checked')).map(cb => cb.value);
        const thenPlay = !!document.getElementById('deployThenPlay')?.checked;

        if (!selectedVideos.length || !selectedGoblins.length) {
            this.showError('Please select at least one video and one Goblin');
            return;
        }

        const deployBtn = document.getElementById('deployBtn');
        const progressContainer = document.getElementById('deploymentProgress');
        const statusContainer = document.getElementById('deploymentStatus');

        deployBtn.disabled = true;
        progressContainer.classList.remove('vid-hidden');
        statusContainer.innerHTML = '';

        const line = (text, cls) => {
            const el = document.createElement('div');
            el.className = 'mb-2';
            el.innerHTML = text + (cls ? ` <span class="${cls}">` : '') + (cls ? '</span>' : '');
            statusContainer.appendChild(el);
            return el;
        };

        try {
            for (const videoId of selectedVideos) {
                for (const goblinId of selectedGoblins) {
                    const video = this.videoFiles.find(v => v.id === videoId);
                    const goblin = this.goblins.find(g => g.id === goblinId);
                    const el = line(`Copying "${this.escapeHtml(video.title)}" to ${this.escapeHtml(goblin.name)}…`);
                    const result = await this.deployToGoblin(videoId, goblinId, { quiet: true });
                    if (!result.success) {
                        el.innerHTML += ` <span class="text-danger">Failed: ${this.escapeHtml(result.error || 'unknown error')}</span>`;
                        continue;
                    }
                    el.innerHTML += ` <span class="text-success">${result.transferred === 0 ? 'already there' : 'copied'} (${this.formatFileSize(result.size || 0)}, ${Math.round((result.elapsedMs || 0) / 1000)} s)</span>`;
                    if (thenPlay) {
                        const response = await fetch(`/video-library/api/video/${videoId}/play-on-goblin`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ goblinId, mode: 'once', deploy: false })
                        });
                        const play = await response.json();
                        el.innerHTML += play.success
                            ? ' <span class="text-success">· playing</span>'
                            : ` <span class="text-danger">· play failed: ${this.escapeHtml(play.error || '')}</span>`;
                    }
                }
            }
        } finally {
            deployBtn.disabled = false;
            this.loadBoard(true);
        }
    }

    // ─── Videos on the Goblins themselves ──────────────────────────────


    // ─── Video Control: the Goblin board and the Send panel ──────────

    thumbUrl(goblinId, filename) {
        return `/video-library/api/goblins/${encodeURIComponent(goblinId)}/thumbnail?filename=${encodeURIComponent(filename)}`;
    }

    /**
     * One call for the whole board. `full` re-reads every Goblin's disk; the poll
     * only re-reads playback and keeps the file lists it already has.
     */
    async loadBoard(full = false) {
        const haveLists = this.board.some(g => Array.isArray(g.videos));
        const playbackOnly = !full && haveLists;
        try {
            const response = await fetch(`/video-library/api/goblins/board${playbackOnly ? '?playbackOnly=1' : ''}`);
            const data = await response.json();
            if (!data.success) return;
            const previous = new Map(this.board.map(g => [g.id, g]));
            this.board = (data.goblins || []).map(g => {
                const old = previous.get(g.id);
                return (playbackOnly && old) ? { ...g, videos: old.videos } : g;
            });
            // Newly online Goblins have no list yet — fetch once more in full.
            if (playbackOnly && this.board.some(g => g.online && !Array.isArray(g.videos))) return this.loadBoard(true);
            for (const g of this.board) if (!g.online) this.sendGoblinIds.delete(g.id);
            if (!this.sendGoblinIds.size) this.board.filter(g => g.online).forEach(g => this.sendGoblinIds.add(g.id));
            this.renderBoard();
            this.renderSendChooser();
            this.renderSendGoblins();
        } catch (error) {
            console.error('Error loading the Goblin board:', error);
        }
    }

    startBoardPolling() {
        if (this.boardTimer) clearInterval(this.boardTimer);
        this.boardTimer = setInterval(() => { if (!document.hidden) this.loadBoard(false); }, 6000);
    }

    describePlayback(pb) {
        if (!pb) return { text: 'Status unavailable', file: null, looping: false };
        if (pb.mpvRunning && pb.currentVideo) {
            const looping = !!(pb.queue && pb.queue.loopMode === 'queue');
            return { text: `Now showing: ${pb.currentVideo}${looping ? ' (looping)' : ''}`, file: pb.currentVideo, looping };
        }
        return { text: 'Idle — nothing on screen', file: null, looping: false };
    }

    renderBoard() {
        const grid = document.getElementById('goblinBoard');
        if (!grid) return;
        if (!this.board.length) {
            grid.innerHTML = '<div class="col-12"><small class="mb-text-muted">No Goblin is registered. Add one on the Goblin Management page.</small></div>';
            return;
        }
        grid.innerHTML = this.board.map(g => {
            const pb = this.describePlayback(g.playback);
            const videos = (g.videos || []).slice().sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
            const status = g.online ? 'online' : (g.expectedOffline ? 'shelved' : 'offline');
            const thumb = g.online && pb.file
                ? `<img alt="" src="${this.thumbUrl(g.id, pb.file)}" onerror="this.parentNode.classList.add('vid-goblin-thumb-missing'); this.remove();">`
                : '';
            return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="mb-card vid-board-card${g.online ? '' : ' vid-board-offline'}" data-goblin-id="${this.escapeAttr(g.id)}">
                    <div class="vid-board-head">
                        <strong class="mb-serif">${this.escapeHtml(g.name)}</strong>
                        <span class="mb-status-badge ${g.online ? 'online' : 'offline'}">${status}</span>
                    </div>
                    <div class="vid-goblin-thumb vid-board-thumb${thumb ? '' : ' vid-goblin-thumb-missing'}">${thumb}<i class="bi ${g.online ? 'bi-moon-stars' : 'bi-plug'}"></i></div>
                    <div class="vid-board-now${pb.file ? ' vid-board-live' : ''}">${this.escapeHtml(g.online ? pb.text : (g.error || 'Not reachable'))}</div>
                    ${g.online ? `
                    <div class="vid-board-pick">
                        <select class="mb-select mb-select-sm vid-board-select" title="A video on ${this.escapeAttr(g.name)}'s disk" data-goblin-id="${this.escapeAttr(g.id)}">
                            <option value="">Pick a video on this Goblin…</option>
                            ${videos.map(v => `<option value="${this.escapeAttr(v.filename)}"${pb.file === v.filename ? ' selected' : ''}>${this.escapeHtml(v.filename)}</option>`).join('')}
                        </select>
                        <span class="mb-btn-group" role="group">
                            <button class="mb-btn mb-btn-sm mb-btn-primary" title="Show the picked video once, then back to this Goblin's loop" onclick="videoLibrary.boardControl('${this.escapeAttr(g.id)}', 'play')"><i class="bi bi-play-fill"></i></button>
                            <button class="mb-btn mb-btn-sm mb-btn-primary" title="Make the picked video this Goblin's show until stopped" onclick="videoLibrary.boardControl('${this.escapeAttr(g.id)}', 'loop')"><i class="bi bi-arrow-repeat"></i></button>
                            <button class="mb-btn mb-btn-sm mb-btn-danger" title="Stop this Goblin" onclick="videoLibrary.boardControl('${this.escapeAttr(g.id)}', 'stop')"><i class="bi bi-stop-fill"></i></button>
                            <button class="mb-btn mb-btn-sm mb-btn-secondary" title="Put this Goblin back on its own loop" onclick="videoLibrary.boardControl('${this.escapeAttr(g.id)}', 'resume')"><i class="bi bi-skip-forward-fill"></i></button>
                        </span>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    /** The per-card controls: one Goblin, the file its select shows. */
    async boardControl(goblinId, action) {
        const g = this.board.find(x => x.id === goblinId);
        if (!g) return;
        let filename = null;
        if (action === 'play' || action === 'loop') {
            const sel = document.querySelector(`.vid-board-select[data-goblin-id="${CSS.escape(goblinId)}"]`);
            filename = sel && sel.value;
            if (!filename) { this.showError(`Pick a video on ${g.name} first`); return; }
        }
        await this.runControl(action, filename, [goblinId]);
    }

    /** Every file on any online Goblin, plus library uploads no Goblin holds yet. */
    sendCandidates() {
        const byName = new Map();
        for (const g of this.board) {
            if (!g.online) continue;
            for (const v of g.videos || []) {
                const entry = byName.get(v.filename) || { kind: 'goblin', filename: v.filename, size: v.size, on: [] };
                entry.on.push(g.id);
                byName.set(v.filename, entry);
            }
        }
        for (const v of this.videoFiles) {
            const name = v.originalName || v.title;
            if (!name || byName.has(name)) continue;
            byName.set(name, { kind: 'library', id: v.id, filename: name, title: v.title, size: v.fileSize, on: [], thumb: v.thumbnailPath ? `/video-library/api/video/${v.id}/thumbnail` : null });
        }
        return Array.from(byName.values()).sort((a, b) => a.filename.localeCompare(b.filename));
    }

    renderSendChooser() {
        const list = document.getElementById('sendVideoList');
        if (!list) return;
        const filter = (document.getElementById('sendFilter')?.value || '').trim().toLowerCase();
        const online = this.board.filter(g => g.online);
        const items = this.sendCandidates().filter(c => !filter || c.filename.toLowerCase().includes(filter));
        if (!items.length) {
            list.innerHTML = `<small class="mb-text-muted">${online.length ? 'No video matches.' : 'No Goblin is online, so there is nothing to send to.'}</small>`;
            return;
        }
        const anyGoblin = online[0] && online[0].id;
        list.innerHTML = items.map(c => {
            const selected = this.sendSelection && this.sendSelection.filename === c.filename;
            const thumbSrc = c.kind === 'goblin' ? this.thumbUrl(c.on[0] || anyGoblin, c.filename) : c.thumb;
            const where = c.kind === 'goblin'
                ? (c.on.length === online.length ? 'on every Goblin' : `on ${c.on.map(id => (this.board.find(g => g.id === id) || {}).name || id).join(', ')}`)
                : 'library upload — copied onto a Goblin when sent';
            return `
            <label class="vid-pick-row vid-send-row${selected ? ' vid-send-selected' : ''}" title="${this.escapeAttr(c.filename)}">
                <input type="radio" name="sendVideo" value="${this.escapeAttr(c.filename)}" ${selected ? 'checked' : ''} onchange="videoLibrary.pickSendVideo(this.value)">
                <span class="vid-goblin-thumb${thumbSrc ? '' : ' vid-goblin-thumb-missing'}">${thumbSrc ? `<img loading="lazy" alt="" src="${thumbSrc}" onerror="this.parentNode.classList.add('vid-goblin-thumb-missing'); this.remove();">` : ''}<i class="bi bi-film"></i></span>
                <span class="vid-goblin-meta">
                    <strong>${this.escapeHtml(c.filename)}</strong>
                    <br><small class="mb-text-muted">${this.escapeHtml(where)}${c.size ? ` · <span class="mb-mono">${this.formatFileSize(c.size)}</span>` : ''}</small>
                </span>
            </label>`;
        }).join('');
    }

    pickSendVideo(filename) {
        this.sendSelection = this.sendCandidates().find(c => c.filename === filename) || null;
        this.renderSendChooser();
    }

    /** A library card was clicked: make it the picked video and show the Send panel. */
    sendFromLibrary(videoId) {
        const v = this.videoFiles.find(x => x.id === videoId);
        if (!v) return;
        this.sendSelection = this.sendCandidates().find(c => c.filename === (v.originalName || v.title)) || { kind: 'library', id: v.id, filename: v.originalName || v.title, title: v.title, on: [] };
        const filter = document.getElementById('sendFilter'); if (filter) filter.value = '';
        this.renderSendChooser();
        document.getElementById('sendPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        this.showSuccess(`Picked "${this.sendSelection.filename}" — tick the Goblins and press Play once or Loop`);
    }

    renderSendGoblins() {
        const list = document.getElementById('sendGoblinList');
        if (!list) return;
        const online = this.board.filter(g => g.online);
        if (!online.length) { list.innerHTML = '<small class="mb-text-muted">No Goblin online.</small>'; return; }
        list.innerHTML = online.map(g => {
            const pb = this.describePlayback(g.playback);
            return `
            <label class="vid-pick-row" title="${this.escapeAttr(g.name)}">
                <input type="checkbox" value="${this.escapeAttr(g.id)}" ${this.sendGoblinIds.has(g.id) ? 'checked' : ''} onchange="videoLibrary.toggleSendGoblin(this.value, this.checked)">
                <span><strong>${this.escapeHtml(g.name)}</strong><br><small class="mb-text-muted">${this.escapeHtml(pb.text)}</small></span>
            </label>`;
        }).join('');
    }

    toggleSendGoblin(goblinId, on) {
        if (on) this.sendGoblinIds.add(goblinId); else this.sendGoblinIds.delete(goblinId);
    }

    selectAllSendGoblins(on) {
        this.sendGoblinIds.clear();
        if (on) this.board.filter(g => g.online).forEach(g => this.sendGoblinIds.add(g.id));
        this.renderSendGoblins();
    }

    /** The Send panel's buttons: the picked video to every ticked Goblin. */
    async sendControl(action) {
        const ids = Array.from(this.sendGoblinIds);
        if (!ids.length) { this.showError('Tick at least one Goblin'); return; }
        const needsVideo = action === 'play' || action === 'loop';
        if (needsVideo && !this.sendSelection) { this.showError('Pick a video first'); return; }
        if (needsVideo && this.sendSelection.kind === 'library') {
            // A library upload: the server copies it onto each Goblin before playing.
            await this.runLibraryOnMany(this.sendSelection, ids, action === 'loop' ? 'loop' : 'once');
            return;
        }
        await this.runControl(action, needsVideo ? this.sendSelection.filename : null, ids);
    }

    async runControl(action, filename, goblinIds) {
        const verbs = { play: 'Playing', loop: 'Looping', stop: 'Stopping', resume: 'Resuming' };
        const names = goblinIds.map(id => (this.board.find(g => g.id === id) || {}).name || id).join(', ');
        this.showSuccess(`${verbs[action]}${filename ? ` "${filename}"` : ''} on ${names}…`);
        this.setSendBusy(true);
        try {
            const response = await fetch('/video-library/api/goblins/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, filename, goblinIds })
            });
            const data = await response.json();
            this.renderSendResults(data.results || [{ goblinId: '', success: false, error: data.error }]);
            if (data.success && data.failed === 0) this.showSuccess(`${verbs[action].replace('ing', 'ed')} on ${data.successful} Goblin${data.successful === 1 ? '' : 's'}`);
            else this.showError(`${data.failed || goblinIds.length} of ${goblinIds.length} did not answer as expected — see the list`);
        } catch (error) {
            console.error('Goblin control error:', error);
            this.showError('Goblin control failed: network error');
        } finally {
            this.setSendBusy(false);
            this.loadBoard(false);
        }
    }

    async runLibraryOnMany(selection, goblinIds, mode) {
        this.showSuccess(`Sending "${selection.filename}" to ${goblinIds.length} Goblin${goblinIds.length === 1 ? '' : 's'} (copied first where missing)…`);
        this.setSendBusy(true);
        try {
            const results = await Promise.all(goblinIds.map(async (goblinId) => {
                try {
                    const r = await fetch(`/video-library/api/video/${selection.id}/play-on-goblin`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ goblinId, mode })
                    });
                    const d = await r.json();
                    return { goblinId, goblinName: d.goblinName, success: !!d.success, error: d.error, deployed: !!d.deployed };
                } catch (e) { return { goblinId, success: false, error: e.message }; }
            }));
            this.renderSendResults(results);
            const ok = results.filter(r => r.success).length;
            if (ok === results.length) this.showSuccess(`"${selection.filename}" is ${mode === 'loop' ? 'looping' : 'playing'} on ${ok} Goblin${ok === 1 ? '' : 's'}`);
            else this.showError(`${results.length - ok} of ${results.length} did not play — see the list`);
            await this.loadVideoLibrary();
        } finally {
            this.setSendBusy(false);
            this.loadBoard(true);
        }
    }

    setSendBusy(busy) {
        ['sendPlayBtn', 'sendLoopBtn', 'sendStopBtn', 'sendResumeBtn'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = busy; });
    }

    renderSendResults(results) {
        const box = document.getElementById('sendResults');
        if (!box) return;
        box.innerHTML = results.map(r => {
            const name = r.goblinName || (this.board.find(g => g.id === r.goblinId) || {}).name || r.goblinId;
            return `<div class="vid-send-result"><span class="mb-status-badge ${r.success ? 'online' : 'offline'}">${r.success ? 'ok' : 'failed'}</span> <strong>${this.escapeHtml(name)}</strong>${r.error ? ` <small class="mb-text-muted">— ${this.escapeHtml(r.error)}</small>` : ''}${r.deployed ? ' <small class="mb-text-muted">(copied first)</small>' : ''}</div>`;
        }).join('');
    }

    // ─── View Toggle ──────────────────────────────────────────────────

    initViewToggle() {
        var saved = localStorage.getItem('monsterbox_video_library_view');
        if (saved === 'list' || saved === 'grid') {
            this.currentView = saved;
        }
        this.applyView();
        this.setupListSortHandlers();
    }

    setView(viewName) {
        this.currentView = viewName;
        localStorage.setItem('monsterbox_video_library_view', viewName);
        this.applyView();
        this.renderCurrentView();
    }

    applyView() {
        var gridEl = document.getElementById('videoGrid');
        var listEl = document.getElementById('videoListContainer');
        var btnGrid = document.getElementById('viewGrid');
        var btnList = document.getElementById('viewList');

        if (this.currentView === 'list') {
            gridEl.classList.add('vid-hidden');
            listEl.classList.remove('vid-hidden');
            btnGrid.className = 'mb-btn mb-btn-sm mb-btn-secondary mb-btn-icon';
            btnList.className = 'mb-btn mb-btn-sm mb-btn-primary mb-btn-icon';
        } else {
            gridEl.classList.remove('vid-hidden');
            listEl.classList.add('vid-hidden');
            btnGrid.className = 'mb-btn mb-btn-sm mb-btn-primary mb-btn-icon';
            btnList.className = 'mb-btn mb-btn-sm mb-btn-secondary mb-btn-icon';
        }
    }

    renderCurrentView() {
        if (this.currentView === 'list') {
            this.renderVideoList();
        } else {
            this.renderVideoGrid();
        }
    }

    renderVideoList() {
        var tbody = document.getElementById('videoListBody');
        var emptyState = document.getElementById('emptyState');
        var listContainer = document.getElementById('videoListContainer');

        if (!this.videoFiles.length) {
            tbody.innerHTML = '';
            emptyState.classList.remove('vid-hidden');
            if (this.currentView === 'list') {
                listContainer.classList.add('vid-hidden');
            }
            return;
        }

        emptyState.classList.add('vid-hidden');
        if (this.currentView === 'list') {
            listContainer.classList.remove('vid-hidden');
        }

        var self = this;
        var bulkMode = this.bulkSelectMode;
        var selectedIds = this.selectedVideoIds;

        tbody.innerHTML = this.videoFiles.map(function(video) {
            var checkboxCell = '';
            if (bulkMode) {
                checkboxCell = '<input type="checkbox" class="video-select-checkbox" title="Select this video for bulk actions" data-video-id="' + video.id + '"' +
                    (selectedIds.has(video.id) ? ' checked' : '') + '>';
            }

            return '<tr data-video-id="' + video.id + '">' +
                '<td>' + checkboxCell + '</td>' +
                '<td><button class="list-fav-btn mb-favorite-btn" title="Toggle favorite" data-video-id="' + video.id + '">' +
                    '<i class="bi bi-heart' + (video.favorite ? '-fill' : '') + '"></i>' +
                '</button></td>' +
                '<td class="title-cell" title="' + self.escapeAttr(video.title) + '">' + self.escapeHtml(video.title) + '</td>' +
                '<td><span class="mb-badge mb-badge-info vid-fmt-badge">' + (video.format || 'vid').toUpperCase() + '</span></td>' +
                '<td class="mb-mono">' + self.formatDuration(video.duration || 0) + '</td>' +
                '<td class="mb-mono">' + self.formatFileSize(video.fileSize || 0) + '</td>' +
                '<td>' +
                    '<div class="btn-group btn-group-sm">' +
                        '<button class="mb-btn mb-btn-sm mb-btn-primary mb-btn-icon goblin-play-btn" data-video-id="' + video.id + '" title="Play on a Goblin">' +
                            '<i class="bi bi-tv"></i>' +
                        '</button>' +
                        '<button class="mb-btn mb-btn-sm mb-btn-secondary mb-btn-icon deploy-btn" data-video-id="' + video.id + '" title="Copy onto a Goblin">' +
                            '<i class="bi bi-broadcast"></i>' +
                        '</button>' +
                        '<button class="mb-btn mb-btn-sm mb-btn-ghost mb-btn-icon delete-btn" data-video-id="' + video.id + '" title="Delete">' +
                            '<i class="bi bi-trash"></i>' +
                        '</button>' +
                    '</div>' +
                '</td>' +
            '</tr>';
        }).join('');

        this.setupVideoListEvents();
    }

    setupVideoListEvents() {
        var self = this;
        var tbody = document.getElementById('videoListBody');

        // Row click plays video
        tbody.querySelectorAll('tr').forEach(function(row) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('button') || e.target.closest('input')) return;
                var videoId = row.dataset.videoId;
                self.sendFromLibrary(videoId);
            });
        });

        // Favorite buttons
        tbody.querySelectorAll('.mb-favorite-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.toggleFavorite(btn.dataset.videoId);
            });
        });

        // Play-on-Goblin buttons
        tbody.querySelectorAll('.goblin-play-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.playOnGoblin(btn.dataset.videoId);
            });
        });

        // Deploy buttons
        tbody.querySelectorAll('.deploy-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                self.quickDeploy(btn.dataset.videoId);
            });
        });

        // Delete buttons
        tbody.querySelectorAll('.delete-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var videoId = btn.dataset.videoId;
                var video = self.videoFiles.find(function(v) { return v.id === videoId; });
                if (!video) return;
                // Styled dialog that names the file, instead of a native browser popup.
                window.mbConfirm({
                    title: 'Delete this video?',
                    body: 'The file is removed from the library. This cannot be undone.',
                    target: video.title,
                    confirmLabel: 'Delete'
                }).then(function (ok) {
                    if (!ok) return;
                    fetch('/video-library/api/video/' + videoId, { method: 'DELETE' })
                        .then(function(r) { return r.json(); })
                        .then(function(data) {
                            if (data.success) {
                                self.showSuccess('Deleted "' + video.title + '"');
                                self.loadVideoLibrary();
                            } else {
                                self.showError(data.error || 'Failed to delete');
                            }
                        })
                        .catch(function() { self.showError('Failed to delete video'); });
                });
            });
        });

        // Bulk select checkboxes
        if (this.bulkSelectMode) {
            tbody.querySelectorAll('.video-select-checkbox').forEach(function(cb) {
                cb.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
                cb.addEventListener('change', function() {
                    self.toggleVideoSelection(cb.dataset.videoId);
                });
            });
        }
    }

    setupListSortHandlers() {
        var self = this;
        var headers = document.querySelectorAll('#videoListTable th[data-sort]');
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
                self.sortVideoList();
                self.updateSortIndicators();
            });
        });
    }

    sortVideoList() {
        var col = this.listSortColumn;
        var dir = this.listSortDirection === 'asc' ? 1 : -1;

        this.videoFiles.sort(function(a, b) {
            var valA, valB;
            switch (col) {
                case 'title':
                    valA = (a.title || '').toLowerCase();
                    valB = (b.title || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'format':
                    valA = (a.format || '').toLowerCase();
                    valB = (b.format || '').toLowerCase();
                    return valA < valB ? -dir : valA > valB ? dir : 0;
                case 'duration':
                    return ((a.duration || 0) - (b.duration || 0)) * dir;
                case 'fileSize':
                    return ((a.fileSize || 0) - (b.fileSize || 0)) * dir;
                case 'favorite':
                    valA = a.favorite ? 1 : 0;
                    valB = b.favorite ? 1 : 0;
                    return (valB - valA) * dir;
                default:
                    return 0;
            }
        });

        this.renderVideoList();
    }

    updateSortIndicators() {
        var col = this.listSortColumn;
        var dir = this.listSortDirection;
        var headers = document.querySelectorAll('#videoListTable th[data-sort]');

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
        
        const bulkBtn = document.getElementById('bulkSelectBtn');
        const bulkActions = document.getElementById('bulkActions');

        if (this.bulkSelectMode) {
            bulkBtn.classList.add('active');
            bulkActions.classList.remove('vid-hidden');
        } else {
            bulkBtn.classList.remove('active');
            bulkActions.classList.add('vid-hidden');
            this.selectedVideoIds.clear();
        }

        this.renderCurrentView();
        this.updateSelectedCount();
    }

    toggleVideoSelection(videoId) {
        if (this.selectedVideoIds.has(videoId)) {
            this.selectedVideoIds.delete(videoId);
        } else {
            this.selectedVideoIds.add(videoId);
        }
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        document.getElementById('selectedCount').textContent = this.selectedVideoIds.size;
    }

    // Utility methods
    updateStats() {
        const totalSize = this.videoFiles.reduce((sum, video) => sum + (video.fileSize || 0), 0);
        const totalCategories = new Set(this.videoFiles.map(v => v.category)).size;
        const totalFavorites = this.videoFiles.filter(v => v.favorite).length;

        document.getElementById('totalFiles').textContent = this.videoFiles.length;
        document.getElementById('totalSize').textContent = this.formatFileSize(totalSize);
        document.getElementById('totalCategories').textContent = totalCategories;
        document.getElementById('totalGoblins').textContent = this.goblins.filter(g => g.status === 'online').length;
    }

    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    timeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        
        return date.toLocaleDateString();
    }

    showError(message) {
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }

    showSuccess(message) {
        if (window.showToast) {
            window.showToast(message, 'success');
        }
    }
}

// Initialize when page loads
const videoLibrary = new VideoLibrary();