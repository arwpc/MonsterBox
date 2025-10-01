# MonsterBox Backend Architecture

## Overview

MonsterBox is built on a robust Node.js/Express backend with EJS templating, designed to manage complex animatronic systems across distributed Raspberry Pi hardware. The architecture emphasizes modularity, scalability, and real-time capabilities.

## Technology Stack

### Core Framework
- **Node.js**: v18.0.0+ runtime environment
- **Express.js**: v4.21.1 web application framework
- **EJS**: v3.1.9 embedded JavaScript templating engine

### Key Dependencies
- **dotenv**: v16.4.5 - Environment variable management
- **express-session**: v1.17.3 - Session management
- **winston**: v3.11.0 - Comprehensive logging
- **ws**: v8.14.2 - WebSocket support for real-time communication

### Hardware Integration
- **i2c-bus**: v5.2.3 - I2C communication for sensors and devices
- **onoff**: v6.0.3 - GPIO control for Raspberry Pi
- **mpg123**: v0.2.3 - Audio playback capabilities

## Application Structure

### Main Application (app.js)

#### Initialization Sequence
1. **Environment Setup**: Load environment variables and configure warnings
2. **Module Loading**: Import all required dependencies with error handling
3. **Express Configuration**: Set up middleware, templating, and static file serving
4. **Route Registration**: Mount all route handlers with proper prefixes
5. **Server Startup**: Initialize HTTP server with graceful error handling

#### Key Features
- **Graceful Error Handling**: Comprehensive uncaught exception and rejection handling
- **Graceful Shutdown**: Proper cleanup of resources on termination signals
- **Session Management**: Secure session handling with character context
- **Static File Serving**: Optimized serving of CSS, JS, and media files

### Route Architecture

#### Route Organization
```
/routes/
├── activeModeRoutes.js      # Automated scene cycling
├── cameraRoutes.js          # Video streaming and capture
├── characterRoutes.js       # Character management CRUD
├── cleanup.js               # System cleanup operations
├── healthRoutes.js          # Health monitoring endpoints
├── ledRoutes.js             # LED control operations
├── lightRoutes.js           # Light control operations
├── linearActuatorRoutes.js  # Linear actuator control
├── logRoutes.js             # Log viewing and management
├── motorRoutes.js           # Motor control operations
├── partRoutes.js            # Hardware part management
├── sceneRoutes.js           # Scene creation and execution
├── sensorRoutes.js          # Sensor monitoring and control
├── servoRoutes.js           # Servo motor control
├── soundRoutes.js           # Audio playback and management
├── systemConfigRoutes.js    # System configuration
└── voiceRoutes.js           # Text-to-speech integration
```

#### Route Mounting Strategy
- **Hierarchical Organization**: Parts routes use sub-mounting (`/parts/led`, `/parts/servo`)
- **RESTful Design**: Consistent HTTP verb usage across all endpoints
- **Character Context**: Global middleware ensures character selection persistence
- **Error Handling**: Standardized error responses across all routes

### Middleware Stack

#### Core Middleware (in order)
1. **JSON/URL Parsing**: `express.json()` and `express.urlencoded()`
2. **Static File Serving**: Public assets and script directory serving
3. **Session Management**: Express session with secure configuration
4. **Character Context**: Global character selection middleware
5. **Route Handlers**: Application-specific route processing

#### Security Considerations
- **Session Security**: Configurable session secrets with fallback
- **HTTPS Ready**: Cookie security settings prepared for HTTPS deployment
- **Input Validation**: JSON and URL-encoded body parsing with limits

## Service Layer Architecture

### Character Service
- **Centralized Character Management**: Single source of truth for character data
- **Async Operations**: Promise-based API for all character operations
- **Error Handling**: Comprehensive error handling with logging

### Sound Controller
- **Audio Management**: Centralized audio playback control
- **Graceful Shutdown**: Proper audio cleanup on application termination
- **Multi-format Support**: Support for various audio formats

## Real-time Communication

### WebSocket Integration
- **Audio Streaming**: Real-time audio stream management
- **Video Streaming**: Live video feed capabilities
- **Bidirectional Communication**: Full-duplex communication for control interfaces

### Stream Management
- **Server Integration**: WebSocket servers integrated with HTTP server
- **Resource Cleanup**: Proper stream cleanup on server shutdown
- **Error Recovery**: Automatic reconnection and error handling

## Configuration Management

### Environment Variables
```bash
# Core Application
PORT=3000                    # Server port
NODE_ENV=production          # Environment mode
SESSION_SECRET=your-secret   # Session encryption key

# Hardware Configuration
# (Hardware-specific variables as needed)
```

### File-based Configuration
- **Character Data**: JSON-based character configurations in `/data`
- **Scene Definitions**: Structured scene data with step definitions
- **Part Configurations**: Hardware part specifications and settings

## Error Handling Strategy

### Global Error Handling
- **Uncaught Exceptions**: Logged and trigger graceful shutdown
- **Unhandled Rejections**: Comprehensive logging with shutdown procedures
- **Process Signals**: SIGTERM and SIGINT handling for clean shutdown

### Route-level Error Handling
- **Try-Catch Blocks**: Comprehensive error catching in async routes
- **Error Responses**: Standardized error response format
- **Logging Integration**: All errors logged with context information

### Graceful Shutdown Process
1. **Signal Reception**: Capture termination signals
2. **Resource Cleanup**: Stop audio, close connections
3. **Server Shutdown**: Close HTTP server gracefully
4. **Forced Termination**: 10-second timeout for forced shutdown

## Performance Considerations

### Optimization Strategies
- **Static File Caching**: Optimized static file serving with proper MIME types
- **Session Efficiency**: Minimal session data storage
- **Async Operations**: Non-blocking I/O throughout the application
- **Resource Management**: Proper cleanup of hardware resources

### Monitoring and Logging
- **Winston Integration**: Structured logging throughout the application
- **Client-side Logging**: Browser error collection endpoint
- **Performance Metrics**: Built-in performance monitoring capabilities

## Development and Testing

### Test Environment
- **Environment Detection**: Automatic test environment detection
- **Server Startup**: Conditional server startup for testing
- **Mock Support**: Test-friendly architecture with dependency injection

### Development Features
- **Hot Reloading**: Nodemon integration for development
- **Debug Support**: Comprehensive logging and error reporting
- **Development Scripts**: NPM scripts for common development tasks

## Deployment Considerations

### Production Readiness
- **Environment Configuration**: Production-ready environment variable handling
- **Security Headers**: Prepared for security header implementation
- **HTTPS Support**: Ready for HTTPS deployment with minimal configuration
- **Process Management**: Compatible with PM2 and other process managers

### Scalability Features
- **Modular Architecture**: Easy to scale individual components
- **Stateless Design**: Session-based state management for horizontal scaling
- **Resource Isolation**: Clean separation between hardware and application logic

---

*This architecture documentation reflects the current implementation as of Task #1 completion. For specific implementation details, refer to the source code and related documentation.*
