const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const logger = require('../scripts/logger');

/**
 * SSH Key Manager Service
 * Manages SSH key deployment and connection registry for MonsterBox animatronics
 * Watches characters.json for changes and automatically deploys keys to new characters
 */
class SSHKeyManager extends EventEmitter {
    constructor(options = {}) {
        super();

        this.charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
        this.deployScriptPath = path.join(__dirname, '..', 'scripts', 'ssh-deployment', 'deploy-keys-to-characters.sh');

        // Connection registry: characterId -> connection info
        this.connectionRegistry = new Map();

        // Character cache for change detection
        this.lastKnownCharacters = new Map();

        // File watcher
        this.watcher = null;

        // Deployment queue to prevent concurrent deployments
        this.deploymentQueue = [];
        this.isDeploying = false;

        // Options
        this.dryRun = options.dryRun || false;
        this.autoDeployOnAdd = options.autoDeployOnAdd !== false; // Default true

        this.initialize();
    }

    /**
     * Initialize the SSH key manager
     */
    async initialize() {
        try {
            logger.info('🔑 Initializing SSH Key Manager...');

            // Load initial character data
            await this.loadCharacterData();

            // Start file watcher
            this.startFileWatcher();

            // Verify SSH key deployment script exists
            if (!fs.existsSync(this.deployScriptPath)) {
                logger.error(`SSH deployment script not found: ${this.deployScriptPath}`);
                return;
            }

            logger.info('✅ SSH Key Manager initialized successfully');
            this.emit('initialized');

        } catch (error) {
            logger.error('❌ Failed to initialize SSH Key Manager:', error);
            this.emit('error', error);
        }
    }

    /**
     * Load character data and detect changes
     */
    async loadCharacterData() {
        try {
            if (!fs.existsSync(this.charactersPath)) {
                logger.warn(`Characters file not found: ${this.charactersPath}`);
                return;
            }

            const charactersData = JSON.parse(fs.readFileSync(this.charactersPath, 'utf8'));
            const currentCharacters = new Map();

            // Process enabled animatronic characters
            for (const character of charactersData) {
                if (character.animatronic && character.animatronic.enabled && character.animatronic.rpi_config) {
                    const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
                    currentCharacters.set(characterKey, {
                        id: character.id,
                        name: character.char_name,
                        host: character.animatronic.rpi_config.host,
                        user: character.animatronic.rpi_config.user || 'remote'
                    });
                }
            }

            // Detect changes
            await this.detectCharacterChanges(currentCharacters);

            // Update cache
            this.lastKnownCharacters = currentCharacters;

        } catch (error) {
            logger.error('Error loading character data:', error);
            throw error;
        }
    }

    /**
     * Detect changes in character configuration
     */
    async detectCharacterChanges(currentCharacters) {
        const addedCharacters = [];
        const removedCharacters = [];
        const modifiedCharacters = [];

        // Find added characters
        for (const [key, character] of currentCharacters) {
            if (!this.lastKnownCharacters.has(key)) {
                addedCharacters.push(character);
            } else {
                // Check for modifications (host changes)
                const lastKnown = this.lastKnownCharacters.get(key);
                if (lastKnown.host !== character.host) {
                    modifiedCharacters.push({ old: lastKnown, new: character });
                }
            }
        }

        // Find removed characters
        for (const [key, character] of this.lastKnownCharacters) {
            if (!currentCharacters.has(key)) {
                removedCharacters.push(character);
            }
        }

        // Process changes
        if (addedCharacters.length > 0) {
            logger.info(`🆕 Detected ${addedCharacters.length} new character(s):`, addedCharacters.map(c => c.name));
            await this.handleAddedCharacters(addedCharacters);
        }

        if (removedCharacters.length > 0) {
            logger.info(`🗑️ Detected ${removedCharacters.length} removed character(s):`, removedCharacters.map(c => c.name));
            await this.handleRemovedCharacters(removedCharacters);
        }

        if (modifiedCharacters.length > 0) {
            logger.info(`🔄 Detected ${modifiedCharacters.length} modified character(s):`, modifiedCharacters.map(c => c.new.name));
            await this.handleModifiedCharacters(modifiedCharacters);
        }
    }

    /**
     * Handle newly added characters
     */
    async handleAddedCharacters(characters) {
        for (const character of characters) {
            if (this.autoDeployOnAdd && !this.dryRun) {
                logger.info(`🔑 Auto-deploying SSH key for new character: ${character.name} (${character.host})`);
                await this.queueKeyDeployment(character);
            } else {
                logger.info(`🔍 Detected new character: ${character.name} (${character.host}) - ${this.dryRun ? 'DRY RUN' : 'Auto-deploy disabled'}`);
                this.updateConnectionRegistry(character, 'detected');
            }
        }
    }

    /**
     * Handle removed characters
     */
    async handleRemovedCharacters(characters) {
        for (const character of characters) {
            logger.info(`🧹 Cleaning up connections for removed character: ${character.name}`);
            await this.cleanupCharacterConnections(character);
        }
    }

    /**
     * Handle modified characters
     */
    async handleModifiedCharacters(characters) {
        for (const { old, new: newChar } of characters) {
            logger.info(`🔄 Updating SSH key deployment for modified character: ${newChar.name} (${old.host} -> ${newChar.host})`);
            await this.cleanupCharacterConnections(old);
            await this.queueKeyDeployment(newChar);
        }
    }

    /**
     * Queue SSH key deployment for a character
     */
    async queueKeyDeployment(character) {
        this.deploymentQueue.push(character);
        await this.processDeploymentQueue();
    }

    /**
     * Process the deployment queue
     */
    async processDeploymentQueue() {
        if (this.isDeploying || this.deploymentQueue.length === 0) {
            return;
        }

        this.isDeploying = true;

        while (this.deploymentQueue.length > 0) {
            const character = this.deploymentQueue.shift();
            await this.deploySSHKey(character);
        }

        this.isDeploying = false;
    }

    /**
     * Check if a host is localhost
     */
    isLocalHost(host) {
        if (!host) return false;

        // Check for localhost variations
        const localhostPatterns = [
            '127.0.0.1',
            'localhost',
            '::1'
        ];

        if (localhostPatterns.includes(host)) {
            return true;
        }

        // Check if host matches any local network interface
        try {
            const networkInterfaces = os.networkInterfaces();
            for (const interfaceName in networkInterfaces) {
                const addresses = networkInterfaces[interfaceName];
                for (const addr of addresses) {
                    if (addr.address === host) {
                        return true;
                    }
                }
            }
        } catch (error) {
            logger.warn('Error checking network interfaces:', error);
        }

        return false;
    }

    /**
     * Deploy SSH key to a specific character
     */
    async deploySSHKey(character) {
        if (this.dryRun) {
            logger.info(`🔍 DRY RUN: Would deploy SSH key to ${character.name} (${character.host})`);
            this.updateConnectionRegistry(character, 'dry-run');
            this.emit('keyDeployed', character);
            return;
        }

        // Skip deployment if target is localhost
        if (this.isLocalHost(character.host)) {
            logger.info(`⏭️ Skipping SSH key deployment to ${character.name} - target is localhost`);
            this.updateConnectionRegistry(character, 'localhost');
            this.emit('keyDeployed', character);
            return;
        }

        return new Promise((resolve) => {
            logger.info(`🚀 Deploying SSH key to ${character.name} (${character.host})...`);

            const childProcess = spawn(this.deployScriptPath, ['deploy'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            let output = '';
            let errorOutput = '';

            childProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            childProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            childProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info(`✅ SSH key deployment completed for ${character.name}`);
                    this.updateConnectionRegistry(character, 'deployed');
                    this.emit('keyDeployed', character);
                } else {
                    logger.warn(`⚠️ SSH key deployment failed for ${character.name}: ${errorOutput}`);
                    this.updateConnectionRegistry(character, 'failed');
                    this.emit('keyDeploymentFailed', character, errorOutput);
                }
                resolve();
            });

            childProcess.on('error', (error) => {
                logger.error(`❌ SSH key deployment error for ${character.name}:`, error);
                this.updateConnectionRegistry(character, 'error');
                this.emit('keyDeploymentError', character, error);
                resolve();
            });
        });
    }

    /**
     * Clean up connections for a character
     */
    async cleanupCharacterConnections(character) {
        const characterKey = character.name.toLowerCase().replace(/\s+/g, '');

        if (this.connectionRegistry.has(characterKey)) {
            logger.info(`🧹 Removing connection registry entry for ${character.name}`);
            this.connectionRegistry.delete(characterKey);
        }

        // Emit cleanup event for other services to handle
        this.emit('characterRemoved', character);
    }

    /**
     * Update connection registry
     */
    updateConnectionRegistry(character, status) {
        const characterKey = character.name.toLowerCase().replace(/\s+/g, '');

        this.connectionRegistry.set(characterKey, {
            ...character,
            status: status,
            lastUpdated: new Date(),
            deploymentAttempts: (this.connectionRegistry.get(characterKey)?.deploymentAttempts || 0) + 1
        });
    }

    /**
     * Start file watcher for characters.json
     */
    startFileWatcher() {
        if (this.watcher) {
            this.watcher.close();
        }

        logger.info(`👀 Starting file watcher for ${this.charactersPath}`);

        this.watcher = fs.watch(this.charactersPath, { persistent: false }, (eventType, filename) => {
            if (eventType === 'change') {
                logger.info('📝 Characters file changed, reloading...');
                setTimeout(() => {
                    this.loadCharacterData().catch(error => {
                        logger.error('Error reloading character data:', error);
                    });
                }, 1000); // Debounce file changes
            }
        });

        this.watcher.on('error', (error) => {
            logger.error('File watcher error:', error);
            // Restart watcher after a delay
            setTimeout(() => {
                this.startFileWatcher();
            }, 5000);
        });
    }

    /**
     * Get connection registry
     */
    getConnectionRegistry() {
        return new Map(this.connectionRegistry);
    }

    /**
     * Get character connection status
     */
    getCharacterStatus(characterName) {
        const characterKey = characterName.toLowerCase().replace(/\s+/g, '');
        return this.connectionRegistry.get(characterKey);
    }

    /**
     * Manually trigger SSH key deployment for all characters
     */
    async deployAllKeys() {
        logger.info('🔑 Manually triggering SSH key deployment for all characters...');

        for (const [key, character] of this.lastKnownCharacters) {
            await this.queueKeyDeployment(character);
        }
    }

    /**
     * Stop the SSH key manager
     */
    stop() {
        logger.info('🛑 Stopping SSH Key Manager...');

        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }

        this.removeAllListeners();
        logger.info('✅ SSH Key Manager stopped');
    }
}

module.exports = SSHKeyManager;
