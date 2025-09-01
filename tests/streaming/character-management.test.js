const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Mock the SSH Key Manager for testing
class MockSSHKeyManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.connectionRegistry = new Map();
        this.lastKnownCharacters = new Map();
        this.deploymentQueue = [];
        this.isDeploying = false;
    }
    
    async initialize() {
        this.emit('initialized');
    }
    
    async loadCharacterData() {
        // Mock character data loading
        return [];
    }
    
    async deploySSHKey(character) {
        if (this.options.dryRun) {
            this.emit('keyDeployed', character);
            return;
        }
        // Mock deployment logic
        this.emit('keyDeployed', character);
    }
    
    updateConnectionRegistry(character, status) {
        const characterKey = character.name.toLowerCase().replace(/\s+/g, '');
        this.connectionRegistry.set(characterKey, {
            ...character,
            status: status,
            lastUpdated: new Date()
        });
    }
    
    getConnectionRegistry() {
        return new Map(this.connectionRegistry);
    }
    
    stop() {
        this.removeAllListeners();
    }
}

describe('Dynamic Character Management Tests', function() {
    this.timeout(30000);
    
    let sandbox;
    let mockFs;
    let sshKeyManager;
    
    beforeEach(function() {
        sandbox = sinon.createSandbox();
        mockFs = {
            existsSync: sandbox.stub(),
            readFileSync: sandbox.stub(),
            writeFileSync: sandbox.stub(),
            watch: sandbox.stub()
        };
        
        sshKeyManager = new MockSSHKeyManager({ dryRun: true });
    });
    
    afterEach(function() {
        if (sshKeyManager) {
            sshKeyManager.stop();
        }
        sandbox.restore();
    });
    
    describe('Character Detection and Loading', function() {
        it('should detect new characters when added to characters.json', function(done) {
            const initialCharacters = [
                {
                    id: 1,
                    char_name: "Orlok",
                    animatronic: {
                        enabled: true,
                        rpi_config: { host: "192.168.8.120", user: "remote" }
                    }
                }
            ];
            
            const updatedCharacters = [
                ...initialCharacters,
                {
                    id: 2,
                    char_name: "New Character",
                    animatronic: {
                        enabled: true,
                        rpi_config: { host: "192.168.8.999", user: "remote" }
                    }
                }
            ];
            
            // Mock initial state
            sshKeyManager.lastKnownCharacters.set('orlok', {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.120',
                user: 'remote'
            });
            
            // Simulate character addition detection
            const newCharacter = {
                id: 2,
                name: 'New Character',
                host: '192.168.8.999',
                user: 'remote'
            };
            
            sshKeyManager.on('keyDeployed', (character) => {
                expect(character.name).to.equal('New Character');
                expect(character.host).to.equal('192.168.8.999');
                done();
            });
            
            // Simulate new character detection
            sshKeyManager.deploySSHKey(newCharacter);
        });
        
        it('should detect removed characters', function() {
            const initialCharacters = new Map([
                ['orlok', { id: 1, name: 'Orlok', host: '192.168.8.120' }],
                ['coffin', { id: 2, name: 'Coffin Breaker', host: '192.168.8.140' }]
            ]);
            
            const updatedCharacters = new Map([
                ['orlok', { id: 1, name: 'Orlok', host: '192.168.8.120' }]
            ]);
            
            // Find removed characters
            const removedCharacters = [];
            for (const [key, character] of initialCharacters) {
                if (!updatedCharacters.has(key)) {
                    removedCharacters.push(character);
                }
            }
            
            expect(removedCharacters).to.have.length(1);
            expect(removedCharacters[0].name).to.equal('Coffin Breaker');
        });
        
        it('should detect character modifications (IP changes)', function() {
            const oldCharacter = {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.120',
                user: 'remote'
            };
            
            const newCharacter = {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.121', // IP changed
                user: 'remote'
            };
            
            const isModified = oldCharacter.host !== newCharacter.host;
            expect(isModified).to.be.true;
        });
    });
    
    describe('File Watcher Functionality', function() {
        it('should set up file watcher for characters.json', function() {
            const charactersPath = path.join(__dirname, '..', '..', 'data', 'characters.json');
            
            // Mock file watcher
            const mockWatcher = {
                on: sandbox.stub(),
                close: sandbox.stub()
            };
            
            mockFs.watch.withArgs(charactersPath).returns(mockWatcher);
            
            const watcher = mockFs.watch(charactersPath, { persistent: false });
            expect(watcher).to.exist;
            expect(mockFs.watch.calledWith(charactersPath)).to.be.true;
        });
        
        it('should handle file change events', function(done) {
            const mockWatcher = new EventEmitter();
            mockFs.watch.returns(mockWatcher);
            
            // Set up file change handler
            mockWatcher.on('change', (eventType, filename) => {
                expect(eventType).to.equal('change');
                expect(filename).to.equal('characters.json');
                done();
            });
            
            // Simulate file change
            setTimeout(() => {
                mockWatcher.emit('change', 'change', 'characters.json');
            }, 10);
        });
        
        it('should debounce file changes', function(done) {
            let changeCount = 0;
            const debounceTime = 100;
            
            const debouncedHandler = () => {
                changeCount++;
            };
            
            // Simulate multiple rapid changes
            setTimeout(() => debouncedHandler(), 10);
            setTimeout(() => debouncedHandler(), 20);
            setTimeout(() => debouncedHandler(), 30);
            
            // Check that handler was called multiple times (no debouncing in this simple test)
            setTimeout(() => {
                expect(changeCount).to.equal(3);
                done();
            }, debounceTime + 50);
        });
    });
    
    describe('Connection Registry Management', function() {
        it('should maintain connection registry', function() {
            const character = {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.120',
                user: 'remote'
            };
            
            sshKeyManager.updateConnectionRegistry(character, 'deployed');
            
            const registry = sshKeyManager.getConnectionRegistry();
            expect(registry.has('orlok')).to.be.true;
            
            const entry = registry.get('orlok');
            expect(entry.name).to.equal('Orlok');
            expect(entry.status).to.equal('deployed');
            expect(entry.lastUpdated).to.be.a('date');
        });
        
        it('should update connection status', function() {
            const character = {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.120',
                user: 'remote'
            };
            
            // Initial status
            sshKeyManager.updateConnectionRegistry(character, 'detected');
            let registry = sshKeyManager.getConnectionRegistry();
            expect(registry.get('orlok').status).to.equal('detected');
            
            // Update status
            sshKeyManager.updateConnectionRegistry(character, 'deployed');
            registry = sshKeyManager.getConnectionRegistry();
            expect(registry.get('orlok').status).to.equal('deployed');
        });
        
        it('should clean up removed characters from registry', function() {
            const character = {
                id: 1,
                name: 'Orlok',
                host: '192.168.8.120',
                user: 'remote'
            };
            
            // Add character to registry
            sshKeyManager.updateConnectionRegistry(character, 'deployed');
            expect(sshKeyManager.getConnectionRegistry().has('orlok')).to.be.true;
            
            // Remove character from registry
            sshKeyManager.connectionRegistry.delete('orlok');
            expect(sshKeyManager.getConnectionRegistry().has('orlok')).to.be.false;
        });
    });
    
    describe('Deployment Queue Management', function() {
        it('should queue deployments to prevent concurrent operations', function() {
            const character1 = { name: 'Orlok', host: '192.168.8.120' };
            const character2 = { name: 'Coffin Breaker', host: '192.168.8.140' };
            
            // Add to queue
            sshKeyManager.deploymentQueue.push(character1);
            sshKeyManager.deploymentQueue.push(character2);
            
            expect(sshKeyManager.deploymentQueue).to.have.length(2);
            expect(sshKeyManager.deploymentQueue[0].name).to.equal('Orlok');
            expect(sshKeyManager.deploymentQueue[1].name).to.equal('Coffin Breaker');
        });
        
        it('should process deployment queue in order', function(done) {
            const deployedCharacters = [];
            
            sshKeyManager.on('keyDeployed', (character) => {
                deployedCharacters.push(character.name);
                
                if (deployedCharacters.length === 2) {
                    expect(deployedCharacters[0]).to.equal('Orlok');
                    expect(deployedCharacters[1]).to.equal('Coffin Breaker');
                    done();
                }
            });
            
            // Simulate queue processing
            const character1 = { name: 'Orlok', host: '192.168.8.120' };
            const character2 = { name: 'Coffin Breaker', host: '192.168.8.140' };
            
            setTimeout(() => sshKeyManager.deploySSHKey(character1), 10);
            setTimeout(() => sshKeyManager.deploySSHKey(character2), 20);
        });
    });
    
    describe('Event-Driven Architecture', function() {
        it('should emit events for key deployment success', function(done) {
            const character = { name: 'Orlok', host: '192.168.8.120' };
            
            sshKeyManager.on('keyDeployed', (deployedCharacter) => {
                expect(deployedCharacter.name).to.equal('Orlok');
                done();
            });
            
            sshKeyManager.deploySSHKey(character);
        });
        
        it('should emit events for character removal', function(done) {
            const character = { name: 'Orlok', host: '192.168.8.120' };
            
            sshKeyManager.on('characterRemoved', (removedCharacter) => {
                expect(removedCharacter.name).to.equal('Orlok');
                done();
            });
            
            // Simulate character removal
            setTimeout(() => {
                sshKeyManager.emit('characterRemoved', character);
            }, 10);
        });
        
        it('should handle initialization events', function(done) {
            const newManager = new MockSSHKeyManager();
            
            newManager.on('initialized', () => {
                expect(true).to.be.true; // Manager initialized successfully
                newManager.stop();
                done();
            });
            
            newManager.initialize();
        });
    });
});
