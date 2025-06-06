# 🎃 MonsterBox MCP Remote Capabilities

## Overview

The MonsterBox MCP (Model Context Protocol) system now includes two powerful capabilities for remote debugging and monitoring of animatronic RPI4b systems through VS Code and Augment AI:

1. **Remote Command Execution** - Execute shell commands directly on Orlok and Coffin RPIs
2. **Comprehensive Log Collection** - Collect both application and system logs from the RPIs

## Supported Systems

- **Orlok** - 192.168.8.120 ✅
- **Coffin** - 192.168.8.140 ✅  
- **Pumpkinhead** - 192.168.1.101 ❌ (Excluded as requested)

## 1. Remote Command Execution

### MCP Tool: `execute_remote_command`

Execute shell commands on the animatronic RPI systems through automated SSH connections.

#### Parameters:
- `host` (required) - RPI IP address or name (`192.168.8.120`, `192.168.8.140`, `orlok`, `coffin`)
- `command` (required) - Shell command to execute
- `timeout` (optional) - Command timeout in seconds (default: 30)

#### Safety Features:
- Only allows Orlok and Coffin systems
- Blocks dangerous commands (`rm -rf`, `dd`, `mkfs`, `shutdown`, etc.)
- Uses existing SSH credentials from `.env` file
- Automatic timeout protection

#### Example Usage:
```javascript
// Get system information
{
  "name": "execute_remote_command",
  "arguments": {
    "host": "192.168.8.120",
    "command": "uname -a"
  }
}

// Check disk usage
{
  "name": "execute_remote_command", 
  "arguments": {
    "host": "orlok",
    "command": "df -h"
  }
}

// Check running processes
{
  "name": "execute_remote_command",
  "arguments": {
    "host": "coffin", 
    "command": "ps aux | grep monsterbox"
  }
}
```

## 2. Comprehensive Log Collection

### MCP Tool: `collect_comprehensive_rpi_logs`

Collect detailed logs from animatronic RPI systems including MonsterBox application logs and Linux system logs.

#### Parameters:
- `host` (required) - RPI IP address or name
- `logTypes` (optional) - Array of log types to collect:
  - `application` - MonsterBox app logs and service logs
  - `system` - General system logs, kernel logs, SSH logs
  - `error` - Error logs, critical logs, dmesg errors
  - `service` - Service-specific logs (SSH, systemd, networking, cron)
  - `all` - Collect all log types
- `lines` (optional) - Number of log lines per type (default: 100)
- `since` (optional) - Time period to collect from (default: "1 hour ago")

#### Example Usage:
```javascript
// Collect all log types
{
  "name": "collect_comprehensive_rpi_logs",
  "arguments": {
    "host": "192.168.8.120",
    "logTypes": ["all"],
    "lines": 50,
    "since": "30 minutes ago"
  }
}

// Collect only application and error logs
{
  "name": "collect_comprehensive_rpi_logs",
  "arguments": {
    "host": "orlok",
    "logTypes": ["application", "error"],
    "lines": 100
  }
}

// Quick system health check
{
  "name": "collect_comprehensive_rpi_logs",
  "arguments": {
    "host": "coffin",
    "logTypes": ["system", "error"],
    "since": "1 hour ago"
  }
}
```

## Authentication

Both capabilities use the existing SSH credentials stored in your `.env` file:

```bash
# Orlok Animatronic SSH Credentials
ORLOK_SSH_USER="remote"
ORLOK_SSH_PASSWORD="klrklr89!"

# Coffin Animatronic SSH Credentials  
COFFIN_SSH_USER="remote"
COFFIN_SSH_PASSWORD="klrklr89!"
```

## Testing

Test the new capabilities:

```bash
# Test both remote command execution and log collection
npm run test:mcp-remote

# Test the full MCP system
npm run test:mcp
```

## Usage in VS Code with Augment

These MCP tools are automatically available in VS Code when using Augment AI. You can:

1. **Debug Issues**: Execute diagnostic commands on the RPIs
2. **Monitor Logs**: Collect comprehensive logs for troubleshooting
3. **System Health**: Check disk usage, memory, processes
4. **Error Analysis**: Collect error logs and system events

### Example Augment Requests:

- "Check the disk usage on Orlok"
- "Collect error logs from Coffin for the last hour"
- "Show me the running processes on the Orlok RPI"
- "Get comprehensive logs from both animatronic systems"
- "Execute 'systemctl status ssh' on the Coffin RPI"

## Security Notes

- Commands are executed with the `remote` user privileges
- Dangerous system commands are blocked for safety
- SSH connections use password authentication (not keys)
- Only Orlok and Coffin systems are accessible
- All commands have timeout protection

## Troubleshooting

If remote capabilities fail:

1. **Check Network**: Ensure RPIs are reachable (`ping 192.168.8.120`)
2. **Verify Credentials**: Confirm SSH credentials in `.env` file
3. **Test SSH**: Try manual SSH connection to verify access
4. **Check Logs**: Review MCP server logs for detailed error messages

## Integration with Existing MCP Tools

These new capabilities work alongside existing MCP tools:

- `collect_browser_logs` - Browser console logs and errors
- `collect_github_logs` - GitHub API logs and repository events  
- `collect_rpi_console_logs` - Basic RPI console logs
- `collect_ubuntu_system_logs` - Ubuntu system logs
- `collect_monsterbox_logs` - Local MonsterBox application logs
- `analyze_logs` - Log analysis and pattern detection
- `setup_log_monitoring` - Continuous log monitoring setup

Your MonsterBox MCP system now provides comprehensive remote debugging and monitoring capabilities for your animatronic systems! 🎃👻🤖
