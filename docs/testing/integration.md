# Integration Testing

## Overview

Integration testing ensures that different components of MonsterBox work together correctly, including hardware services, AI integrations, and web interfaces.

## Integration Test Categories

### 1. Hardware Integration Tests
- **WebSocket Services**: Test communication between Node.js and Python hardware services
- **GPIO Integration**: Verify GPIO control across different hardware types
- **Multi-Character Coordination**: Test simultaneous operation of multiple animatronics

### 2. AI Service Integration
- **Voice Synthesis**: ElevenLabs TTS integration testing (`eleven_flash_v2_5`)
- **Character AI**: ElevenLabs Conversational AI agent response testing
- **Conversation Integration**: Jaw animation synchronized with TTS output

### 3. Web Interface Integration
- **Real-time Updates**: WebSocket communication testing
- **Hardware Control**: Web interface to hardware service communication
- **Scene Playback**: End-to-end scene execution testing

## Running Integration Tests

### Full Integration Test Suite
```bash
npm run test:integration
```

### Specific Integration Tests
```bash
# WebSocket integration
npm run test:websockets-full

# Hardware services integration
npm run test:hardware-services

# AI integration tests
mocha tests/enhanced-ai-integration.test.js
```

### Remote System Integration
```bash
# Test SSH connectivity to animatronics
npm run test:animatronic-ssh

# Test MCP log collection
npm run test:mcp-remote
```

## Test Environments

### Local Development
- Mock hardware services for development
- Simulated GPIO operations
- Local AI service testing

### Raspberry Pi Testing
- Real hardware integration
- Actual GPIO control
- Network service testing

### Production Environment
- Full system integration
- Multi-character coordination
- Performance testing

## Integration Test Scenarios

### Scenario 1: Character Activation
1. Character selection via web interface
2. Hardware service initialization
3. AI character activation
4. Real-time monitoring activation

### Scenario 2: Scene Playback
1. Scene selection and configuration
2. Multi-character coordination
3. Synchronized hardware control
4. Audio/visual synchronization

### Scenario 3: Remote Monitoring
1. MCP log collection activation
2. Real-time status monitoring
3. Error detection and reporting
4. Automated recovery procedures

## Test Data and Fixtures

Integration tests use:
- Character configurations from `data/characters.json`
- Test scenes in `data/scenes.json`
- Mock hardware responses
- Simulated AI responses

## Monitoring and Reporting

### Real-time Monitoring
- Hardware service status at `/hardware-monitor.html`
- WebSocket connection status
- Service health checks

### Test Reports
- Integration test results in `tests/reports/`
- Performance metrics
- Error logs and debugging information

## Troubleshooting Integration Issues

### Common Problems

1. **Service Communication Failures**
   - Check WebSocket port availability
   - Verify service startup order
   - Review network connectivity

2. **Hardware Integration Issues**
   - Verify GPIO permissions
   - Check hardware connections
   - Review calibration settings

3. **AI Service Integration**
   - Verify API keys and quotas
   - Check network connectivity
   - Review service configurations

### Debug Tools

- **MCP Log Collection**: Comprehensive log analysis
- **Hardware Monitor**: Real-time service status
- **WebSocket Debugger**: Connection and message testing
