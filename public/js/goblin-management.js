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

            return `
                <div class="col-lg-6 col-xl-4">
                    <div class="card goblin-card ${goblin.status}" data-goblin-id="${goblin.id}" ondblclick="goblinManager.openVideoQueue('${goblin.id}')" style="cursor: pointer;">
                        <div class="card-header d-flex justify-content-between align-items-center py-2">
                            <div>
                                <h6 class="mb-0 d-flex align-items-center">
                                    <div class="heartbeat-indicator ${heartbeatAge < 60 ? 'active' : 'inactive'}"></div>
                                    ${goblin.name}
                                </h6>
                                <small class="text-muted">${goblin.location || goblin.endpoint}</small>
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
                                <button class="btn btn-sm btn-outline-info" onclick="goblinManager.showGoblinDetails('${goblin.id}')" title="View detailed information about this Goblin">
                                    <i class="bi bi-info-circle"></i>
                                </button>

                                ${goblin.status === 'online' ? `
                                    <button class="btn btn-sm btn-outline-success" onclick="goblinManager.testConnection('${goblin.id}')" title="Test network connection to this Goblin">
                                        <i class="bi bi-wifi"></i>
                                    </button>

                                    ${goblin.locked ? `
                                        <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.unlockGoblin('${goblin.id}')" title="Unlock this Goblin for other users">
                                            <i class="bi bi-unlock"></i>
                                        </button>
                                    ` : `
                                        <button class="btn btn-sm btn-outline-secondary" onclick="goblinManager.lockGoblin('${goblin.id}')" title="Lock this Goblin for exclusive control">
                                            <i class="bi bi-lock"></i>
                                        </button>
                                    `}

                                    <button class="btn btn-sm btn-outline-primary" onclick="goblinManager.deployToGoblin('${goblin.id}')" title="Deploy latest code to this Goblin via Facehugger">
                                        <i class="bi bi-broadcast"></i>
                                    </button>

                                    <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.stopGoblinPlayback('${goblin.id}')" title="Stop all media playback on this Goblin">
                                        <i class="bi bi-stop-fill"></i>
                                    </button>
                                ` : `
                                    <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.testConnection('${goblin.id}')" title="Attempt to reconnect to this Goblin">
                                        <i class="bi bi-arrow-clockwise"></i> Reconnect
                                    </button>
                                `}

                                <button class="btn btn-sm btn-outline-danger" onclick="goblinManager.unregisterGoblin('${goblin.id}')" title="Remove this Goblin from the system">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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

        const name = formData.get('name');
        const host = formData.get('host');
        const port = parseInt(formData.get('port') || '3001');

        // Transform frontend form data to backend API format
        const goblinData = {
            goblinId: name.toLowerCase().replace(/\s+/g, '-'),  // Convert name to ID format
            endpoint: `http://${host}:${port}`,                  // Combine host:port into endpoint
            capabilities: capabilities.length > 0 ? capabilities : ['video', 'audio'],  // Default capabilities
            platform: 'unknown',                                 // Will be updated by Goblin on first heartbeat
            version: '1.0.0',
            // Store additional metadata for display purposes
            metadata: {
                name: name,
                location: formData.get('location') || '',
                description: formData.get('description') || ''
            }
        };

        registerBtn.disabled = true;
        statusDiv.style.display = 'block';
        statusDiv.className = 'alert alert-info mt-3';

        try {
            // Check if facehugger mode is enabled
            const autoDeploy = formData.get('autoDeploy');
            const sshPassword = formData.get('sshPassword');

            // Test connection first if requested
            if (formData.get('testConnection')) {
                statusMessage.textContent = 'Testing connection...';

                // Simple connection test using the endpoint
                const testUrl = `${goblinData.endpoint}/health`;
                const testResponse = await fetch(testUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000)
                });

                if (!testResponse.ok) {
                    // Connection failed - check if facehugger mode is enabled
                    if (autoDeploy && sshPassword) {
                        statusMessage.textContent = '👽 Connection failed! Activating FACEHUGGER MODE...';
                        await this.deployWithFacehugger(goblinData, sshPassword);
                        return;
                    } else {
                        throw new Error(`Connection test failed: ${testResponse.status}`);
                    }
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
                statusMessage.textContent = `Successfully registered ${goblinData.metadata.name}!`;

                // Refresh the Goblin list
                await this.loadGoblins();
                this.logActivity(`Registered new Goblin: ${goblinData.metadata.name}`, 'success');

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
        document.getElementById('facehuggerProgress').style.display = 'none';
        document.getElementById('registerBtn').disabled = true;
    }

    async deployWithFacehugger(goblinData, sshPassword) {
        const statusDiv = document.getElementById('registrationStatus');
        const progressDiv = document.getElementById('facehuggerProgress');
        const progressBar = document.getElementById('facehuggerProgressBar');
        const progressStatus = document.getElementById('facehuggerStatus');
        const registerBtn = document.getElementById('registerBtn');

        // Hide status, show progress
        statusDiv.style.display = 'none';
        progressDiv.style.display = 'block';
        registerBtn.disabled = true;

        try {
            // Use EventSource for Server-Sent Events
            const eventSource = new EventSource('/goblin-management/api/deploy-and-register?' + new URLSearchParams({
                goblinData: JSON.stringify(goblinData),
                sshPassword: sshPassword
            }));

            // Actually, we need to use POST for this, so let's use fetch with streaming
            const response = await fetch('/goblin-management/api/deploy-and-register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goblinData, sshPassword })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.substring(6));

                        if (data.progress >= 0) {
                            progressBar.style.width = `${data.progress}%`;
                            progressBar.textContent = `${data.progress}%`;
                            progressStatus.textContent = data.message;
                        }

                        if (data.final) {
                            if (data.success) {
                                progressDiv.style.display = 'none';
                                statusDiv.style.display = 'block';
                                statusDiv.className = 'alert alert-success mt-3';
                                document.getElementById('statusMessage').textContent =
                                    `👽 FACEHUGGER SUCCESS! ${goblinData.metadata.name} deployed and registered!`;

                                await this.loadGoblins();
                                this.logActivity(`👽 Facehugger deployed: ${goblinData.metadata.name}`, 'success');

                                setTimeout(() => {
                                    bootstrap.Modal.getInstance(document.getElementById('registerGoblinModal')).hide();
                                    this.resetRegistrationForm();
                                }, 3000);
                            } else {
                                throw new Error(data.error || 'Deployment failed');
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Facehugger deployment error:', error);
            progressDiv.style.display = 'none';
            statusDiv.style.display = 'block';
            statusDiv.className = 'alert alert-danger mt-3';
            document.getElementById('statusMessage').textContent =
                `👽 FACEHUGGER FAILED: ${error.message}`;
        } finally {
            registerBtn.disabled = false;
        }
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
Online: ${stats.online} (${((stats.online / stats.total) * 100).toFixed(1)}%)
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

    // Video Queue Management
    async openVideoQueue(goblinId) {
        const goblin = this.goblins.find(g => g.id === goblinId);
        if (!goblin) {
            this.showError('Goblin not found');
            return;
        }

        if (goblin.status !== 'online') {
            this.showWarning('Goblin must be online to manage video queue');
            return;
        }

        // Store current goblin for queue operations
        this.currentQueueGoblin = goblin;

        // Load queue status and available videos
        await this.loadVideoQueue(goblin);
        await this.loadGoblinVideos(goblin);
        await this.updatePlaybackStatus();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('videoQueueModal'));
        modal.show();

        // Set up auto-refresh for playback status and queue while modal is open
        this.playbackStatusInterval = setInterval(async () => {
            await this.updatePlaybackStatus();
            await this.loadVideoQueue(this.currentQueueGoblin);
        }, 2000); // Update every 2 seconds

        // Clear interval when modal is closed
        document.getElementById('videoQueueModal').addEventListener('hidden.bs.modal', () => {
            if (this.playbackStatusInterval) {
                clearInterval(this.playbackStatusInterval);
                this.playbackStatusInterval = null;
            }
        }, { once: true });
    }

    // Helper to transform API queue response to frontend format
    transformQueueData(data) {
        if (!data || !data.success) {
            return {
                queue: [],
                priorityQueue: [],
                running: false,
                mode: 'none',
                currentVideo: null
            };
        }

        return {
            queue: data.queue?.videos || [],
            priorityQueue: [], // Not implemented in current API
            running: data.queue?.playing || false,
            mode: data.queue?.loopMode || 'none',
            currentVideo: data.currentVideo || null
        };
    }

    async loadVideoQueue(goblin) {
        try {
            const response = await fetch(`${goblin.endpoint}/queue`);
            const data = await response.json();

            if (data.success) {
                this.currentQueue = this.transformQueueData(data);
                this.renderVideoQueue();
            } else {
                this.showError('Failed to load video queue');
            }
        } catch (error) {
            console.error('Error loading video queue:', error);
            this.showError('Error loading video queue: ' + error.message);
        }
    }

    async loadGoblinVideos(goblin) {
        try {
            const response = await fetch(`${goblin.endpoint}/media`);
            const data = await response.json();

            if (data.success) {
                // Handle both old format (data.media.video) and new format (data.videos)
                this.goblinVideos = data.videos || data.media?.video || [];
                this.renderAvailableVideos();
            } else {
                this.goblinVideos = [];
                this.renderAvailableVideos();
            }
        } catch (error) {
            console.error('Error loading goblin videos:', error);
            this.goblinVideos = [];
            this.renderAvailableVideos();
        }
    }

    async updatePlaybackStatus() {
        if (!this.currentQueueGoblin) return;

        try {
            // Try the new endpoint first, fall back to /status
            let response = await fetch(`${this.currentQueueGoblin.endpoint}/playback-status`);
            let data;

            if (!response.ok) {
                // Fall back to /status endpoint
                response = await fetch(`${this.currentQueueGoblin.endpoint}/status`);
                data = await response.json();

                // Transform /status response to match expected format
                if (data.success) {
                    data.performance = {
                        cpu: { usage: data.status?.system?.loadAvg?.[0] * 100 / 4 || 0 },
                        memory: { percent: data.status?.system?.memoryUsage?.percent || 0 },
                        temperature: { current: data.status?.system?.temperature || 0 },
                        uptime: data.status?.system?.uptime || 0
                    };
                }
            } else {
                data = await response.json();
            }

            if (data.success) {
                this.renderPlaybackStatus(data);
            }
        } catch (error) {
            console.error('Error fetching playback status:', error);
        }
    }

    renderPlaybackStatus(data) {
        const card = document.getElementById('currentlyPlayingCard');
        const header = document.getElementById('currentlyPlayingHeader');
        const content = document.getElementById('currentlyPlayingContent');

        // Always show the card
        card.style.display = 'block';

        // Check if anything is playing
        const isPlaying = data.playback?.video?.playing || data.queue?.currentVideo;
        const currentFile = data.queue?.currentVideo || data.playback?.video?.file || null;
        const queueMode = data.queue?.mode || 'sequential';
        const queueRunning = data.queue?.running || false;

        // If nothing is playing, show idle state
        if (!isPlaying && !currentFile) {
            header.className = 'card-header bg-secondary text-white';
            content.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="bi bi-pause-circle" style="font-size: 3rem;"></i>
                    <p class="mb-0 mt-2">No video playing</p>
                    <small>Click the Play button on any video to start playback</small>
                </div>
            `;
            return;
        }

        // Set header color based on playback state
        header.className = queueRunning ? 'card-header bg-success text-white' : 'card-header bg-warning text-dark';

        // Performance metrics
        const cpu = data.performance?.cpu?.usage || 0;
        const memory = data.performance?.memory?.percent || 0;
        const temp = data.performance?.temperature?.current || 0;
        const uptime = data.performance?.uptime || 0;

        // Format uptime
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const uptimeStr = `${hours}h ${minutes}m`;

        // Performance status colors
        const cpuClass = cpu > 80 ? 'danger' : cpu > 60 ? 'warning' : 'success';
        const memClass = memory > 80 ? 'danger' : memory > 60 ? 'warning' : 'success';
        const tempClass = temp > 70 ? 'danger' : temp > 60 ? 'warning' : 'success';

        content.innerHTML = `
            <div class="mb-3">
                <h6 class="mb-2"><i class="bi bi-film"></i> ${currentFile}</h6>
                <div class="d-flex gap-2">
                    <span class="badge bg-${queueRunning ? 'success' : 'secondary'}">
                        ${queueRunning ? '▶️ Playing' : '⏸️ Paused'}
                    </span>
                    <span class="badge bg-info">${queueMode}</span>
                </div>
            </div>

            <div class="row g-2 small">
                <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span>CPU:</span>
                        <span class="badge bg-${cpuClass}">${cpu.toFixed(1)}%</span>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar bg-${cpuClass}" style="width: ${cpu}%"></div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span>Memory:</span>
                        <span class="badge bg-${memClass}">${memory.toFixed(1)}%</span>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar bg-${memClass}" style="width: ${memory}%"></div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span>Temp:</span>
                        <span class="badge bg-${tempClass}">${temp.toFixed(1)}°C</span>
                    </div>
                    <div class="progress" style="height: 8px;">
                        <div class="progress-bar bg-${tempClass}" style="width: ${Math.min(temp, 100)}%"></div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="d-flex justify-content-between align-items-center">
                        <span>Uptime:</span>
                        <span class="badge bg-secondary">${uptimeStr}</span>
                    </div>
                </div>
            </div>
        `;
    }

    renderVideoQueue() {
        const queueList = document.getElementById('videoQueueList');
        const queueStatus = document.getElementById('queueStatus');

        if (!this.currentQueue) {
            queueList.innerHTML = '<div class="text-muted">Loading...</div>';
            return;
        }

        // Update status
        queueStatus.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span><strong>Status:</strong> ${this.currentQueue.running ? '▶️ Running' : '⏸️ Stopped'}</span>
                <span><strong>Mode:</strong> ${this.currentQueue.mode}</span>
            </div>
            ${this.currentQueue.currentVideo ? `
                <div class="alert alert-info py-2 mb-2">
                    <strong>Now Playing:</strong> ${this.currentQueue.currentVideo}
                </div>
            ` : ''}
        `;

        // Render queue
        if (this.currentQueue.queue.length === 0 && this.currentQueue.priorityQueue.length === 0) {
            queueList.innerHTML = '<div class="text-muted text-center py-3">Queue is empty</div>';
            return;
        }

        let html = '';

        // Priority queue
        if (this.currentQueue.priorityQueue.length > 0) {
            html += '<div class="mb-3"><h6 class="text-warning">⚡ Priority Queue</h6>';
            this.currentQueue.priorityQueue.forEach((item, index) => {
                html += this.renderQueueItem(item, index, true);
            });
            html += '</div>';
        }

        // Regular queue
        if (this.currentQueue.queue.length > 0) {
            html += '<div><h6>📋 Queue</h6>';
            this.currentQueue.queue.forEach((item, index) => {
                html += this.renderQueueItem(item, index, false);
            });
            html += '</div>';
        }

        queueList.innerHTML = html;
    }

    renderQueueItem(item, index, isPriority) {
        return `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <span class="badge bg-secondary me-2">${index + 1}</span>
                    <span>${item.filename}</span>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="goblinManager.removeFromQueue(${index}, ${isPriority})" title="Remove this video from the queue">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `;
    }

    renderAvailableVideos() {
        const videoList = document.getElementById('availableVideosList');

        if (!this.goblinVideos || this.goblinVideos.length === 0) {
            videoList.innerHTML = '<div class="text-muted text-center py-3">No videos available on this Goblin</div>';
            return;
        }

        videoList.innerHTML = this.goblinVideos.map(video => {
            // Handle both string filenames (legacy) and video objects (new format)
            const filename = typeof video === 'string' ? video : video.filename;
            const fileSize = video.size ? this.formatFileSize(video.size) : '';
            const resolution = video.resolution || '';
            const fps = video.fps || '';
            const duration = video.duration ? this.formatDuration(video.duration) : '';

            // Build resolution/fps badge
            let resolutionBadge = '';
            if (resolution && resolution !== 'unknown') {
                const resClass = this.getResolutionClass(resolution);
                resolutionBadge = `<span class="badge ${resClass} me-1">${resolution}${fps ? '@' + fps + 'fps' : ''}</span>`;
            }

            return `
                <div class="list-group-item p-2">
                    <div class="d-flex align-items-start">
                        <!-- Thumbnail -->
                        <div class="flex-shrink-0 me-3 d-flex align-items-center justify-content-center rounded"
                             style="width: 120px; height: 90px; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border: 1px solid #444;">
                            <i class="bi bi-film" style="font-size: 2.5rem; color: #666;"></i>
                        </div>

                        <!-- Video Info -->
                        <div class="flex-grow-1 min-width-0">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                                <div class="text-truncate me-2" style="max-width: 400px;">
                                    <strong>${filename}</strong>
                                </div>
                                <div class="flex-shrink-0 btn-group">
                                    <button class="btn btn-sm btn-success" onclick="goblinManager.playNow('${filename.replace(/'/g, "\\'")}')" title="Stop current playback and play this video immediately">
                                        <i class="bi bi-play-fill"></i> Play
                                    </button>
                                    <button class="btn btn-sm btn-outline-primary" onclick="goblinManager.addToQueue('${filename.replace(/'/g, "\\'")}')" title="Add this video to the end of the queue">
                                        <i class="bi bi-plus"></i> Add
                                    </button>
                                    <button class="btn btn-sm btn-outline-warning" onclick="goblinManager.addToQueue('${filename.replace(/'/g, "\\'")}', true)" title="Add this video to priority queue (plays next)">
                                        <i class="bi bi-lightning"></i> Priority
                                    </button>
                                </div>
                            </div>
                            <div class="small text-muted">
                                ${resolutionBadge}
                                ${fileSize ? `<span class="me-2">${fileSize}</span>` : ''}
                                ${duration ? `<span class="me-2"><i class="bi bi-clock"></i> ${duration}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    getResolutionClass(resolution) {
        // Color code based on resolution for easy identification
        const [width] = resolution.split('x').map(Number);
        if (width <= 720) return 'bg-success'; // Green for 720p and below (good for Goblins)
        if (width <= 1080) return 'bg-warning'; // Yellow for 1080p (may need conversion)
        return 'bg-danger'; // Red for higher (needs conversion)
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    async playNow(filename) {
        try {
            // Stop current queue
            await fetch(`${this.currentQueueGoblin.endpoint}/queue/stop`, {
                method: 'POST'
            });

            // Clear queue
            await fetch(`${this.currentQueueGoblin.endpoint}/queue/clear`, {
                method: 'POST'
            });

            // Add video to priority queue
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/enqueue-priority`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });

            const data = await response.json();

            if (data.success) {
                // Start queue in sequential mode
                const startResponse = await fetch(`${this.currentQueueGoblin.endpoint}/queue/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        videos: [filename],
                        mode: 'sequential'
                    })
                });

                const startData = await startResponse.json();

                if (startData.success) {
                    await this.loadVideoQueue(this.currentQueueGoblin);
                    await this.updatePlaybackStatus();
                    this.showSuccess(`Now playing: ${filename}`);
                } else {
                    this.showError('Failed to start playback');
                }
            } else {
                this.showError('Failed to queue video');
            }
        } catch (error) {
            console.error('Error playing video:', error);
            this.showError('Error playing video: ' + error.message);
        }
    }

    async addToQueue(filename, priority = false) {
        const endpoint = priority ? '/queue/enqueue-priority' : '/queue/enqueue';

        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                this.showSuccess(`Added ${filename} to ${priority ? 'priority ' : ''}queue`);
            } else {
                this.showError('Failed to add video to queue');
            }
        } catch (error) {
            console.error('Error adding to queue:', error);
            this.showError('Error adding to queue: ' + error.message);
        }
    }

    async removeFromQueue(index, isPriority) {
        // Note: This requires implementing a remove endpoint on the Goblin
        this.showWarning('Remove from queue not yet implemented');
    }

    async startQueue(mode = 'sequential') {
        if (!this.currentQueue || !this.currentQueue.queue || this.currentQueue.queue.length === 0) {
            this.showWarning('Queue is empty. Add videos first.');
            return;
        }

        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videos: this.currentQueue.queue.map(item => item.filename),
                    mode
                })
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                await this.updatePlaybackStatus();
                this.showSuccess('Queue started');
            } else {
                this.showError('Failed to start queue');
            }
        } catch (error) {
            console.error('Error starting queue:', error);
            this.showError('Error starting queue: ' + error.message);
        }
    }

    async pauseQueue() {
        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/pause`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                this.showSuccess('Queue paused');
            }
        } catch (error) {
            this.showError('Error pausing queue: ' + error.message);
        }
    }

    async resumeQueue() {
        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/resume`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                await this.updatePlaybackStatus();
                this.showSuccess('Queue resumed');
            } else {
                this.showError('Failed to resume queue');
            }
        } catch (error) {
            console.error('Error resuming queue:', error);
            this.showError('Error resuming queue: ' + error.message);
        }
    }

    async skipVideo() {
        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/skip`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                this.showSuccess('Skipped to next video');
            }
        } catch (error) {
            this.showError('Error skipping video: ' + error.message);
        }
    }

    async stopQueue() {
        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/stop`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                this.showSuccess('Queue stopped');
            }
        } catch (error) {
            this.showError('Error stopping queue: ' + error.message);
        }
    }

    async clearQueue() {
        if (!confirm('Clear all videos from queue?')) return;

        try {
            const response = await fetch(`${this.currentQueueGoblin.endpoint}/queue/clear`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                await this.loadVideoQueue(this.currentQueueGoblin);
                this.showSuccess('Queue cleared');
            }
        } catch (error) {
            this.showError('Error clearing queue: ' + error.message);
        }
    }

    async refreshQueue() {
        if (this.currentQueueGoblin) {
            await this.loadVideoQueue(this.currentQueueGoblin);
            await this.updatePlaybackStatus();
        }
    }
}

// Initialize when page loads
const goblinManager = new GoblinManager();