# MonsterBox WebSocket Architecture Documentation

## Overview

The MonsterBox application uses a comprehensive WebSocket architecture for real-time communication between various services and the web interface. This document provides a complete analysis of the WebSocket implementation, including all services, connections, data flows, and identified issues.

## WebSocket Services Architecture

### Core WebSocket Services

#### 1. Jaw Animation WebSocket Server (`scripts/jaw_websocket_server.py`)
- **Port**: 8765
- **Purpose**: Controls jaw servo movements for animatronic characters
- **Protocol**: Python WebSocket server using `websockets` library
- **Key Features**:
  - Client registration and management
  - Jaw movement commands (`jaw_move`, `jaw_stop`)
  - Position feedback (`get_position`)
  - Status monitoring (`get_status`)
  - Event subscription system
  - Ping/pong heartbeat mechanism

#### 2. ChatterPi AI WebSocket Bridge (`scripts/chatterpi/ai_websocket_bridge.py`)
- **Port**: 8766
- **Purpose**: AI conversation system with jaw animation synchronization
- **Protocol**: Python WebSocket server
- **Key Features**:
  - Multi-character AI personalities (Count Orlok, RoboChat, Blackbeard)
  - Real-time chat processing
  - Jaw animation generation based on text
  - Character switching
  - AI integration with fallback responses

#### 3. Hardware Services WebSocket Ecosystem
- **Service Registry**: Port 8770
- **Main Hardware Server**: Port 8780
- **Motor Service**: Port 8771
- **Light Service**: Port 8772

#### 4. Dynamic WebSocket Proxy System (`services/dynamicWebSocketProxy.js`)
- **Purpose**: Proxy layer for hardware services
- **Proxy Ports**: 8790-8793
- **Features**:
  - Browser-to-hardware service bridging
  - Connection management
  - Message forwarding
  - Error handling

### WebSocket Client Implementations

#### 1. ChatterPi AI Chat Interface (`public/chatterpi-ai-chat.html`)
- **Connection**: ws://hostname:8766
- **Features**:
  - Real-time AI conversation
  - Character selection
  - Connection status monitoring
  - Auto-reconnection logic

#### 2. Hardware Monitor (`public/hardware-monitor.html`)
- **Connections**: Multiple WebSocket connections to hardware services
- **Features**:
  - Real-time hardware status monitoring
  - Webcam service integration (Port 8774)
  - Service health checking

#### 3. Head Tracking System (`views/part-forms/head-tracking.ejs`)
- **Connection**: ws://localhost:8778
- **Features**:
  - Real-time head tracking data
  - Preview functionality
  - Auto-reconnection

#### 4. Log Collection Dashboard (`public/js/log-collection-dashboard.js`)
- **Connection**: ws://hostname:8781
- **Features**:
  - Real-time log aggregation
  - Connection status monitoring
  - Auto-reconnection

## Data Flow Architecture

### ChatterPi AI System Flow
```
Web Client (8766) → AI Bridge → OpenAI API
                              ↓
                         Jaw Server (8765) → Servo Hardware
```

### Hardware Control Flow
```
Web Client → Proxy (8790-8793) → Hardware Services (8770-8772) → GPIO Hardware
```

### Real-time Monitoring Flow
```
Hardware Services → WebSocket Connections → Web Dashboard → User Interface
```

## Connection Management Patterns

### 1. Client Registration Pattern
- Used by: Jaw WebSocket Server, AI Bridge
- Features: Unique client IDs, connection tracking, welcome messages

### 2. Proxy Pattern
- Used by: Dynamic WebSocket Proxy
- Features: Browser-to-service bridging, message forwarding

### 3. Auto-Reconnection Pattern
- Used by: Most client implementations
- Features: Automatic reconnection on disconnect, exponential backoff

### 4. Subscription Pattern
- Used by: Jaw WebSocket Server, Enhanced Audio Stream
- Features: Event-based messaging, selective message delivery

## Message Protocol Standards

### Standard Message Format
```json
{
  "type": "message_type",
  "data": {},
  "timestamp": 1234567890,
  "client_id": "optional_client_id"
}
```

### Common Message Types
- `welcome`: Initial connection acknowledgment
- `error`: Error reporting
- `status`: Status requests/responses
- `ping`/`pong`: Heartbeat mechanism
- `subscribe`/`unsubscribe`: Event subscription management

## Identified Issues and Inconsistencies

### 1. Connection Management Issues
- **Incomplete cleanup**: Some services don't properly clean up resources on disconnect
- **Inconsistent error handling**: Different error handling patterns across services
- **Missing reconnection logic**: Some client implementations lack robust reconnection

### 2. Message Protocol Inconsistencies
- **Varying message formats**: Different services use different message structures
- **Inconsistent error reporting**: Error messages lack standardization
- **Missing validation**: Insufficient input validation in message handlers

### 3. Resource Management Problems
- **Memory leaks**: Potential client connection tracking issues
- **Resource cleanup**: Incomplete cleanup in error scenarios
- **Connection limits**: No connection limiting or rate limiting

### 4. Integration Issues
- **Service dependencies**: Hard-coded service URLs and ports
- **Fallback mechanisms**: Incomplete fallback handling when services are unavailable
- **Configuration management**: Scattered configuration across multiple files

### 5. Testing Gaps
- **Limited error scenario testing**: Missing tests for network failures
- **Load testing**: No comprehensive load testing framework
- **Integration testing**: Limited end-to-end testing

## Security Considerations

### Current Security Gaps
- **No authentication**: WebSocket connections lack authentication
- **No authorization**: No access control mechanisms
- **Input validation**: Insufficient input sanitization
- **Rate limiting**: No protection against abuse

### Recommended Security Measures
- Implement WebSocket authentication
- Add input validation and sanitization
- Implement rate limiting
- Add connection monitoring and logging

## Performance Considerations

### Current Performance Issues
- **Blocking operations**: Some synchronous operations in async contexts
- **Resource usage**: Potential memory leaks in long-running connections
- **Message queuing**: No message queuing for offline clients

### Optimization Opportunities
- Implement connection pooling
- Add message queuing systems
- Optimize message serialization
- Implement connection health monitoring

## Next Steps for Improvement

1. **Standardize message protocols** across all services
2. **Implement comprehensive error handling** and recovery mechanisms
3. **Add robust testing framework** for all WebSocket functionality
4. **Improve resource management** and cleanup procedures
5. **Enhance security measures** for production deployment
6. **Optimize performance** for high-load scenarios
