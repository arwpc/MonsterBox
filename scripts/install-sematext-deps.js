#!/usr/bin/env node

/**
 * MonsterBox Sematext Dependencies Installer
 * 
 * Installs required dependencies for Sematext integration
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function installDependencies() {
    console.log('📦 Installing Sematext dependencies...\n');
    
    const dependencies = [
        'inquirer@^8.2.6',
        'axios@^1.7.7'
    ];
    
    try {
        console.log('Installing Node.js dependencies...');
        const installCommand = `npm install ${dependencies.join(' ')}`;
        await execAsync(installCommand);
        console.log('✅ Node.js dependencies installed');
        
        console.log('\nChecking for sshpass...');
        try {
            await execAsync('sshpass -V');
            console.log('✅ sshpass is available');
        } catch (error) {
            console.log('⚠️  sshpass not found. Installing...');
            
            // Try different package managers
            const installCommands = [
                'choco install sshpass',  // Windows Chocolatey
                'brew install sshpass',   // macOS Homebrew
                'sudo apt-get install sshpass',  // Ubuntu/Debian
                'sudo yum install sshpass'       // CentOS/RHEL
            ];
            
            let installed = false;
            for (const cmd of installCommands) {
                try {
                    await execAsync(cmd);
                    console.log('✅ sshpass installed');
                    installed = true;
                    break;
                } catch (error) {
                    // Try next command
                }
            }
            
            if (!installed) {
                console.log('⚠️  Could not install sshpass automatically.');
                console.log('Please install sshpass manually:');
                console.log('  Windows: choco install sshpass');
                console.log('  macOS: brew install sshpass');
                console.log('  Ubuntu: sudo apt-get install sshpass');
            }
        }
        
        console.log('\n✅ All dependencies ready!');
        console.log('\n🚀 Next step: npm run setup:sematext');
        
    } catch (error) {
        console.error('❌ Installation failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    installDependencies();
}

module.exports = { installDependencies };
