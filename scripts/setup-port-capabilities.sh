#!/bin/bash
# MonsterBox Port Capabilities Setup
# This script grants Node.js the capability to bind to privileged ports (like 80)
# without requiring sudo for the entire application

set -e

echo "🔧 Setting up port binding capabilities for MonsterBox..."

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    echo "❌ Please run this script as a regular user, not root"
    echo "   The script will use sudo when needed"
    exit 1
fi

# Find Node.js binary
NODE_PATH=$(which node)
if [[ -z "$NODE_PATH" ]]; then
    echo "❌ Node.js not found in PATH"
    exit 1
fi

echo "📍 Found Node.js at: $NODE_PATH"

# Install libcap2-bin if not present (for setcap command)
if ! command -v setcap &> /dev/null; then
    echo "📦 Installing libcap2-bin package..."
    sudo apt update
    sudo apt install -y libcap2-bin
fi

# Grant CAP_NET_BIND_SERVICE capability to Node.js
echo "🔐 Granting CAP_NET_BIND_SERVICE capability to Node.js..."
sudo setcap 'cap_net_bind_service=+ep' "$NODE_PATH"

# Verify the capability was set
echo "✅ Verifying capabilities..."
getcap "$NODE_PATH"

# Check if the capability is properly set
if getcap "$NODE_PATH" | grep -q "cap_net_bind_service"; then
    echo "✅ Success! Node.js can now bind to privileged ports (80, 443, etc.)"
    echo ""
    echo "🚀 You can now run MonsterBox without sudo:"
    echo "   npm start"
    echo "   node app.js"
    echo ""
    echo "📝 Note: If you update Node.js, you'll need to run this script again"
else
    echo "❌ Failed to set capabilities"
    exit 1
fi

# Create a verification script
cat > scripts/verify-port-capabilities.sh << 'EOF'
#!/bin/bash
# Verify that Node.js has the required capabilities

NODE_PATH=$(which node)
echo "Checking capabilities for: $NODE_PATH"

if getcap "$NODE_PATH" | grep -q "cap_net_bind_service"; then
    echo "✅ Node.js has CAP_NET_BIND_SERVICE capability"
    echo "✅ Can bind to privileged ports (80, 443, etc.)"
else
    echo "❌ Node.js does NOT have CAP_NET_BIND_SERVICE capability"
    echo "❌ Cannot bind to privileged ports without sudo"
    echo ""
    echo "Run: ./scripts/setup-port-capabilities.sh"
fi
EOF

chmod +x scripts/verify-port-capabilities.sh

echo "📋 Created verification script: scripts/verify-port-capabilities.sh"
echo "   Run it anytime to check if capabilities are still set"
