/**
 * SSH Key Management Interface
 * Provides comprehensive SSH key management for MonsterBox animatronic network
 */

class KeyManagement {
    constructor() {
        this.characters = [];
        this.keyStatus = {};
        this.isOperationRunning = false;
        this.logOutput = document.getElementById('log-content');
        this.logContainer = document.getElementById('log-output');
        
        this.init();
    }

    async init() {
        await this.loadKeyInfo();
        await this.loadCharacters();
        await this.refreshStatus();
        
        // Auto-refresh every 30 seconds
        setInterval(() => {
            if (!this.isOperationRunning) {
                this.refreshStatus();
            }
        }, 30000);
    }

    async loadKeyInfo() {
        try {
            const response = await fetch('/api/key-management/key-info');
            const keyInfo = await response.json();
            
            document.getElementById('private-key-status').textContent = 
                keyInfo.privateKeyExists ? '✅ Present' : '❌ Missing';
            document.getElementById('public-key-status').textContent = 
                keyInfo.publicKeyExists ? '✅ Present' : '❌ Missing';
            document.getElementById('key-created-date').textContent = 
                keyInfo.createdDate || 'Unknown';
                
        } catch (error) {
            console.error('Error loading key info:', error);
            this.log('❌ Error loading SSH key information');
        }
    }

    async loadCharacters() {
        try {
            const response = await fetch('/api/key-management/characters');
            this.characters = await response.json();
            this.renderCharacterGrid();
        } catch (error) {
            console.error('Error loading characters:', error);
            this.log('❌ Error loading character data');
        }
    }

    renderCharacterGrid() {
        const grid = document.getElementById('key-status-grid');
        grid.innerHTML = '';

        this.characters.forEach(character => {
            const card = this.createCharacterCard(character);
            grid.appendChild(card);
        });
    }

    createCharacterCard(character) {
        const status = this.keyStatus[character.id] || { status: 'unknown', lastChecked: null };
        const statusClass = this.getStatusClass(status.status);
        
        const card = document.createElement('div');
        card.className = `key-status-card ${statusClass}`;
        card.innerHTML = `
            <div class="character-name">${character.char_name}</div>
            <div class="character-info">
                <div><strong>Host:</strong> ${character.animatronic.rpi_config.host}</div>
                <div><strong>User:</strong> ${character.animatronic.rpi_config.user || 'remote'}</div>
                <div>
                    <strong>Status:</strong> 
                    <span class="status-indicator status-${status.status}"></span>
                    ${this.getStatusText(status.status)}
                </div>
                <div><strong>Last Checked:</strong> ${status.lastChecked || 'Never'}</div>
            </div>
            <div class="action-buttons">
                <button class="action-button" onclick="keyManager.deployKey(${character.id})">
                    🔑 Deploy Key
                </button>
                <button class="action-button" onclick="keyManager.testConnection(${character.id})">
                    🔗 Test Connection
                </button>
                <button class="action-button" onclick="keyManager.viewCharacterLogs(${character.id})">
                    📋 View Logs
                </button>
                <button class="action-button danger" onclick="keyManager.removeKey(${character.id})">
                    🗑️ Remove Key
                </button>
            </div>
        `;
        
        return card;
    }

    getStatusClass(status) {
        switch (status) {
            case 'connected': return 'connected';
            case 'disconnected': return 'disconnected';
            case 'pending': return 'pending';
            default: return '';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'connected': return 'Connected ✅';
            case 'disconnected': return 'Disconnected ❌';
            case 'pending': return 'Pending ⏳';
            case 'deploying': return 'Deploying 🚀';
            case 'testing': return 'Testing 🔍';
            default: return 'Unknown ❓';
        }
    }

    async refreshStatus() {
        if (this.isOperationRunning) return;
        
        this.log('🔄 Refreshing connection status...');
        
        try {
            const response = await fetch('/api/key-management/status');
            const statusData = await response.json();
            
            this.keyStatus = statusData.characters || {};
            this.renderCharacterGrid();
            
            const connectedCount = Object.values(this.keyStatus).filter(s => s.status === 'connected').length;
            this.log(`✅ Status refreshed - ${connectedCount}/${this.characters.length} characters connected`);
            
        } catch (error) {
            console.error('Error refreshing status:', error);
            this.log('❌ Error refreshing status');
        }
    }

    async deployAllKeys() {
        if (this.isOperationRunning) {
            this.log('⚠️ Operation already in progress');
            return;
        }
        
        this.isOperationRunning = true;
        this.log('🚀 Starting deployment to all characters...');
        this.showLogs();
        
        try {
            const response = await fetch('/api/key-management/deploy-all', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✅ Deployment completed - ${result.successful}/${result.total} successful`);
                if (result.failed > 0) {
                    this.log(`⚠️ ${result.failed} deployments failed - check individual character logs`);
                }
            } else {
                this.log(`❌ Deployment failed: ${result.error}`);
            }
            
            await this.refreshStatus();
            
        } catch (error) {
            console.error('Error deploying keys:', error);
            this.log('❌ Error during deployment');
        } finally {
            this.isOperationRunning = false;
        }
    }

    async verifyAllConnections() {
        if (this.isOperationRunning) {
            this.log('⚠️ Operation already in progress');
            return;
        }
        
        this.isOperationRunning = true;
        this.log('🔍 Verifying all SSH connections...');
        this.showLogs();
        
        try {
            const response = await fetch('/api/key-management/verify-all', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✅ Verification completed - ${result.connected}/${result.total} connected`);
                result.results.forEach(r => {
                    const status = r.connected ? '✅' : '❌';
                    this.log(`  ${status} ${r.character}: ${r.message || (r.connected ? 'Connected' : 'Failed')}`);
                });
            } else {
                this.log(`❌ Verification failed: ${result.error}`);
            }
            
            await this.refreshStatus();
            
        } catch (error) {
            console.error('Error verifying connections:', error);
            this.log('❌ Error during verification');
        } finally {
            this.isOperationRunning = false;
        }
    }

    async deployKey(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;
        
        this.log(`🔑 Deploying SSH key to ${character.char_name}...`);
        this.showLogs();
        
        // Update status to deploying
        this.keyStatus[characterId] = { status: 'deploying', lastChecked: new Date().toLocaleString() };
        this.renderCharacterGrid();
        
        try {
            const response = await fetch(`/api/key-management/deploy/${characterId}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✅ SSH key deployed successfully to ${character.char_name}`);
                this.keyStatus[characterId] = { status: 'connected', lastChecked: new Date().toLocaleString() };
            } else {
                this.log(`❌ Failed to deploy SSH key to ${character.char_name}: ${result.error}`);
                this.keyStatus[characterId] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
            }
            
        } catch (error) {
            console.error('Error deploying key:', error);
            this.log(`❌ Error deploying key to ${character.char_name}`);
            this.keyStatus[characterId] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
        }
        
        this.renderCharacterGrid();
    }

    async testConnection(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;
        
        this.log(`🔍 Testing SSH connection to ${character.char_name}...`);
        this.showLogs();
        
        // Update status to testing
        this.keyStatus[characterId] = { status: 'testing', lastChecked: new Date().toLocaleString() };
        this.renderCharacterGrid();
        
        try {
            const response = await fetch(`/api/key-management/test/${characterId}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.connected) {
                this.log(`✅ SSH connection successful to ${character.char_name}`);
                this.keyStatus[characterId] = { status: 'connected', lastChecked: new Date().toLocaleString() };
            } else {
                this.log(`❌ SSH connection failed to ${character.char_name}: ${result.error}`);
                this.keyStatus[characterId] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
            }
            
        } catch (error) {
            console.error('Error testing connection:', error);
            this.log(`❌ Error testing connection to ${character.char_name}`);
            this.keyStatus[characterId] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
        }
        
        this.renderCharacterGrid();
    }

    async removeKey(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;
        
        if (!confirm(`Are you sure you want to remove the SSH key from ${character.char_name}? This will disable secure connections.`)) {
            return;
        }
        
        this.log(`🗑️ Removing SSH key from ${character.char_name}...`);
        this.showLogs();
        
        try {
            const response = await fetch(`/api/key-management/remove/${characterId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log(`✅ SSH key removed from ${character.char_name}`);
                this.keyStatus[characterId] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
            } else {
                this.log(`❌ Failed to remove SSH key from ${character.char_name}: ${result.error}`);
            }
            
        } catch (error) {
            console.error('Error removing key:', error);
            this.log(`❌ Error removing key from ${character.char_name}`);
        }
        
        this.renderCharacterGrid();
    }

    async generateNewKeys() {
        if (!confirm('Are you sure you want to generate new SSH keys? This will require re-deploying to all characters.')) {
            return;
        }
        
        this.log('🆕 Generating new SSH keys...');
        this.showLogs();
        
        try {
            const response = await fetch('/api/key-management/generate-keys', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.log('✅ New SSH keys generated successfully');
                this.log('⚠️ You will need to re-deploy keys to all characters');
                await this.loadKeyInfo();
                
                // Reset all character statuses
                Object.keys(this.keyStatus).forEach(id => {
                    this.keyStatus[id] = { status: 'disconnected', lastChecked: new Date().toLocaleString() };
                });
                this.renderCharacterGrid();
            } else {
                this.log(`❌ Failed to generate new keys: ${result.error}`);
            }
            
        } catch (error) {
            console.error('Error generating keys:', error);
            this.log('❌ Error generating new keys');
        }
    }

    async exportKeys() {
        this.log('📤 Exporting SSH keys...');
        
        try {
            const response = await fetch('/api/key-management/export-keys');
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monsterbox-ssh-keys-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.log('✅ SSH keys exported successfully');
            
        } catch (error) {
            console.error('Error exporting keys:', error);
            this.log('❌ Error exporting keys');
        }
    }

    viewCharacterLogs(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;
        
        this.log(`📋 Viewing logs for ${character.char_name}...`);
        // This could open a modal or navigate to a detailed log view
        // For now, we'll just show a message
        this.log(`📋 Character-specific logs for ${character.char_name} would be displayed here`);
        this.showLogs();
    }

    viewLogs() {
        this.showLogs();
    }

    showLogs() {
        this.logContainer.classList.remove('hidden');
        this.logContainer.scrollIntoView({ behavior: 'smooth' });
    }

    clearLogs() {
        this.logOutput.innerHTML = '';
        this.logContainer.classList.add('hidden');
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}\n`;
        this.logOutput.textContent += logEntry;
        this.logOutput.scrollTop = this.logOutput.scrollHeight;
        console.log(message);
    }
}

// Initialize when page loads
let keyManager;
document.addEventListener('DOMContentLoaded', () => {
    keyManager = new KeyManagement();
});

// Global functions for button clicks
function deployAllKeys() { keyManager.deployAllKeys(); }
function verifyAllConnections() { keyManager.verifyAllConnections(); }
function refreshStatus() { keyManager.refreshStatus(); }
function generateNewKeys() { keyManager.generateNewKeys(); }
function exportKeys() { keyManager.exportKeys(); }
function viewLogs() { keyManager.viewLogs(); }
function clearLogs() { keyManager.clearLogs(); }
