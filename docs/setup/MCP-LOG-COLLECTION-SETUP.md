# 🎃 MonsterBox MCP Log Collection System

## Overview

Your MonsterBox now has a comprehensive Model Context Protocol (MCP) log collection system that gathers errors, logs, and monitoring data from multiple sources:

- **Browser Console** - JavaScript errors, console logs, network failures
- **GitHub Repository** - Events, workflows, issues, commits, actions
- **RPI4b Console** - System logs, service logs, kernel messages  
- **Ubuntu System Logs** - Syslog, auth logs, daemon logs
- **MonsterBox Application** - Winston logs, API logs, error logs

## 🚀 Quick Start

### Test Your MCP Setup
```bash
npm run test:mcp
```

### Collect GitHub Logs
```bash
npm run collect:github-logs
```

### Check API Keys (includes MCP servers)
```bash
npm run check-api-keys
```

## 📋 MCP Servers Configured

### 1. Task Master AI
- **Purpose**: Project management and task automation
- **Status**: ✅ Configured with your API keys
- **Location**: `.cursor/mcp.json`

### 2. MonsterBox Log Collector
- **Purpose**: Multi-source log collection and analysis
- **Status**: ✅ Configured and ready
- **Location**: `mcp-servers/log-collector-server.js`

## 🔧 MCP Tools Available

### Browser Log Collection
```javascript
// Automatically collects:
- Console logs (log, info, warn, error, debug)
- JavaScript errors and stack traces
- Unhandled promise rejections
- Network request failures
- Performance metrics
- User interactions
```

### GitHub Log Collection
```javascript
// Available tools:
collect_github_logs({
    repo: "MonsterBox",
    events: ["push", "pull_request", "issues"]
})
```

### System Log Collection
```javascript
// Available tools:
collect_rpi_console_logs({
    host: "your-rpi-ip",
    lines: 100
})

collect_ubuntu_system_logs({
    host: "your-ubuntu-ip", 
    logTypes: ["syslog", "auth", "kern"],
    since: "1 hour ago"
})
```

### Log Analysis
```javascript
// Available tools:
analyze_logs({
    sources: ["browser", "github", "system"],
    pattern: "error|exception|fail"
})
```

## 🌐 Web Endpoints

### Browser Log Collection
- **POST** `/logs/browser` - Receive browser logs
- **GET** `/logs/system` - Collect system logs
- **GET** `/logs/rpi/:host` - Collect RPI logs
- **GET** `/logs/application` - Get MonsterBox logs
- **POST** `/logs/analyze` - Analyze collected logs
- **GET** `/logs/stream` - Real-time log streaming

### Health Monitoring
- **GET** `/health` - Basic health check
- **GET** `/health/api-keys` - API key status
- **GET** `/health/environment` - Environment variables
- **GET** `/health/connectivity` - Service connectivity

## 📁 File Structure

```
MonsterBox/
├── mcp-servers/
│   └── log-collector-server.js     # MCP log collection server
├── scripts/
│   ├── github-log-collector.js     # GitHub API log collector
│   └── test-mcp-setup.js          # MCP setup testing
├── public/js/
│   └── log-collector.js           # Browser log collection client
├── routes/
│   └── logRoutes.js               # Enhanced log collection API
├── .cursor/
│   └── mcp.json                   # MCP server configuration
└── log/
    ├── browser.log                # Browser logs
    ├── github-YYYY-MM-DD.log      # GitHub logs
    └── mcp-test-YYYY-MM-DD.json   # MCP test results
```

## 🔑 Environment Variables

Your `.env` file now includes:
```bash
# API Keys for MCP servers
ANTHROPIC_API_KEY="your-key"
OPENAI_API_KEY="your-key" 
GOOGLE_API_KEY="your-key"

# Optional for GitHub log collection
GITHUB_TOKEN="your-github-token"

# Application configuration
SESSION_SECRET="your-session-secret"
NODE_ENV="development"
PORT="3000"
```

## 🧪 Testing Commands

### Complete MCP Test Suite
```bash
npm run test:mcp
```
Tests all MCP components, endpoints, and integrations.

### API Key Testing
```bash
npm run check-api-keys
```
Verifies all API keys work with their services.

### GitHub Log Collection
```bash
npm run collect:github-logs
```
Collects recent GitHub repository activity.

## 📊 Log Collection Examples

### Browser Logs
```javascript
// Automatic collection of:
{
  "type": "console",
  "level": "error", 
  "message": "Failed to load scene data",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "url": "http://localhost:3000/scenes",
  "sessionId": "mb-1705312200000-abc123"
}
```

### GitHub Logs
```javascript
// Repository events:
{
  "type": "PushEvent",
  "actor": "arwpc",
  "created_at": "2024-01-15T10:30:00Z",
  "payload": {
    "commits": [...]
  }
}
```

### System Logs
```javascript
// RPI/Ubuntu logs:
{
  "timestamp": "2024-01-15 10:30:00",
  "host": "monsterbox-rpi",
  "service": "systemd",
  "message": "Started MonsterBox service"
}
```

## 🔧 Configuration

### Adding RPI4b Log Collection
1. Set up SSH key authentication to your RPI
2. Update the log collection calls with your RPI IP:
```javascript
collect_rpi_console_logs({
    host: "192.168.1.100",  // Your RPI IP
    lines: 100,
    service: "monsterbox"   // Optional: specific service
})
```

### Adding GitHub Token
1. Create a GitHub Personal Access Token
2. Add to your `.env` file:
```bash
GITHUB_TOKEN="ghp_your_token_here"
```

### Configuring Ubuntu System Logs
```javascript
collect_ubuntu_system_logs({
    host: "your-ubuntu-server",
    logTypes: ["syslog", "auth", "kern", "daemon"],
    since: "1 hour ago"
})
```

## 🚨 Troubleshooting

### MCP Server Not Starting
```bash
# Check MCP configuration
cat .cursor/mcp.json

# Test MCP server manually
node mcp-servers/log-collector-server.js
```

### Browser Logs Not Collecting
1. Check if log-collector.js is loaded in browser
2. Verify `/logs/browser` endpoint is accessible
3. Check browser console for errors

### GitHub API Rate Limits
- Without token: 60 requests/hour
- With token: 5000 requests/hour
- Check rate limit: `npm run collect:github-logs`

### System Log Access Issues
- Ensure SSH access to remote systems
- Check sudo permissions for journalctl
- Verify system log paths exist

## 📈 Monitoring Dashboard

Access your logs through:
- **Web Interface**: `http://localhost:3000/logs`
- **Health Status**: `http://localhost:3000/health`
- **Real-time Stream**: `http://localhost:3000/logs/stream`

## 🎯 Next Steps

1. **Run the test suite**: `npm run test:mcp`
2. **Configure your RPI IP** in log collection calls
3. **Add GitHub token** for enhanced GitHub log collection
4. **Set up automated log collection** using MCP tools
5. **Monitor logs** through the web interface

Your MonsterBox MCP log collection system is now ready to gather comprehensive monitoring data from all your sources! 🎃👻🤖
