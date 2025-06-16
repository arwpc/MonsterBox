#!/usr/bin/env node

/**
 * Debug Test Runner for MonsterBox
 * Helps identify hanging tests by running them individually with timeouts
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'tests');
const testFiles = fs.readdirSync(testDir)
    .filter(file => file.endsWith('.test.js'))
    .slice(0, 5); // Only test first 5 files to avoid hanging

console.log('🧪 Debug Test Runner - Testing individual files...');
console.log(`Found ${testFiles.length} test files to check`);

async function runTestFile(testFile) {
    return new Promise((resolve) => {
        console.log(`\n🔍 Testing: ${testFile}`);
        
        const testProcess = spawn('npx', ['mocha', '--timeout', '10000', path.join(testDir, testFile)], {
            stdio: 'pipe',
            cwd: path.join(__dirname, '..')
        });

        let output = '';
        let hasOutput = false;

        testProcess.stdout.on('data', (data) => {
            output += data.toString();
            hasOutput = true;
        });

        testProcess.stderr.on('data', (data) => {
            output += data.toString();
            hasOutput = true;
        });

        // Set a 15-second timeout for each test file
        const timeout = setTimeout(() => {
            console.log(`⏰ ${testFile} - TIMEOUT (15s) - likely hanging`);
            testProcess.kill('SIGTERM');
            resolve({ file: testFile, status: 'timeout', output: output.slice(-500) });
        }, 15000);

        testProcess.on('close', (code) => {
            clearTimeout(timeout);
            
            if (code === 0) {
                console.log(`✅ ${testFile} - PASSED`);
                resolve({ file: testFile, status: 'passed', output: '' });
            } else {
                console.log(`❌ ${testFile} - FAILED (code: ${code})`);
                resolve({ file: testFile, status: 'failed', code, output: output.slice(-500) });
            }
        });

        testProcess.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`💥 ${testFile} - ERROR: ${error.message}`);
            resolve({ file: testFile, status: 'error', error: error.message, output: '' });
        });
    });
}

async function main() {
    const results = [];
    
    for (const testFile of testFiles) {
        const result = await runTestFile(testFile);
        results.push(result);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const passed = results.filter(r => r.status === 'passed');
    const failed = results.filter(r => r.status === 'failed');
    const timeout = results.filter(r => r.status === 'timeout');
    const errors = results.filter(r => r.status === 'error');

    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`⏰ Timeout: ${timeout.length}`);
    console.log(`💥 Errors: ${errors.length}`);

    if (timeout.length > 0) {
        console.log('\n🚨 Hanging Tests (likely cause of pre-commit issues):');
        timeout.forEach(t => {
            console.log(`  - ${t.file}`);
            if (t.output) {
                console.log(`    Last output: ${t.output.slice(0, 200)}...`);
            }
        });
    }

    if (failed.length > 0) {
        console.log('\n❌ Failed Tests:');
        failed.forEach(t => {
            console.log(`  - ${t.file} (code: ${t.code})`);
        });
    }

    console.log('\n💡 Recommendation:');
    if (timeout.length > 0) {
        console.log('Fix hanging tests by ensuring proper cleanup of servers, WebSockets, and timers.');
        console.log('Add proper afterEach/after hooks to close connections and clear timeouts.');
    } else if (failed.length > 0) {
        console.log('Fix failing tests before committing.');
    } else {
        console.log('All tested files are working correctly!');
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { runTestFile };
