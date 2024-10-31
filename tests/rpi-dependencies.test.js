const { expect } = require('chai');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

describe('RPI Dependencies Check', function() {
    // Increase timeout for slower operations
    this.timeout(10000);

    // Helper function to run command and check output
    async function runCommand(command, errorMessage) {
        try {
            const { stdout, stderr } = await execAsync(command);
            return { success: true, output: stdout || stderr };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    it('should have I2C working', async function() {
        const result = await runCommand('sudo i2cdetect -y 1');
        expect(result.success).to.be.true;
        // I2C output should show a grid of addresses
        expect(result.output).to.match(/\s+0\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s+a\s+b\s+c\s+d\s+e\s+f/);
    });

    it('should have camera available', async function() {
        const result = await runCommand('v4l2-ctl --list-devices');
        expect(result.success).to.be.true;
        // Should list at least one video device
        expect(result.output).to.match(/\/dev\/video\d+/);
    });

    it('should have audio devices configured', async function() {
        const result = await runCommand('aplay -l');
        expect(result.success).to.be.true;
        // Should list at least one audio device
        expect(result.output).to.match(/card \d+/);
    });

    it('should have audio volume set correctly', async function() {
        // Try different volume controls that might exist
        const controls = ['PCM', 'Master', 'Headphone', 'Speaker'];
        let volumeFound = false;

        for (const control of controls) {
            const result = await runCommand(`amixer get ${control}`);
            if (result.success) {
                volumeFound = true;
                // Volume should be around 95%
                expect(result.output).to.match(/\[(\d+)%\]/);
                const match = result.output.match(/\[(\d+)%\]/);
                if (match) {
                    const volume = parseInt(match[1]);
                    expect(volume).to.be.within(90, 100);
                }
            }
        }

        expect(volumeFound, 'No working volume control found').to.be.true;
    });

    it('should have ffmpeg installed with required codecs', async function() {
        const result = await runCommand('ffmpeg -version');
        expect(result.success).to.be.true;
        // Check for important components
        expect(result.output).to.match(/ffmpeg version/);
        expect(result.output).to.match(/libavcodec/);
        expect(result.output).to.match(/libmp3lame/);
    });

    it('should have MP3 playback capability', async function() {
        const result = await runCommand('mpg123 --version');
        expect(result.success).to.be.true;
        expect(result.output).to.match(/mpg123/);
    });

    it('should have correct GPU memory allocation', async function() {
        const result = await runCommand('vcgencmd get_mem gpu');
        expect(result.success).to.be.true;
        // Should show 1024M
        expect(result.output).to.match(/gpu=1024M/);
    });

    // Additional helper tests
    it('should have correct permissions for video devices', async function() {
        const result = await runCommand('ls -l /dev/video*');
        expect(result.success).to.be.true;
        // Should have correct permissions (666 or 660)
        expect(result.output).to.match(/crw-rw-rw-|crw-rw----/);
    });

    it('should have I2C device node available', async function() {
        const result = await runCommand('ls -l /dev/i2c-1');
        expect(result.success).to.be.true;
        // Should exist and have correct permissions
        expect(result.output).to.match(/crw-rw----/);
    });

    it('should have correct user groups configured', async function() {
        const username = process.env.SUDO_USER || process.env.USER;
        const result = await runCommand(`groups ${username}`);
        expect(result.success).to.be.true;
        // User should be in required groups
        expect(result.output).to.match(/video/);
        expect(result.output).to.match(/i2c/);
        expect(result.output).to.match(/gpio/);
        expect(result.output).to.match(/audio/);
    });

    it('should have correct GPU configuration in boot config', async function() {
        const result = await runCommand('cat /boot/config.txt');
        expect(result.success).to.be.true;
        // Check for required settings
        expect(result.output).to.match(/gpu_mem=1024/);
        expect(result.output).to.match(/start_x=1/);
        expect(result.output).to.match(/dtparam=i2c_arm=on/);
    });
});
