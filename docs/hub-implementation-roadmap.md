# Unified Animatronic Hub - Implementation Roadmap

## 🎯 Project Overview
Transform MonsterBox from a fragmented multi-port architecture to a unified single-endpoint system per animatronic.

**Goal**: One secure connection per animatronic for both monitoring and control.

## 📋 Phase 1: Monitoring Hub Foundation (Week 1)

### Day 1-2: Core Hub Structure
- [ ] **Create services/unified-hub/ directory structure**
- [ ] **Implement UnifiedAnimatronicHub.js skeleton**
  ```javascript
  class UnifiedAnimatronicHub {
      constructor() { /* Initialize services */ }
      async handleRequest(req, res) { /* Route requests */ }
      async getSystemStatus() { /* Consolidated status */ }
  }
  ```
- [ ] **Add routes/hubRoutes.js for API endpoints**
- [ ] **Create GET /api/hub/status endpoint**

### Day 3-4: Status Monitoring
- [ ] **Implement StatusMonitor.js**
  - Service health checking
  - Status aggregation
  - Health history tracking
- [ ] **Test local service status collection**
- [ ] **Add system metrics (CPU, memory, disk)**

### Day 5-7: Services Monitor Integration
- [ ] **Update views/hardware-monitor.ejs**
  - Replace individual service checks with hub status call
  - Single API call: `GET /api/hub/status`
  - Display consolidated service status
- [ ] **Test monitoring functionality**
- [ ] **Validate remote character monitoring**

### Phase 1 Success Criteria:
✅ Single API call returns all service status  
✅ Services monitor page shows consolidated status  
✅ No more individual port connections for monitoring  
✅ Remote character monitoring works via hub  

## 📋 Phase 2: Hardware Consolidation (Week 2)

### Day 1-2: MainHardwareServer Foundation
- [ ] **Create MainHardwareServer.js**
  ```javascript
  class MainHardwareServer {
      constructor() {
          this.components = { servos, motors, lights, sensors, actuators };
      }
      async execute(command) { /* Unified hardware control */ }
  }
  ```
- [ ] **Implement component controllers**
  - ServoController
  - MotorController  
  - LightController (absorb Light Service)
  - SensorController
  - ActuatorController

### Day 3-4: Hardware API Implementation
- [ ] **Add POST /api/hub/hardware endpoint**
- [ ] **Implement unified command structure**
  ```javascript
  {
      "component": "servo|motor|lights|sensor|actuator",
      "action": "move|set|read|run",
      "params": { /* component-specific */ }
  }
  ```
- [ ] **Add hardware state management**
- [ ] **Implement safety controls**

### Day 5-7: Light Service Migration
- [ ] **Identify all Light Service functionality**
- [ ] **Migrate light control to MainHardwareServer**
- [ ] **Update existing light control interfaces**
- [ ] **Test hardware control functionality**
- [ ] **Deprecate separate Light Service**

### Phase 2 Success Criteria:
✅ All hardware controllable through single endpoint  
✅ Light Service functionality fully migrated  
✅ Hardware state tracking working  
✅ Safety controls prevent conflicts  

## 📋 Phase 3: Service Integration (Week 3)

### Day 1-2: Microphone Service Integration
- [ ] **Wrap existing MicrophoneService with hub interface**
- [ ] **Add microphone endpoints to hub**
  ```javascript
  GET /api/hub/microphone/status
  POST /api/hub/microphone/start_recording
  WebSocket /api/hub/microphone/live_audio
  ```
- [ ] **Test microphone functionality through hub**

### Day 3-4: WebCam Service Exposure
- [ ] **Expose existing WebCamService through hub**
- [ ] **Add webcam endpoints to hub**
  ```javascript
  GET /api/hub/webcam/status
  GET /api/hub/webcam/snapshot
  WebSocket /api/hub/webcam/live_video
  ```
- [ ] **Make webcam accessible to other services**
- [ ] **Test video streaming through hub**

### Day 5-7: AI Service Consolidation
- [ ] **Create AIConversationalService.js**
- [ ] **Consolidate ElevenLabs Conversational + STT services**
- [ ] **Add AI endpoints to hub**
  ```javascript
  POST /api/hub/ai/speak
  POST /api/hub/ai/conversation
  WebSocket /api/hub/ai/live_conversation
  ```
- [ ] **Test AI functionality through hub**

### Phase 3 Success Criteria:
✅ All services accessible through hub  
✅ Microphone service integrated  
✅ WebCam service exposed and shared  
✅ AI services consolidated  

## 📋 Phase 4: Advanced Features (Week 4)

### Day 1-2: Sequence Manager
- [ ] **Implement SequenceManager.js**
- [ ] **Add coordinated action support**
  ```javascript
  POST /api/hub/sequence
  {
      "name": "scary_greeting",
      "steps": [
          { "component": "lights", "action": "flash" },
          { "delay": 500 },
          { "component": "servo", "action": "move" },
          { "component": "ai", "action": "speak" }
      ]
  }
  ```
- [ ] **Create predefined sequence library**

### Day 3-4: Real-time Updates
- [ ] **Implement WebSocket support**
  ```javascript
  WebSocket /api/hub/events
  ```
- [ ] **Add real-time status updates**
- [ ] **Implement event broadcasting**
- [ ] **Test real-time functionality**

### Day 5-7: Security & Authentication
- [ ] **Implement SecurityManager.js**
- [ ] **Add JWT-based authentication**
  ```javascript
  POST /api/hub/auth/login
  ```
- [ ] **Add permission-based access control**
- [ ] **Test security functionality**

### Phase 4 Success Criteria:
✅ Coordinated sequences working  
✅ Real-time updates via WebSocket  
✅ Authentication and authorization  
✅ Security controls in place  

## 📋 Phase 5: Migration & Cleanup (Week 5)

### Day 1-2: Client Application Updates
- [ ] **Update all MonsterBox UI components to use hub API**
- [ ] **Update remote control interfaces**
- [ ] **Test all client functionality**

### Day 3-4: Service Deprecation
- [ ] **Identify all deprecated individual services**
- [ ] **Create migration scripts**
- [ ] **Gradually disable individual services**
- [ ] **Update port configurations**

### Day 5-7: Final Testing & Documentation
- [ ] **Comprehensive end-to-end testing**
- [ ] **Performance testing and optimization**
- [ ] **Update deployment scripts**
- [ ] **Update user documentation**
- [ ] **Final validation across all animatronics**

### Phase 5 Success Criteria:
✅ All animatronics using hub architecture  
✅ Individual services removed  
✅ Documentation updated  
✅ Deployment scripts updated  

## 🎯 Success Metrics

### Technical Metrics:
- **Network Ports**: Reduced from 8 to 1 per animatronic
- **API Response Time**: <100ms for status checks
- **Service Uptime**: 99.9% availability
- **Security**: Zero CSP violations or mixed content errors

### User Experience Metrics:
- **Connection Time**: Single-click animatronic connection
- **Status Updates**: Real-time service status
- **Control Interface**: Unified hardware control
- **Error Handling**: Clear, actionable error messages

## 🔧 Development Guidelines

### Code Standards:
- **ES6+ JavaScript** with async/await
- **Comprehensive error handling** with try/catch
- **Logging** for all major operations
- **Unit tests** for all new components
- **JSDoc comments** for all public methods

### Testing Strategy:
- **Unit Tests**: Each component tested in isolation
- **Integration Tests**: Service-to-service communication
- **End-to-End Tests**: Full user workflows
- **Performance Tests**: Load and stress testing
- **Security Tests**: Authentication and authorization

### Git Workflow:
- **Feature branches** for each phase
- **Pull requests** for code review
- **Automated testing** on all commits
- **Staging deployment** before production

## 📁 File Organization

### New Directory Structure:
```
services/
├── unified-hub/
│   ├── UnifiedAnimatronicHub.js
│   ├── MainHardwareServer.js
│   ├── StatusMonitor.js
│   ├── SequenceManager.js
│   ├── SecurityManager.js
│   └── components/
│       ├── ServoController.js
│       ├── MotorController.js
│       ├── LightController.js
│       ├── SensorController.js
│       └── ActuatorController.js
├── routes/
│   └── hubRoutes.js
├── middleware/
│   └── hubAuth.js
└── tests/
    └── hub/
        ├── unit/
        ├── integration/
        └── e2e/
```

## 🚀 Getting Started

### Prerequisites:
- Node.js 16+ installed
- MonsterBox development environment set up
- Access to test animatronic hardware
- Understanding of existing MonsterBox architecture

### First Steps:
1. **Review existing codebase** - understand current service structure
2. **Set up development branch** - create feature branch for hub development
3. **Create directory structure** - set up services/unified-hub/
4. **Begin Phase 1** - implement basic monitoring hub

---

**Ready to transform MonsterBox into a unified, powerful animatronic control system!** 🎃
