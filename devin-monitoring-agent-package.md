# Devin AI Implementation Package - Monitoring Agent

## Project Context
MonsterBox animatronic control system with distributed Raspberry Pi systems. Current MCP (Model Context Protocol) system needs enhancement for comprehensive log collection and real-time monitoring.

## Task Assignment: Implement MCP Log Collection System (Task 4)

### Repository Information
- **GitHub**: https://github.com/arwpc/MonsterBox
- **Branch**: main
- **Current MCP Setup**: /mcp-servers/ directory with existing log-collector-server.js
- **Existing Logging**: Winston logging in scripts/logger.js

### Current MCP Infrastructure
- **Log Collector Server**: /mcp-servers/log-collector-server.js
- **Test Scripts**: scripts/test-mcp-*.js
- **Sematext Integration**: Already configured for Orlok and Coffin RPis
- **Target Systems**: Orlok (192.168.8.120), Coffin (192.168.8.140)

### Subtasks to Implement

#### 4.1: Design MCP Log Collection Protocol
**Status**: In Progress
**Dependencies**: None
**Requirements**:
- Enhance existing MCP protocol for distributed log collection
- Support for multiple log sources (application, system, hardware)
- Real-time streaming capabilities
- Authentication and security for log transmission
- Message format standardization

**Deliverables**:
1. `/docs/mcp/protocol-specification.md` - Complete protocol documentation
2. `/mcp-servers/protocol/` - Protocol implementation modules
3. `/config/mcp-config.js` - Enhanced MCP configuration
4. Protocol message schemas and validation

#### 4.2: Implement MCP Server Log Collection Components
**Status**: In Progress
**Dependencies**: 4.1
**Requirements**:
- Enhance existing log-collector-server.js
- Support for multiple concurrent RPi connections
- Log aggregation and buffering capabilities
- Integration with existing Sematext agents
- Fault tolerance and reconnection logic

**Deliverables**:
1. Enhanced `/mcp-servers/log-collector-server.js`
2. `/mcp-servers/components/logAggregator.js`
3. `/mcp-servers/components/connectionManager.js`
4. `/mcp-servers/components/bufferManager.js`
5. `/services/mcpLogService.js` - Integration service

#### 4.4: Implement Automated Log Analysis System
**Status**: In Progress
**Dependencies**: 4.2, 4.4
**Requirements**:
- Pattern recognition for common issues
- Automated alerting for critical events
- Log correlation across multiple systems
- Performance metrics extraction
- Integration with existing Winston logging

**Deliverables**:
1. `/services/logAnalysisService.js` - Core analysis engine
2. `/analyzers/` - Directory with specific log analyzers
3. `/config/analysis-rules.json` - Configurable analysis rules
4. `/routes/analysisRoutes.js` - API endpoints for analysis results
5. Alert system integration

#### 4.5: Create Real-time Monitoring Dashboard
**Status**: In Progress
**Dependencies**: 4.2, 4.4
**Requirements**:
- Web-based dashboard for real-time log monitoring
- Integration with existing EJS templating system
- Customizable alerts and notifications
- System health visualization
- Multi-system view for all RPi systems

**Deliverables**:
1. `/views/monitoring/` - Dashboard EJS templates
2. `/public/js/monitoring-dashboard.js` - Frontend JavaScript
3. `/public/css/monitoring-dashboard.css` - Dashboard styling
4. `/routes/monitoringRoutes.js` - Dashboard API endpoints
5. WebSocket integration for real-time updates

### Implementation Guidelines

#### Existing Infrastructure to Enhance
- **Current MCP Server**: /mcp-servers/log-collector-server.js (needs enhancement)
- **Winston Logging**: scripts/logger.js (integrate with new system)
- **Test Scripts**: scripts/test-mcp-*.js (update for new features)
- **Sematext Integration**: Maintain existing agent functionality

#### Technology Stack
- **MCP Framework**: @modelcontextprotocol/sdk v1.12.1
- **FastMCP**: fastmcp v1.27.7 for server framework
- **WebSocket**: ws v8.14.2 for real-time communication
- **Winston**: v3.11.0 for logging integration
- **Axios**: v1.7.7 for HTTP client functionality

#### Security Requirements
- Secure authentication for MCP connections
- Encrypted log transmission
- Access control for monitoring dashboard
- Rate limiting for log collection endpoints

### File Structure to Create/Modify

```
/mcp-servers/
  ├── log-collector-server.js (enhance existing)
  ├── protocol/
  │   ├── messageTypes.js (new)
  │   ├── authentication.js (new)
  │   └── validation.js (new)
  └── components/
      ├── logAggregator.js (new)
      ├── connectionManager.js (new)
      └── bufferManager.js (new)

/services/
  ├── mcpLogService.js (new)
  ├── logAnalysisService.js (new)
  └── alertService.js (new)

/analyzers/
  ├── errorAnalyzer.js (new)
  ├── performanceAnalyzer.js (new)
  ├── securityAnalyzer.js (new)
  └── hardwareAnalyzer.js (new)

/routes/
  ├── monitoringRoutes.js (new)
  └── analysisRoutes.js (new)

/views/monitoring/
  ├── dashboard.ejs (new)
  ├── logs.ejs (new)
  ├── alerts.ejs (new)
  └── system-health.ejs (new)

/public/
  ├── js/monitoring-dashboard.js (new)
  ├── css/monitoring-dashboard.css (new)
  └── js/log-viewer.js (new)

/config/
  ├── mcp-config.js (new)
  ├── analysis-rules.json (new)
  └── alert-config.json (new)

/docs/mcp/
  ├── protocol-specification.md (new)
  ├── log-analysis-guide.md (new)
  └── dashboard-user-guide.md (new)

/tests/mcp/
  ├── protocol.test.js (new)
  ├── log-collection.test.js (new)
  ├── analysis.test.js (new)
  └── dashboard.test.js (new)
```

### Dependencies to Add
```json
{
  "@modelcontextprotocol/sdk": "^1.12.1",
  "fastmcp": "^1.27.7",
  "ws": "^8.14.2",
  "socket.io": "^4.7.2",
  "moment": "^2.29.4",
  "lodash": "^4.17.21",
  "node-cron": "^3.0.2"
}
```

### Environment Variables Required
```env
MCP_SERVER_PORT=3001
MCP_LOG_BUFFER_SIZE=1000
MCP_RECONNECT_INTERVAL=5000
SEMATEXT_LOGS_TOKEN=d3994e09-bc6e-4090-abe3-4ccaa9037cf4
ALERT_EMAIL_ENABLED=true
ALERT_EMAIL_RECIPIENTS=admin@monsterbox.local
```

### Integration with Existing Systems

#### Sematext Integration
- Maintain existing st-agent functionality on RPi systems
- Enhance with additional log collection capabilities
- Preserve existing metrics collection (token: d3994e09-bc6e-4090-abe3-4ccaa9037cf4)

#### Winston Logging Enhancement
- Extend scripts/logger.js with MCP integration
- Add structured logging for better analysis
- Maintain existing log file formats

#### MCP Remote Capabilities
- Integrate with existing remote command execution
- Enhance docs/MCP-REMOTE-CAPABILITIES.md
- Maintain compatibility with current SSH-based operations

### Success Criteria
1. Enhanced MCP protocol supporting real-time log streaming
2. Robust log collection from Orlok and Coffin RPi systems
3. Automated analysis identifying patterns and issues
4. Real-time monitoring dashboard with customizable alerts
5. Integration with existing Sematext and Winston logging
6. Comprehensive test coverage for all MCP components
7. Documentation updated and user-friendly
8. No disruption to existing animatronic control functionality

### Performance Requirements
- Handle 1000+ log messages per minute per RPi
- Real-time dashboard updates within 1 second
- Log analysis processing within 5 seconds
- 99.9% uptime for log collection service
- Efficient memory usage with configurable buffering

### Git Workflow
1. Create feature branch: `feature/enhanced-mcp-log-collection`
2. Implement each subtask with detailed commits
3. Reference Task Master IDs in commit messages
4. Comprehensive testing before pull request
5. Update existing documentation and create new guides

### Notes
- Preserve existing MCP functionality while enhancing capabilities
- Consider network reliability between development workstation and RPi systems
- Ensure log collection doesn't impact animatronic performance
- Design for scalability to support additional RPi systems in the future
