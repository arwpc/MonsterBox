/**
 * Goblin Management Frontend JavaScript
 * Handles Goblin registration, monitoring, lock/unlock controls, and real-time status updates
 */

class GoblinManager {
    constructor() {
        this.goblins = [];
        this.activityLog = [];
        this.autoRefresh = true;
        this.refreshInterval = null;
        this.statusFilter = 'all';
        this.lockTimers = new Map();

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadGoblins();
        this.updateStats();
        this.startAutoRefresh();
        this.logActivity('Goblin Management initialized');
    }

    setupEventListeners() {
        // Auto refresh toggle
        document.getElementById('autoRefresh').addEventListener('change', (e) => {
            this.autoRefresh = e.target.checked;
            if (this.autoRefresh) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });

        // Status filter
        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.statusFilter = e.target.value;
            this.renderGoblinGrid();
        });

        // Broadcast command selection
        document.getElementById('broadcastCommand').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customCommandGroup');
            if (e.target.value === 'custom') {
                customGroup.style.display = 'block';
            } else {
                customGroup.style.display = 'none';
            }
        });

        // Registration form validation
        document.getElementById('registerGoblinForm').addEventListener('input', () => {
            this.validateRegistrationForm();
        });

        // Edit Settings button
        document.getElementById('editGoblinBtn').addEventListener('click', () => {
            this.editGoblinSettings();
        });
    }

    async loadGoblins() {
        try {
            const response = await fetch('/goblin-management/api/goblins');
            const data = await response.json();
            
            if (data.success) {
                this.goblins = data.goblins;
                this.updateLockTimers();
                this.renderGoblinGrid();
                this.updateStats();
            } else {
                console.error('Failed to load Goblins:', data.error);
                this.logActivity('ERROR: Failed to load Goblins', 'error');
            }
        } catch (error) {
            console.error('Error loading Goblins:', error);
            this.logActivity('ERROR: Network error loading Goblins', 'error');
        }
    }

    renderGoblinGrid() {
        const grid = document.getElementById('goblinGrid');
        const emptyState = document.getElementById('emptyState');

        let filteredGoblins = this.goblins;

        // Apply status filter
        if (this.statusFilter !== 'all') {
            filteredGoblins = this.goblins.filter(goblin => goblin.status === this.statusFilter);
        }

        if (!filteredGoblins.length) {
            grid.innerHTML = '';
            emptyState.style.display = this.goblins.length === 0 ? 'block' : 'none';
            
            if (this.goblins.length > 0 && this.statusFilter !== 'all') {
                // Show filter message instead of empty state
                grid.innerHTML = `
                    <div class="col-12">
                        <div class="text-center py-4">
                            <i class="bi bi-funnel text-muted" style="font-size: 3rem;"></i>
                            <h5 class="text-muted mt-2">No ${this.statusFilter} Goblins found</h5>
                            <button class="btn btn-outline-primary" onclick="document.getElementById('statusFilter').value='all'; goblinManager.statusFilter='all'; goblinManager.renderGoblinGrid();">
                                Show All Goblins
                            </button>
                        </div>
                    </div>
                `;
            }
            return;
        }

        emptyState.style.display = 'none';

        grid.innerHTML = filteredGoblins.map(goblin => {
            const lockTimeRemaining = this.getLockTimeRemaining(goblin);
            const heartbeatAge = goblin.lastHeartbeat ?
                Math.floor((Date.now() - new Date(goblin.lastHeartbeat).getTime()) / 1000) : null;

            // Get goblin avatar (use default if not set)
            const avatarUrl = goblin.avatar || `/images/goblins/goblin${(parseInt(goblin.id.replace('goblin', '')) % 5) + 1}.svg`;

            // Ensure location is displayed
            const locationText = goblin.location || 'No location set';

            return `
                <div class="col-lg-6 col-xl-4">
                    <div class="card goblin-card ${goblin.status}" data-goblin-id="${goblin.id}">
                        <div class="card-header d-flex justify-content-between align-items-center py-2">
                            <div class="d-flex align-items-center">
                                <img src="${avatarUrl}" class="goblin-avatar rounded-circle me-2"
                                     alt="${goblin.name}" onerror="this.src='/images/goblins/default.svg'">
                                <div>
                                    <h6 class="mb-0 d-flex align-items-center">
                                        <div class="heartbeat-indicator ${heartbeatAge < 60 ? 'active' : 'inactive'}"></div>
                                        ${goblin.name}
                                    </h6>
                                    <small class="text-muted">${locationText}</small>
                                </div>
                            </div>
                            <div>
                                <span class="status-badge ${goblin.status}">${goblin.status}</span>
                            </div>
                        </div>
                        
                        <div class="card-body py-2">
                            <!-- Status Information -->
                            <div class="mb-2">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <small class="text-muted">Endpoint:</small>
                                    <small class="font-monospace">${goblin.endpoint}</small>
                                </div>
                                
                                ${goblin.locked ? `
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-muted">Locked by:</small>
                                        <small class="text-warning">${goblin.lockedBy}</small>
                                    </div>
                                    ${lockTimeRemaining > 0 ? `
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <small class="text-muted">Unlock in:</small>
                                            <small class="lock-timer">${this.formatTime(lockTimeRemaining)}</small>
                                        </div>
                                    ` : ''}
                                ` : ''}
                                
                                ${heartbeatAge !== null ? `
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-muted">Last seen:</small>
                                        <small class="${heartbeatAge > 300 ? 'text-danger' : 'text-success'}">${this.timeAgo(goblin.lastHeartbeat)}</small>
                                    </div>
                                ` : ''}
                            </div>

                            <!-- Capabilities -->
                            ${goblin.capabilities && goblin.capabilities.length ? `
                                <div class="mb-2">
                                    ${goblin.capabilities.map(cap => 
                                        `<span class="badge bg-secondary capability-badge">${cap}</span>`
                                    ).join('')}
                                </div>
                            ` : ''}

                            <!-- Resource Usage (if available) -->
                            ${goblin.resources ? `
                                <div class="mb-2">
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-muted">CPU:</small>
                                        <small>${goblin.resources.cpu}%</small>
                                    </div>
                                    <div class="cpu-usage">
                                        <div style="width: ${goblin.resources.cpu}%; height: 100%; background: ${goblin.resources.cpu > 80 ? '#dc3545' : goblin.resources.cpu > 50 ? '#ffc107' : '#28a745'}; border-radius: 2px;"></div>
                                    </div>
                                    
                                    <div class="d-flex justify-content-between align-items-center mb-1">
                                        <small class="text-muted">Memory:</small>
                                        <small>${goblin.resources.memory}%</small>
                                    </div>
                                    <div class="memory-usage">
                                        <div style="width: ${goblin.resources.memory}%; height: 100%; background: #17a2b8; border-radius: 2px;"></div>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                        
                        <div class="card-footer py-2">
                            <div class="goblin-controls d-flex flex-wrap justify-content-center">
                                <button class="btn btn-sm btn-outline-info" onclick="goblinManager.showGoblinDetails('${goblin.id}')"
                                        title="View Details & Edit Settings" data-bs-toggle="tooltip">
                                    <i class="bi bi-info-circle"></i>
                                </button>

                                ${goblin.status === 'online' ? `
                                    <button class="btn btn-sm btn-outline-success" onclick="goblinManager.testConnection('${goblin.id}')"
                                            title="Test Connection" data-bs-toggle="tooltip">
                                        <i class="bi bi-wifi"></i>
                                    </button>

                                    ${goblin.locked ? `
                                        <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.unlockGoblin('${goblin.id}')"
                                                title="Unlock Goblin" data-bs-toggle="tooltip">
                                            <i class="bi bi-unlock"></i>
                                        </button>
                                    ` : `
                                        <button class="btn btn-sm btn-outline-secondary" onclick="goblinManager.lockGoblin('${goblin.id}')"
                                                title="Lock Goblin" data-bs-toggle="tooltip">
                                            <i class="bi bi-lock"></i>
                                        </button>
                                    `}

                                    <button class="btn btn-sm btn-outline-primary" onclick="goblinManager.deployToGoblin('${goblin.id}')"
                                            title="Deploy Video" data-bs-toggle="tooltip">
                                        <i class="bi bi-broadcast"></i>
                                    </button>

                                    <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.stopGoblinPlayback('${goblin.id}')"
                                            title="Stop Playback" data-bs-toggle="tooltip">
                                        <i class="bi bi-stop-fill"></i>
                                    </button>

                                    <button class="btn btn-sm btn-outline-info" onclick="goblinManager.restartGoblin('${goblin.id}')"
                                            title="Restart Goblin Service" data-bs-toggle="tooltip">
                                        <i class="bi bi-arrow-repeat"></i>
                                    </button>
                                ` : `
                                    <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.testConnection('${goblin.id}')"
                                            title="Reconnect" data-bs-toggle="tooltip">
                                        <i class="bi bi-arrow-clockwise"></i> Reconnect
                                    </button>

                                    <button class="btn btn-sm btn-outline-info" onclick="goblinManager.restartGoblin('${goblin.id}')"
                                            title="Restart Goblin Service" data-bs-toggle="tooltip">
                                        <i class="bi bi-arrow-repeat"></i> Restart
                                    </button>
                                `}

                                <button class="btn btn-sm btn-outline-danger" onclick="goblinManager.unregisterGoblin('${goblin.id}')"
                                        title="Unregister Goblin" data-bs-toggle="tooltip">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Initialize Bootstrap tooltips after rendering
        setTimeout(() => {
            const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
            [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
        }, 100);
    }

    async registerGoblin() {
        const form = document.getElementById('registerGoblinForm');
        const formData = new FormData(form);
        const statusDiv = document.getElementById('registrationStatus');
        const statusMessage = document.getElementById('statusMessage');
        const registerBtn = document.getElementById('registerBtn');

        // Collect capabilities
        const capabilities = Array.from(form.querySelectorAll('input[name="capabilities"]:checked'))
            .map(cb => cb.value);

        const goblinData = {
            name: formData.get('name'),
            host: formData.get('host'),
            port: parseInt(formData.get('port') || '3001'),
            capabilities: capabilities,
            location: formData.get('location') || '',
            description: formData.get('description') || ''
        };

        registerBtn.disabled = true;
        statusDiv.style.display = 'block';
        statusDiv.className = 'alert alert-info mt-3';

        try {
            // Test connection first if requested
            if (formData.get('testConnection')) {
                statusMessage.textContent = 'Testing connection...';
                
                // Simple connection test
                const testUrl = `http://${goblinData.host}:${goblinData.port}/health`;
                const testResponse = await fetch(testUrl, { 
                    method: 'GET', 
                    signal: AbortSignal.timeout(10000) 
                });

                if (!testResponse.ok) {
                    throw new Error(`Connection test failed: ${testResponse.status}`);
                }

                statusMessage.textContent = 'Connection successful! Registering Goblin...';
            } else {
                statusMessage.textContent = 'Registering Goblin...';
            }

            // Register the Goblin
            const response = await fetch('/goblin-management/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(goblinData)
            });

            const result = await response.json();

            if (result.success) {
                statusDiv.className = 'alert alert-success mt-3';
                statusMessage.textContent = `Successfully registered ${goblinData.name}!`;
                
                // Refresh the Goblin list
                await this.loadGoblins();
                this.logActivity(`Registered new Goblin: ${goblinData.name}`, 'success');
                
                setTimeout(() => {
                    bootstrap.Modal.getInstance(document.getElementById('registerGoblinModal')).hide();
                    this.resetRegistrationForm();
                }, 2000);
            } else {
                statusDiv.className = 'alert alert-danger mt-3';
                statusMessage.textContent = `Registration failed: ${result.error}`;
            }

        } catch (error) {
            console.error('Registration error:', error);
            statusDiv.className = 'alert alert-danger mt-3';
            
            if (error.name === 'AbortError' || error.message.includes('timeout')) {
                statusMessage.textContent = 'Connection test timed out. Check the IP address and port.';
            } else if (error.message.includes('Connection test failed')) {
                statusMessage.textContent = error.message;
            } else {
                statusMessage.textContent = `Registration failed: ${error.message}`;
            }
        } finally {
            registerBtn.disabled = false;
        }
    }

    validateRegistrationForm() {
        const form = document.getElementById('registerGoblinForm');
        const name = form.querySelector('input[name="name"]').value.trim();
        const host = form.querySelector('input[name="host"]').value.trim();
        const registerBtn = document.getElementById('registerBtn');

        registerBtn.disabled = !name || !host;
    }

    resetRegistrationForm() {
        document.getElementById('registerGoblinForm').reset();
        document.getElementById('registrationStatus').style.display = 'none';
        document.getElementById('registerBtn').disabled = true;
    }

    async lockGoblin(goblinId) {
        try {
            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lockingEntity: 'Goblin Management Interface' })
            });

            const result = await response.json();

            if (result.success) {
                this.logActivity(`Locked Goblin: ${this.getGoblinName(goblinId)}`, 'warning');
                await this.loadGoblins();
            } else {
                this.showError(`Failed to lock Goblin: ${result.error}`);
            }
        } catch (error) {
            console.error('Lock error:', error);
            this.showError('Failed to lock Goblin due to network error');
        }
    }

    async unlockGoblin(goblinId) {
        try {
            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unlockingEntity: 'Goblin Management Interface' })
            });

            const result = await response.json();

            if (result.success) {
                this.logActivity(`Unlocked Goblin: ${this.getGoblinName(goblinId)}`, 'success');
                await this.loadGoblins();
            } else {
                this.showError(`Failed to unlock Goblin: ${result.error}`);
            }
        } catch (error) {
            console.error('Unlock error:', error);
            this.showError('Failed to unlock Goblin due to network error');
        }
    }

    async unlockAll() {
        const lockedGoblins = this.goblins.filter(g => g.locked);
        
        if (!lockedGoblins.length) {
            this.showInfo('No Goblins are currently locked');
            return;
        }

        try {
            const promises = lockedGoblins.map(goblin => 
                fetch(`/goblin-management/api/goblin/${goblin.id}/unlock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ unlockingEntity: 'Goblin Management Interface - Bulk Unlock' })
                })
            );

            const results = await Promise.allSettled(promises);
            
            let successful = 0;
            let failed = 0;

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const data = await result.value.json();
                    if (data.success) {
                        successful++;
                    } else {
                        failed++;
                    }
                } else {
                    failed++;
                }
            }

            this.logActivity(`Bulk unlock: ${successful} successful, ${failed} failed`, successful > 0 ? 'success' : 'error');
            await this.loadGoblins();

        } catch (error) {
            console.error('Bulk unlock error:', error);
            this.showError('Bulk unlock failed due to network error');
        }
    }

    async testConnection(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) return;

        try {
            this.logActivity(`Testing connection to ${goblin.name}...`, 'info');

            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/status`, {
                signal: AbortSignal.timeout(10000)
            });

            const result = await response.json();

            if (result.success && result.status === 'online') {
                this.logActivity(`${goblin.name}: Connection successful`, 'success');
                this.showSuccess(`${goblin.name} is online and responding`);
            } else {
                this.logActivity(`${goblin.name}: Connection failed - ${result.status}`, 'error');
                this.showWarning(`${goblin.name} is ${result.status}`);
            }

            await this.loadGoblins();

        } catch (error) {
            console.error('Connection test error:', error);
            this.logActivity(`${goblin.name}: Connection test failed`, 'error');
            this.showError(`Connection test failed for ${goblin.name}`);
        }
    }

    async testAllConnections() {
        this.logActivity('Testing all Goblin connections...', 'info');
        
        const promises = this.goblins.map(goblin => this.testConnection(goblin.id));
        await Promise.allSettled(promises);
        
        this.logActivity('Connection test complete for all Goblins', 'info');
    }

    async stopGoblinPlayback(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) return;

        try {
            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/stop-all`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.logActivity(`Stopped playback on ${goblin.name}`, 'info');
                this.showSuccess(`Stopped playback on ${goblin.name}`);
            } else {
                this.showError(`Failed to stop playback: ${result.error}`);
            }

        } catch (error) {
            console.error('Stop playback error:', error);
            this.showError(`Failed to stop playback on ${goblin.name}`);
        }
    }

    async stopAllPlayback() {
        this.logActivity('Stopping playback on all online Goblins...', 'info');
        
        const onlineGoblins = this.goblins.filter(g => g.status === 'online');
        const promises = onlineGoblins.map(goblin => this.stopGoblinPlayback(goblin.id));
        
        await Promise.allSettled(promises);
        this.logActivity('Stop all playback complete', 'info');
    }

    async unregisterGoblin(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) return;

        if (!confirm(`Are you sure you want to unregister "${goblin.name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/goblin-management/api/goblin/${goblinId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (result.success) {
                this.logActivity(`Unregistered Goblin: ${goblin.name}`, 'warning');
                await this.loadGoblins();
                this.showSuccess(`Successfully unregistered ${goblin.name}`);
            } else {
                this.showError(`Failed to unregister Goblin: ${result.error}`);
            }

        } catch (error) {
            console.error('Unregister error:', error);
            this.showError('Failed to unregister Goblin due to network error');
        }
    }

    async showGoblinDetails(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) return;

        // Store current goblin ID for edit button
        this.currentGoblinId = goblinId;

        // Get live status
        let liveData = null;
        try {
            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/status`);
            const result = await response.json();
            if (result.success && result.live) {
                liveData = result.live;
            }
        } catch (error) {
            console.warn('Could not fetch live data for Goblin:', error);
        }

        const modal = new bootstrap.Modal(document.getElementById('goblinDetailsModal'));
        const content = document.getElementById('goblinDetailsContent');

        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Basic Information</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Name:</strong></td><td>${goblin.name}</td></tr>
                        <tr><td><strong>Status:</strong></td><td><span class="status-badge ${goblin.status}">${goblin.status}</span></td></tr>
                        <tr><td><strong>Endpoint:</strong></td><td class="font-monospace">${goblin.endpoint}</td></tr>
                        <tr><td><strong>Location:</strong></td><td>${goblin.location || 'Not specified'}</td></tr>
                        <tr><td><strong>Registered:</strong></td><td>${this.formatDate(goblin.registeredAt)}</td></tr>
                        <tr><td><strong>Last Heartbeat:</strong></td><td>${goblin.lastHeartbeat ? this.formatDate(goblin.lastHeartbeat) : 'Never'}</td></tr>
                    </table>
                </div>
                
                <div class="col-md-6">
                    <h6>Capabilities</h6>
                    <div class="mb-3">
                        ${goblin.capabilities && goblin.capabilities.length ? 
                            goblin.capabilities.map(cap => `<span class="badge bg-primary me-1">${cap}</span>`).join('') :
                            '<span class="text-muted">No capabilities specified</span>'
                        }
                    </div>
                    
                    ${goblin.locked ? `
                        <h6>Lock Information</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Locked by:</strong></td><td>${goblin.lockedBy}</td></tr>
                            <tr><td><strong>Locked at:</strong></td><td>${this.formatDate(goblin.lockedAt)}</td></tr>
                            <tr><td><strong>Expires:</strong></td><td>${this.formatDate(goblin.lockExpiresAt)}</td></tr>
                        </table>
                    ` : ''}
                </div>
            </div>
            
            ${liveData ? `
                <hr>
                <h6>Live System Information</h6>
                <div class="row">
                    <div class="col-md-6">
                        <table class="table table-sm">
                            <tr><td><strong>CPU Usage:</strong></td><td>${liveData.cpu || 'N/A'}%</td></tr>
                            <tr><td><strong>Memory Usage:</strong></td><td>${liveData.memory || 'N/A'}%</td></tr>
                            <tr><td><strong>Uptime:</strong></td><td>${liveData.uptime || 'N/A'}</td></tr>
                            <tr><td><strong>Load Average:</strong></td><td>${liveData.loadAvg || 'N/A'}</td></tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <table class="table table-sm">
                            <tr><td><strong>Platform:</strong></td><td>${liveData.platform || 'N/A'}</td></tr>
                            <tr><td><strong>Node.js:</strong></td><td>${liveData.nodeVersion || 'N/A'}</td></tr>
                            <tr><td><strong>Active Tasks:</strong></td><td>${liveData.activeTasks || 0}</td></tr>
                            <tr><td><strong>Last Activity:</strong></td><td>${liveData.lastActivity || 'N/A'}</td></tr>
                        </table>
                    </div>
                </div>
            ` : ''}
            
            ${goblin.description ? `
                <hr>
                <h6>Description</h6>
                <p class="text-muted">${goblin.description}</p>
            ` : ''}
        `;

        modal.show();
    }

    editGoblinSettings() {
        // Get the currently displayed goblin using stored ID
        const goblin = this.goblins.find(g => g.id === this.currentGoblinId);

        if (!goblin) {
            this.showError('Could not find goblin to edit');
            return;
        }

        // Close details modal
        const detailsModal = bootstrap.Modal.getInstance(document.getElementById('goblinDetailsModal'));
        if (detailsModal) {
            detailsModal.hide();
        }

        // Populate edit form
        document.getElementById('editGoblinId').value = goblin.id;
        document.getElementById('editGoblinName').value = goblin.name || '';
        document.getElementById('editGoblinEndpoint').value = goblin.endpoint || '';
        document.getElementById('editGoblinLocation').value = goblin.location || '';
        document.getElementById('editGoblinDescription').value = goblin.description || '';
        document.getElementById('editGoblinPlatform').value = goblin.platform || '';
        document.getElementById('editGoblinVersion').value = goblin.version || '';

        // Set capabilities checkboxes
        const capabilities = goblin.capabilities || [];
        document.getElementById('editCap1').checked = capabilities.includes('video-playback');
        document.getElementById('editCap2').checked = capabilities.includes('audio-playback');
        document.getElementById('editCap3').checked = capabilities.includes('screen-effects');
        document.getElementById('editCap4').checked = capabilities.includes('hardware-control');

        // Set video settings
        const videoSettings = goblin.videoSettings || {};
        document.getElementById('editVideoDirectory').value = videoSettings.directory || '/home/remote/goblin/media/video';
        document.getElementById('editFramerate').value = videoSettings.framerate || 60;
        document.getElementById('editResolution').value = videoSettings.resolution || '1280x720';

        // Show edit modal
        const editModal = new bootstrap.Modal(document.getElementById('editGoblinModal'));
        editModal.show();
    }

    async saveGoblinSettings() {
        const form = document.getElementById('editGoblinForm');
        const formData = new FormData(form);
        const statusDiv = document.getElementById('editStatus');
        const statusMessage = document.getElementById('editStatusMessage');
        const saveBtn = document.getElementById('saveGoblinBtn');

        const goblinId = document.getElementById('editGoblinId').value;

        // Collect capabilities
        const capabilities = Array.from(form.querySelectorAll('input[name="capabilities"]:checked'))
            .map(cb => cb.value);

        const updateData = {
            name: formData.get('name'),
            endpoint: formData.get('endpoint'),
            location: formData.get('location'),
            description: formData.get('description'),
            platform: formData.get('platform'),
            version: formData.get('version'),
            capabilities: capabilities,
            videoSettings: {
                directory: formData.get('videoDirectory') || '/home/remote/goblin/media/video',
                framerate: parseInt(formData.get('framerate')) || 60,
                resolution: formData.get('resolution') || '1280x720'
            }
        };

        try {
            saveBtn.disabled = true;
            statusDiv.style.display = 'block';
            statusDiv.className = 'alert alert-info mt-3';
            statusMessage.textContent = 'Saving changes...';

            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            const result = await response.json();

            if (result.success) {
                statusDiv.className = 'alert alert-success mt-3';
                statusMessage.textContent = 'Settings saved successfully!';
                this.showSuccess('Goblin settings updated');
                this.logActivity(`✅ Updated settings for ${goblinId}`, 'success');

                // Reload goblins
                await this.loadGoblins();

                // Close modal after short delay
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('editGoblinModal'));
                    if (modal) {
                        modal.hide();
                    }
                }, 1500);
            } else {
                statusDiv.className = 'alert alert-danger mt-3';
                statusMessage.textContent = result.error || 'Failed to save settings';
                this.showError(result.error || 'Failed to save settings');
                this.logActivity(`❌ Failed to update ${goblinId}: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error saving goblin settings:', error);
            statusDiv.className = 'alert alert-danger mt-3';
            statusMessage.textContent = 'Network error saving settings';
            this.showError('Network error saving settings');
            this.logActivity(`❌ Error updating ${goblinId}: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
        }
    }

    async applyVideoSettings() {
        const form = document.getElementById('editGoblinForm');
        const formData = new FormData(form);
        const statusDiv = document.getElementById('editStatus');
        const statusMessage = document.getElementById('editStatusMessage');
        const applyBtn = document.getElementById('applyVideoSettingsBtn');

        const goblinId = document.getElementById('editGoblinId').value;
        const goblin = this.goblins.find(g => g.id === goblinId);

        if (!goblin) {
            this.showError('Could not find goblin');
            return;
        }

        const videoSettings = {
            directory: formData.get('videoDirectory') || '/home/remote/goblin/media/video',
            framerate: parseInt(formData.get('framerate')) || 60,
            resolution: formData.get('resolution') || '1280x720'
        };

        try {
            applyBtn.disabled = true;
            statusDiv.style.display = 'block';
            statusDiv.className = 'alert alert-info mt-3';
            statusMessage.textContent = 'Applying video settings and restarting video...';

            // First save settings to database
            await this.saveGoblinSettings();

            // Then apply settings to goblin
            const response = await fetch(`${goblin.endpoint}/settings/apply`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(videoSettings)
            });

            const result = await response.json();

            if (result.success) {
                statusDiv.className = 'alert alert-success mt-3';
                statusMessage.textContent = 'Video settings applied! Video restarted with new settings.';
                this.showSuccess('Video settings applied successfully');
                this.logActivity(`✅ Applied video settings to ${goblin.name}`, 'success');
            } else {
                statusDiv.className = 'alert alert-warning mt-3';
                statusMessage.textContent = result.message || 'Settings saved but could not apply to goblin';
                this.showWarning('Settings saved but could not apply to goblin');
            }
        } catch (error) {
            console.error('Error applying video settings:', error);
            statusDiv.className = 'alert alert-warning mt-3';
            statusMessage.textContent = 'Settings saved but could not connect to goblin';
            this.showWarning('Settings saved but could not connect to goblin');
        } finally {
            applyBtn.disabled = false;
        }
    }

    deployToGoblin(goblinId) {
        // Open Video Library with Goblin pre-selected
        window.open(`/video-library?goblin=${goblinId}`, '_blank');
    }

    openVideoLibrary() {
        window.open('/video-library', '_blank');
    }

    broadcastCommand() {
        const modal = new bootstrap.Modal(document.getElementById('broadcastModal'));
        document.getElementById('broadcastResults').style.display = 'none';
        modal.show();
    }

    async executeBroadcast() {
        const form = document.getElementById('broadcastForm');
        const formData = new FormData(form);
        const resultsDiv = document.getElementById('broadcastResults');
        const resultsList = document.getElementById('broadcastResultsList');

        let command = formData.get('command');
        if (command === 'custom') {
            command = formData.get('customCommand');
            if (!command) {
                this.showError('Please enter a custom command');
                return;
            }
        }

        let data = {};
        const dataText = formData.get('data');
        if (dataText) {
            try {
                data = JSON.parse(dataText);
            } catch (error) {
                this.showError('Invalid JSON data format');
                return;
            }
        }

        try {
            this.logActivity(`Broadcasting "${command}" to all Goblins...`, 'info');

            const response = await fetch('/goblin-management/api/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, data })
            });

            const result = await response.json();

            if (result.success) {
                resultsDiv.style.display = 'block';
                
                resultsList.innerHTML = result.results.map(r => `
                    <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
                        <span>${this.getGoblinName(r.goblinId)}</span>
                        <span class="badge bg-${r.success ? 'success' : 'danger'}">
                            ${r.success ? 'Success' : 'Failed: ' + r.error}
                        </span>
                    </div>
                `).join('');

                this.logActivity(`Broadcast complete: ${result.successful}/${result.totalGoblins} successful`, 
                               result.successful === result.totalGoblins ? 'success' : 'warning');
            } else {
                this.showError(`Broadcast failed: ${result.error}`);
            }

        } catch (error) {
            console.error('Broadcast error:', error);
            this.showError('Broadcast failed due to network error');
        }
    }

    async refreshAllStatus() {
        this.logActivity('Refreshing all Goblin status...', 'info');
        await this.loadGoblins();
        document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        this.logActivity('Status refresh complete', 'success');
    }

    showSystemHealth() {
        const stats = this.getSystemStats();
        const healthModal = new bootstrap.Modal(document.createElement('div'));
        
        // Create health modal content
        alert(`System Health Summary:
        
Total Goblins: ${stats.total}
Online: ${stats.online} (${((stats.online/stats.total)*100).toFixed(1)}%)
Offline: ${stats.offline}
Locked: ${stats.locked}
Average Response: ${stats.avgResponse}ms
Success Rate: ${stats.successRate}%`);
    }

    // Utility methods
    updateStats() {
        const stats = this.getSystemStats();
        
        document.getElementById('totalGoblins').textContent = stats.total;
        document.getElementById('onlineGoblins').textContent = stats.online;
        document.getElementById('lockedGoblins').textContent = stats.locked;
        document.getElementById('offlineGoblins').textContent = stats.offline;
        
        document.getElementById('avgResponse').textContent = stats.avgResponse + 'ms';
        document.getElementById('successRate').textContent = stats.successRate + '%';
    }

    getSystemStats() {
        const total = this.goblins.length;
        const online = this.goblins.filter(g => g.status === 'online').length;
        const offline = this.goblins.filter(g => g.status === 'offline').length;
        const locked = this.goblins.filter(g => g.locked).length;
        
        // Mock response time and success rate for now
        const avgResponse = Math.floor(Math.random() * 200) + 50;
        const successRate = total > 0 ? Math.floor((online / total) * 100) : 0;

        return { total, online, offline, locked, avgResponse, successRate };
    }

    updateLockTimers() {
        // Clear existing timers
        this.lockTimers.forEach(timer => clearInterval(timer));
        this.lockTimers.clear();

        // Set up new timers for locked Goblins
        this.goblins.forEach(goblin => {
            if (goblin.locked && goblin.lockExpiresAt) {
                const timer = setInterval(() => {
                    const remaining = this.getLockTimeRemaining(goblin);
                    if (remaining <= 0) {
                        clearInterval(timer);
                        this.lockTimers.delete(goblin.id);
                        this.loadGoblins(); // Refresh to get updated lock status
                    } else {
                        // Update display
                        this.renderGoblinGrid();
                    }
                }, 1000);
                
                this.lockTimers.set(goblin.id, timer);
            }
        });
    }

    getLockTimeRemaining(goblin) {
        if (!goblin.locked || !goblin.lockExpiresAt) return 0;
        return Math.max(0, new Date(goblin.lockExpiresAt).getTime() - Date.now());
    }

    getGoblinName(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        return goblin ? goblin.name : `Unknown (${goblinId})`;
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        if (this.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.loadGoblins();
            }, 30000); // Refresh every 30 seconds
        }
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    async restartGoblin(goblinId) {
        if (!confirm(`Are you sure you want to restart ${goblinId}? This will temporarily interrupt any running playback.`)) {
            return;
        }

        try {
            this.logActivity(`Restarting ${goblinId}...`, 'info');

            const response = await fetch(`/goblin-management/api/goblin/${goblinId}/restart`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess(result.message || `${goblinId} restart initiated`);
                this.logActivity(`✅ ${goblinId} restart successful`, 'success');

                // Reload goblins after a short delay to show updated status
                setTimeout(() => {
                    this.loadGoblins();
                }, 2000);
            } else {
                this.showError(result.error || 'Failed to restart Goblin');
                this.logActivity(`❌ ${goblinId} restart failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error restarting Goblin:', error);
            this.showError('Network error restarting Goblin');
            this.logActivity(`❌ ${goblinId} restart error: ${error.message}`, 'error');
        }
    }

    logActivity(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message, type };

        this.activityLog.unshift(logEntry);

        // Keep only last 50 entries
        if (this.activityLog.length > 50) {
            this.activityLog = this.activityLog.slice(0, 50);
        }

        this.updateActivityLog();
    }

    updateActivityLog() {
        const logDiv = document.getElementById('activityLog');
        
        if (this.activityLog.length === 0) {
            logDiv.innerHTML = '<div class="text-muted">Waiting for activity...</div>';
            return;
        }

        logDiv.innerHTML = this.activityLog.map(entry => {
            const color = {
                'success': '#0f0',
                'error': '#f00',
                'warning': '#ff0',
                'info': '#0ff'
            }[entry.type] || '#0f0';

            return `<div style="color: ${color};">[${entry.timestamp}] ${entry.message}</div>`;
        }).join('');
        
        // Scroll to top
        logDiv.scrollTop = 0;
    }

    clearLog() {
        this.activityLog = [];
        this.updateActivityLog();
    }

    formatTime(milliseconds) {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
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

    // Toast notifications
    showError(message) {
        this.showToast(message, 'danger');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showWarning(message) {
        this.showToast(message, 'warning');
    }

    showInfo(message) {
        this.showToast(message, 'info');
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-bg-${type} border-0`;
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
}

// Initialize when page loads
const goblinManager = new GoblinManager();