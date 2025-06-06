#!/bin/bash

# MonsterBox Fluent Bit Deployment Script for Coffin RPI4b
# Deploy the same working configuration from Orlok to Coffin

set -e

# Configuration
ANIMATRONIC_ID="coffin"
REMOTE_HOST="192.168.8.140"
REMOTE_USER="remote"
LOG_EXPORT_DIR="/home/remote/log_export"
MONSTERBOX_LOG_DIR="/home/remote/MonsterBox/log"
SCRIPTS_LOG_DIR="/home/remote/MonsterBox/scripts/log"

echo "🎃 MonsterBox Fluent Bit Deployment for ${ANIMATRONIC_ID}"
echo "=================================================="
echo "Target: ${REMOTE_USER}@${REMOTE_HOST}"
echo ""

# Function to run SSH commands
run_ssh() {
    local command="$1"
    echo "🔧 Executing: $command"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" "$command"
}

# Function to copy files via SCP
copy_file() {
    local source="$1"
    local dest="$2"
    echo "📁 Copying: $source -> $dest"
    scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$source" "${REMOTE_USER}@${REMOTE_HOST}:$dest"
}

# Test connectivity
echo "🔍 Testing connectivity to Coffin..."
if ping -c 1 -W 5 "$REMOTE_HOST" > /dev/null 2>&1; then
    echo "✅ Coffin RPI is reachable"
else
    echo "❌ Cannot reach Coffin RPI at $REMOTE_HOST"
    exit 1
fi

# Test SSH connectivity
echo "🔍 Testing SSH connectivity..."
if run_ssh "echo 'SSH connection successful'"; then
    echo "✅ SSH connection working"
else
    echo "❌ SSH connection failed"
    exit 1
fi

# Install Fluent Bit if not already installed
echo "📦 Checking Fluent Bit installation..."
if run_ssh "which fluent-bit"; then
    echo "✅ Fluent Bit is already installed"
else
    echo "📦 Installing Fluent Bit..."
    run_ssh "curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh"
fi

# Stop Fluent Bit service if running
echo "🛑 Stopping Fluent Bit service..."
run_ssh "sudo systemctl stop fluent-bit || true"

# Create required directories
echo "📁 Creating required directories..."
run_ssh "sudo mkdir -p ${LOG_EXPORT_DIR}"
run_ssh "sudo mkdir -p ${MONSTERBOX_LOG_DIR}"
run_ssh "sudo mkdir -p ${SCRIPTS_LOG_DIR}"
run_ssh "sudo mkdir -p /tmp/flb-storage/"
run_ssh "sudo mkdir -p /etc/fluent-bit/"

# Set correct permissions
echo "🔐 Setting directory permissions..."
run_ssh "sudo chown -R ${REMOTE_USER}:${REMOTE_USER} ${LOG_EXPORT_DIR}"
run_ssh "sudo chown -R ${REMOTE_USER}:${REMOTE_USER} /tmp/flb-storage/"
run_ssh "sudo chmod 755 ${LOG_EXPORT_DIR}"
run_ssh "sudo chmod 755 /tmp/flb-storage/"

# Create the Fluent Bit configuration
echo "⚙️  Creating Fluent Bit configuration..."
cat > /tmp/fluent-bit-coffin.conf << 'EOF'
# MonsterBox Fluent Bit Configuration for Coffin RPI4b
# Using default format (no format specified)

[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020
    storage.path  /tmp/flb-storage/
    storage.sync  normal
    storage.checksum off
    storage.backlog.mem_limit 5M

# MonsterBox Application Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/*.log
    Path_Key          filename
    Tag               monsterbox.app
    DB                /var/log/flb_monsterbox_app.db
    Refresh_Interval  5
    Read_from_Head    true

# MonsterBox Utility Scripts Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/scripts/log/*.log
    Path_Key          filename
    Tag               monsterbox.utils
    DB                /var/log/flb_monsterbox_utils.db
    Refresh_Interval  5
    Read_from_Head    true

# MonsterBox Error Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/error*.log
    Path_Key          filename
    Tag               monsterbox.errors
    DB                /var/log/flb_monsterbox_errors.db
    Refresh_Interval  2
    Read_from_Head    true

# System Logs (syslog only - most important)
[INPUT]
    Name              tail
    Path              /var/log/syslog
    Tag               system.syslog
    DB                /var/log/flb_syslog.db
    Refresh_Interval  10
    Read_from_Head    false
    Skip_Long_Lines   On

# CPU and Memory Metrics
[INPUT]
    Name              cpu
    Tag               metrics.cpu
    Interval_Sec      30

[INPUT]
    Name              mem
    Tag               metrics.memory
    Interval_Sec      30

# FILTERS - Add metadata
[FILTER]
    Name              record_modifier
    Match             monsterbox.*
    Record            hostname coffin
    Record            source_type monsterbox_app

[FILTER]
    Name              record_modifier
    Match             system.*
    Record            hostname coffin
    Record            source_type system

[FILTER]
    Name              record_modifier
    Match             metrics.*
    Record            hostname coffin
    Record            source_type metrics

# OUTPUTS - Using default format (no format specified)
[OUTPUT]
    Name              file
    Match             monsterbox.app
    Path              /home/remote/log_export/
    File              coffin-monsterbox-app.log

[OUTPUT]
    Name              file
    Match             monsterbox.utils
    Path              /home/remote/log_export/
    File              coffin-monsterbox-utils.log

[OUTPUT]
    Name              file
    Match             monsterbox.errors
    Path              /home/remote/log_export/
    File              coffin-monsterbox-errors.log

[OUTPUT]
    Name              file
    Match             system.syslog
    Path              /home/remote/log_export/
    File              coffin-system-syslog.log

[OUTPUT]
    Name              file
    Match             metrics.*
    Path              /home/remote/log_export/
    File              coffin-metrics.log

# Combined output for easy MCP consumption
[OUTPUT]
    Name              file
    Match             *
    Path              /home/remote/log_export/
    File              coffin-combined.log

# Also output to stdout for debugging
[OUTPUT]
    Name              stdout
    Match             *
EOF

# Copy configuration to Coffin
echo "📋 Deploying configuration..."
copy_file "/tmp/fluent-bit-coffin.conf" "/tmp/fluent-bit.conf"
run_ssh "sudo mv /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf"

# Create parsers.conf if it doesn't exist
echo "📝 Creating parsers configuration..."
cat > /tmp/parsers.conf << 'EOF'
[PARSER]
    Name        json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L
    Time_Keep   On

[PARSER]
    Name        syslog
    Format      regex
    Regex       ^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$
    Time_Key    time
    Time_Format %b %d %H:%M:%S
EOF

copy_file "/tmp/parsers.conf" "/tmp/parsers.conf"
run_ssh "sudo mv /tmp/parsers.conf /etc/fluent-bit/parsers.conf"

# Create test log files
echo "📝 Creating test log entries..."
run_ssh "mkdir -p ${MONSTERBOX_LOG_DIR}"
run_ssh 'echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"info\",\"message\":\"Coffin MonsterBox startup test\",\"component\":\"app\",\"animatronic\":\"coffin\"}" > /home/remote/MonsterBox/log/test.log'

# Test configuration
echo "🧪 Testing Fluent Bit configuration..."
if run_ssh "sudo /opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf --dry-run"; then
    echo "✅ Configuration test passed"
else
    echo "❌ Configuration test failed"
    exit 1
fi

# Enable and start Fluent Bit service
echo "🚀 Starting Fluent Bit service..."
run_ssh "sudo systemctl enable fluent-bit"
run_ssh "sudo systemctl start fluent-bit"

# Wait a moment for startup
sleep 5

# Check service status
echo "🔍 Checking Fluent Bit status..."
if run_ssh "sudo systemctl is-active fluent-bit"; then
    echo "✅ Fluent Bit service is running"
else
    echo "❌ Fluent Bit service failed to start"
    echo "📋 Checking logs..."
    run_ssh "sudo journalctl -u fluent-bit -n 10 --no-pager"
    exit 1
fi

# Test HTTP interface
echo "🌐 Testing HTTP monitoring interface..."
sleep 2
if run_ssh "curl -s http://localhost:2020/ | grep -q fluent-bit"; then
    echo "✅ HTTP interface is responding"
else
    echo "⚠️  HTTP interface test failed (may not be critical)"
fi

# Check if logs are being generated
echo "📊 Checking log generation..."
sleep 5
if run_ssh "ls -la ${LOG_EXPORT_DIR}/coffin-*.log"; then
    echo "✅ Log files are being generated"
    run_ssh "find ${LOG_EXPORT_DIR} -name 'coffin-*.log' -exec wc -l {} \;"
else
    echo "⚠️  No log files found yet (may need more time)"
fi

# Clean up temporary files
rm -f /tmp/fluent-bit-coffin.conf /tmp/parsers.conf

echo ""
echo "🎉 Fluent Bit deployment to Coffin completed!"
echo ""
echo "📊 Status Summary:"
echo "   • Service: $(run_ssh 'sudo systemctl is-active fluent-bit')"
echo "   • HTTP Interface: http://${REMOTE_HOST}:2020/"
echo "   • Log Export Directory: ${LOG_EXPORT_DIR}/"
echo ""
echo "🔧 Useful commands:"
echo "   • Check status: ssh ${REMOTE_USER}@${REMOTE_HOST} 'sudo systemctl status fluent-bit'"
echo "   • View logs: ssh ${REMOTE_USER}@${REMOTE_HOST} 'sudo journalctl -u fluent-bit -f'"
echo "   • Test HTTP: curl http://${REMOTE_HOST}:2020/"
echo "   • Check exports: ssh ${REMOTE_USER}@${REMOTE_HOST} 'ls -la ${LOG_EXPORT_DIR}/'"
echo ""
echo "✅ Coffin is now ready for MCP log collection!"
