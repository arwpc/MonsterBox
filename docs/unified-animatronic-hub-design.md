# Unified Animatronic Hub - Design Plan

## 🎯 Overview

This document outlines the design for consolidating MonsterBox animatronic services into a unified hub architecture. The goal is to replace the current fragmented multi-port system with a single secure endpoint per animatronic that handles both monitoring and control.

## 🏗️ Current Architecture Problems

### Issues with Current System:
- **Port Fragmentation**: 6-8 different ports per animatronic (8771, 8778, 8776, 8780, 8770, 8772, 8872, 8873)
- **Security Complexity**: Multiple SSL certificates, CSP violations, mixed content issues
- **Service Duplication**: Separate Light Service when lights should be part of hardware control
- **Network Complexity**: Cross-network WebSocket connections, firewall management
- **Monitoring Overhead**: Individual service checks instead of consolidated status

### Current Service Structure:
```
Animatronic (e.g., PumpkinHead - 192.168.1.200)
├── ElevenLabs Conversational (8771) + SSL Proxy (8872)
├── ElevenLabs STT (8778) + SSL Proxy (8873)  
├── Motor Service (8776)
├── Light Service (8780) ← REDUNDANT
├── Servo Service (8770)
├── Sensor Service (8772)
└── Main MonsterBox App (3000/8080)
```

## 🎯 Target Architecture

### Unified Hub Structure:
```
Animatronic (e.g., PumpkinHead - 192.168.1.200)
└── Unified Animatronic Hub (3000/8080) - SINGLE SECURE ENDPOINT
    ├── Main Hardware Server (motors, servos, lights, LEDs, PIR sensors, actuators)
    ├── Microphone Service (STT, live audio streaming)
    ├── WebCam Service (video capture, shared resource)
    └── AI/Conversational Service (ElevenLabs integration, personality)
```

## 📋 Service Consolidation Plan

### 1. Main Hardware Server 🔧
**Consolidates**: Motor Service + Light Service + Servo Service + Sensor Service + Actuator Service

**Responsibilities**:
- All physical hardware control (motors, servos, lights, LEDs, PIR sensors, actuators)
- Coordinated movements (synchronize lights with motor movements)
- Hardware state management (track position of all servos, light states, sensor readings)
- Safety controls (prevent conflicting commands, enforce hardware limits)
- Real-time hardware status monitoring

**API Interface**:
```javascript
POST /api/hub/hardware
{
    "component": "servo|motor|lights|sensor|actuator",
    "action": "move|set|read|run",
    "params": { /* component-specific parameters */ }
}
```

### 2. Microphone Service 🎤
**Keeps**: Current microphone functionality but accessible through hub

**Responsibilities**:
- Audio input handling (STT, live audio streaming)
- Audio processing (noise reduction, voice detection)
- Multiple microphone support
- Real-time audio data via WebSocket

**API Interface**:
```javascript
GET /api/hub/microphone/status
POST /api/hub/microphone/start_recording
WebSocket /api/hub/microphone/live_audio
```

### 3. WebCam Service 📹
**Exposes**: Video capture as shared resource for all services

**Responsibilities**:
- Video capture with multiple camera support
- Stream management (different resolutions/formats)
- Computer vision ready (face detection, motion tracking feeds)
- Shared resource accessible by any service

**API Interface**:
```javascript
GET /api/hub/webcam/status
GET /api/hub/webcam/snapshot
WebSocket /api/hub/webcam/live_video
```

### 4. AI/Conversational Service 🤖
**Consolidates**: ElevenLabs Conversational + ElevenLabs STT services

**Responsibilities**:
- ElevenLabs integration (STT, TTS, conversational AI)
- Character personality maintenance
- Context awareness (can request webcam/sensor data)
- Voice-activated responses

**API Interface**:
```javascript
POST /api/hub/ai/speak
POST /api/hub/ai/conversation
WebSocket /api/hub/ai/live_conversation
```

## 🔌 Unified API Design

### Single Endpoint Structure:
**Base URL**: `https://[animatronic-hostname]:3000/api/hub`

### Core Endpoints:

#### System Status (Monitoring)
```javascript
GET /api/hub/status
Response: {
    "hostname": "pumpkinhead",
    "ip": "192.168.1.200",
    "timestamp": "2025-08-30T17:30:00Z",
    "hardware": {
        "servos": { "head_pan": { "position": 90, "status": "ready" } },
        "motors": { "jaw": { "status": "idle" } },
        "lights": { "eyes": { "color": "#ff0000", "brightness": 80 } },
        "sensors": { "pir": { "motion_detected": false } }
    },
    "microphone": { "status": "ready", "recording": false },
    "webcam": { "status": "online", "resolution": "1920x1080" },
    "ai": { "status": "ready", "character": "PumpkinHead" },
    "summary": { "services_online": 4, "services_offline": 0 }
}
```

#### Hardware Control
```javascript
POST /api/hub/hardware
Examples:
- Servo: { "component": "servo", "action": "move", "params": { "servo_id": "head_pan", "position": 90 } }
- Lights: { "component": "lights", "action": "set", "params": { "zone": "eyes", "color": "#ff0000" } }
- Motor: { "component": "motor", "action": "run", "params": { "motor_id": "jaw", "direction": "open" } }
- Sensor: { "component": "sensor", "action": "read", "params": { "sensor_type": "pir" } }
```

#### Coordinated Sequences
```javascript
POST /api/hub/sequence
{
    "name": "scary_greeting",
    "steps": [
        { "component": "lights", "action": "flash", "params": { "color": "red" } },
        { "component": "servo", "action": "move", "params": { "servo_id": "head", "position": 45 } },
        { "component": "ai", "action": "speak", "params": { "text": "Welcome!" } }
    ]
}
```

#### Real-time Updates
```javascript
WebSocket /api/hub/events
Message Types:
- hardware_status_change
- microphone_activity
- webcam_motion_detected
- ai_conversation_state
- system_health_update
```

## 🔒 Security & Authentication

### Single Secure Connection:
- **One SSL certificate** per animatronic
- **Unified authentication** - authenticate once, control everything
- **Simplified CSP** - only need HTTPS to animatronic IPs
- **No mixed content issues** - all communication over HTTPS

### Authentication Flow:
```javascript
POST /api/hub/auth/login
{
    "username": "remote",
    "password": "klrklr89!",
    "client_info": "MonsterBox Control Panel"
}

Response: {
    "token": "jwt_token_here",
    "expires": "2025-08-30T18:30:00Z",
    "permissions": ["hardware_control", "monitoring", "ai_interaction"]
}
```

## 📁 File Structure

### New Hub Implementation:
```
services/
├── unified-hub/
│   ├── UnifiedAnimatronicHub.js          # Main hub controller
│   ├── MainHardwareServer.js             # Consolidated hardware control
│   ├── MicrophoneService.js              # Audio input (existing, integrated)
│   ├── WebCamService.js                  # Video capture (existing, exposed)
│   ├── AIConversationalService.js        # ElevenLabs integration
│   ├── SequenceManager.js                # Coordinated action sequences
│   ├── SecurityManager.js                # Authentication & authorization
│   └── StatusMonitor.js                  # System health monitoring
├── routes/
│   └── hubRoutes.js                      # API route definitions
└── middleware/
    └── hubAuth.js                        # Authentication middleware
```

## 🚀 Implementation Phases

### Phase 1: Monitoring Hub (Week 1)
- [ ] Create UnifiedAnimatronicHub.js skeleton
- [ ] Implement StatusMonitor.js for consolidated service status
- [ ] Add GET /api/hub/status endpoint
- [ ] Update services-monitor page to use hub endpoint
- [ ] Test monitoring functionality

### Phase 2: Hardware Consolidation (Week 2)
- [ ] Create MainHardwareServer.js
- [ ] Migrate Light Service functionality into MainHardwareServer
- [ ] Implement POST /api/hub/hardware endpoint
- [ ] Add hardware control interface
- [ ] Test hardware control functionality

### Phase 3: Service Integration (Week 3)
- [ ] Integrate existing Microphone Service through hub
- [ ] Expose WebCam Service through hub API
- [ ] Consolidate ElevenLabs services into AIConversationalService
- [ ] Implement service-to-service communication
- [ ] Test integrated functionality

### Phase 4: Advanced Features (Week 4)
- [ ] Implement SequenceManager for coordinated actions
- [ ] Add WebSocket support for real-time updates
- [ ] Implement authentication and security
- [ ] Add remote control capabilities
- [ ] Performance optimization and testing

### Phase 5: Migration & Cleanup (Week 5)
- [ ] Migrate all animatronics to hub architecture
- [ ] Update all client applications to use hub API
- [ ] Remove deprecated individual services
- [ ] Update documentation and deployment scripts
- [ ] Final testing and validation

## 🎮 Remote Control Benefits

### Simplified Remote Operations:
```javascript
// Control PumpkinHead from Skulltalker
const pumpkinHead = new RemoteAnimatronic('192.168.1.200');

// Simple hardware control
await pumpkinHead.hardware.lights.set({ color: 'red', brightness: 100 });
await pumpkinHead.hardware.servo.move({ id: 'head_pan', position: 45 });

// Get live feeds
const videoStream = await pumpkinHead.webcam.getLiveStream();
const audioStream = await pumpkinHead.microphone.getLiveAudio();

// Execute complex sequences
await pumpkinHead.sequence.run('scary_greeting');

// Monitor status
const status = await pumpkinHead.getStatus();
```

### Network Simplification:
- **Before**: 8 ports per animatronic × 4 animatronics = 32 network endpoints
- **After**: 1 port per animatronic × 4 animatronics = 4 network endpoints
- **Firewall Rules**: Reduced from 32 to 4 rules
- **SSL Certificates**: Reduced from 8 to 1 per animatronic

## 📊 Success Metrics

### Technical Metrics:
- [ ] Reduce network ports from 8 to 1 per animatronic
- [ ] Eliminate CSP violations and mixed content errors
- [ ] Achieve <100ms response time for status checks
- [ ] Support coordinated multi-service actions
- [ ] 99.9% uptime for hub services

### User Experience Metrics:
- [ ] Single-click animatronic connection
- [ ] Real-time status updates
- [ ] Simplified remote control interface
- [ ] Coordinated animation sequences
- [ ] Unified error reporting

## 🔧 Migration Strategy

### Backward Compatibility:
- Keep existing services running during migration
- Implement hub as proxy to existing services initially
- Gradually move functionality into hub
- Remove individual services only after full migration

### Testing Strategy:
- Unit tests for each hub component
- Integration tests for service communication
- End-to-end tests for remote control
- Performance tests for concurrent operations
- Security tests for authentication and authorization

## 💻 Technical Implementation Details

### UnifiedAnimatronicHub.js Structure:
```javascript
class UnifiedAnimatronicHub {
    constructor() {
        this.services = {
            hardware: new MainHardwareServer(),
            microphone: new MicrophoneService(),
            webcam: new WebCamService(),
            ai: new AIConversationalService()
        };
        this.statusMonitor = new StatusMonitor(this.services);
        this.sequenceManager = new SequenceManager(this.services);
        this.securityManager = new SecurityManager();
    }

    async handleRequest(req, res) {
        // Unified request handler for all hub endpoints
        const { endpoint, method, data } = this.parseRequest(req);

        // Authentication check
        if (!await this.securityManager.authenticate(req)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Route to appropriate service
        switch(endpoint) {
            case 'status': return await this.getSystemStatus();
            case 'hardware': return await this.services.hardware.execute(data);
            case 'microphone': return await this.services.microphone.handle(data);
            case 'webcam': return await this.services.webcam.handle(data);
            case 'ai': return await this.services.ai.handle(data);
            case 'sequence': return await this.sequenceManager.execute(data);
            default: return res.status(404).json({ error: 'Endpoint not found' });
        }
    }

    async getSystemStatus() {
        return {
            hostname: os.hostname(),
            ip: this.getLocalIP(),
            timestamp: new Date().toISOString(),
            services: await this.statusMonitor.checkAllServices(),
            summary: await this.statusMonitor.getSummary()
        };
    }
}
```

### MainHardwareServer.js (Consolidated Hardware Control):
```javascript
class MainHardwareServer {
    constructor() {
        this.components = {
            servos: new ServoController(),
            motors: new MotorController(),
            lights: new LightController(),    // Absorbed from Light Service
            sensors: new SensorController(),
            actuators: new ActuatorController()
        };
        this.state = new HardwareStateManager();
        this.safety = new SafetyController();
    }

    async execute(command) {
        const { component, action, params } = command;

        // Safety check
        if (!this.safety.validateCommand(command)) {
            throw new Error(`Unsafe command: ${JSON.stringify(command)}`);
        }

        // Execute command
        const controller = this.components[component];
        if (!controller) {
            throw new Error(`Unknown component: ${component}`);
        }

        const result = await controller[action](params);

        // Update state
        await this.state.updateComponentState(component, result);

        return result;
    }

    async getStatus() {
        const status = {};
        for (const [name, controller] of Object.entries(this.components)) {
            status[name] = await controller.getStatus();
        }
        return status;
    }
}
```

### StatusMonitor.js (System Health Monitoring):
```javascript
class StatusMonitor {
    constructor(services) {
        this.services = services;
        this.lastCheck = {};
        this.healthHistory = [];
    }

    async checkAllServices() {
        const status = {};

        for (const [name, service] of Object.entries(this.services)) {
            try {
                status[name] = await this.checkService(service);
                status[name].status = 'online';
            } catch (error) {
                status[name] = {
                    status: 'offline',
                    error: error.message,
                    lastCheck: new Date().toISOString()
                };
            }
        }

        this.lastCheck = status;
        this.updateHealthHistory(status);

        return status;
    }

    async checkService(service) {
        // Service-specific health checks
        if (service.healthCheck) {
            return await service.healthCheck();
        }

        // Default health check
        return {
            status: 'online',
            lastCheck: new Date().toISOString()
        };
    }

    getSummary() {
        const services = Object.values(this.lastCheck);
        return {
            total: services.length,
            online: services.filter(s => s.status === 'online').length,
            offline: services.filter(s => s.status === 'offline').length,
            uptime: this.calculateUptime()
        };
    }
}
```

### SequenceManager.js (Coordinated Actions):
```javascript
class SequenceManager {
    constructor(services) {
        this.services = services;
        this.runningSequences = new Map();
        this.predefinedSequences = this.loadPredefinedSequences();
    }

    async execute(sequenceData) {
        const { name, steps } = sequenceData;
        const sequenceId = this.generateSequenceId();

        this.runningSequences.set(sequenceId, {
            name,
            steps,
            currentStep: 0,
            status: 'running',
            startTime: new Date()
        });

        try {
            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];

                // Update sequence progress
                this.runningSequences.get(sequenceId).currentStep = i;

                // Handle delays
                if (step.delay) {
                    await this.delay(step.delay);
                    continue;
                }

                // Execute service command
                const service = this.services[step.component];
                if (!service) {
                    throw new Error(`Unknown service: ${step.component}`);
                }

                await service.execute ?
                    service.execute(step) :
                    service.handle(step);
            }

            // Mark sequence as completed
            this.runningSequences.get(sequenceId).status = 'completed';

            return { sequenceId, status: 'completed' };

        } catch (error) {
            this.runningSequences.get(sequenceId).status = 'failed';
            this.runningSequences.get(sequenceId).error = error.message;
            throw error;
        }
    }

    loadPredefinedSequences() {
        return {
            'scary_greeting': [
                { component: 'lights', action: 'flash', params: { color: 'red', duration: 500 } },
                { delay: 200 },
                { component: 'servo', action: 'move', params: { servo_id: 'head_pan', position: 45 } },
                { component: 'ai', action: 'speak', params: { text: 'Welcome to my domain!' } }
            ],
            'nod_yes': [
                { component: 'servo', action: 'move', params: { servo_id: 'head_tilt', position: -15 } },
                { delay: 300 },
                { component: 'servo', action: 'move', params: { servo_id: 'head_tilt', position: 15 } },
                { delay: 300 },
                { component: 'servo', action: 'move', params: { servo_id: 'head_tilt', position: 0 } }
            ]
        };
    }
}
```

## 🔗 Integration Points

### Existing Service Integration:
1. **Microphone Service**: Wrap existing functionality with hub interface
2. **WebCam Service**: Expose existing streams through hub endpoints
3. **ElevenLabs Services**: Consolidate into single AI service
4. **Hardware Services**: Merge into MainHardwareServer

### Database Integration:
- Character configurations stored in existing `data/characters.json`
- Hardware state persistence in new `data/hardware-state.json`
- Sequence definitions in new `data/sequences.json`
- System logs in existing logging infrastructure

### WebSocket Integration:
```javascript
// Real-time updates through single WebSocket connection
const hubSocket = new WebSocket('wss://pumpkinhead:3000/api/hub/events');

hubSocket.onmessage = (event) => {
    const { type, service, data } = JSON.parse(event.data);

    switch(type) {
        case 'hardware_status_change':
            updateHardwareDisplay(data);
            break;
        case 'microphone_activity':
            updateAudioLevels(data);
            break;
        case 'sequence_progress':
            updateSequenceProgress(data);
            break;
    }
};
```

---

**Next Steps**: Begin Phase 1 implementation with monitoring hub creation.
