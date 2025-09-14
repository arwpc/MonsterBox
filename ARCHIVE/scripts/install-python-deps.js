#!/usr/bin/env node

/**
 * Post-install script to install required Python dependencies
 * This ensures that Python packages needed for hardware services are available
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Required Python packages for MonsterBox hardware services
const REQUIRED_PYTHON_PACKAGES = [
    'websockets',
    'asyncio',  // Usually built-in, but good to check
    'json',     // Built-in
    'logging',  // Built-in
];

// Optional packages that might be needed on Raspberry Pi
const OPTIONAL_PYTHON_PACKAGES = [
    'RPi.GPIO',
    'gpiozero',
    'adafruit-circuitpython-motor',
    'adafruit-circuitpython-servo'
];

console.log('🐍 Installing Python dependencies for MonsterBox hardware services...');

/**
 * Check if a command exists
 */
function commandExists(command) {
    return new Promise((resolve) => {
        exec(`which ${command}`, (error) => {
            resolve(!error);
        });
    });
}

/**
 * Try to install a Python package using various methods
 */
async function installPythonPackage(packageName, optional = false) {
    const methods = [
        { cmd: 'pip3', args: ['install', packageName] },
        { cmd: 'pip', args: ['install', packageName] },
        { cmd: 'apt', args: ['install', '-y', `python3-${packageName}`] },
        { cmd: 'apt-get', args: ['install', '-y', `python3-${packageName}`] }
    ];

    for (const method of methods) {
        const available = await commandExists(method.cmd);
        if (!available) continue;

        console.log(`  Trying ${method.cmd} ${method.args.join(' ')}...`);
        
        return new Promise((resolve) => {
            const needsSudo = method.cmd.includes('apt');
            const fullCmd = needsSudo ? 
                `sudo ${method.cmd} ${method.args.join(' ')}` : 
                `${method.cmd} ${method.args.join(' ')}`;

            exec(fullCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (!error) {
                    console.log(`  ✅ Successfully installed ${packageName} using ${method.cmd}`);
                    resolve(true);
                } else {
                    if (!optional) {
                        console.log(`  ❌ Failed to install ${packageName} using ${method.cmd}: ${error.message}`);
                    }
                    resolve(false);
                }
            });
        });
    }

    if (!optional) {
        console.log(`  ⚠️  Could not install ${packageName} - no suitable package manager found`);
    }
    return false;
}

/**
 * Check if Python package is already installed
 */
function checkPythonPackage(packageName) {
    return new Promise((resolve) => {
        exec(`python3 -c "import ${packageName}"`, (error) => {
            resolve(!error);
        });
    });
}

/**
 * Try to install from requirements.txt
 */
async function installFromRequirements() {
    const requirementsPath = path.join(__dirname, '..', 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
        return false;
    }

    console.log('📋 Found requirements.txt, attempting to install...');

    const methods = ['pip3', 'pip'];
    for (const pip of methods) {
        const available = await commandExists(pip);
        if (!available) continue;

        return new Promise((resolve) => {
            exec(`${pip} install -r ${requirementsPath}`, { timeout: 120000 }, (error, stdout, stderr) => {
                if (!error) {
                    console.log('✅ Successfully installed Python dependencies from requirements.txt');
                    resolve(true);
                } else {
                    console.log(`❌ Failed to install from requirements.txt using ${pip}: ${error.message}`);
                    resolve(false);
                }
            });
        });
    }
    return false;
}

/**
 * Main installation function
 */
async function installPythonDependencies() {
    try {
        // Check if Python 3 is available
        const python3Available = await commandExists('python3');
        if (!python3Available) {
            console.log('⚠️  Python 3 not found. Hardware services may not work properly.');
            console.log('   Please install Python 3 manually for full functionality.');
            return;
        }

        console.log('✅ Python 3 found');

        // Try to install from requirements.txt first
        const requirementsSuccess = await installFromRequirements();
        if (requirementsSuccess) {
            console.log('✅ Python dependency installation complete via requirements.txt!');
            console.log('🎭 MonsterBox hardware services should now work properly.');
            return;
        }

        // Install required packages
        console.log('\n📦 Installing required Python packages...');
        for (const packageName of REQUIRED_PYTHON_PACKAGES) {
            const alreadyInstalled = await checkPythonPackage(packageName);
            if (alreadyInstalled) {
                console.log(`  ✅ ${packageName} already installed`);
                continue;
            }

            console.log(`  📦 Installing ${packageName}...`);
            await installPythonPackage(packageName, false);
        }

        // Install optional packages (for Raspberry Pi)
        console.log('\n🔧 Installing optional hardware packages...');
        for (const packageName of OPTIONAL_PYTHON_PACKAGES) {
            const alreadyInstalled = await checkPythonPackage(packageName);
            if (alreadyInstalled) {
                console.log(`  ✅ ${packageName} already installed`);
                continue;
            }

            console.log(`  🔧 Installing ${packageName} (optional)...`);
            await installPythonPackage(packageName, true);
        }

        console.log('\n✅ Python dependency installation complete!');
        console.log('🎭 MonsterBox hardware services should now work properly.');

    } catch (error) {
        console.error('❌ Error during Python dependency installation:', error.message);
        console.log('⚠️  Some hardware services may not work properly.');
        console.log('   You may need to install Python dependencies manually:');
        console.log('   pip3 install websockets');
    }
}

// Run the installation
if (require.main === module) {
    installPythonDependencies();
}

module.exports = { installPythonDependencies };
