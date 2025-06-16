# MonsterBox MCP Log Collection System Architecture

## Task 4.1: MCP Log Collection Architecture Design

### Overview
The MonsterBox MCP Log Collection System provides distributed log monitoring and aggregation across all Raspberry Pi 4B devices running MonsterBox services. This system integrates with the existing WebSocket architecture and provides real-time monitoring capabilities.

### Architecture Components

#### 1. Log Collection Agents (MCP-Compliant)
- **Local Agent**: Runs on each RPi4B device
- **Collection Sources**:
  - WebSocket services (ports 8765-8780)
  - Hardware control scripts (GPIO, I2C, servo)
  - System logs (syslog, auth, kern)
  - Application logs (MonsterBox app, Python scripts)
  - Performance metrics (CPU, memory, disk)

#### 2. Central Log Aggregation Service
- **Location**: Development workstation
- **Components**:
  - MCP Server for log collection
  - Fluent Bit aggregation engine
  - Local storage with indexing
  - Real-time streaming interface

#### 3. WebSocket Service Integration
- **Service Registry** (Port 8770): Service discovery and health monitoring
- **Hardware Services** (Ports 8771-8780): Individual service log collection
- **ChatterPi Services** (Ports 8765-8766): AI and jaw animation logs
- **Main Service** (Port 8780): Central hardware coordination logs

#### 4. Storage and Processing
- **Local Storage**: `/log/aggregated/{animatronic}/`
- **Format**: JSONL (JSON Lines) for structured logging
- **Indexing**: Time-based and service-based indexing
- **Retention**: 30-day rolling retention with compression

#### 5. Monitoring Dashboard
- **Web Interface**: Real-time log viewing and filtering
- **Integration**: Embedded in MonsterBox UI at `/hardware-monitor.html`
- **Features**: Live streaming, search, filtering, alerting

### Data Flow Architecture

```
RPi4B Devices (Orlok, Coffin, etc.)
├── Local Log Agents
│   ├── WebSocket Service Logs
│   ├── Hardware Script Logs  
│   ├── System Logs
│   └── Performance Metrics
│
├── Fluent Bit Forwarder
│   ├── Real-time streaming
│   ├── Local buffering
│   └── Compression
│
└── SSH/SCP Backup Collection
    ├── Batch transfers
    └── Reliability fallback

Development Workstation
├── MCP Log Collector Server
│   ├── Real-time ingestion
│   ├── Processing pipeline
│   └── Storage management
│
├── Web Dashboard
│   ├── Live monitoring
│   ├── Search interface
│   └── Alert management
│
└── Integration APIs
    ├── MonsterBox UI integration
    ├── TaskMaster integration
    └── External monitoring
```

### Service Port Allocation
- **8770**: Service Registry + Log Coordination
- **8771**: Motor Service Logs
- **8772**: Light Service Logs  
- **8773**: Sensor Service Logs
- **8774**: Servo Service Logs
- **8775**: Camera Service Logs
- **8776**: Audio Service Logs
- **8777**: Linear Actuator Service Logs
- **8778**: Reserved for future services
- **8779**: Reserved for future services
- **8780**: Main Hardware Service Logs

### Security and Access Control
- **SSH Key Authentication**: Secure log collection
- **Network Isolation**: MonsterNet private network (192.168.8.x)
- **Access Control**: Role-based access to log data
- **Audit Logging**: All log access is logged

### Integration Points
- **Existing MCP Server**: Extend current log-collector-server.js
- **Fluent Bit**: Leverage existing configurations
- **SSH Credentials**: Use established ssh-credentials.js
- **WebSocket Services**: Integrate with hardware service manager
- **MonsterBox UI**: Embed monitoring in existing interface

### Performance Requirements
- **Real-time Latency**: < 5 seconds for critical alerts
- **Throughput**: Handle 1000+ log entries/minute per device
- **Storage**: 1GB/day per device with compression
- **Retention**: 30 days local, 90 days compressed archive

### Reliability Features
- **Redundant Collection**: Multiple collection methods (real-time + batch)
- **Local Buffering**: Fluent Bit local storage during network issues
- **Health Monitoring**: Service health checks and auto-recovery
- **Failover**: Automatic fallback to SSH collection if streaming fails

This architecture builds upon the existing MonsterBox infrastructure while providing comprehensive distributed logging capabilities for the entire animatronic ecosystem.
