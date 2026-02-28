# Installation

## Prerequisites

- **Raspberry Pi 4B** with 8GB RAM (4GB minimum)
- **OS:** Debian Bookworm (aarch64) — standard Raspberry Pi OS
- **Storage:** SD card (32GB+ recommended)
- **Network:** WiFi (MonsterNet) or Ethernet
- **Peripherals:** USB camera, USB audio adapter (optional), servo/motor hardware

## Automated Installation

MonsterBox includes a complete installation script that handles all system dependencies. Run it with root privileges:

```bash
git clone git@github.com:arwpc/MonsterBox.git
cd MonsterBox
sudo bash install.sh
```

!!! note
    The install script is `install.sh` in the project root. It must be run as root (`sudo`).

## What `install.sh` Does

The script performs these steps in order:

### 1. System Update
Updates and upgrades all system packages.

### 2. Core System Dependencies
Installs build tools, git, cmake, curl, wget, and related utilities.

### 3. Node.js 20 LTS
Installs Node.js 20 from the official NodeSource repository.

### 4. Python and Core Packages
Installs Python 3 with pip, numpy, scipy, and development headers.

### 5. Hardware Control Libraries
Installs GPIO and hardware control packages:

- `python3-rpi.gpio` — GPIO pin control
- `python3-gpiozero` — High-level GPIO interface
- `python3-smbus` — I2C communication
- `python3-spidev` — SPI communication
- `python3-pigpio` — pigpio daemon client
- `pigpio` — pigpio daemon for GPIO
- `i2c-tools` / `spi-tools` — Bus diagnostic tools

### 6. Audio System (PipeWire)
Removes PulseAudio (to avoid conflicts) and installs:

- PipeWire + PipeWire-ALSA + PipeWire-Pulse
- WirePlumber (session manager)
- ffmpeg, mpg123 (playback tools)
- pyaudio, websockets (Python audio streaming)

### 7. Video/Camera Dependencies
Installs V4L2 utilities, fswebcam, and libav development libraries for video capture and processing.

### 8. OpenCV
Installs `python3-opencv` and related computer vision libraries for head tracking.

### 9. MJPG-Streamer
Builds and installs [mjpg-streamer](https://github.com/jacksonliam/mjpg-streamer) from source for live webcam streaming on port 8090. Creates a systemd service (`mjpg-streamer.service`).

### 10. Hardware Interfaces
Enables I2C, SPI, and camera via `raspi-config`:

```bash
raspi-config nonint do_i2c 0
raspi-config nonint do_spi 0
raspi-config nonint do_camera 0
```

### 11. GPU Memory
Sets `gpu_mem=256` and `start_x=1` in `/boot/config.txt` for camera support.

### 12. User Groups
Adds the user to required groups: `gpio`, `video`, `audio`, `i2c`, `spi`, `dialout`, `plugdev`. Creates udev rules for GPIO, I2C, SPI, and camera device access.

### 13. Services
Enables and starts `pigpiod` for GPIO control. Loads `i2c-dev` and `spi-dev` kernel modules.

### 14. Audio Configuration
Sets default audio levels and configures WirePlumber for auto-start.

### 15. OS Performance Tuning
Applies CPU governor, sysctl, and service priority optimizations for RPi4B.

### 16. ElevenLabs API Key
If `ELEVENLABS_API_KEY` or `XI_API_KEY` is set in the environment, writes it to `/etc/monsterbox/elevenlabs.key`. Otherwise, you can set it later:

```bash
sudo mkdir -p /etc/monsterbox
echo -n 'sk_...' | sudo tee /etc/monsterbox/elevenlabs.key >/dev/null
sudo chmod 600 /etc/monsterbox/elevenlabs.key
```

### 17. Character Creation
Prompts to create a new character and set it as the active selection in `config/app-config.json`.

## Post-Installation

After the install script completes:

```bash
# Reboot to apply hardware interface changes
sudo reboot

# After reboot, install Node.js dependencies
cd MonsterBox
npm ci

# Start MonsterBox
npm start
# Dashboard: http://localhost:3000
```

## Systemd Service

To run MonsterBox as a system service that starts on boot:

```bash
# The service file is at /etc/systemd/system/monsterbox.service
sudo systemctl enable monsterbox
sudo systemctl start monsterbox

# Check status
sudo systemctl status monsterbox

# View logs
sudo journalctl -u monsterbox -f

# Restart after code changes
sudo systemctl restart monsterbox
```

## Test Mode

To start MonsterBox without hardware initialization (useful for development or CI):

```bash
MB_TEST_MODE=1 npm start
```

This defaults to Character 1 and skips GPIO/I2C initialization.

## Updating

For routine updates after the initial install:

```bash
cd MonsterBox
git pull
npm ci
sudo systemctl restart monsterbox
```

## Further Reading

- [Animatronic Setup Guide](setup/ANIMATRONIC-SETUP-GUIDE.md) — detailed hardware configuration
- [Usage Guide](usage.md) — how to operate the system
- [Configuration](config.md) — config files and settings
