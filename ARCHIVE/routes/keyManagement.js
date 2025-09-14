const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const archiver = require('archiver');
const logger = require('../scripts/logger');

// Paths
const monsterboxRoot = path.join(__dirname, '..');
const charactersPath = path.join(monsterboxRoot, 'data', 'characters.json');
const keyPath = path.join(monsterboxRoot, 'scripts', 'ssh-deployment', 'keys', 'monsterbox-dev');
const deployScriptPath = path.join(monsterboxRoot, 'scripts', 'ssh-deployment', 'deploy-keys-to-characters.sh');

/**
 * Main Key Management Page
 */
router.get('/', (req, res) => {
    res.render('key-management', {
        title: 'SSH Key Management - MonsterBox'
    });
});

/**
 * Get SSH key information
 */
router.get('/key-info', (req, res) => {
    try {
        const privateKeyExists = fs.existsSync(keyPath);
        const publicKeyExists = fs.existsSync(keyPath + '.pub');
        
        let createdDate = null;
        if (privateKeyExists) {
            const stats = fs.statSync(keyPath);
            createdDate = stats.birthtime.toLocaleDateString();
        }
        
        res.json({
            privateKeyExists,
            publicKeyExists,
            createdDate,
            keyPath: keyPath
        });
    } catch (error) {
        logger.error('Error getting key info:', error);
        res.status(500).json({ error: 'Failed to get key information' });
    }
});

/**
 * Get all animatronic characters
 */
router.get('/characters', (req, res) => {
    try {
        if (!fs.existsSync(charactersPath)) {
            return res.json([]);
        }
        
        const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
        const animatronics = charactersData.filter(char => 
            char.animatronic && 
            char.animatronic.enabled && 
            char.animatronic.rpi_config
        );
        
        res.json(animatronics);
    } catch (error) {
        logger.error('Error loading characters:', error);
        res.status(500).json({ error: 'Failed to load characters' });
    }
});

/**
 * Get connection status for all characters
 */
router.get('/status', async (req, res) => {
    try {
        const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
        const animatronics = charactersData.filter(char => 
            char.animatronic && 
            char.animatronic.enabled && 
            char.animatronic.rpi_config
        );
        
        const statusPromises = animatronics.map(async (character) => {
            const status = await testSSHConnection(character);
            return {
                id: character.id,
                status: status.connected ? 'connected' : 'disconnected',
                lastChecked: new Date().toLocaleString(),
                error: status.error
            };
        });
        
        const results = await Promise.all(statusPromises);
        const characters = {};
        
        results.forEach(result => {
            characters[result.id] = {
                status: result.status,
                lastChecked: result.lastChecked,
                error: result.error
            };
        });
        
        res.json({ characters });
    } catch (error) {
        logger.error('Error getting status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});

/**
 * Deploy SSH keys to all characters
 */
router.post('/deploy-all', async (req, res) => {
    try {
        logger.info('Starting SSH key deployment to all characters');
        
        const result = await executeCommand(deployScriptPath, ['deploy']);
        
        if (result.exitCode === 0) {
            // Parse output to get success/failure counts
            const output = result.output;
            const successfulMatch = output.match(/(\d+) successful/);
            const failedMatch = output.match(/(\d+) failed/);
            
            const successful = successfulMatch ? parseInt(successfulMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
            const total = successful + failed;
            
            res.json({
                success: true,
                total,
                successful,
                failed,
                output: result.output
            });
        } else {
            res.json({
                success: false,
                error: result.error || 'Deployment failed',
                output: result.output
            });
        }
    } catch (error) {
        logger.error('Error deploying all keys:', error);
        res.status(500).json({ error: 'Failed to deploy keys' });
    }
});

/**
 * Verify all SSH connections
 */
router.post('/verify-all', async (req, res) => {
    try {
        logger.info('Verifying all SSH connections');
        
        const result = await executeCommand(deployScriptPath, ['verify']);
        
        if (result.exitCode === 0) {
            // Parse output to get connection results
            const output = result.output;
            const lines = output.split('\n');
            const results = [];
            
            lines.forEach(line => {
                if (line.includes('✅') || line.includes('❌')) {
                    const parts = line.split(':');
                    if (parts.length >= 2) {
                        const character = parts[0].replace(/[✅❌]/g, '').trim();
                        const connected = line.includes('✅');
                        const message = parts[1].trim();
                        results.push({ character, connected, message });
                    }
                }
            });
            
            const connected = results.filter(r => r.connected).length;
            const total = results.length;
            
            res.json({
                success: true,
                total,
                connected,
                results,
                output: result.output
            });
        } else {
            res.json({
                success: false,
                error: result.error || 'Verification failed',
                output: result.output
            });
        }
    } catch (error) {
        logger.error('Error verifying connections:', error);
        res.status(500).json({ error: 'Failed to verify connections' });
    }
});

/**
 * Deploy SSH key to specific character
 */
router.post('/deploy/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const character = await getCharacterById(characterId);
        
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }
        
        logger.info(`Deploying SSH key to ${character.char_name}`);
        
        // For individual deployment, we'll use the SSH credentials manager
        const sshCredentials = require('../scripts/ssh-credentials');
        const host = character.animatronic.rpi_config.host;
        const user = character.animatronic.rpi_config.user || 'remote';
        
        // Test if key is already deployed
        const testResult = await testSSHConnection(character);
        
        if (testResult.connected) {
            res.json({
                success: true,
                message: 'SSH key already deployed and working'
            });
        } else {
            // Try to deploy using ssh-copy-id
            const deployResult = await deploySSHKey(character);
            
            if (deployResult.success) {
                res.json({
                    success: true,
                    message: 'SSH key deployed successfully'
                });
            } else {
                res.json({
                    success: false,
                    error: deployResult.error
                });
            }
        }
    } catch (error) {
        logger.error('Error deploying key:', error);
        res.status(500).json({ error: 'Failed to deploy key' });
    }
});

/**
 * Test SSH connection to specific character
 */
router.post('/test/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const character = await getCharacterById(characterId);
        
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }
        
        logger.info(`Testing SSH connection to ${character.char_name}`);
        
        const result = await testSSHConnection(character);
        
        res.json({
            connected: result.connected,
            error: result.error,
            character: character.char_name
        });
    } catch (error) {
        logger.error('Error testing connection:', error);
        res.status(500).json({ error: 'Failed to test connection' });
    }
});

/**
 * Remove SSH key from specific character
 */
router.delete('/remove/:characterId', async (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const character = await getCharacterById(characterId);
        
        if (!character) {
            return res.status(404).json({ error: 'Character not found' });
        }
        
        logger.info(`Removing SSH key from ${character.char_name}`);
        
        const host = character.animatronic.rpi_config.host;
        const user = character.animatronic.rpi_config.user || 'remote';
        
        // Remove the public key from authorized_keys
        const removeCommand = `ssh-keygen -f ~/.ssh/known_hosts -R ${host} && ssh ${user}@${host} 'sed -i "/monsterbox-dev/d" ~/.ssh/authorized_keys'`;
        
        const result = await executeCommand('sh', ['-c', removeCommand]);
        
        res.json({
            success: result.exitCode === 0,
            error: result.exitCode !== 0 ? result.error : null
        });
    } catch (error) {
        logger.error('Error removing key:', error);
        res.status(500).json({ error: 'Failed to remove key' });
    }
});

/**
 * Generate new SSH keys
 */
router.post('/generate-keys', async (req, res) => {
    try {
        logger.info('Generating new SSH keys');
        
        // Backup existing keys
        if (fs.existsSync(keyPath)) {
            const backupPath = keyPath + '.backup.' + Date.now();
            fs.copyFileSync(keyPath, backupPath);
            fs.copyFileSync(keyPath + '.pub', backupPath + '.pub');
        }
        
        // Generate new keys
        const generateCommand = `ssh-keygen -t rsa -b 2048 -f ${keyPath} -N "" -C "monsterbox-dev@$(hostname)"`;
        const result = await executeCommand('sh', ['-c', generateCommand]);
        
        if (result.exitCode === 0) {
            // Set correct permissions
            fs.chmodSync(keyPath, 0o600);
            fs.chmodSync(keyPath + '.pub', 0o644);
            
            res.json({
                success: true,
                message: 'New SSH keys generated successfully'
            });
        } else {
            res.json({
                success: false,
                error: result.error || 'Failed to generate keys'
            });
        }
    } catch (error) {
        logger.error('Error generating keys:', error);
        res.status(500).json({ error: 'Failed to generate keys' });
    }
});

/**
 * Export SSH keys as ZIP file
 */
router.get('/export-keys', (req, res) => {
    try {
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        res.attachment('monsterbox-ssh-keys.zip');
        archive.pipe(res);
        
        // Add SSH keys to archive
        if (fs.existsSync(keyPath)) {
            archive.file(keyPath, { name: 'monsterbox-dev' });
        }
        if (fs.existsSync(keyPath + '.pub')) {
            archive.file(keyPath + '.pub', { name: 'monsterbox-dev.pub' });
        }
        
        // Add deployment script
        if (fs.existsSync(deployScriptPath)) {
            archive.file(deployScriptPath, { name: 'deploy-keys-to-characters.sh' });
        }
        
        // Add characters.json for reference
        if (fs.existsSync(charactersPath)) {
            archive.file(charactersPath, { name: 'characters.json' });
        }
        
        archive.finalize();
    } catch (error) {
        logger.error('Error exporting keys:', error);
        res.status(500).json({ error: 'Failed to export keys' });
    }
});

// Helper functions

async function getCharacterById(id) {
    try {
        const charactersData = JSON.parse(fs.readFileSync(charactersPath, 'utf8'));
        return charactersData.find(char => char.id === id);
    } catch (error) {
        return null;
    }
}

async function testSSHConnection(character) {
    const host = character.animatronic.rpi_config.host;
    const user = character.animatronic.rpi_config.user || 'remote';
    
    const testCommand = `ssh -i ${keyPath} -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o PasswordAuthentication=no -o PubkeyAuthentication=yes -o BatchMode=yes ${user}@${host} 'echo "SSH connection test successful"'`;
    
    const result = await executeCommand('sh', ['-c', testCommand]);
    
    return {
        connected: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.error : null
    };
}

async function deploySSHKey(character) {
    const host = character.animatronic.rpi_config.host;
    const user = character.animatronic.rpi_config.user || 'remote';
    
    const deployCommand = `ssh-copy-id -i ${keyPath}.pub -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new ${user}@${host}`;
    
    const result = await executeCommand('sh', ['-c', deployCommand]);
    
    return {
        success: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.error : null
    };
}

async function executeCommand(command, args = []) {
    return new Promise((resolve) => {
        const process = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        
        let output = '';
        let errorOutput = '';
        
        process.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        process.on('close', (code) => {
            resolve({
                exitCode: code,
                output: output,
                error: errorOutput
            });
        });
        
        process.on('error', (error) => {
            resolve({
                exitCode: -1,
                output: '',
                error: error.message
            });
        });
    });
}

module.exports = router;
