const { expect } = require('chai');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

if (process.env.SKIP_CI_INTEGRATION) {
    describe.skip('RPI Dependencies Check', function() {
        it('skipped in CI', function() {});
    });
} else {
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

    before(function() {
        // Check if running as root/sudo
        if (process.getuid() !== 0) {
            console.warn('\x1b[33m%s\x1b[0m', 
                'Warning: Some tests require root privileges. Run with sudo: sudo npm test'
            );
        }
    });

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
            const result = await runCommand(`amixer -c 0 get ${control}`);
            if (result.success && !result.output.includes('Invalid')) {
                volumeFound = true;
                // Volume should be around 95%
                expect(result.output).to.match(/\[(\d+)%\]/);
                const match = result.output.match(/\[(\d+)%\]/);
                if (match) {
                    const volume = parseInt(match[1]);
                    expect(volume).to.be.within(90, 100);
                }
                break;
            }
        }

        if (!volumeFound) {
            // If no standard controls found, try getting any control
            const result = await runCommand('amixer controls');
            expect(result.success).to.be.true;
            expect(result.output).to.match(/numid=/);
        }
    });

    it('should have ffmpeg installed with required codecs', async function() {
        const result = await runCommand('ffmpeg -version');
        expect(result.success).to.be.true;
        // Check for important components
        expect(result.output).to.match(/ffmpeg version/);
        expect(result.output).to.match(/libavcodec/);
    });

    it('should have MP3 playback capability', async function() {
        const result = await runCommand('mpg123 --version');
        expect(result.success).to.be.true;
        expect(result.output).to.match(/mpg123/);
    });

    it('should have correct GPU memory allocation', async function() {
        const result = await runCommand('vcgencmd get_mem gpu');
        expect(result.success).to.be.true;
        // Should show 512M or 1024M
        expect(result.output).to.match(/gpu=\d+M/);
        const match = result.output.match(/gpu=(\d+)M/);
        if (match) {
            const memory = parseInt(match[1]);
            expect(memory).to.be.at.least(512);
        }
    });

    it('should have correct permissions for video devices', async function() {
        const result = await runCommand('ls -l /dev/video* 2>/dev/null || true');
        if (result.success && result.output) {
            // Should have correct permissions (666 or 660)
            expect(result.output).to.match(/crw-rw-rw-|crw-rw----/);
        }
    });

    it('should have I2C device node available', async function() {
        const result = await runCommand('ls -l /dev/i2c* 2>/dev/null || true');
        if (result.success && result.output) {
            // Should exist and have correct permissions
            expect(result.output).to.match(/crw-rw----/);
        }
    });

    it('should have correct user groups configured', async function() {
        const username = process.env.SUDO_USER || process.env.USER;
        const result = await runCommand(`groups ${username}`);
        expect(result.success).to.be.true;
        // User should be in required groups
        const groups = result.output.toLowerCase();
        const requiredGroups = ['video', 'audio'];
        const foundGroups = requiredGroups.filter(group => groups.includes(group));
        expect(foundGroups.length, 'Missing required groups').to.be.at.least(1);
    });

    it('should have correct GPU configuration in boot config', async function() {
        const result = await runCommand('cat /boot/config.txt');
        expect(result.success).to.be.true;
        // Check for required settings
        expect(result.output).to.match(/gpu_mem=\d+/);
        expect(result.output).to.match(/start_x=1/);
        expect(result.output).to.match(/dtparam=i2c_arm=on/);
    });

    it('should have lgpio installed correctly', async function() {
        const result = await runCommand('python3 -c "import lgpio; print(lgpio.__version__ if hasattr(lgpio, \'__version__\') else \'1.0.0\')"');
        expect(result.success).to.be.true;
        const version = result.output.trim().split('.');
        expect(parseInt(version[0])).to.be.at.least(1);
        // Allow for any minor version as lgpio is still fairly new
    });

    it('should have pigpio daemon running', async function() {
        const result = await runCommand('systemctl is-active pigpiod');
        expect(result.success).to.be.true;
        expect(result.output.trim()).to.equal('active');
    });

    it('should have correct GPIO permissions', async function() {
        const result = await runCommand('ls -l /dev/gpiomem');
        expect(result.success).to.be.true;
        // Should be readable/writable by gpio group
        expect(result.output).to.match(/crw-rw----.*gpio/);
    });

    it('should have I2C enabled for PCA9685', async function() {
        const result = await runCommand('raspi-config nonint get_i2c');
        expect(result.success).to.be.true;
        expect(result.output.trim()).to.equal('0'); // 0 means enabled
    });

    it('should have correct GPIO group membership', async function() {
        const username = process.env.SUDO_USER || process.env.USER;
        const result = await runCommand(`groups ${username}`);
        expect(result.success).to.be.true;
        expect(result.output.toLowerCase()).to.match(/gpio/);
    });

    it('should have lgpio installed and configured', async function() {
        // First check that the library is importable
        const importResult = await runCommand('python3 -c "import lgpio"');
        expect(importResult.success).to.be.true;
        
        // Then check we can access GPIO chip functions
        const functionalTest = await runCommand('python3 -c "import lgpio; print(lgpio.gpiochip_open(0))"');
        expect(functionalTest.success).to.be.true;
        // Should return a valid handle (integer)
        expect(parseInt(functionalTest.output.trim())).to.be.at.least(0);
    });
});
}
