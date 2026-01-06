# Port Management Interface User Guide

## Overview

The Port Management Interface provides a comprehensive web-based dashboard for managing, monitoring, and configuring the MonsterBox centralized port management system. This interface allows you to control all aspects of service management, port allocation, and system monitoring through an intuitive web interface.

## Accessing the Interface

### Navigation
1. Go to the main MonsterBox interface
2. Navigate to **Configuration** → **System Config**
3. Click on **Port Management System**

### Direct URL
```
http://your-monsterbox-ip:3000/system-config/port-management
```

## Interface Overview

The interface is organized into six main tabs:

1. **Services** - Service management and control
2. **Port Allocation** - Port usage and allocation monitoring
3. **Monitoring** - Real-time system monitoring
4. **Configuration** - System configuration management
5. **Diagnostics** - System validation and troubleshooting
6. **API Testing** - API endpoint testing and validation

## System Status Overview

At the top of the interface, you'll find the **System Status** card displaying:

- **Total Services**: Number of registered services
- **Running Services**: Number of currently running services
- **Allocated Ports**: Number of ports currently in use
- **Active Connections**: Number of active WebSocket connections
- **System Status Badge**: Overall system health indicator

### Status Indicators
- 🟢 **HEALTHY**: All systems operational
- 🟡 **DEGRADED**: Some issues detected
- 🔴 **ERROR**: Critical issues present

## Services Tab

### Service Management Controls

#### Bulk Operations
- **Start All**: Start all configured services
- **Stop All**: Stop all running services (⚠️ Use with caution)
- **Refresh**: Update service status information

#### Service Filtering
- **Type Filter**: Filter by service type (hardware, websocket, chatterpi, etc.)
- **Status Filter**: Filter by service status (running, stopped, error, etc.)
- **Search Filter**: Search services by name

### Service Table

The services table displays:

| Column | Description |
|--------|-------------|
| **Service** | Service name and description |
| **Type** | Service category (hardware, websocket, etc.) |
| **Status** | Current service status with color coding |
| **Port** | Direct service port |
| **Proxy Port** | Browser-compatible proxy port |
| **Uptime** | How long the service has been running |
| **Actions** | Service control buttons |

#### Service Actions
- ▶️ **Start**: Start a stopped service
- ⏹️ **Stop**: Stop a running service
- 🔄 **Restart**: Restart a service
- ℹ️ **Info**: View detailed service information

### Service Details Modal

Clicking the info button opens a detailed view showing:
- Basic service information
- Connection details
- Service tags and dependencies
- Raw service data

## Port Allocation Tab

### Port Range Utilization

Visual charts showing:
- **Port Range Chart**: Usage by port range type
- **Port Type Chart**: Distribution by service type

### Port Range Details Table

Detailed breakdown of port usage:
- **Range**: Port range name (main, websocket, hardware, etc.)
- **Start/End**: Port range boundaries
- **Total**: Total ports in range
- **Used**: Currently allocated ports
- **Available**: Free ports remaining
- **Utilization**: Percentage usage with color coding

#### Utilization Color Coding
- 🟢 **Green**: < 60% utilization
- 🟡 **Yellow**: 60-80% utilization
- 🔴 **Red**: > 80% utilization

## Monitoring Tab

### Real-time Health Status
- Pie chart showing service status distribution
- Health status breakdown by service state

### Connection Statistics
- Active WebSocket connections
- Number of active proxies
- Connection distribution by service

### System Metrics
- **CPU Usage**: Current processor utilization
- **Memory Usage**: RAM consumption
- **Network Connections**: Active network connections
- **System Uptime**: How long the system has been running

## Configuration Tab

### Environment Configuration
- **Environment**: Current environment (development/production/test)
- **Health Check Interval**: How often to check service health
- **Connection Timeout**: WebSocket connection timeout

### Service Priorities
Adjust priority levels for different service types:
- Higher priority services get preference during resource allocation
- Drag sliders to adjust priority values (1-100)

### Saving Configuration
Click **Save Configuration** to apply changes.

## Diagnostics Tab

### System Validation
- **Run Full Validation**: Comprehensive system check
- Validates port configuration, service definitions, and dependencies
- Results show pass/fail status for each component

### Health Check
- **Run Health Check**: Check all service health
- Shows overall system health status
- Lists any issues found with services

### System Logs
- **Log Level Filter**: Filter logs by severity (error, warn, info, debug)
- **Refresh**: Update log display
- **Clear**: Clear log display
- Real-time log viewing with color coding

#### Log Color Coding
- 🔴 **Red**: Error messages
- 🟡 **Yellow**: Warning messages
- 🔵 **Blue**: Info messages
- ⚪ **Gray**: Debug messages

## API Testing Tab

### Endpoint Testing
- **Endpoint**: Select from predefined API endpoints
- **Method**: Choose HTTP method (GET/POST)
- **Request Body**: JSON payload for POST requests
- **Test Endpoint**: Execute the API call

### Available Endpoints
- `/api/service-management/status` - System status
- `/api/service-management/connections` - Service connections
- `/api/service-management/health` - Health check
- `/api/service-management/ports` - Port information

### Response Display
- HTTP status code and message
- Formatted JSON response
- Error handling and display

## Common Tasks

### Starting a Service
1. Go to **Services** tab
2. Find the service in the table
3. Click the ▶️ **Start** button
4. Wait for status to change to "Running"

### Stopping a Service
1. Go to **Services** tab
2. Find the running service
3. Click the ⏹️ **Stop** button
4. Confirm the action if prompted

### Checking System Health
1. Go to **Diagnostics** tab
2. Click **Run Health Check**
3. Review the results
4. Address any issues shown

### Viewing Port Usage
1. Go to **Port Allocation** tab
2. Review the utilization charts
3. Check the port ranges table
4. Look for high utilization ranges

### Troubleshooting Service Issues
1. Go to **Services** tab
2. Click ℹ️ **Info** on the problematic service
3. Check service details and status
4. Go to **Diagnostics** tab
5. Run health check and validation
6. Review system logs for errors

## Keyboard Shortcuts

- **Ctrl+R**: Refresh current tab data
- **Tab**: Navigate between form fields
- **Enter**: Submit forms or trigger default actions
- **Esc**: Close modals and dialogs

## Mobile and Tablet Support

The interface is fully responsive and works on:
- 📱 **Mobile devices** (phones)
- 📱 **Tablets** (iPads, Android tablets)
- 💻 **Desktop computers**

On smaller screens:
- Tabs may stack vertically
- Tables become horizontally scrollable
- Charts adapt to screen size

## Troubleshooting

### Interface Won't Load
1. Check that MonsterBox is running
2. Verify network connection
3. Try refreshing the browser
4. Check browser console for errors

### Services Not Showing
1. Click **Refresh** button
2. Check **Diagnostics** tab for errors
3. Verify service integration is running
4. Check system logs

### Charts Not Displaying
1. Ensure JavaScript is enabled
2. Try refreshing the page
3. Check browser compatibility
4. Clear browser cache

### API Calls Failing
1. Check network connectivity
2. Verify MonsterBox services are running
3. Test with **API Testing** tab
4. Check system logs for errors

## Browser Compatibility

Supported browsers:
- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+

Required features:
- JavaScript enabled
- WebSocket support
- Canvas support (for charts)
- CSS Grid support

## Security Considerations

- Interface requires access to MonsterBox network
- No authentication required (local network access)
- All API calls are logged
- Service control actions are logged

## Performance Tips

- Use **Refresh** buttons instead of page reload
- Filter services when working with many services
- Close unused tabs to reduce resource usage
- Clear logs periodically to improve performance

## Getting Help

If you encounter issues:
1. Check the **Diagnostics** tab first
2. Review system logs for error messages
3. Run system validation to identify problems
4. Check the main MonsterBox documentation
5. Verify all services are properly configured

## Advanced Features

### Custom API Testing
- Add custom endpoints to test
- Modify request headers if needed
- Test with different HTTP methods
- Save common test scenarios

### Log Analysis
- Filter logs by time period
- Search for specific error patterns
- Export logs for external analysis
- Monitor real-time log updates

### Performance Monitoring
- Track service uptime trends
- Monitor port allocation patterns
- Analyze connection statistics
- Identify resource bottlenecks
