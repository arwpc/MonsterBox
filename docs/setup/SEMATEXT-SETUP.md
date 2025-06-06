# MonsterBox Sematext Integration Setup

This guide explains how to set up Sematext monitoring for your MonsterBox RPI4b systems, replacing SSH-based MCP log collection with a proper monitoring infrastructure.

## 🎯 Overview

Sematext provides:
- **Centralized log collection** from all RPI4b systems
- **Real-time system metrics** (CPU, memory, disk, network)
- **Application monitoring** for MonsterBox services
- **Alerting** for critical issues
- **MCP integration** for AI-powered log analysis

## 📋 Prerequisites

1. **Sematext Account**: Sign up at [sematext.com](https://sematext.com/)
2. **RPI4b Systems**: Orlok (192.168.8.120) and Coffin (192.168.8.140) running
3. **SSH Access**: Configured SSH credentials for RPI systems
4. **Node.js Dependencies**: `inquirer` and `axios` installed

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Sematext Account

1. Create account at [sematext.com](https://sematext.com/)
2. Create a new **Logs App** for MonsterBox
3. Note your **API Key** and **Logs Token**

### 3. Run Sematext Setup

```bash
npm run setup:sematext
```

The setup wizard will:
- Prompt for your Sematext credentials
- Install agents on enabled RPI4b systems
- Configure log collection for MonsterBox services
- Set up system metrics monitoring
- Create MCP server integration

### 4. Test the Setup

```bash
npm run test:sematext
```

This will verify:
- ✅ Sematext API connectivity
- ✅ Agent installation on RPI systems
- ✅ Log collection functionality
- ✅ Metrics collection (if enabled)

### 5. Start MCP Server

```bash
npm run start:sematext-mcp
```

## 🔧 Configuration

### Sematext Configuration

The setup creates `data/sematext-config.json`:

```json
{
  "sematext": {
    "api_key": "your-api-key",
    "logs_token": "your-logs-token",
    "app_name": "MonsterBox-Animatronics",
    "log_sources": ["system", "monsterbox", "nginx", "ssh", "gpio"],
    "metrics_enabled": true,
    "alerts_enabled": true
  },
  "systems": [
    {
      "name": "orlok",
      "host": "192.168.8.120",
      "enabled": true,
      "agent_status": "installed"
    },
    {
      "name": "coffin", 
      "host": "192.168.8.140",
      "enabled": true,
      "agent_status": "installed"
    }
  ]
}
```

### Log Sources Monitored

- **System Logs**: `journalctl` output for system events
- **MonsterBox App**: Application logs from `/var/log/monsterbox/`
- **Nginx**: Web server access and error logs
- **SSH**: Authentication and connection logs
- **GPIO**: Hardware control and sensor logs
- **Custom**: Any additional application logs

### MCP Integration

The Sematext MCP server provides these tools:

#### `query_sematext_logs`
Query logs from RPI systems:
```javascript
query_sematext_logs({
    system: "orlok",           // orlok, coffin, pumpkinhead, all
    log_type: "monsterbox",    // system, monsterbox, nginx, ssh, gpio, all
    time_range: "1h",          // 1h, 6h, 24h, 7d
    query: "error",            // Optional search term
    limit: 100                 // Max results
})
```

#### `get_sematext_metrics`
Get system metrics:
```javascript
get_sematext_metrics({
    system: "coffin",          // orlok, coffin, pumpkinhead, all
    metric_type: "cpu",        // cpu, memory, disk, network, all
    time_range: "6h"           // 1h, 6h, 24h, 7d
})
```

#### `check_sematext_alerts`
Check active alerts:
```javascript
check_sematext_alerts({
    system: "all",             // orlok, coffin, pumpkinhead, all
    severity: "critical"       // critical, warning, info, all
})
```

#### `get_system_status`
Get overall system status:
```javascript
get_system_status({
    include_metrics: true      // Include basic metrics
})
```

## 📊 Accessing Your Data

### Sematext UI
- **Logs**: https://apps.sematext.com/ui/logs
- **Metrics**: https://apps.sematext.com/ui/monitoring
- **Alerts**: https://apps.sematext.com/ui/alerts

### MCP Integration
Add to your `augment-mcp-config.json`:
```json
{
  "mcpServers": {
    "monsterbox-sematext": {
      "command": "node",
      "args": ["mcp-servers/sematext-server.js"],
      "cwd": "C:\\Users\\arwpe\\CodeBase\\MonsterBox-1"
    }
  }
}
```

## 🔍 Troubleshooting

### Agent Installation Issues

1. **Check SSH connectivity**:
   ```bash
   ssh remote@192.168.8.120 "echo 'Connection OK'"
   ```

2. **Verify agent status**:
   ```bash
   ssh remote@192.168.8.120 "sudo systemctl status spm-monitor logagent"
   ```

3. **Check agent logs**:
   ```bash
   ssh remote@192.168.8.120 "sudo journalctl -u logagent -f"
   ```

### Log Collection Issues

1. **Test log generation**:
   ```bash
   ssh remote@192.168.8.120 "echo 'Test log' | logger -t monsterbox-test"
   ```

2. **Check Sematext connectivity**:
   ```bash
   npm run test:sematext
   ```

3. **Verify configuration**:
   ```bash
   ssh remote@192.168.8.120 "sudo cat /etc/sematext/logagent.conf"
   ```

### MCP Server Issues

1. **Test MCP server directly**:
   ```bash
   node mcp-servers/sematext-server.js
   ```

2. **Check configuration file**:
   ```bash
   cat data/sematext-config.json
   ```

3. **Verify API credentials**:
   - Check your Sematext dashboard
   - Ensure API key and logs token are correct

## 🎛️ Advanced Configuration

### Custom Log Patterns

Edit the logagent configuration on each RPI:
```bash
sudo nano /etc/sematext/logagent.conf
```

Add custom log sources:
```yaml
input:
  - module: files
    patterns:
      - '/path/to/custom/logs/*.log'
    sourceName: custom-app
    tags:
      system: orlok
      type: custom
```

### Alert Configuration

Set up alerts in the Sematext UI:
1. Go to https://apps.sematext.com/ui/alerts
2. Create new alert rule
3. Configure conditions (e.g., error rate > 10/min)
4. Set notification channels

### Dashboard Creation

Create custom dashboards:
1. Go to https://apps.sematext.com/ui/dashboards
2. Add widgets for key metrics
3. Save and share with team

## 🔄 Migration from SSH-based MCP

The Sematext setup replaces the SSH-based log collection:

### Before (SSH-based)
- Manual SSH connections to RPI systems
- Limited log retention
- No centralized monitoring
- Performance impact on RPI systems

### After (Sematext-based)
- Automated log shipping
- Centralized storage and search
- Real-time monitoring and alerting
- Minimal RPI performance impact
- Professional monitoring infrastructure

### Transition Steps

1. **Run Sematext setup**: `npm run setup:sematext`
2. **Test new system**: `npm run test:sematext`
3. **Update MCP config**: Use `monsterbox-sematext` server
4. **Verify functionality**: Check logs in Sematext UI
5. **Disable SSH MCP**: Comment out `monsterbox-log-collector` in MCP config

## 📈 Benefits

- **Scalability**: Easy to add new RPI systems
- **Reliability**: Professional monitoring infrastructure
- **Performance**: Minimal impact on RPI resources
- **Features**: Advanced search, alerting, and analytics
- **Integration**: Seamless MCP integration for AI analysis
- **Maintenance**: Reduced SSH configuration complexity

## 🆘 Support

- **Sematext Documentation**: https://sematext.com/docs/
- **MonsterBox Issues**: Create GitHub issue
- **MCP Integration**: Check `mcp-servers/sematext-server.js`
