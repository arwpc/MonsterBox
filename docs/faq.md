# FAQ / Troubleshooting

## Server won't start

- **Check Node.js version:** `node --version` — requires Node.js 20.x
- **Check port availability:** `sudo lsof -i :3000` — kill conflicting processes with `sudo fuser -k 3000/tcp`
- **Review logs:** `sudo journalctl -u monsterbox -f`
- **Try test mode:** `MB_TEST_MODE=1 npm start` — skips hardware init, useful for isolating issues

## Audio not working

- **Verify PipeWire is running:** `wpctl status`
- **Check audio devices:** `pactl list short sinks` (speakers) and `pactl list short sources` (microphones)
- **Test audio health:** `curl http://localhost:3000/api/audio/health`
- **Check volume levels:** Speaker parts have a `volume` property (0-100) in their part configuration
- **WirePlumber not starting?** Run `scripts/configure-wireplumber.sh` to set up user session auto-start

## Hardware not responding

- **Verify GPIO connections** match the part configuration in the character's `parts.json`
- **Test GPIO access:** `python3 -c "import RPi.GPIO as GPIO; GPIO.setmode(GPIO.BCM); print('GPIO OK')"`
- **Check pigpiod:** `sudo systemctl status pigpiod` — must be running for servo/motor control
- **Check I2C (for PCA9685 servos):** `i2cdetect -y 1` — should show device at address `0x40`
- **Run in test mode** to isolate software vs hardware: `MB_TEST_MODE=1 npm start`

## Webcam not streaming

- **Check webcam device:** `ls /dev/video*` — should show `/dev/video0` or similar
- **Check MJPG-Streamer:** `sudo systemctl status mjpg-streamer`
- **Verify stream bytes:** `curl -s http://localhost:8090/?action=stream | dd bs=1k count=64 2>/dev/null | hexdump -C | head -n 8`
- **Camera permissions:** The user must be in the `video` group — `groups` to check
- **V4L2 info:** `v4l2-ctl --list-devices`

## I2C not found / PCA9685 errors

- **Enable I2C:** `sudo raspi-config nonint do_i2c 0` then reboot
- **Check kernel module:** `lsmod | grep i2c` — should show `i2c_dev` and `i2c_bcm2835`
- **Scan I2C bus:** `i2cdetect -y 1` — PCA9685 typically appears at `0x40`
- **Check wiring:** SDA (GPIO 2, pin 3) and SCL (GPIO 3, pin 5) to PCA9685 board
- **Power:** PCA9685 needs its own 5V power supply for servos (not just logic power)

## GPIO permission denied

- **Add user to groups:** `sudo usermod -a -G gpio,i2c,spi,video,audio $USER`
- **Check udev rules exist:** `ls /etc/udev/rules.d/99-gpio.rules`
- **Reload udev:** `sudo udevadm control --reload-rules && sudo udevadm trigger`
- **Log out and back in** for group changes to take effect

## Jaw animation not working

- **Check config:** Jaw servo must be assigned in Setup > Jaw Animation
- **Verify servo responds:** Use Calibration page to test the jaw servo independently
- **Check daemon:** The jaw servo daemon (`jaw_servo_daemon.py`) runs as a persistent subprocess
- **Hardware-dependent:** Jaw animation requires a real PCA9685 + servo — tests without hardware will show warnings

## Tests failing

- **CI vs local:** Some tests skip in CI environments (no GPIO, no camera). This is expected.
- **Pre-existing intermittent failures:** VU meter, jaw animation save config, and calibration timeout tests may occasionally fail
- **Run individual suites:**
    - `npm run test:unit` — Mocha unit tests
    - `npm run test:system` — Mocha system tests (uses `MB_TEST_MODE=1`)
    - `npm run test:browser` — Playwright E2E tests
- **Test port:** Tests use port 3100 (HTTP). Don't start the server on port 3100 directly.

## SD card filling up

- **Check disk usage:** `df -h /`
- **Large files:** Audio library (`data/audio-library/files/`) and video library (`data/video-library/files/`) can grow
- **Logs:** MonsterBox logs through systemd journal — use `sudo journalctl --vacuum-size=100M` to trim
- **node_modules:** ~200MB — don't duplicate it

## ElevenLabs errors

- **Check API key:** `cat /etc/monsterbox/elevenlabs.key` — should contain your `sk_...` key
- **Key permissions:** `ls -la /etc/monsterbox/elevenlabs.key` — should be mode 600
- **Test TTS:** `curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play -H "Content-Type: application/json" -d '{"text":"test","characterId":3}'`
- **Voice not set:** Each character needs a voice configured in AI Settings (`/ai-settings`)
- **Rate limits:** ElevenLabs has API rate limits — check the ElevenLabs dashboard for usage
