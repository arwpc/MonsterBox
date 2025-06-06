#!/usr/bin/env node

/**
 * MonsterBox SSH Credentials Manager
 * 
 * Manages individual SSH credentials for each animatronic RPI.
 * Supports per-animatronic credentials with fallback to legacy shared credentials.
 * 
 * Used for:
 * - MCP (Model Context Protocol) log collection and monitoring
 * - Development work using Augment AI assistant in VS Code
 * - NOT for runtime MonsterBox application functionality
 */

// Load environment variables
require('dotenv').config();

class SSHCredentialsManager {
    constructor() {
        // Define animatronic ID to environment variable mapping
        this.credentialMap = {
            'orlok': {
                userVar: 'ORLOK_SSH_USER',
                passwordVar: 'ORLOK_SSH_PASSWORD'
            },
            'pumpkinhead': {
                userVar: 'PUMPKINHEAD_SSH_USER', 
                passwordVar: 'PUMPKINHEAD_SSH_PASSWORD'
            },
            'coffin': {
                userVar: 'COFFIN_SSH_USER',
                passwordVar: 'COFFIN_SSH_PASSWORD'
            }
        };

        // Legacy fallback credentials
        this.fallbackUser = process.env.RPI_SSH_USER || 'remote';
        this.fallbackPassword = process.env.RPI_SSH_PASSWORD;
    }

    /**
     * Get SSH credentials for a specific animatronic
     * @param {string} animatronicId - The animatronic ID (orlok, pumpkinhead, coffin)
     * @returns {object} SSH credentials {user, password}
     */
    getCredentials(animatronicId) {
        const id = animatronicId.toLowerCase();
        const mapping = this.credentialMap[id];

        if (!mapping) {
            // Unknown animatronic, use fallback credentials
            return {
                user: this.fallbackUser,
                password: this.fallbackPassword,
                source: 'fallback'
            };
        }

        // Try to get specific credentials for this animatronic
        const user = process.env[mapping.userVar];
        const password = process.env[mapping.passwordVar];

        if (user && password) {
            return {
                user: user,
                password: password,
                source: 'specific'
            };
        }

        // Fall back to legacy shared credentials
        return {
            user: this.fallbackUser,
            password: this.fallbackPassword,
            source: 'fallback'
        };
    }

    /**
     * Get SSH credentials by host IP address
     * @param {string} host - The host IP address
     * @returns {object} SSH credentials {user, password}
     */
    getCredentialsByHost(host) {
        // Map known hosts to animatronic IDs
        const hostMap = {
            '192.168.8.120': 'orlok',
            '192.168.1.101': 'pumpkinhead',
            '192.168.8.140': 'coffin'
        };

        const animatronicId = hostMap[host];
        if (animatronicId) {
            return this.getCredentials(animatronicId);
        }

        // Unknown host, use fallback credentials
        return {
            user: this.fallbackUser,
            password: this.fallbackPassword,
            source: 'fallback'
        };
    }

    /**
     * Build SSH command for a specific animatronic
     * @param {string} animatronicId - The animatronic ID
     * @param {string} host - The host IP address
     * @param {string} command - The command to execute
     * @param {object} options - SSH options
     * @returns {string} Complete SSH command
     */
    buildSSHCommand(animatronicId, host, command, options = {}) {
        const credentials = this.getCredentials(animatronicId);

        // For Windows, we'll create a temporary PowerShell script that automates SSH password entry
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Create a unique temporary script file
        const tempDir = os.tmpdir();
        const scriptName = `ssh_${animatronicId}_${Date.now()}.ps1`;
        const scriptPath = path.join(tempDir, scriptName);

        // Escape special characters for PowerShell
        const escapedPassword = credentials.password.replace(/'/g, "''");
        const escapedCommand = command.replace(/'/g, "''");

        // PowerShell script content that uses expect-like functionality
        const powershellScript = `
# SSH automation script for ${animatronicId}
$sshPassword = '${escapedPassword}'
$securePassword = ConvertTo-SecureString $sshPassword -AsPlainText -Force

# Use Start-Process with input redirection
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "ssh"
$psi.Arguments = "-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no ${credentials.user}@${host} '${escapedCommand}'"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = [System.Diagnostics.Process]::Start($psi)

# Send password when prompted
Start-Sleep -Milliseconds 500
$process.StandardInput.WriteLine($sshPassword)
$process.StandardInput.Close()

# Wait for completion and get output
$output = $process.StandardOutput.ReadToEnd()
$errorOutput = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -eq 0) {
    Write-Output $output
} else {
    Write-Host $errorOutput -ForegroundColor Red
    exit $process.ExitCode
}

# Clean up
Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

        // Write the script to temp file
        fs.writeFileSync(scriptPath, powershellScript);

        return `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
    }

    /**
     * Build SSH command by host IP address
     * @param {string} host - The host IP address
     * @param {string} command - The command to execute
     * @param {object} options - SSH options
     * @returns {string} Complete SSH command
     */
    buildSSHCommandByHost(host, command, options = {}) {
        // Map host to animatronic ID for consistent script naming
        const hostMap = {
            '192.168.8.120': 'orlok',
            '192.168.1.101': 'pumpkinhead',
            '192.168.8.140': 'coffin'
        };

        const animatronicId = hostMap[host] || 'unknown';
        return this.buildSSHCommand(animatronicId, host, command, options);
    }

    /**
     * Get all configured animatronics with their credentials
     * @returns {object} All animatronic credentials
     */
    getAllCredentials() {
        const result = {};
        
        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            result[id] = this.getCredentials(id);
        }

        return result;
    }

    /**
     * Validate that all required credentials are configured
     * @returns {object} Validation result
     */
    validateCredentials() {
        const validation = {
            valid: true,
            missing: [],
            configured: [],
            fallbackAvailable: !!(this.fallbackUser && this.fallbackPassword)
        };

        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            const user = process.env[mapping.userVar];
            const password = process.env[mapping.passwordVar];

            if (user && password) {
                validation.configured.push(id);
            } else {
                validation.missing.push(id);
                if (!validation.fallbackAvailable) {
                    validation.valid = false;
                }
            }
        }

        return validation;
    }

    /**
     * Build SCP command for file transfer
     * @param {string} animatronicId - The animatronic ID
     * @param {string} host - The host IP address
     * @param {string} sourcePath - Source file path (remote)
     * @param {string} destPath - Destination path (local)
     * @param {object} options - SCP options
     * @returns {string} Complete SCP command
     */
    buildSCPCommand(animatronicId, host, sourcePath, destPath, options = {}) {
        const credentials = this.getCredentials(animatronicId);

        // For Windows, we'll create a temporary PowerShell script that automates SCP password entry
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        // Create a unique temporary script file
        const tempDir = os.tmpdir();
        const scriptName = `scp_${animatronicId}_${Date.now()}.ps1`;
        const scriptPath = path.join(tempDir, scriptName);

        // Escape special characters for PowerShell
        const escapedPassword = credentials.password.replace(/'/g, "''");
        const recursiveFlag = options.recursive ? '-r' : '';

        // PowerShell script content for SCP
        const powershellScript = `
# SCP automation script for ${animatronicId}
$scpPassword = '${escapedPassword}'

# Use Start-Process with input redirection
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "scp"
$psi.Arguments = "-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no ${recursiveFlag} ${credentials.user}@${host}:${sourcePath} '${destPath}'"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = [System.Diagnostics.Process]::Start($psi)

# Send password when prompted
Start-Sleep -Milliseconds 500
$process.StandardInput.WriteLine($scpPassword)
$process.StandardInput.Close()

# Wait for completion and get output
$output = $process.StandardOutput.ReadToEnd()
$errorOutput = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -eq 0) {
    Write-Output $output
} else {
    Write-Host $errorOutput -ForegroundColor Red
    exit $process.ExitCode
}

# Clean up
Remove-Item -Path $PSCommandPath -Force -ErrorAction SilentlyContinue
`;

        // Write the script to temp file
        fs.writeFileSync(scriptPath, powershellScript);

        return `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
    }

    /**
     * Get setup instructions for missing credentials
     * @returns {string} Setup instructions
     */
    getSetupInstructions() {
        const validation = this.validateCredentials();

        if (validation.valid && validation.missing.length === 0) {
            return 'All animatronic SSH credentials are properly configured.';
        }

        let instructions = 'SSH Credentials Setup Instructions:\n\n';

        if (validation.missing.length > 0) {
            instructions += 'Missing specific credentials for:\n';
            validation.missing.forEach(id => {
                const mapping = this.credentialMap[id];
                instructions += `  - ${id.toUpperCase()}: Set ${mapping.userVar} and ${mapping.passwordVar} in .env file\n`;
            });
            instructions += '\n';
        }

        if (!validation.fallbackAvailable) {
            instructions += 'Missing fallback credentials:\n';
            instructions += '  - Set RPI_SSH_USER and RPI_SSH_PASSWORD in .env file\n\n';
        }

        instructions += 'Example .env configuration:\n';
        instructions += '# Individual animatronic credentials\n';
        for (const [id, mapping] of Object.entries(this.credentialMap)) {
            instructions += `${mapping.userVar}="remote"\n`;
            instructions += `${mapping.passwordVar}="your_password_here"\n`;
        }
        instructions += '\n# Fallback credentials\n';
        instructions += 'RPI_SSH_USER="remote"\n';
        instructions += 'RPI_SSH_PASSWORD="your_password_here"\n';

        return instructions;
    }
}

// Export singleton instance
const sshCredentials = new SSHCredentialsManager();

module.exports = sshCredentials;
