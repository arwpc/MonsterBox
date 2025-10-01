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
