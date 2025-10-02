/**
 * Video Library Frontend JavaScript
 * Handles UI interactions, video playback, upload, search, filtering, and Goblin deployment
 */

class VideoLibrary {
    constructor() {
        this.videoFiles = [];
        this.allVideoFiles = []; // Store all videos before filtering
        this.goblins = [];
        this.categories = [];
        this.selectedFiles = [];
        this.currentVideo = null;
        this.searchTimeout = null;
        this.bulkSelectMode = false;
        this.selectedVideoIds = new Set();
        this.currentPlayer = null;
        this.deploymentInProgress = false;
        this.selectedGoblinId = null; // Currently selected goblin for filtering
        this.activityLog = []; // Activity log

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        await this.loadGoblins(); // Load goblins first
        await this.loadVideoLibrary();
        this.renderGoblinSelector(); // Add goblin selector
        this.populateCategoryFilters();
        this.updateStats();
        this.startGoblinStatusPolling();
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentPlayer) {
                this.stopCurrentVideo();
            }
            if (e.key === ' ' && this.currentPlayer && e.target.tagName !== 'INPUT') {
                e.preventDefault();
                this.togglePlayPause();
            }
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
            if (e.target === dropZone || e.target.closest('.drag-drop-zone')) {
                document.getElementById('videoFileInput').click();
            }
        });
    }

    async loadVideoLibrary() {
        try {
            // Load videos from ALL goblins' local libraries
            const goblinsResponse = await fetch('/goblin-management/api/goblins');
            const goblinsData = await goblinsResponse.json();

            if (!goblinsData.success) {
                this.showError('Failed to load goblins');
                return;
            }

            const onlineGoblins = goblinsData.goblins.filter(g => g.status === 'online');

            if (onlineGoblins.length === 0) {
                this.videoFiles = [];
                this.categories = [];
                this.showWarning('No goblins online - no videos available');
                this.renderVideoGrid();
                this.updateStats();
                return;
            }

            // Fetch videos from each online goblin
            const videoPromises = onlineGoblins.map(async (goblin) => {
                try {
                    const response = await fetch(`${goblin.endpoint}/video-library/api/videos`);
                    const data = await response.json();

                    if (data.success && data.videos) {
                        // Add goblin info to each video
                        return data.videos.map(video => ({
                            ...video,
                            goblinId: goblin.id,
                            goblinName: goblin.name,
                            goblinEndpoint: goblin.endpoint,
                            // Create unique ID combining goblin and video path
                            id: `${goblin.id}:${video.path}`,
                            // Store original path for playback
                            filename: video.path,
                            title: video.name
                        }));
                    }
                    return [];
                } catch (error) {
                    console.error(`Error loading videos from ${goblin.name}:`, error);
                    return [];
                }
            });

            const videoArrays = await Promise.all(videoPromises);
            this.allVideoFiles = videoArrays.flat(); // Store all videos
            this.videoFiles = this.allVideoFiles; // Initially show all

            // Extract unique categories
            const categorySet = new Set();
            this.videoFiles.forEach(v => {
                if (v.category) categorySet.add(v.category);
            });
            this.categories = Array.from(categorySet);

            console.log(`📹 Loaded ${this.videoFiles.length} videos from ${onlineGoblins.length} goblin(s)`);
            this.applyGoblinFilter(); // Apply goblin filter if one is selected
            this.renderVideoGrid();
            this.updateStats();

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
                // Check for status changes
                const oldGoblins = this.goblins || [];
                const newGoblins = data.goblins;

                newGoblins.forEach(newGoblin => {
                    const oldGoblin = oldGoblins.find(g => g.id === newGoblin.id);
                    if (oldGoblin && oldGoblin.status !== newGoblin.status) {
                        if (newGoblin.status === 'online') {
                            this.logActivity(`${newGoblin.name} is now online`, 'success');
                        } else {
                            this.logActivity(`${newGoblin.name} went offline`, 'warning');
                        }
                    }
                });

                this.goblins = newGoblins;
                this.updateGoblinStatus();
                this.renderGoblinSelector(); // Update selector when goblins change
            }
        } catch (error) {
            console.error('Error loading Goblins:', error);
        }
    }

    renderGoblinSelector() {
        const container = document.getElementById('goblinSelector');
        if (!container) return;

        const onlineGoblins = this.goblins.filter(g => g.status === 'online');

        if (onlineGoblins.length === 0) {
            container.innerHTML = '<div class="alert alert-warning mb-0">No goblins online</div>';
            return;
        }

        // Add "All Goblins" button
        let html = `
            <button class="btn ${!this.selectedGoblinId ? 'btn-primary' : 'btn-outline-primary'} goblin-selector-btn"
                    onclick="videoLibrary.selectGoblin(null)">
                <i class="bi bi-grid-3x3"></i> All Goblins
                <br><small class="text-muted">${this.allVideoFiles.length} videos</small>
            </button>
        `;

        // Add button for each goblin
        onlineGoblins.forEach(goblin => {
            const videoCount = this.allVideoFiles.filter(v => v.goblinId === goblin.id).length;
            const isSelected = this.selectedGoblinId === goblin.id;

            html += `
                <button class="btn ${isSelected ? 'btn-success' : 'btn-outline-success'} goblin-selector-btn"
                        onclick="videoLibrary.selectGoblin('${goblin.id}')"
                        ondblclick="videoLibrary.openGoblinQueue('${goblin.id}')">
                    <i class="bi bi-cpu"></i> ${goblin.name}
                    <br><small class="text-muted">${videoCount} videos</small>
                </button>
            `;
        });

        container.innerHTML = html;
    }

    selectGoblin(goblinId) {
        this.selectedGoblinId = goblinId;
        this.renderGoblinSelector(); // Update button states
        this.applyGoblinFilter();
        this.renderVideoGrid();
        this.updateStats();

        if (goblinId) {
            const goblin = this.goblins.find(g => g.id === goblinId);
            this.showSuccess(`Showing videos from ${goblin.name}`);
        } else {
            this.showSuccess('Showing videos from all goblins');
        }
    }

    applyGoblinFilter() {
        if (this.selectedGoblinId) {
            // Filter to only show videos from selected goblin
            this.videoFiles = this.allVideoFiles.filter(v => v.goblinId === this.selectedGoblinId);
        } else {
            // Show all videos
            this.videoFiles = this.allVideoFiles;
        }
    }

    openGoblinQueue(goblinId) {
        // TODO: Open queue control for this goblin
        const goblin = this.goblins.find(g => g.id === goblinId);
        this.showInfo(`Queue control for ${goblin.name} - Coming soon!`);
        // For now, just navigate to goblin management
        // window.location.href = `/goblin-management?goblin=${goblinId}`;
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
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        grid.innerHTML = this.videoFiles.map(video => `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="video-card card position-relative h-100" data-video-id="${video.id}" onclick="videoLibrary.playVideo('${video.id}')">
                    ${this.bulkSelectMode ? `
                        <div class="position-absolute top-0 start-0 p-2" style="z-index: 20;">
                            <input type="checkbox" class="form-check-input video-select-checkbox" 
                                   data-video-id="${video.id}" onclick="event.stopPropagation(); videoLibrary.toggleVideoSelection('${video.id}')" 
                                   ${this.selectedVideoIds.has(video.id) ? 'checked' : ''}>
                        </div>
                    ` : ''}
                    
                    <div class="position-relative">
                        ${video.thumbnail && !video.goblinId ? `
                            <img src="/video-library/api/video/${video.id}/thumbnail" class="video-thumbnail" alt="${video.title}">
                        ` : `
                            <div class="video-thumbnail d-flex align-items-center justify-content-center bg-gradient" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                <i class="bi bi-camera-video fs-1 text-white"></i>
                            </div>
                        `}
                        
                        <div class="video-overlay"></div>
                        
                        <div class="video-controls">
                            <button class="btn btn-primary btn-lg rounded-circle">
                                <i class="bi bi-play-fill"></i>
                            </button>
                        </div>
                        
                        <div class="video-duration">${this.formatDuration(video.duration || 0)}</div>
                        
                        <button class="favorite-btn ${video.favorite ? 'text-warning' : ''}" 
                                onclick="event.stopPropagation(); videoLibrary.toggleFavorite('${video.id}')">
                            <i class="bi bi-heart${video.favorite ? '-fill' : ''}"></i>
                        </button>
                    </div>
                    
                    <div class="card-body p-2">
                        <h6 class="card-title mb-1 text-truncate" title="${video.title}">${video.title}</h6>
                        <small class="text-muted d-block mb-1">
                            ${video.format?.toUpperCase() || 'VIDEO'} • ${this.formatFileSize(video.fileSize || 0)}
                        </small>
                        ${video.tags && video.tags.length ? `
                            <div class="mb-1">
                                ${video.tags.slice(0, 2).map(tag => `
                                    <span class="badge bg-secondary tag-badge">${tag}</span>
                                `).join('')}
                                ${video.tags.length > 2 ? `<span class="badge bg-secondary tag-badge">+${video.tags.length - 2}</span>` : ''}
                            </div>
                        ` : ''}
                        <div class="d-flex justify-content-between align-items-center gap-1">
                            <small class="text-muted">${this.timeAgo(video.uploadedAt)}</small>
                            <div class="btn-group btn-group-sm">
                                <button class="btn btn-outline-success" onclick="event.stopPropagation(); videoLibrary.playNow('${video.id}')"
                                        title="Play Now (stops current video)">
                                    <i class="bi bi-play-fill"></i>
                                </button>
                                <button class="btn btn-outline-primary" onclick="event.stopPropagation(); videoLibrary.addToQueue('${video.id}')"
                                        title="Add to Queue">
                                    <i class="bi bi-plus-circle"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async playVideo(videoId) {
        try {
            const video = this.videoFiles.find(v => v.id === videoId);
            if (!video) {
                console.error('Video not found:', videoId);
                return;
            }

            this.currentVideo = video;

            // Update main player
            const playerContainer = document.getElementById('mainVideoPlayer');
            const playerControls = document.getElementById('videoPlayerControls');
            const playerInfo = document.getElementById('videoPlayerInfo');

            playerContainer.innerHTML = `
                <video class="video-preview-player" controls autoplay>
                    <source src="/video-library/api/video/${videoId}/stream" type="${video.mimeType || 'video/mp4'}">
                    Your browser does not support the video tag.
                </video>
            `;

            this.currentPlayer = playerContainer.querySelector('video');

            // Update player info
            document.getElementById('currentVideoTitle').textContent = video.title;
            document.getElementById('currentVideoInfo').textContent = 
                `${video.format?.toUpperCase() || 'VIDEO'} • ${this.formatDuration(video.duration || 0)} • ${this.formatFileSize(video.fileSize || 0)}`;

            const tagsContainer = document.getElementById('currentVideoTags');
            if (video.tags && video.tags.length) {
                tagsContainer.innerHTML = video.tags.map(tag => 
                    `<span class="badge bg-secondary tag-badge">${tag}</span>`
                ).join('');
            } else {
                tagsContainer.innerHTML = '';
            }

            playerControls.style.display = 'block';
            playerInfo.style.display = 'block';

            // Update play count
            this.incrementPlayCount(videoId);

            // Log activity
            this.logActivity(`Playing "${video.title}"`, 'info');

        } catch (error) {
            console.error('Error playing video:', error);
            this.showError('Error playing video');
            this.logActivity(`Error playing video: ${error.message}`, 'error');
        }
    }

    stopCurrentVideo() {
        if (this.currentPlayer) {
            this.currentPlayer.pause();
            this.currentPlayer = null;
        }
        
        document.getElementById('mainVideoPlayer').innerHTML = `
            <div class="player-placeholder">
                <i class="bi bi-camera-video" style="font-size: 4rem;"></i>
                <h4 class="mt-3">Select a video to preview</h4>
                <p class="text-muted">Click any video from the library to start playing</p>
            </div>
        `;
        
        document.getElementById('videoPlayerControls').style.display = 'none';
        document.getElementById('videoPlayerInfo').style.display = 'none';
        
        this.currentVideo = null;
    }

    togglePlayPause() {
        if (this.currentPlayer) {
            if (this.currentPlayer.paused) {
                this.currentPlayer.play();
            } else {
                this.currentPlayer.pause();
            }
        }
    }

    toggleFullscreen() {
        if (this.currentPlayer) {
            if (this.currentPlayer.requestFullscreen) {
                this.currentPlayer.requestFullscreen();
            } else if (this.currentPlayer.webkitRequestFullscreen) {
                this.currentPlayer.webkitRequestFullscreen();
            } else if (this.currentPlayer.msRequestFullscreen) {
                this.currentPlayer.msRequestFullscreen();
            }
        }
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
                    this.renderVideoGrid();
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

        container.style.display = 'block';

        list.innerHTML = this.selectedFiles.map(file => `
            <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                <div>
                    <strong>${file.name}</strong>
                    <small class="text-muted d-block">${this.formatFileSize(file.size)} • ${file.type}</small>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="videoLibrary.removeSelectedFile('${file.name}')">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `).join('');
    }

    removeSelectedFile(filename) {
        this.selectedFiles = this.selectedFiles.filter(f => f.name !== filename);
        
        if (this.selectedFiles.length === 0) {
            document.getElementById('selectedFilesList').style.display = 'none';
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
        progressContainer.style.display = 'block';

        const formData = new FormData();
        
        // Add files
        this.selectedFiles.forEach(file => {
            formData.append('videos', file);
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
        document.getElementById('selectedFilesList').style.display = 'none';
        document.querySelector('.upload-progress').style.display = 'none';
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
        this.renderVideoGrid();
        this.videoFiles = originalFiles;
    }

    // Goblin playback methods
    async playNow(videoId) {
        const video = this.videoFiles.find(v => v.id === videoId);

        if (!video) {
            this.showError('Video not found');
            return;
        }

        // If a goblin is selected and the video is on that goblin, play directly
        if (this.selectedGoblinId && video.goblinId === this.selectedGoblinId) {
            await this.playOnGoblin(videoId, this.selectedGoblinId, true);
            return;
        }

        // Otherwise, play on the goblin that has the video
        await this.playOnGoblin(videoId, video.goblinId, true);
    }

    async addToQueue(videoId) {
        const video = this.videoFiles.find(v => v.id === videoId);

        if (!video) {
            this.showError('Video not found');
            return;
        }

        // If a goblin is selected and the video is on that goblin, add to queue
        if (this.selectedGoblinId && video.goblinId === this.selectedGoblinId) {
            await this.addToGoblinQueue(videoId, this.selectedGoblinId);
            return;
        }

        // Otherwise, add to the goblin that has the video
        await this.addToGoblinQueue(videoId, video.goblinId);
    }

    async playOnGoblin(videoId, goblinId, stopCurrent = false) {
        const video = this.videoFiles.find(v => v.id === videoId);
        const goblin = this.goblins.find(g => g.id === goblinId);

        if (!video || !goblin) {
            this.showError('Video or Goblin not found');
            return;
        }

        try {
            // Check if video is on this goblin
            if (video.goblinId !== goblinId) {
                this.showError(`Video "${video.title}" is not available on ${goblin.name}. It's on ${video.goblinName}.`);
                return;
            }

            // Stop current video if requested (with fade to black)
            if (stopCurrent) {
                try {
                    await fetch(`${goblin.endpoint}/stop-all`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    // Wait for fade to black (1 second)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.error('Error stopping video:', error);
                    // Continue anyway - not critical
                }
            }

            this.logActivity(`Playing "${video.title}" on ${goblin.name}...`, 'info');

            // Play the video directly on the goblin (it's already there locally!)
            const response = await fetch(`${goblin.endpoint}/play-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: video.filename,
                    loop: false
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(`Now playing "${video.title}" on ${goblin.name}!`);
                this.logActivity(`Now playing "${video.title}" on ${goblin.name}`, 'success');
            } else {
                this.showError(`Playback failed: ${result.error || 'Unknown error'}`);
                this.logActivity(`Playback failed on ${goblin.name}: ${result.error}`, 'error');
            }

        } catch (error) {
            console.error('Playback error:', error);
            this.showError('Playback failed due to network error');
            this.logActivity(`Playback failed on ${goblin.name}: ${error.message}`, 'error');
        }
    }

    async addToGoblinQueue(videoId, goblinId) {
        const video = this.videoFiles.find(v => v.id === videoId);
        const goblin = this.goblins.find(g => g.id === goblinId);

        if (!video || !goblin) {
            this.showError('Video or Goblin not found');
            return;
        }

        // TODO: Queue management coming soon!
        this.showError('Queue management coming soon! For now, use "Play Now" to play videos immediately.');
        this.logActivity(`Queue feature for ${goblin.name} - Coming soon!`, 'info');
        return;

        /* FUTURE IMPLEMENTATION:
        try {
            // Check if video is on this goblin
            if (video.goblinId !== goblinId) {
                this.showError(`Video "${video.title}" is not available on ${goblin.name}. It's on ${video.goblinName}.`);
                return;
            }

            this.logActivity(`Adding "${video.title}" to ${goblin.name} queue...`, 'info');

            // Add to queue
            const response = await fetch(`${goblin.endpoint}/add-to-queue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: video.filename
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(`Added "${video.title}" to ${goblin.name} queue!`);
                this.logActivity(`Added "${video.title}" to ${goblin.name} queue`, 'success');
            } else {
                this.showError(`Failed to add to queue: ${result.error || 'Unknown error'}`);
                this.logActivity(`Failed to add to ${goblin.name} queue: ${result.error}`, 'error');
            }

        } catch (error) {
            console.error('Queue error:', error);
            this.showError('Failed to add to queue due to network error');
            this.logActivity(`Failed to add to ${goblin.name} queue: ${error.message}`, 'error');
        }
        */
    }

    populateDeploymentModal() {
        // Populate video list
        const videoList = document.getElementById('deployVideoList');
        videoList.innerHTML = this.videoFiles.map(video => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${video.id}" id="deployVideo${video.id}">
                <label class="form-check-label small" for="deployVideo${video.id}">
                    <strong>${video.title}</strong>
                    <br><small class="text-muted">${video.format?.toUpperCase()} • ${this.formatFileSize(video.fileSize)}</small>
                </label>
            </div>
        `).join('');

        // Populate Goblin list
        const goblinList = document.getElementById('deployGoblinList');
        const availableGoblins = this.goblins.filter(g => g.status === 'online');
        
        goblinList.innerHTML = availableGoblins.map(goblin => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="${goblin.id}" id="deployGoblin${goblin.id}"
                       ${goblin.lockedBy ? 'disabled' : ''}>
                <label class="form-check-label small" for="deployGoblin${goblin.id}">
                    <strong>${goblin.name}</strong>
                    <span class="goblin-status ${goblin.status}">${goblin.status}</span>
                    ${goblin.lockedBy ? '<br><small class="text-warning">Locked by ' + goblin.lockedBy + '</small>' : ''}
                    <br><small class="text-muted">${goblin.endpoint}</small>
                </label>
            </div>
        `).join('');
    }

    async executeDeployment() {
        const selectedVideos = Array.from(document.querySelectorAll('#deployVideoList input:checked')).map(cb => cb.value);
        const selectedGoblins = Array.from(document.querySelectorAll('#deployGoblinList input:checked')).map(cb => cb.value);

        if (!selectedVideos.length || !selectedGoblins.length) {
            this.showError('Please select at least one video and one Goblin');
            return;
        }

        const deployBtn = document.getElementById('deployBtn');
        const progressContainer = document.getElementById('deploymentProgress');
        const statusContainer = document.getElementById('deploymentStatus');

        deployBtn.disabled = true;
        progressContainer.style.display = 'block';
        statusContainer.innerHTML = '';

        try {
            for (let videoId of selectedVideos) {
                for (let goblinId of selectedGoblins) {
                    const video = this.videoFiles.find(v => v.id === videoId);
                    const goblin = this.goblins.find(g => g.id === goblinId);

                    statusContainer.innerHTML += `<div class="mb-2">Deploying "${video.title}" to ${goblin.name}... <span class="text-warning">In Progress</span></div>`;

                    try {
                        const response = await fetch('/video-library/api/deploy', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ videoId, goblinId })
                        });

                        const result = await response.json();
                        const statusElement = statusContainer.lastElementChild;

                        if (result.success) {
                            statusElement.innerHTML = statusElement.innerHTML.replace('In Progress', '<span class="text-success">Success</span>');
                            this.logActivity(`Deployed "${video.title}" to ${goblin.name}`, 'success');
                        } else {
                            statusElement.innerHTML = statusElement.innerHTML.replace('In Progress', `<span class="text-danger">Failed: ${result.error}</span>`);
                            this.logActivity(`Failed to deploy "${video.title}" to ${goblin.name}: ${result.error}`, 'error');
                        }
                    } catch (error) {
                        const statusElement = statusContainer.lastElementChild;
                        statusElement.innerHTML = statusElement.innerHTML.replace('In Progress', `<span class="text-danger">Error: ${error.message}</span>`);
                    }
                }
            }
        } finally {
            deployBtn.disabled = false;
        }
    }

    // Bulk operations
    toggleBulkSelect() {
        this.bulkSelectMode = !this.bulkSelectMode;
        
        const bulkBtn = document.getElementById('bulkSelectBtn');
        const bulkActions = document.getElementById('bulkActions');

        if (this.bulkSelectMode) {
            bulkBtn.classList.add('active');
            bulkActions.style.display = 'block';
        } else {
            bulkBtn.classList.remove('active');
            bulkActions.style.display = 'none';
            this.selectedVideoIds.clear();
        }

        this.renderVideoGrid();
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

    updateGoblinStatus() {
        const onlineGoblins = this.goblins.filter(g => g.status === 'online');
        const statusBar = document.getElementById('goblinStatusBar');
        const statusList = document.getElementById('goblinStatusList');

        if (onlineGoblins.length > 0) {
            statusBar.style.display = 'block';
            statusList.innerHTML = onlineGoblins.map(goblin => `
                <span class="goblin-status ${goblin.status} me-2">${goblin.name}</span>
            `).join('');
        } else {
            statusBar.style.display = 'none';
        }
    }

    startGoblinStatusPolling() {
        setInterval(async () => {
            await this.loadGoblins();
        }, 30000); // Update every 30 seconds
    }

    showGoblinManager() {
        window.location.href = '/goblin-management';
    }

    deployCurrentVideo() {
        if (this.currentVideo) {
            this.playNow(this.currentVideo.id);
        }
    }

    // Queue Management
    async openGoblinQueue(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) {
            this.showError('Goblin not found');
            return;
        }

        // TODO: Queue management coming soon!
        this.showError('Queue management coming soon! For now, use "Play Now" to play videos immediately.');
        this.logActivity(`Queue management for ${goblin.name} - Coming soon!`, 'info');
        return;

        /* FUTURE IMPLEMENTATION:
        this.currentQueueGoblinId = goblinId;
        document.getElementById('queueGoblinName').textContent = goblin.name;

        // Open modal
        const modal = new bootstrap.Modal(document.getElementById('queueManagementModal'));
        modal.show();

        // Load queue
        await this.refreshQueue();
        */
    }

    async refreshQueue() {
        if (!this.currentQueueGoblinId) return;

        const goblin = this.goblins.find(g => g.id === this.currentQueueGoblinId);
        if (!goblin) return;

        try {
            const response = await fetch(`${goblin.endpoint}/queue`);
            const result = await response.json();

            if (result.success) {
                this.renderQueue(result.queue || []);
                document.getElementById('queueCount').textContent = `${result.queue?.length || 0} items`;
                document.getElementById('queueStatus').textContent = result.status || 'Idle';
            } else {
                this.showError('Failed to load queue');
            }
        } catch (error) {
            console.error('Queue error:', error);
            this.showError('Failed to load queue');
        }
    }

    renderQueue(queue) {
        const container = document.getElementById('queueItems');

        if (!queue || queue.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-inbox" style="font-size: 2rem;"></i>
                    <p class="mt-2">Queue is empty</p>
                </div>
            `;
            return;
        }

        container.innerHTML = queue.map((item, index) => `
            <div class="card mb-2 queue-item" data-index="${index}">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-secondary">${index + 1}</span>
                            <div>
                                <strong>${item.filename || item.title || 'Unknown'}</strong>
                                ${item.status ? `<br><small class="text-muted">${item.status}</small>` : ''}
                            </div>
                        </div>
                        <div class="btn-group btn-group-sm">
                            ${index > 0 ? `
                                <button class="btn btn-outline-primary" onclick="videoLibrary.moveQueueItem(${index}, ${index - 1})" title="Move Up">
                                    <i class="bi bi-arrow-up"></i>
                                </button>
                            ` : ''}
                            ${index < queue.length - 1 ? `
                                <button class="btn btn-outline-primary" onclick="videoLibrary.moveQueueItem(${index}, ${index + 1})" title="Move Down">
                                    <i class="bi bi-arrow-down"></i>
                                </button>
                            ` : ''}
                            <button class="btn btn-outline-danger" onclick="videoLibrary.removeQueueItem(${index})" title="Remove">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async moveQueueItem(fromIndex, toIndex) {
        if (!this.currentQueueGoblinId) return;

        const goblin = this.goblins.find(g => g.id === this.currentQueueGoblinId);
        if (!goblin) return;

        try {
            const response = await fetch(`${goblin.endpoint}/queue/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromIndex, toIndex })
            });

            const result = await response.json();

            if (result.success) {
                await this.refreshQueue();
                this.logActivity(`Moved queue item on ${goblin.name}`, 'success');
            } else {
                this.showError('Failed to move item');
            }
        } catch (error) {
            console.error('Move error:', error);
            this.showError('Failed to move item');
        }
    }

    async removeQueueItem(index) {
        if (!this.currentQueueGoblinId) return;

        const goblin = this.goblins.find(g => g.id === this.currentQueueGoblinId);
        if (!goblin) return;

        try {
            const response = await fetch(`${goblin.endpoint}/queue/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index })
            });

            const result = await response.json();

            if (result.success) {
                await this.refreshQueue();
                this.showSuccess('Removed from queue');
                this.logActivity(`Removed item from ${goblin.name} queue`, 'success');
            } else {
                this.showError('Failed to remove item');
            }
        } catch (error) {
            console.error('Remove error:', error);
            this.showError('Failed to remove item');
        }
    }

    async pauseQueue() {
        if (!this.currentQueueGoblinId) return;

        const goblin = this.goblins.find(g => g.id === this.currentQueueGoblinId);
        if (!goblin) return;

        try {
            const response = await fetch(`${goblin.endpoint}/queue/pause`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess('Queue paused');
                this.logActivity(`Paused ${goblin.name} queue`, 'info');
                await this.refreshQueue();
            } else {
                this.showError('Failed to pause queue');
            }
        } catch (error) {
            console.error('Pause error:', error);
            this.showError('Failed to pause queue');
        }
    }

    async clearQueue() {
        if (!this.currentQueueGoblinId) return;

        const goblin = this.goblins.find(g => g.id === this.currentQueueGoblinId);
        if (!goblin) return;

        if (!confirm(`Clear all items from ${goblin.name} queue?`)) {
            return;
        }

        try {
            const response = await fetch(`${goblin.endpoint}/queue/clear`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess('Queue cleared');
                this.logActivity(`Cleared ${goblin.name} queue`, 'warning');
                await this.refreshQueue();
            } else {
                this.showError('Failed to clear queue');
            }
        } catch (error) {
            console.error('Clear error:', error);
            this.showError('Failed to clear queue');
        }
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
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-danger border-0';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        
        document.body.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
        
        toast.addEventListener('hidden.bs.toast', () => {
            document.body.removeChild(toast);
        });
    }

    showSuccess(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-success border-0';
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        document.body.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();

        toast.addEventListener('hidden.bs.toast', () => {
            document.body.removeChild(toast);
        });
    }

    logActivity(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const entry = { message, type, timestamp };
        this.activityLog.unshift(entry);

        // Keep only last 50 entries
        if (this.activityLog.length > 50) {
            this.activityLog = this.activityLog.slice(0, 50);
        }

        this.updateActivityLog();
    }

    updateActivityLog() {
        const logContainer = document.getElementById('activityLog');
        if (!logContainer) return;

        if (this.activityLog.length === 0) {
            logContainer.innerHTML = '<small class="text-muted">No recent activity</small>';
            return;
        }

        logContainer.innerHTML = this.activityLog.map(entry => {
            const iconClass = {
                'success': 'bi-check-circle text-success',
                'error': 'bi-x-circle text-danger',
                'warning': 'bi-exclamation-triangle text-warning',
                'info': 'bi-info-circle text-info'
            }[entry.type] || 'bi-info-circle text-info';

            return `
                <div class="d-flex align-items-start mb-2 small">
                    <i class="bi ${iconClass} me-2 mt-1"></i>
                    <div class="flex-grow-1">
                        <div>${entry.message}</div>
                        <small class="text-muted">${entry.timestamp}</small>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Initialize when page loads
const videoLibrary = new VideoLibrary();