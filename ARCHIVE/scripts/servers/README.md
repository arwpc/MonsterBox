# Server Utilities

This directory contains standalone server utilities for development, testing, and debugging purposes.

## Files

### `simple_webcam_server.js`
- **Purpose**: Simple standalone webcam streaming server
- **Features**: Direct webcam streaming without complex routing, basic HTML interface
- **Usage**: `node scripts/servers/simple_webcam_server.js`
- **Port**: 3000
- **Endpoints**:
  - `/` - HTML interface for viewing stream
  - `/webcam/stream` - MJPEG webcam stream
  - `/webcam/test` - Camera test endpoint
  - `/test` - Server status check

### `monsterbox_webcam_server.js`
- **Purpose**: MonsterBox-specific webcam server with full integration
- **Features**: Character-based webcam management, streaming service integration
- **Usage**: `node scripts/servers/monsterbox_webcam_server.js`
- **Dependencies**: MonsterBox services and character data

## Running Servers

```bash
# Simple webcam server (standalone)
node scripts/servers/simple_webcam_server.js

# MonsterBox webcam server (requires full environment)
node scripts/servers/monsterbox_webcam_server.js
```

## Use Cases

### Development
- Test webcam functionality without full MonsterBox setup
- Debug streaming issues in isolation
- Prototype new webcam features

### Testing
- Validate camera hardware before integration
- Test streaming performance
- Debug network connectivity issues

### Debugging
- Isolate webcam problems from main application
- Test different camera configurations
- Validate streaming protocols

## Requirements

- **Camera Hardware**: USB webcam or RPI camera module
- **Python Dependencies**: OpenCV (`pip install opencv-python`)
- **Network**: Port 3000 available
- **System**: Linux/RPI for optimal camera support

## Notes

- Simple server is designed for quick testing and development
- MonsterBox server requires full application environment
- Servers are not intended for production use
- Use for development and testing purposes only
