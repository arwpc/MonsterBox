#!/usr/bin/env node

/**
 * MonsterBox Post-Install Script
 * Runs automatically after npm install to set up Python dependencies
 * and verify system configuration
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color output functions
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

function printStatus(message) {
    console.log(`${colors.blue}${colors.bright}>>> ${message}${colors.reset}`);
}

function printSuccess(message) {
    console.log(`${colors.green}${colors.bright}>>> Success: ${message}${colors.reset}`);
}

function printWarning(message) {
    console.log(`${colors.yellow}${colors.bright}>>> Warning: ${message}${colors.reset}`);
}

function printError(message) {
    console.log(`${colors.red}${colors.bright}>>> Error: ${message}${colors.reset}`);
}

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
 * Run a command and return promise
 */
function runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 60000, ...options }, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stdout, stderr });
            } else {
                resolve({ stdout, stderr });
            }
        });
    });
}

/**
 * Install Python dependencies
 */
async function installPythonDependencies() {
    printStatus('Installing Python dependencies...');
    
    // Check if Python 3 is available
    const python3Available = await commandExists('python3');
    if (!python3Available) {
        printWarning('Python 3 not found. Hardware services may not work properly.');
        printWarning('Please install Python 3 manually for full functionality.');
        return false;
    }
    
    printSuccess('Python 3 found');
    
    // Check if requirements.txt exists
    const requirementsPath = path.join(process.cwd(), 'utils', 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
        printWarning('requirements.txt not found, skipping Python dependency installation');
        return false;
    }
    
    // Try to install Python dependencies
    try {
        printStatus('Installing Python packages from requirements.txt...');
        const result = await runCommand(`python3 -m pip install --user -r ${requirementsPath}`);
        printSuccess('Python dependencies installed successfully');
        return true;
    } catch (error) {
        printWarning('Failed to install some Python dependencies');
        printWarning('You may need to install them manually or run the system installation script');
        return false;
    }
}

/**
 * Check system requirements
 */
async function checkSystemRequirements() {
    printStatus('Checking system requirements...');
    
    const checks = {
        node: await commandExists('node'),
        python3: await commandExists('python3'),
        pip3: await commandExists('pip3'),
        gpio: fs.existsSync('/dev/gpiomem'),
        i2c: fs.existsSync('/dev/i2c-1'),
        camera: fs.existsSync('/dev/video0')
    };
    
    console.log('System Check Results:');
    console.log(`  Node.js: ${checks.node ? '✅' : '❌'}`);
    console.log(`  Python 3: ${checks.python3 ? '✅' : '❌'}`);
    console.log(`  pip3: ${checks.pip3 ? '✅' : '❌'}`);
    console.log(`  GPIO: ${checks.gpio ? '✅' : '❌'}`);
    console.log(`  I2C: ${checks.i2c ? '✅' : '❌'}`);
    console.log(`  Camera: ${checks.camera ? '✅' : '❌'}`);
    
    const criticalIssues = !checks.node || !checks.python3;
    const hardwareIssues = !checks.gpio || !checks.i2c;
    
    if (criticalIssues) {
        printError('Critical system requirements missing');
        printError('Please run the system installation script: sudo bash install.sh');
        return false;
    }
    
    if (hardwareIssues) {
        printWarning('Hardware interfaces not available');
        printWarning('This may be normal on non-Raspberry Pi systems');
        printWarning('For Raspberry Pi, run: sudo bash install.sh');
    }
    
    return true;
}

/**
 * Set up Python wrapper permissions
 */
async function setupPythonWrappers() {
    printStatus('Setting up Python wrapper permissions...');
    
    const wrappersDir = path.join(process.cwd(), 'python_wrappers');
    if (!fs.existsSync(wrappersDir)) {
        printWarning('python_wrappers directory not found');
        return false;
    }
    
    try {
        // Make Python wrappers executable
        const files = fs.readdirSync(wrappersDir);
        const pythonFiles = files.filter(file => file.endsWith('.py'));
        
        for (const file of pythonFiles) {
            const filePath = path.join(wrappersDir, file);
            fs.chmodSync(filePath, 0o755);
        }
        
        printSuccess(`Set executable permissions for ${pythonFiles.length} Python wrappers`);
        return true;
    } catch (error) {
        printWarning('Failed to set Python wrapper permissions');
        return false;
    }
}

/**
 * Create default environment file
 */
async function createEnvironmentFile() {
    const envPath = path.join(process.cwd(), '.env');
    
    if (fs.existsSync(envPath)) {
        printSuccess('Environment file already exists');
        return true;
    }
    
    printStatus('Creating default environment file...');
    
    const envContent = `# MonsterBox Environment Configuration
NODE_ENV=production
PORT=3000

# Hardware Configuration
ENABLE_HARDWARE=true
ENABLE_SERVO_CONTROL=true
ENABLE_CAMERA=true
ENABLE_AUDIO=true

# PCA9685 Configuration
PCA9685_ADDRESS=0x40
PCA9685_FREQUENCY=50

# Camera Configuration
CAMERA_DEVICE=/dev/video0
CAMERA_RESOLUTION=640x480
CAMERA_FPS=15

# Audio Configuration
AUDIO_SAMPLE_RATE=44100
AUDIO_CHANNELS=2

# Logging
LOG_LEVEL=info
`;
    
    try {
        fs.writeFileSync(envPath, envContent);
        printSuccess('Environment file created');
        return true;
    } catch (error) {
        printWarning('Failed to create environment file');
        return false;
    }
}

/**
 * Display next steps
 */
function displayNextSteps() {
    console.log('');
    printStatus('MonsterBox Post-Install Complete!');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. For fresh Raspberry Pi setup: sudo bash install.sh');
    console.log('  2. Set up application: npm run setup');
    console.log('  3. Check system status: npm run check');
    console.log('  4. Start MonsterBox: npm start');
    console.log('');
    console.log('Useful Commands:');
    console.log('  npm run setup:webcam  - Set up camera functionality');
    console.log('  npm run install:python - Install Python dependencies');
    console.log('  npm run check - Run system diagnostics');
    console.log('');
    printSuccess('Ready to use MonsterBox!');
}

/**
 * Main post-install function
 */
async function main() {
    console.log('');
    printStatus('MonsterBox Post-Install Setup');
    console.log('');
    
    try {
        // Check system requirements
        const systemOk = await checkSystemRequirements();
        
        // Install Python dependencies (if possible)
        await installPythonDependencies();
        
        // Set up Python wrappers
        await setupPythonWrappers();
        
        // Create environment file
        await createEnvironmentFile();
        
        // Display next steps
        displayNextSteps();
        
    } catch (error) {
        printError('Post-install setup failed');
        console.error(error);
        process.exit(1);
    }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export {
    installPythonDependencies,
    checkSystemRequirements,
    setupPythonWrappers,
    createEnvironmentFile
};
