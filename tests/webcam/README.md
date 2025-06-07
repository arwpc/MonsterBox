# Webcam Tests

This directory contains tests specifically for webcam functionality, including camera detection, streaming, and hardware compatibility tests.

## Files

### `test_task_16_webcam_fixes.js`
- **Purpose**: Comprehensive Task 16 webcam management interface functionality test
- **Tests**: Camera detection, button functionality, settings persistence, RPI compatibility, streaming
- **Usage**: `node tests/webcam/test_task_16_webcam_fixes.js`

### `test_webcam_complete.js`
- **Purpose**: Complete webcam system test
- **Tests**: Full webcam functionality across all components
- **Usage**: `node tests/webcam/test_webcam_complete.js`

### `test_webcam_fixes.js`
- **Purpose**: Webcam fixes validation test
- **Tests**: Specific webcam bug fixes and improvements
- **Usage**: `node tests/webcam/test_webcam_fixes.js`

### `simple_webcam_test.py`
- **Purpose**: Simple Python-based webcam hardware test
- **Tests**: Basic camera access and frame capture using OpenCV
- **Usage**: `python3 tests/webcam/simple_webcam_test.py`

## Running Webcam Tests

```bash
# Run all webcam tests
npm run test:webcam

# Run individual tests
node tests/webcam/test_task_16_webcam_fixes.js
node tests/webcam/test_webcam_complete.js
node tests/webcam/test_webcam_fixes.js
python3 tests/webcam/simple_webcam_test.py
```

## Test Requirements

- OpenCV installed (`pip install opencv-python`)
- Camera hardware available (USB webcam or RPI camera)
- MonsterBox application running (for API tests)
- SSH access to RPI systems (for hardware tests)

## Hardware Compatibility

- **Primary Target**: Orlok RPI4b system (192.168.8.120)
- **Camera Support**: USB webcams, RPI camera modules
- **Resolution**: 640x480 to 1920x1080
- **Formats**: MJPEG, H.264 streaming

## Notes

- Python tests require OpenCV and camera hardware
- JavaScript tests require MonsterBox application running
- Some tests are designed specifically for RPI4b hardware
- Tests may fail on systems without proper camera setup
