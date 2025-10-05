#!/bin/bash
# Kill all running MonsterBox instances

echo "🛑 Killing all MonsterBox instances..."
echo ""

# Kill by process name (node server.js)
echo "Killing Node.js server processes..."
pkill -f "node.*server.js" && echo "  ✅ Killed node server.js processes" || echo "  ℹ️  No node server.js processes found"

# Kill by process name (node server-test.js)
echo "Killing Node.js test server processes..."
pkill -f "node.*server-test.js" && echo "  ✅ Killed node server-test.js processes" || echo "  ℹ️  No node server-test.js processes found"

# Kill any node process in MonsterBox directory
echo "Killing any Node.js processes in MonsterBox directory..."
pkill -f "node.*MonsterBox" && echo "  ✅ Killed MonsterBox node processes" || echo "  ℹ️  No MonsterBox node processes found"

# Kill PM2 processes if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "Stopping PM2 processes..."
    pm2 stop all 2>/dev/null && echo "  ✅ Stopped PM2 processes" || echo "  ℹ️  No PM2 processes running"
    pm2 delete all 2>/dev/null && echo "  ✅ Deleted PM2 processes" || echo "  ℹ️  No PM2 processes to delete"
fi

echo ""
echo "Checking for remaining MonsterBox processes..."
REMAINING=$(ps aux | grep -E "node.*(server|MonsterBox)" | grep -v grep | wc -l)

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ All MonsterBox processes killed successfully"
else
    echo "⚠️  Warning: $REMAINING MonsterBox process(es) still running:"
    ps aux | grep -E "node.*(server|MonsterBox)" | grep -v grep
    echo ""
    echo "To force kill these processes, run:"
    echo "  pkill -9 -f 'node.*server.js'"
fi

echo ""
echo "Done."

