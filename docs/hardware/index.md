# Hardware Documentation

This section contains documentation for MonsterBox hardware components, services, and integration guides.

## Hardware Components

### Servo Motors
- **Standard Servos**: PWM-controlled servo motors for animatronic movement
- **High-Torque Servos**: Heavy-duty servos for large animatronic parts
- **Continuous Rotation**: Servos modified for continuous rotation

### Sensors
- **Motion Sensors**: PIR sensors for detecting movement
- **Proximity Sensors**: Ultrasonic and infrared distance sensors
- **Environmental Sensors**: Temperature, humidity, and light sensors

### Actuators
- **Linear Actuators**: Electric actuators for extending/retracting movements
- **Pneumatic Systems**: Air-powered actuators for rapid movements
- **Motor Controllers**: DC motor control for continuous movement

### Lighting
- **LED Strips**: Addressable RGB LED strips
- **Individual LEDs**: Single-color and RGB LEDs
- **Light Controllers**: PWM controllers for brightness control

### Audio/Visual
- **Webcams**: USB cameras for computer vision
- **Microphones**: Audio input for voice recognition
- **Speakers**: Audio output for character voices

## Hardware Services

### WebSocket Services
MonsterBox uses a distributed WebSocket architecture for hardware control:

- **Port 8770**: Service Registry
- **Port 8771**: Motor Service
- **Port 8772**: Light Service
- **Port 8773**: Sensor Service
- **Port 8774**: Webcam Service
- **Port 8775**: Actuator Service
- **Port 8778**: Head Tracking Service
- **Port 8780**: Main Hardware Service

### Service Architecture
- **Auto-Start**: All services start automatically with `npm start`
- **Health Monitoring**: Continuous service health checks
- **Real-Time Communication**: WebSocket-based control and status
- **Hardware Abstraction**: Unified API for different hardware types

## Hardware Integration

### [Head Tracking System](head-tracking.md)
Computer vision-based head tracking for animatronic characters:
- Real-time person detection using OpenCV
- Servo-controlled head movement
- WebSocket integration for remote control
- Character-specific configuration

### GPIO Management
- **Pin Assignments**: [GPIO Assignments](gpio_assignments.md)
- **Conflict Resolution**: Automatic pin conflict detection
- **Safety Limits**: Hardware protection and limits
- **Calibration**: Per-device calibration storage

### Power Management
- **12V Power Bus**: Linear actuators and large 12V servos are wired into a shared 12V bus
- **5V Fuse Protection**: The 12V bus is protected by intentionally undersized 5V fuses that blow before harming people or hardware — a safety-first design
- **Power Distribution**: Safe power distribution for multiple devices
- **Current Monitoring**: Overcurrent protection
- **Shutdown Procedures**: Safe hardware shutdown

## Hardware Monitoring

### Real-Time Monitoring
- **Hardware Monitor**: Web interface at `/hardware-monitor.html`
- **Service Status**: Real-time service health monitoring
- **Performance Metrics**: CPU, memory, and hardware utilization
- **Error Reporting**: Automatic error detection and reporting

### Diagnostic Tools
- **Dependency Checkers**: Automated hardware dependency verification
- **Connection Tests**: Hardware connectivity testing
- **Performance Benchmarks**: Hardware performance testing
- **Calibration Tools**: Interactive calibration interfaces

## Configuration

### Parts System
Hardware components are managed through the Parts system:
- **Part Types**: Servo, sensor, actuator, light, webcam, head-tracking
- **Character Assignment**: Parts assigned to specific characters
- **Configuration Storage**: JSON-based configuration files
- **Runtime Updates**: Dynamic configuration changes

### Character Integration
- **Character-Specific Hardware**: Parts assigned per character
- **Service Mapping**: Services mapped to character requirements
- **Behavior Profiles**: Hardware behavior patterns per character
- **Safety Profiles**: Character-specific safety limits

## Testing

### Hardware Testing
- **Unit Tests**: Individual component testing
- **Integration Tests**: Multi-component system testing
- **Performance Tests**: Hardware performance validation
- **Safety Tests**: Hardware safety limit verification

### Test Tools
- **Automated Testing**: `npm run test:hardware-comprehensive`
- **Manual Testing**: Interactive hardware testing interfaces
- **Load Testing**: Hardware stress testing
- **Regression Testing**: Automated regression test suites

## Setup Guides

### Initial Setup
- **[Animatronic Setup Guide](../setup/ANIMATRONIC-SETUP-GUIDE.md)**: Complete animatronic setup
- **[Head Tracking Setup](../setup/HEAD-TRACKING-SETUP.md)**: Head tracking system setup
- **[SSH Setup](../setup/ANIMATRONIC-SSH-SETUP.md)**: Remote access configuration

### Hardware-Specific Guides
- **Servo Calibration**: Step-by-step servo calibration
- **Camera Configuration**: Webcam setup and optimization
- **Sensor Integration**: Motion and proximity sensor setup
- **Lighting Systems**: LED strip and lighting configuration

## Troubleshooting

### Common Issues
- **Service Startup**: Hardware service startup problems
- **GPIO Conflicts**: Pin assignment conflicts
- **Power Issues**: Insufficient power or overcurrent
- **Communication Errors**: WebSocket communication problems

### Diagnostic Procedures
- **Service Health Check**: Verify all services are running
- **Hardware Detection**: Confirm hardware is detected
- **Connection Testing**: Test hardware connections
- **Performance Analysis**: Identify performance bottlenecks

## Development

### Adding New Hardware
- **Service Creation**: Creating new hardware services
- **WebSocket Integration**: Integrating with WebSocket architecture
- **Configuration Schema**: Defining configuration parameters
- **Testing Framework**: Creating tests for new hardware

### Hardware Abstraction Layer
- **Unified API**: Common interface for different hardware types
- **Driver Architecture**: Hardware-specific driver implementation
- **Plugin System**: Extensible hardware plugin architecture
- **Compatibility Layer**: Supporting different hardware versions

## Safety

### Hardware Safety
- **Electrical Safety**: Proper grounding and isolation
- **Mechanical Safety**: Movement limits and collision detection
- **Thermal Safety**: Temperature monitoring and protection
- **Emergency Stops**: Hardware emergency stop procedures

### Software Safety
- **Limit Enforcement**: Software-enforced hardware limits
- **Watchdog Timers**: Automatic safety shutdowns
- **Error Recovery**: Automatic error recovery procedures
- **Safe Defaults**: Safe default configurations

## Performance

### Optimization
- **Resource Management**: Efficient resource utilization
- **Real-Time Performance**: Meeting real-time requirements
- **Scalability**: Supporting multiple hardware devices
- **Power Efficiency**: Minimizing power consumption

### Monitoring
- **Performance Metrics**: Real-time performance monitoring
- **Resource Usage**: CPU, memory, and I/O monitoring
- **Bottleneck Identification**: Performance bottleneck analysis
- **Optimization Recommendations**: Automated optimization suggestions

## See Also

- **[API Documentation](../api/api-documentation.md)**: Hardware API reference
- **[Testing Documentation](../testing/hardware.md)**: Hardware testing procedures
- **[Setup Documentation](../setup/)**: Hardware setup guides
- **[Development Documentation](../development/)**: Hardware development guides
