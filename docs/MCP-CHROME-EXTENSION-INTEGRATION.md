# MonsterBox MCP Chrome Extension Integration

## 🎯 Overview

This document describes the integration between MonsterBox and the Chrome MCP extension for comprehensive browser debugging and log collection during streaming development and testing.

## 🔧 Chrome MCP Extension Details

- **Extension ID**: `bjfgambnhccakkhmkepdoekmckoijdlc`
- **Version**: 1.3.4
- **Size**: 2.4 MB
- **Permissions**: 
  - Access the page debugger backend
  - Read and change all your data on all websites

## 📋 MCP Servers Configured

### 1. MonsterBox Browser Debug Server
- **Purpose**: Comprehensive browser debugging for streaming issues
- **Location**: `mcp-servers/browser-debug-server.js`
- **Tools Available**:
  - `collect_browser_logs` - Console logs, errors, warnings
  - `collect_network_logs` - Network requests and streaming connections
  - `debug_streaming_issues` - WebRTC and MJPEG stream debugging
  - `analyze_browser_performance` - Performance metrics collection
  - `collect_streaming_diagnostics` - Comprehensive streaming diagnostics
  - `generate_debug_report` - Consolidated debug reports

### 2. Enhanced Browser Log Collector
- **Purpose**: Real-time browser log collection with MCP integration
- **Location**: `public/js/log-collector.js`
- **Features**:
  - Automatic streaming debug mode detection
  - WebRTC connection monitoring
  - Video element event tracking
  - MCP Chrome extension communication
  - Streaming API call monitoring

## 🚀 Usage Instructions

### Step 1: Enable MCP Chrome Extension
1. Ensure the Chrome MCP extension is installed and enabled
2. Grant necessary permissions for all sites
3. Pin the extension to the toolbar for easy access

### Step 2: Start MonsterBox with MCP
```bash
# Start MonsterBox server
npm start

# In another terminal, test MCP integration
npm run mcp:browser-debug
```

### Step 3: Access Streaming Test Pages
Navigate to any of these URLs to automatically enable streaming debug mode:
- `http://192.168.8.120:3000/webrtc-test.html`
- `http://192.168.8.120:3000/stream-test.html`
- `http://192.168.8.120:3000/api/streaming/stream/1`

### Step 4: Use MCP Tools for Debugging

#### Collect Browser Logs
```javascript
// In Augment/Claude with MCP access
collect_browser_logs({
  "url": "http://192.168.8.120:3000/webrtc-test.html",
  "logLevel": "all",
  "duration": 60
})
```

#### Debug Streaming Issues
```javascript
debug_streaming_issues({
  "characterId": 1,
  "testType": "both",
  "collectPerformance": true
})
```

#### Analyze Performance
```javascript
analyze_browser_performance({
  "url": "http://192.168.8.120:3000/stream-test.html",
  "duration": 120
})
```

## 🔍 Debugging Workflow

### 1. Initial Setup
1. Open Chrome DevTools (F12)
2. Navigate to Console tab
3. Enable all log levels (Verbose, Info, Warnings, Errors)
4. Open Network tab and enable "Preserve log"

### 2. Start Streaming Test
1. Visit: `http://192.168.8.120:3000/stream-test.html`
2. Select Orlok (Character ID: 1)
3. Click "Start Stream" button
4. Monitor console and network tabs

### 3. Collect MCP Data
Use MCP tools to collect comprehensive debugging data:
- Browser console logs
- Network request logs
- WebRTC connection states
- Video element events
- Performance metrics

### 4. Generate Debug Report
```javascript
generate_debug_report({
  "reportType": "streaming",
  "timeRange": "1h"
})
```

## 📊 Key Metrics to Monitor

### Browser Console
- JavaScript errors (especially module loading)
- WebRTC connection failures
- Video element errors
- Network timeout errors

### Network Tab
- Failed requests (red status codes)
- Slow loading times (>5s)
- CORS errors
- 404 errors for JS modules
- Streaming connection timeouts

### Performance Tab
- Memory usage stability
- CPU usage during streaming
- Frame rate consistency
- Video decode performance

## 🎥 Streaming-Specific Debugging

### WebRTC Issues
- Check RTCPeerConnection state changes
- Monitor ICE connection states
- Verify STUN/TURN server connectivity
- Analyze WebRTC statistics

### MJPEG Stream Issues
- Verify stream endpoint accessibility
- Check MIME type headers
- Monitor frame delivery rate
- Analyze bandwidth utilization

### Video Element Issues
- Check video.canplay events
- Monitor video.error events
- Verify video dimensions
- Check video.readyState

## 🔧 Troubleshooting Common Issues

### 1. ES6 Module Loading Errors
**Symptoms**: `Failed to load module script` errors
**Solution**: Check MIME types and file accessibility
```javascript
collect_network_logs({
  "url": "http://192.168.8.120:3000/webrtc-test.html",
  "includeHeaders": true,
  "filterStreaming": true
})
```

### 2. WebRTC Connection Failures
**Symptoms**: Connection state stuck in "connecting"
**Solution**: Check STUN servers and network connectivity
```javascript
debug_streaming_issues({
  "characterId": 1,
  "testType": "webrtc",
  "collectPerformance": true
})
```

### 3. MJPEG Stream Not Loading
**Symptoms**: Image not displaying or constant loading
**Solution**: Verify streaming service and camera availability
```javascript
collect_streaming_diagnostics({
  "characterId": 1,
  "includeServerLogs": true,
  "includeBrowserLogs": true
})
```

## 📁 Log File Locations

### Browser Debug Logs
- Location: `log/browser-debug/`
- Files: `browser-logs-*.json`, `network-logs-*.json`, `streaming-debug-*.json`

### MonsterBox Application Logs
- Location: `log/`
- Files: `monsterbox.log`, `streaming.log`, `error.log`

### MCP Debug Reports
- Location: `log/browser-debug/`
- Files: `debug-report-*.json`, `diagnostics-*.json`

## 🎯 Integration Benefits

1. **Real-time Debugging**: Immediate feedback on streaming issues
2. **Comprehensive Logging**: All browser and server events captured
3. **Performance Monitoring**: Detailed metrics for optimization
4. **Automated Collection**: MCP tools automate complex debugging tasks
5. **Centralized Analysis**: All logs aggregated for easy analysis

## 🔄 Continuous Monitoring

The enhanced log collector automatically:
- Detects streaming pages and enables debug mode
- Connects to MCP Chrome extension
- Monitors video elements and WebRTC connections
- Sends real-time data to MCP servers
- Generates periodic debug reports

This integration provides comprehensive visibility into MonsterBox streaming functionality for rapid issue identification and resolution.
