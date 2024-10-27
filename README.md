# MonsterBox

A Node.js application for managing and controlling interactive animatronic displays through scenes, sounds, and various hardware components.

## Features

- Scene Management: Create, edit, and execute complex animatronic scenes
- Character Management: Manage different character profiles and their associated components
- Hardware Control:
  - Servo Motors
  - LED Controls
  - Linear Actuators
  - Motors
  - Light Controls
  - Sensors
- Sound Management: Upload and play audio files
- Voice Integration: Voice selection and management
- Camera Integration: Live camera feed and head tracking capabilities
- Active Mode: Real-time control and monitoring
- Comprehensive Logging System

## Hardware Components

### Core System
- **Raspberry Pi**: RPi4b with 4GB RAM and 256GB SD Card
- **USB Audio**: External USB Sound Card Adapter for audio output

### Servo Control
- **Controller**: PCA9685 16-Channel Servo Controller
- **Servos**:
  - Hooyij DS3240MG 40kg Waterproof High Torque Servo Motor
    - Full metal gear
    - Waterproof design
    - High torque capacity
  - Miuzei MG90S 9G Micro Servo Motor
    - Compact design
    - Suitable for lighter applications
  - Gobilda Stingray 2 Servo Gearbox
    - Used for animatronic head movement
    - 0.34 sec/60° speed
    - 30RPM
    - 700 oz-in torque
    - 900° rotation range

### Motor Control System
- **Control Board**: Cytron 2-channel 10A Motor Driver
- **Linear Actuators**:
  - 150mm Stroke Actuator
    - Used for Baphomet's Arms
    - Precise position control
  - 12" Stroke Actuator
    - Used for coffin door mechanism
    - Heavy-duty applications
- **Motors**:
  - Jeep Wrangler Wiper Motor
    - Robust design
    - High torque capability

### Sensors
- **Motion Detection**: PIR Motion Sensor
  - HC-SR501 Infrared Sensor
  - Adjustable sensitivity
  - Wide detection range

## Dependencies

### Core Dependencies
- `express@4.21.1`: Web application framework
- `body-parser@1.20.3`: Request body parsing middleware
- `express-session@1.18.1`: Session middleware
- `ejs@3.1.10`: Templating engine
- `dotenv@16.4.5`: Environment variable management

### Hardware Control
- `i2c-bus@5.2.3`: I2C communication for hardware control
- `onoff@6.0.3`: GPIO control for Raspberry Pi
- `pca9685@5.0.0`: PWM controller for servos and LEDs

### Media Handling
- `hls.js@1.5.17`: HTTP Live Streaming client
- `mpg123@0.2.3`: Audio playback
- `multer@1.4.5-lts.1`: File upload handling
- `ws@8.18.0`: WebSocket client/server

### System Management
- `node-disk-info@1.3.0`: Disk information utilities
- `node-schedule@2.1.1`: Task scheduling
- `form-data@4.0.1`: Form data handling
- `jsdom@25.0.1`: DOM environment for testing

### Logging & Monitoring
- `winston@3.15.0`: Logging framework
- `winston-daily-rotate-file@4.7.1`: Log rotation

### Development & Testing
- `nodemon@3.1.7`: Development server with auto-reload
- `mocha@10.7.3`: Testing framework
- `chai@4.5.0`: Assertion library
- `chai-http@4.4.0`: HTTP integration testing
- `supertest@6.3.4`: HTTP assertions
- `axios@1.7.7`: HTTP client

### Authentication & Tools
- `replit-auth@5.0.3`: Authentication utilities
- `repopack@0.1.43`: Repository management tools

## System Requirements

- Node.js >= 14.0.0
- Python (for hardware control scripts)
- Required hardware components as detailed in Hardware Components section
- Network connectivity for web interface access
- USB ports for audio and peripheral connections
- I2C interface enabled on Raspberry Pi

## Installation

1. Clone the repository:
```bash
git clone https://github.com/your-repo/monsterbox.git
cd monsterbox
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

## Project Structure

- `/controllers` - Business logic for different components
- `/data` - JSON data storage for characters, scenes, sounds, etc.
- `/public` - Static assets (CSS, images, sounds)
- `/routes` - Express route definitions
- `/scripts` - Python and JavaScript scripts for hardware control
- `/services` - Core service layer
- `/tests` - Test suites
- `/views` - EJS templates for the web interface

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

Run tests:
```bash
npm test
```

Run specific test suite:
```bash
npm run test:sound
```

## Logging System

MonsterBox uses Winston for centralized logging:

- Log files are stored in the `/log` directory
- Daily rotation with compression after 20MB
- 14-day retention policy
- Multiple log levels (debug, info, warn, error)

Configure logging level via environment variable:
```bash
export LOG_LEVEL=debug
```

## Scene Management

Scenes can be created and managed through the web interface, including:
- Step sequencing
- Component coordination
- Sound integration
- Timing control
- Character-specific behaviors

## API Routes

The application provides various REST endpoints for:
- Character management (`/api/characters`)
- Scene control (`/api/scenes`)
- Hardware control (`/api/servos`, `/api/leds`, etc.)
- Sound management (`/api/sounds`)
- System configuration (`/api/system-config`)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - See LICENSE file for details
