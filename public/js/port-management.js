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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    portManagement = new PortManagementInterface();
});
