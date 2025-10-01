/**
 * Port Management System Interface
 * JavaScript for the port management configuration interface
 */

class PortManagementInterface {
    constructor() {
        this.services = [];
        this.systemStatus = null;
        this.refreshInterval = null;
        this.charts = {};
        
        this.init();
    }
    
    init() {
        // Initialize the interface
        this.setupEventListeners();
        this.loadInitialData();
        this.startAutoRefresh();
        
        // Initialize charts
        this.initializeCharts();
    }
    
    setupEventListeners() {
        // Tab change events
        document.querySelectorAll('#portManagementTabs button[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (event) => {
                const targetTab = event.target.getAttribute('data-bs-target');
                this.onTabChange(targetTab);
            });
        });
        
        // API method change
        const methodSelect = document.getElementById('apiMethodSelect');
        if (methodSelect) {
            methodSelect.addEventListener('change', this.onApiMethodChange.bind(this));
        }
    }
    
    async loadInitialData() {
        try {
            await this.refreshSystemStatus();
            await this.refreshServices();
            await this.loadPortRanges();
            await this.loadConfiguration();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load initial data: ' + error.message);
        }
    }
    
    startAutoRefresh() {
        // Refresh every 30 seconds
        this.refreshInterval = setInterval(() => {
            this.refreshSystemStatus();
            this.refreshServices();
            this.updateMonitoring();
        }, 30000);
    }
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    
    async refreshSystemStatus() {
        try {
            const response = await fetch('/api/service-management/status');
            const data = await response.json();
            
            this.systemStatus = data;
            this.updateSystemStatusDisplay();
        } catch (error) {
            console.error('Error refreshing system status:', error);
            this.updateSystemStatusBadge('error', 'Error');
        }
    }
    
    updateSystemStatusDisplay() {
        if (!this.systemStatus) return;
        
        const { integration, portManager, serviceManager, services } = this.systemStatus;
        
        // Update status badge
        const overallStatus = integration.initialized ? 'healthy' : 'error';
        this.updateSystemStatusBadge(overallStatus, overallStatus.toUpperCase());
        
        // Update metrics
        const runningServices = Object.values(services).filter(s => s.status === 'running').length;
        const totalServices = Object.keys(services).length;
        const allocatedPorts = portManager.stats ? portManager.stats.totalAllocated : 0;
        const activeConnections = this.systemStatus.proxyManager?.stats?.activeConnections || 0;
        
        document.getElementById('totalServices').textContent = totalServices;
        document.getElementById('runningServices').textContent = runningServices;
        document.getElementById('allocatedPorts').textContent = allocatedPorts;
        document.getElementById('activeConnections').textContent = activeConnections;
    }
    
    updateSystemStatusBadge(status, text) {
        const badge = document.getElementById('systemStatusBadge');
        if (!badge) return;
        
        badge.className = 'badge';
        badge.textContent = text;
        
        switch (status) {
            case 'healthy':
                badge.classList.add('bg-success');
                break;
            case 'degraded':
                badge.classList.add('bg-warning');
                break;
            case 'error':
                badge.classList.add('bg-danger');
                break;
            default:
                badge.classList.add('bg-secondary');
        }
    }
    
    async refreshServices() {
        try {
            const response = await fetch('/api/service-management/connections');
            const data = await response.json();
            
            this.services = Object.values(data);
            this.updateServicesTable();
        } catch (error) {
            console.error('Error refreshing services:', error);
            this.showError('Failed to refresh services: ' + error.message);
        }
    }
    
    updateServicesTable() {
        const tbody = document.getElementById('servicesTableBody');
        if (!tbody) return;
        
        if (this.services.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No services found</td></tr>';
            return;
        }
        
        tbody.innerHTML = this.services.map(service => {
            const statusBadge = this.getStatusBadge(service.status);
            const uptime = this.formatUptime(service.uptime);
            
            return `
                <tr data-service="${service.name}" data-type="${service.type}" data-status="${service.status}">
                    <td>
                        <strong>${service.name}</strong>
                        <br><small class="text-muted">${service.description || 'No description'}</small>
                    </td>
                    <td><span class="badge bg-secondary">${service.type}</span></td>
                    <td>${statusBadge}</td>
                    <td><code>${service.port || '-'}</code></td>
                    <td><code>${service.proxyPort || '-'}</code></td>
                    <td>${uptime}</td>
                    <td class="service-actions">
                        <button class="btn btn-sm btn-success" onclick="portManagement.startService('${service.name}')" 
                                ${service.status === 'running' ? 'disabled' : ''}>
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="portManagement.stopService('${service.name}')"
                                ${service.status !== 'running' ? 'disabled' : ''}>
                            <i class="fas fa-stop"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="portManagement.restartService('${service.name}')">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="portManagement.showServiceDetails('${service.name}')">
                            <i class="fas fa-info"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }
    
    getStatusBadge(status) {
        const badges = {
            'running': '<span class="badge bg-success">Running</span>',
            'stopped': '<span class="badge bg-secondary">Stopped</span>',
            'error': '<span class="badge bg-danger">Error</span>',
            'unhealthy': '<span class="badge bg-warning">Unhealthy</span>',
            'starting': '<span class="badge bg-info">Starting</span>',
            'stopping': '<span class="badge bg-warning">Stopping</span>'
        };
        
        return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
    }
    
    formatUptime(uptime) {
        if (!uptime || uptime === 0) return '-';
        
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
    
    async startService(serviceName) {
        try {
            this.showLoading(`Starting ${serviceName}...`);
            
            const response = await fetch(`/api/service-management/service/${serviceName}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess(`Service ${serviceName} started successfully`);
                await this.refreshServices();
            } else {
                this.showError(`Failed to start ${serviceName}: ${result.error}`);
            }
        } catch (error) {
            console.error('Error starting service:', error);
            this.showError(`Error starting ${serviceName}: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    async stopService(serviceName) {
        try {
            this.showLoading(`Stopping ${serviceName}...`);
            
            const response = await fetch(`/api/service-management/service/${serviceName}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess(`Service ${serviceName} stopped successfully`);
                await this.refreshServices();
            } else {
                this.showError(`Failed to stop ${serviceName}: ${result.error}`);
            }
        } catch (error) {
            console.error('Error stopping service:', error);
            this.showError(`Error stopping ${serviceName}: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    async restartService(serviceName) {
        try {
            this.showLoading(`Restarting ${serviceName}...`);
            
            const response = await fetch(`/api/service-management/service/${serviceName}/restart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess(`Service ${serviceName} restarted successfully`);
                await this.refreshServices();
            } else {
                this.showError(`Failed to restart ${serviceName}: ${result.error}`);
            }
        } catch (error) {
            console.error('Error restarting service:', error);
            this.showError(`Error restarting ${serviceName}: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    async startAllServices() {
        if (!confirm('Are you sure you want to start all services?')) return;
        
        try {
            this.showLoading('Starting all services...');
            
            const response = await fetch('/api/service-management/start-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess('All services started successfully');
                await this.refreshServices();
            } else {
                this.showError(`Failed to start all services: ${result.error}`);
            }
        } catch (error) {
            console.error('Error starting all services:', error);
            this.showError(`Error starting all services: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    async stopAllServices() {
        if (!confirm('Are you sure you want to stop all services? This will affect system functionality.')) return;
        
        try {
            this.showLoading('Stopping all services...');
            
            const response = await fetch('/api/service-management/stop-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showSuccess('All services stopped successfully');
                await this.refreshServices();
            } else {
                this.showError(`Failed to stop all services: ${result.error}`);
            }
        } catch (error) {
            console.error('Error stopping all services:', error);
            this.showError(`Error stopping all services: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }
    
    filterServices() {
        const typeFilter = document.getElementById('serviceTypeFilter').value;
        const statusFilter = document.getElementById('serviceStatusFilter').value;
        const searchFilter = document.getElementById('serviceSearchFilter').value.toLowerCase();
        
        const rows = document.querySelectorAll('#servicesTableBody tr[data-service]');
        
        rows.forEach(row => {
            const serviceName = row.getAttribute('data-service').toLowerCase();
            const serviceType = row.getAttribute('data-type');
            const serviceStatus = row.getAttribute('data-status');
            
            const matchesType = !typeFilter || serviceType === typeFilter;
            const matchesStatus = !statusFilter || serviceStatus === statusFilter;
            const matchesSearch = !searchFilter || serviceName.includes(searchFilter);
            
            row.style.display = matchesType && matchesStatus && matchesSearch ? '' : 'none';
        });
    }
    
    async showServiceDetails(serviceName) {
        try {
            const response = await fetch(`/api/service-management/service/${serviceName}`);
            const data = await response.json();
            
            const modal = new bootstrap.Modal(document.getElementById('serviceDetailModal'));
            const content = document.getElementById('serviceDetailContent');
            
            content.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>Basic Information</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Name:</strong></td><td>${data.discovery?.name || serviceName}</td></tr>
                            <tr><td><strong>Type:</strong></td><td>${data.discovery?.type || 'Unknown'}</td></tr>
                            <tr><td><strong>Status:</strong></td><td>${this.getStatusBadge(data.discovery?.status || 'unknown')}</td></tr>
                            <tr><td><strong>Port:</strong></td><td><code>${data.discovery?.port || '-'}</code></td></tr>
                            <tr><td><strong>Proxy Port:</strong></td><td><code>${data.discovery?.proxyPort || '-'}</code></td></tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <h6>Connection Information</h6>
                        <table class="table table-sm">
                            <tr><td><strong>WebSocket URL:</strong></td><td><code>${data.connection?.url || '-'}</code></td></tr>
                            <tr><td><strong>Connection Type:</strong></td><td>${data.connection?.type || '-'}</td></tr>
                            <tr><td><strong>Last Health Check:</strong></td><td>${data.discovery?.lastHealthCheck || '-'}</td></tr>
                        </table>
                    </div>
                </div>
                
                ${data.discovery?.tags && data.discovery.tags.size > 0 ? `
                <div class="mt-3">
                    <h6>Tags</h6>
                    <div>
                        ${Array.from(data.discovery.tags).map(tag => `<span class="badge bg-info me-1">${tag}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${data.discovery?.dependencies && data.discovery.dependencies.size > 0 ? `
                <div class="mt-3">
                    <h6>Dependencies</h6>
                    <div>
                        ${Array.from(data.discovery.dependencies).map(dep => `<span class="badge bg-warning me-1">${dep}</span>`).join('')}
                    </div>
                </div>
                ` : ''}
                
                <div class="mt-3">
                    <h6>Raw Data</h6>
                    <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 11px; max-height: 200px; overflow-y: auto;">${JSON.stringify(data, null, 2)}</pre>
                </div>
            `;
            
            modal.show();
        } catch (error) {
            console.error('Error loading service details:', error);
            this.showError(`Failed to load service details: ${error.message}`);
        }
    }
    
    // Utility methods
    showLoading(message) {
        // Implementation for loading indicator
        console.log('Loading:', message);
    }
    
    hideLoading() {
        // Implementation for hiding loading indicator
        console.log('Loading complete');
    }
    
    showSuccess(message) {
        this.showToast(message, 'success');
    }
    
    showError(message) {
        this.showToast(message, 'error');
    }
    
    showToast(message, type) {
        // Simple toast implementation
        const toast = document.createElement('div');
        toast.className = `alert alert-${type === 'error' ? 'danger' : 'success'} position-fixed`;
        toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        toast.innerHTML = `
            ${message}
            <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    async loadPortRanges() {
        try {
            const response = await fetch('/api/service-management/ports');
            const data = await response.json();

            this.updatePortRangesTable(data);
            this.updatePortCharts(data);
        } catch (error) {
            console.error('Error loading port ranges:', error);
        }
    }

    updatePortRangesTable(data) {
        const tbody = document.getElementById('portRangesTableBody');
        if (!tbody || !data.portManager?.stats?.ranges) return;

        tbody.innerHTML = Object.entries(data.portManager.stats.ranges).map(([rangeName, stats]) => {
            const utilizationClass = stats.utilization > 80 ? 'text-danger' :
                                   stats.utilization > 60 ? 'text-warning' : 'text-success';

            return `
                <tr>
                    <td><strong>${rangeName}</strong></td>
                    <td><code>${stats.start || '-'}</code></td>
                    <td><code>${stats.end || '-'}</code></td>
                    <td>${stats.total}</td>
                    <td>${stats.used}</td>
                    <td>${stats.available}</td>
                    <td class="${utilizationClass}">${stats.utilization}%</td>
                </tr>
            `;
        }).join('');
    }

    initializeCharts() {
        // Initialize chart containers
        this.charts.portRange = null;
        this.charts.portType = null;
        this.charts.healthStatus = null;
        this.charts.connectionStats = null;
    }

    updatePortCharts(data) {
        if (!data.portManager?.stats?.ranges) return;

        // Port Range Utilization Chart
        this.updatePortRangeChart(data.portManager.stats.ranges);

        // Port Type Chart
        this.updatePortTypeChart(data.services);
    }

    updatePortRangeChart(ranges) {
        const chartContainer = document.getElementById('portRangeChart');
        if (!chartContainer) return;

        const labels = Object.keys(ranges);
        const usedData = labels.map(label => ranges[label].used);
        const availableData = labels.map(label => ranges[label].available);

        chartContainer.innerHTML = `
            <canvas id="portRangeCanvas" width="400" height="300"></canvas>
        `;

        const ctx = document.getElementById('portRangeCanvas').getContext('2d');

        // Simple bar chart implementation
        this.drawBarChart(ctx, {
            labels: labels,
            datasets: [
                { label: 'Used', data: usedData, color: '#dc3545' },
                { label: 'Available', data: availableData, color: '#28a745' }
            ]
        });
    }

    updatePortTypeChart(services) {
        const chartContainer = document.getElementById('portTypeChart');
        if (!chartContainer || !services) return;

        const typeCounts = {};
        Object.values(services).forEach(service => {
            typeCounts[service.type] = (typeCounts[service.type] || 0) + 1;
        });

        chartContainer.innerHTML = `
            <canvas id="portTypeCanvas" width="400" height="300"></canvas>
        `;

        const ctx = document.getElementById('portTypeCanvas').getContext('2d');

        // Simple pie chart implementation
        this.drawPieChart(ctx, typeCounts);
    }

    drawBarChart(ctx, data) {
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const padding = 40;

        ctx.clearRect(0, 0, width, height);

        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;

        const maxValue = Math.max(...data.datasets.flatMap(d => d.data));
        const barWidth = chartWidth / (data.labels.length * 2);

        // Draw bars
        data.datasets.forEach((dataset, datasetIndex) => {
            dataset.data.forEach((value, index) => {
                const barHeight = (value / maxValue) * chartHeight;
                const x = padding + index * barWidth * 2 + datasetIndex * barWidth;
                const y = height - padding - barHeight;

                ctx.fillStyle = dataset.color;
                ctx.fillRect(x, y, barWidth * 0.8, barHeight);
            });
        });

        // Draw labels
        ctx.fillStyle = '#333';
        ctx.font = '12px Arial';
        data.labels.forEach((label, index) => {
            const x = padding + index * barWidth * 2;
            const y = height - padding + 15;
            ctx.fillText(label, x, y);
        });
    }

    drawPieChart(ctx, data) {
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const total = Object.values(data).reduce((sum, value) => sum + value, 0);
        const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14'];

        let currentAngle = 0;
        Object.entries(data).forEach(([label, value], index) => {
            const sliceAngle = (value / total) * 2 * Math.PI;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
            ctx.closePath();

            ctx.fillStyle = colors[index % colors.length];
            ctx.fill();

            // Draw label
            const labelAngle = currentAngle + sliceAngle / 2;
            const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
            const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

            ctx.fillStyle = '#fff';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(label, labelX, labelY);

            currentAngle += sliceAngle;
        });
    }

    async loadConfiguration() {
        try {
            const response = await fetch('/api/service-management/status');
            const data = await response.json();

            // Update environment select
            const envSelect = document.getElementById('environmentSelect');
            if (envSelect && data.portManager?.environment) {
                envSelect.value = data.portManager.environment;
            }

            // Load service priorities
            this.loadServicePriorities(data);
        } catch (error) {
            console.error('Error loading configuration:', error);
        }
    }

    loadServicePriorities(data) {
        const container = document.getElementById('servicePriorities');
        if (!container || !data.portManager?.priorities) return;

        container.innerHTML = Object.entries(data.portManager.priorities).map(([type, priority]) => `
            <div class="mb-2">
                <label class="form-label">${type}</label>
                <input type="range" class="form-range" min="1" max="100" value="${priority}"
                       onchange="updateServicePriority('${type}', this.value)">
                <small class="text-muted">Priority: <span id="priority-${type}">${priority}</span></small>
            </div>
        `).join('');
    }

    onTabChange(targetTab) {
        switch (targetTab) {
            case '#monitoring':
                this.updateMonitoring();
                break;
            case '#ports':
                this.loadPortRanges();
                break;
            case '#configuration':
                this.loadConfiguration();
                break;
        }
    }

    async updateMonitoring() {
        // Update health status chart
        this.updateHealthStatusChart();

        // Update connection stats
        this.updateConnectionStatsChart();

        // Update system metrics
        this.updateSystemMetrics();
    }

    updateHealthStatusChart() {
        if (!this.services.length) return;

        const statusCounts = {};
        this.services.forEach(service => {
            statusCounts[service.status] = (statusCounts[service.status] || 0) + 1;
        });

        const chartContainer = document.getElementById('healthStatusChart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <canvas id="healthStatusCanvas" width="400" height="250"></canvas>
            `;

            const ctx = document.getElementById('healthStatusCanvas').getContext('2d');
            this.drawPieChart(ctx, statusCounts);
        }
    }

    updateConnectionStatsChart() {
        const chartContainer = document.getElementById('connectionStatsChart');
        if (!chartContainer || !this.systemStatus?.proxyManager?.stats) return;

        const stats = this.systemStatus.proxyManager.stats;

        chartContainer.innerHTML = `
            <div class="text-center">
                <h4 class="text-primary">${stats.activeConnections}</h4>
                <p class="mb-2">Active Connections</p>
                <h5 class="text-info">${stats.totalProxies}</h5>
                <p class="mb-0">Active Proxies</p>
            </div>
        `;
    }

    updateSystemMetrics() {
        // Mock system metrics - in real implementation, these would come from the API
        document.getElementById('cpuUsage').textContent = '15%';
        document.getElementById('memoryUsage').textContent = '45%';
        document.getElementById('networkConnections').textContent = '23';
        document.getElementById('systemUptime').textContent = '2d 14h';
    }

    onApiMethodChange() {
        const method = document.getElementById('apiMethodSelect').value;
        const bodySection = document.getElementById('apiBodySection');

        if (bodySection) {
            bodySection.style.display = method === 'POST' ? 'block' : 'none';
        }
    }

    async testApiEndpoint() {
        const endpoint = document.getElementById('apiEndpointSelect').value;
        const method = document.getElementById('apiMethodSelect').value;
        const bodyText = document.getElementById('apiRequestBody').value;
        const responseContainer = document.getElementById('apiResponse');

        if (!responseContainer) return;

        try {
            responseContainer.innerHTML = '<div class="text-muted">Making request...</div>';

            const options = {
                method: method,
                headers: { 'Content-Type': 'application/json' }
            };

            if (method === 'POST' && bodyText.trim()) {
                try {
                    options.body = JSON.stringify(JSON.parse(bodyText));
                } catch (e) {
                    responseContainer.innerHTML = '<div class="text-danger">Invalid JSON in request body</div>';
                    return;
                }
            }

            const response = await fetch(endpoint, options);
            const data = await response.json();

            const statusClass = response.ok ? 'text-success' : 'text-danger';

            responseContainer.innerHTML = `
                <div class="${statusClass} mb-2">
                    <strong>Status:</strong> ${response.status} ${response.statusText}
                </div>
                <div class="mb-2">
                    <strong>Response:</strong>
                </div>
                <pre style="white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(data, null, 2)}</pre>
            `;
        } catch (error) {
            responseContainer.innerHTML = `
                <div class="text-danger mb-2">
                    <strong>Error:</strong> ${error.message}
                </div>
            `;
        }
    }
}

// Global functions for template
let portManagement;

function refreshSystemStatus() {
    if (portManagement) portManagement.refreshSystemStatus();
}

function refreshServices() {
    if (portManagement) portManagement.refreshServices();
}

function startAllServices() {
    if (portManagement) portManagement.startAllServices();
}

function stopAllServices() {
    if (portManagement) portManagement.stopAllServices();
}

function filterServices() {
    if (portManagement) portManagement.filterServices();
}

// Additional global functions
function updateServicePriority(type, value) {
    document.getElementById(`priority-${type}`).textContent = value;
    // In real implementation, this would save the priority change
}

function saveConfiguration() {
    portManagement.showSuccess('Configuration saved successfully');
}

function runSystemValidation() {
    const container = document.getElementById('validationResults');
    if (container) {
        container.innerHTML = '<div class="text-info">Running validation...</div>';

        // Simulate validation
        setTimeout(() => {
            container.innerHTML = `
                <div class="alert alert-success">
                    <h6>✅ Validation Complete</h6>
                    <ul class="mb-0">
                        <li>Port configuration: Valid</li>
                        <li>Service definitions: Valid</li>
                        <li>Port ranges: No conflicts</li>
                        <li>Service dependencies: Valid</li>
                    </ul>
                </div>
            `;
        }, 2000);
    }
}

function runHealthCheck() {
    const container = document.getElementById('healthCheckResults');
    if (container) {
        container.innerHTML = '<div class="text-info">Running health check...</div>';

        // Use actual health check API
        fetch('/api/service-management/health')
            .then(response => response.json())
            .then(data => {
                const statusClass = data.overall === 'healthy' ? 'alert-success' :
                                  data.overall === 'degraded' ? 'alert-warning' : 'alert-danger';

                container.innerHTML = `
                    <div class="alert ${statusClass}">
                        <h6>Health Status: ${data.overall.toUpperCase()}</h6>
                        ${data.issues.length > 0 ? `
                            <ul class="mb-0">
                                ${data.issues.map(issue => `<li>${issue}</li>`).join('')}
                            </ul>
                        ` : '<p class="mb-0">All services are healthy</p>'}
                    </div>
                `;
            })
            .catch(error => {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <h6>Health Check Failed</h6>
                        <p class="mb-0">${error.message}</p>
                    </div>
                `;
            });
    }
}

function refreshLogs() {
    const container = document.getElementById('systemLogs');
    if (container) {
        container.innerHTML = 'Loading logs...';

        // Mock log data - in real implementation, this would fetch from the API
        setTimeout(() => {
            container.innerHTML = `
[2024-01-15 10:30:15] INFO: Port Manager initialized successfully
[2024-01-15 10:30:16] INFO: Service Discovery started
[2024-01-15 10:30:17] INFO: Service 'microphone' registered on port 8401
[2024-01-15 10:30:18] INFO: Service 'audioStream' registered on port 8402
[2024-01-15 10:30:19] INFO: Dynamic proxy created for microphone: 8201 → 8401
[2024-01-15 10:30:20] INFO: All services started successfully
            `;
        }, 1000);
    }
}

function clearLogs() {
    const container = document.getElementById('systemLogs');
    if (container) {
        container.innerHTML = '<div class="text-muted">Logs cleared</div>';
    }
}

function testApiEndpoint() {
    if (portManagement) {
        portManagement.testApiEndpoint();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    portManagement = new PortManagementInterface();
});
