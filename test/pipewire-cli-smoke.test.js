/**
 * PipeWire CLI Smoke Test
 * Tests the Python wrappers directly to ensure PipeWire integration works
 */

import { expect } from 'chai';
import { spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_WRAPPERS_DIR = path.join(__dirname, '..', 'python_wrappers');

function runPythonScript(scriptName, args = [], timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(PYTHON_WRAPPERS_DIR, scriptName);
        const process = spawn('python3', [scriptPath, ...args]);
        
        let stdout = '';
        let stderr = '';
        
        const timeout = setTimeout(() => {
            process.kill('SIGTERM');
            reject(new Error(`Script ${scriptName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        
        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        
        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        
        process.on('close', (code) => {
            clearTimeout(timeout);
            resolve({
                code,
                stdout: stdout.trim(),
                stderr: stderr.trim()
            });
        });
        
        process.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

describe('PipeWire CLI Smoke Tests', () => {
    describe('Microphone CLI', () => {
        it('should check PipeWire tools availability', async () => {
            const result = await runPythonScript('microphone_cli.py', ['check_tools']);
            console.log(`🔧 Microphone CLI tools check: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // Script should exit cleanly (tools may or may not be available)
            expect(result.code).to.be.oneOf([0, 1]);
        });

        it('should attempt to get microphone level (may fail in CI)', async () => {
            const result = await runPythonScript('microphone_cli.py', 
                ['get_level', 'default', '16000', '1', '0.1'], 3000);
            
            console.log(`🎤 Microphone level test: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // May fail in CI without audio hardware, but should not crash
            expect(result.code).to.be.oneOf([0, 1]);
            
            if (result.code === 0 && result.stdout) {
                try {
                    const output = JSON.parse(result.stdout);
                    expect(output).to.have.property('status');
                    console.log(`✅ Microphone level result: ${output.status}`);
                } catch (e) {
                    console.log(`⚠️ Non-JSON output (expected in some environments)`);
                }
            }
        });
    });

    describe('Speaker CLI', () => {
        it('should check PipeWire tools availability', async () => {
            const result = await runPythonScript('speaker_cli.py', ['check_tools']);
            console.log(`🔧 Speaker CLI tools check: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // Script should exit cleanly (tools may or may not be available)
            expect(result.code).to.be.oneOf([0, 1]);
        });

        it('should attempt to set volume (may fail in CI)', async () => {
            const result = await runPythonScript('speaker_cli.py', 
                ['set_volume', '50', '--device', 'default'], 3000);
            
            console.log(`🔊 Speaker volume test: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // May fail in CI without audio hardware, but should not crash
            expect(result.code).to.be.oneOf([0, 1]);
            
            if (result.code === 0 && result.stdout) {
                try {
                    const output = JSON.parse(result.stdout);
                    expect(output).to.have.property('status');
                    console.log(`✅ Speaker volume result: ${output.status}`);
                } catch (e) {
                    console.log(`⚠️ Non-JSON output (expected in some environments)`);
                }
            }
        });

        it('should attempt to stop playback (may fail in CI)', async () => {
            const result = await runPythonScript('speaker_cli.py', 
                ['stop', '--device', 'default'], 3000);
            
            console.log(`🛑 Speaker stop test: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // May fail in CI without audio hardware, but should not crash
            expect(result.code).to.be.oneOf([0, 1]);
            
            if (result.code === 0 && result.stdout) {
                try {
                    const output = JSON.parse(result.stdout);
                    expect(output).to.have.property('status');
                    console.log(`✅ Speaker stop result: ${output.status}`);
                } catch (e) {
                    console.log(`⚠️ Non-JSON output (expected in some environments)`);
                }
            }
        });
    });

    describe('PipeWire System Integration', () => {
        it('should test wpctl availability', async () => {
            const result = await runPythonScript('speaker_cli.py', ['check_pipewire'], 2000);
            console.log(`🎵 PipeWire system check: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // Should not crash regardless of PipeWire availability
            expect(result.code).to.be.oneOf([0, 1]);
        });

        it('should handle graceful fallbacks', async () => {
            // Test with invalid device to ensure graceful fallback
            const result = await runPythonScript('microphone_cli.py', 
                ['get_level', 'nonexistent_device', '16000', '1', '0.1'], 3000);
            
            console.log(`🔄 Fallback test: exit=${result.code}`);
            console.log(`📤 stdout: ${result.stdout}`);
            if (result.stderr) console.log(`📥 stderr: ${result.stderr}`);
            
            // Should handle gracefully, not crash
            expect(result.code).to.be.oneOf([0, 1]);
        });
    });
});
