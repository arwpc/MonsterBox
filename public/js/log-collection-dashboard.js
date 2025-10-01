/**
 * MonsterBox Log Collection Dashboard JavaScript
 * Handles UI interactions for the log collection system
 */

class LogCollectionDashboard {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isPaused = false;
        this.logBuffer = [];
        this.maxLogEntries = 1000;
        this.chart = null;
        this.devices = new Map();
        this.logCounts = { error: 0, warn: 0, info: 0, debug: 0 };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupChart();
        this.loadConfiguration();
        this.loadDevices();
        this.connectWebSocket();
        this.startStatusUpdates();
    }

    setupEventListeners() {
        // Control buttons
        document.getElementById('startCollection').addEventListener('click', () => this.startCollection());
        document.getElementById('pauseCollection').addEventListener('click', () => this.pauseCollection());
        document.getElementById('stopCollection').addEventListener('click', () => this.stopCollection());
        document.getElementById('refreshStatus').addEventListener('click', () => this.refreshStatus());

        // Configuration form
        document.getElementById('configForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });
        document.getElementById('resetConfig').addEventListener('click', () => this.resetConfiguration());

        // Device management
        document.getElementById('addDevice').addEventListener('click', () => this.showAddDeviceModal());
        document.getElementById('scanDevices').addEventListener('click', () => this.scanDevices());
        document.getElementById('saveDevice').addEventListener('click', () => this.saveDevice());

        // Log stream controls
        document.getElementById('pauseStream').addEventListener('click', () => this.toggleStreamPause());
        document.getElementById('clearStream').addEventListener('click', () => this.clearLogStream());
        document.getElementById('exportLogs').addEventListener('click', () => this.exportLogs());

        // Filters
        document.getElementById('filterDevice').addEventListener('change', () => this.applyFilters());
        document.getElementById('filterService').addEventListener('change', () => this.applyFilters());
        document.getElementById('filterLevel').addEventListener('change', () => this.applyFilters());
        document.getElementById('filterText').addEventListener('input', () => this.applyFilters());
    }

    setupChart() {
        const ctx = document.getElementById('logChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Logs per Minute',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    connectWebSocket() {
        try {
            // Use protocol utils for automatic HTTPS/WSS detection
            const wsUrl = window.protocolUtils ?
                window.protocolUtils.getWebSocketUrl(8781) :
                `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8781`;

            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus('Connected', 'healthy');
                console.log('Connected to log aggregation service');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', 'unhealthy');
                console.log('Disconnected from log aggregation service');
                
                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.connectWebSocket(), 5000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('Error', 'unhealthy');
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.updateConnectionStatus('Failed to Connect', 'unhealthy');
        }
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'welcome':
                console.log('Received welcome message:', message);
                break;
            case 'log_entry':
                if (!this.isPaused) {
                    this.addLogEntry(message.data);
                }
                break;
            case 'status_update':
                this.updateStatus(message.data);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    addLogEntry(logEntry) {
        this.logBuffer.push(logEntry);
        
        // Keep buffer size manageable
        if (this.logBuffer.length > this.maxLogEntries) {
            this.logBuffer.shift();
        }

        // Update counters
        this.logCounts[logEntry.level] = (this.logCounts[logEntry.level] || 0) + 1;
        this.updateLogCounts();

        // Add to display if it passes filters
        if (this.passesFilters(logEntry)) {
            this.displayLogEntry(logEntry);
        }

        // Update chart data
        this.updateChart();
    }

    displayLogEntry(logEntry) {
        const logStream = document.getElementById('logStream');
        const logElement = document.createElement('div');
        logElement.className = `log-entry ${logEntry.level}`;
        
        const timestamp = new Date(logEntry.timestamp).toLocaleTimeString();
        logElement.innerHTML = `
            <div class="d-flex justify-content-between">
                <span><strong>[${timestamp}]</strong> ${logEntry.animatronic}/${logEntry.service}</span>
                <span class="badge bg-${this.getLevelColor(logEntry.level)}">${logEntry.level.toUpperCase()}</span>
            </div>
            <div>${logEntry.message}</div>
        `;

        logStream.appendChild(logElement);
        logStream.scrollTop = logStream.scrollHeight;

        // Remove old entries to prevent memory issues
        while (logStream.children.length > 500) {
            logStream.removeChild(logStream.firstChild);
        }
    }

    getLevelColor(level) {
        const colors = {
            error: 'danger',
            warn: 'warning',
            info: 'info',
            debug: 'secondary'
        };
        return colors[level] || 'secondary';
    }

    passesFilters(logEntry) {
        const deviceFilter = document.getElementById('filterDevice').value;
        const serviceFilter = document.getElementById('filterService').value;
        const levelFilter = document.getElementById('filterLevel').value;
        const textFilter = document.getElementById('filterText').value.toLowerCase();

        if (deviceFilter && logEntry.animatronic !== deviceFilter) return false;
        if (serviceFilter && logEntry.service !== serviceFilter) return false;
        if (levelFilter && logEntry.level !== levelFilter) return false;
        if (textFilter && !logEntry.message.toLowerCase().includes(textFilter)) return false;

        return true;
    }

    applyFilters() {
        const logStream = document.getElementById('logStream');
        logStream.innerHTML = '';

        // Re-display filtered logs
        this.logBuffer.forEach(logEntry => {
            if (this.passesFilters(logEntry)) {
                this.displayLogEntry(logEntry);
            }
        });
    }

    updateConnectionStatus(status, health) {
        const statusElement = document.getElementById('collectionStatus');
        statusElement.className = `service-status ${health}`;
        statusElement.innerHTML = `<i class="fas fa-${health === 'healthy' ? 'check-circle' : 'exclamation-triangle'}"></i> ${status}`;
    }

    updateLogCounts() {
        document.getElementById('errorCount').textContent = this.logCounts.error || 0;
        document.getElementById('warningCount').textContent = this.logCounts.warn || 0;
    }

    updateChart() {
        const now = new Date();
        const timeLabel = now.toLocaleTimeString();
        
        // Add new data point
        this.chart.data.labels.push(timeLabel);
        
        // Calculate logs per minute (simplified)
        const recentLogs = this.logBuffer.filter(log => {
            const logTime = new Date(log.timestamp);
            return (now - logTime) < 60000; // Last minute
        });
        
        this.chart.data.datasets[0].data.push(recentLogs.length);

        // Keep only last 20 data points
        if (this.chart.data.labels.length > 20) {
            this.chart.data.labels.shift();
            this.chart.data.datasets[0].data.shift();
        }

        this.chart.update('none');
    }

    async startCollection() {
        try {
            const response = await fetch('/api/log-collection/start', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Log collection started successfully', 'success');
                this.refreshStatus();
            } else {
                this.showAlert('Failed to start log collection: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showAlert('Error starting log collection: ' + error.message, 'danger');
        }
    }

    async pauseCollection() {
        try {
            const response = await fetch('/api/log-collection/pause', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Log collection paused', 'warning');
                this.refreshStatus();
            } else {
                this.showAlert('Failed to pause log collection: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showAlert('Error pausing log collection: ' + error.message, 'danger');
        }
    }

    async stopCollection() {
        try {
            const response = await fetch('/api/log-collection/stop', { method: 'POST' });
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Log collection stopped', 'info');
                this.refreshStatus();
            } else {
                this.showAlert('Failed to stop log collection: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showAlert('Error stopping log collection: ' + error.message, 'danger');
        }
    }

    async refreshStatus() {
        try {
            const response = await fetch('/api/log-collection/status');
            const status = await response.json();
            
            this.updateStatusDisplay(status);
        } catch (error) {
            console.error('Failed to refresh status:', error);
        }
    }

    updateStatusDisplay(status) {
        document.getElementById('activeDevices').querySelector('span').textContent = status.activeDevices || 0;
        document.getElementById('logsPerMinute').querySelector('span').textContent = status.logsPerMinute || 0;
        document.getElementById('storageUsed').querySelector('span').textContent = status.storageUsed || '0 MB';
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/log-collection/config');
            const config = await response.json();
            
            if (config) {
                document.getElementById('collectionInterval').value = config.collectionInterval || 30;
                document.getElementById('bufferSize').value = config.bufferSize || 1000;
                document.getElementById('retentionDays').value = config.retentionDays || 30;
                document.getElementById('compressionEnabled').checked = config.compressionEnabled !== false;
                document.getElementById('errorThreshold').value = config.errorThreshold || 10;
                document.getElementById('warningThreshold').value = config.warningThreshold || 50;
                document.getElementById('alertingEnabled').checked = config.alertingEnabled !== false;
                document.getElementById('emailAlerts').checked = config.emailAlerts === true;
            }
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    async saveConfiguration() {
        const config = {
            collectionInterval: parseInt(document.getElementById('collectionInterval').value),
            bufferSize: parseInt(document.getElementById('bufferSize').value),
            retentionDays: parseInt(document.getElementById('retentionDays').value),
            compressionEnabled: document.getElementById('compressionEnabled').checked,
            errorThreshold: parseInt(document.getElementById('errorThreshold').value),
            warningThreshold: parseInt(document.getElementById('warningThreshold').value),
            alertingEnabled: document.getElementById('alertingEnabled').checked,
            emailAlerts: document.getElementById('emailAlerts').checked
        };

        try {
            const response = await fetch('/api/log-collection/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Configuration saved successfully', 'success');
            } else {
                this.showAlert('Failed to save configuration: ' + result.error, 'danger');
            }
        } catch (error) {
            this.showAlert('Error saving configuration: ' + error.message, 'danger');
        }
    }

    resetConfiguration() {
        if (confirm('Are you sure you want to reset to default configuration?')) {
            document.getElementById('collectionInterval').value = 30;
            document.getElementById('bufferSize').value = 1000;
            document.getElementById('retentionDays').value = 30;
            document.getElementById('compressionEnabled').checked = true;
            document.getElementById('errorThreshold').value = 10;
            document.getElementById('warningThreshold').value = 50;
            document.getElementById('alertingEnabled').checked = true;
            document.getElementById('emailAlerts').checked = false;
        }
    }

    showAddDeviceModal() {
        const modal = new bootstrap.Modal(document.getElementById('addDeviceModal'));
        modal.show();
    }

    async loadDevices() {
        try {
            const response = await fetch('/api/log-collection/devices');
            const devices = await response.json();
            
            this.updateDeviceTable(devices);
            this.updateDeviceFilter(devices);
        } catch (error) {
            console.error('Failed to load devices:', error);
        }
    }

    updateDeviceTable(devices) {
        const tbody = document.getElementById('deviceTable');
        tbody.innerHTML = '';

        devices.forEach(device => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${device.name}</td>
                <td>${device.ip}</td>
                <td><span class="service-status ${device.status}">${device.status}</span></td>
                <td>${device.services.join(', ')}</td>
                <td>${device.lastSeen || 'Never'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="dashboard.testDevice('${device.id}')">
                        <i class="fas fa-check"></i> Test
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="dashboard.removeDevice('${device.id}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateDeviceFilter(devices) {
        const select = document.getElementById('filterDevice');
        select.innerHTML = '<option value="">All Devices</option>';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.name;
            option.textContent = device.name;
            select.appendChild(option);
        });
    }

    toggleStreamPause() {
        this.isPaused = !this.isPaused;
        const button = document.getElementById('pauseStream');
        button.innerHTML = this.isPaused ? 
            '<i class="fas fa-play"></i> Resume' : 
            '<i class="fas fa-pause"></i> Pause';
    }

    clearLogStream() {
        document.getElementById('logStream').innerHTML = '';
        this.logBuffer = [];
        this.logCounts = { error: 0, warn: 0, info: 0, debug: 0 };
        this.updateLogCounts();
    }

    exportLogs() {
        const logs = this.logBuffer.map(log => 
            `[${log.timestamp}] ${log.animatronic}/${log.service} ${log.level.toUpperCase()}: ${log.message}`
        ).join('\n');

        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `monsterbox-logs-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    showAlert(message, type) {
        // Create and show bootstrap alert
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.insertBefore(alertDiv, document.body.firstChild);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }

    startStatusUpdates() {
        // Update status every 30 seconds
        setInterval(() => {
            this.refreshStatus();
        }, 30000);
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new LogCollectionDashboard();
});
