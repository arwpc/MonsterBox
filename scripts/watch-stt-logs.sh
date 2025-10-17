#!/usr/bin/env bash
# Watch STT logs in real-time with color highlighting
# Makes it easy to see what's happening with STT

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

LOG_FILE="/var/log/monsterbox.log"
ERR_FILE="/var/log/monsterbox.err"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         MonsterBox STT Real-Time Log Viewer               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Watching: $LOG_FILE and $ERR_FILE${NC}"
echo -e "${CYAN}Filtering for: STT, microphone, audio, transcription${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if log files exist
if [ ! -f "$LOG_FILE" ]; then
    echo -e "${RED}Error: Log file not found: $LOG_FILE${NC}"
    echo ""
    echo "MonsterBox may not be running, or logs may be in a different location."
    echo ""
    echo "Try:"
    echo "  sudo systemctl status monsterbox"
    echo "  ls -la /var/log/monsterbox*"
    exit 1
fi

# Follow both log files and highlight important lines
tail -f "$LOG_FILE" "$ERR_FILE" 2>/dev/null | grep --line-buffered -E "(STT|🎙️|📝|🎤|microphone|audio|transcrib|language_code|amplitude|maxAmp|Sample count|Looping)" | while IFS= read -r line; do
    # Color code based on content
    if echo "$line" | grep -q "ERROR\|error\|Error\|✗\|failed\|Failed"; then
        echo -e "${RED}$line${NC}"
    elif echo "$line" | grep -q "WARNING\|warning\|Warning\|⚠️"; then
        echo -e "${YELLOW}$line${NC}"
    elif echo "$line" | grep -q "✓\|success\|Success\|captured"; then
        echo -e "${GREEN}$line${NC}"
    elif echo "$line" | grep -q "🎙️\|capturing"; then
        echo -e "${CYAN}$line${NC}"
    elif echo "$line" | grep -q "📝\|Response\|text="; then
        echo -e "${MAGENTA}$line${NC}"
    elif echo "$line" | grep -q "Audio stats\|amplitude\|maxAmp"; then
        echo -e "${BLUE}$line${NC}"
    else
        echo "$line"
    fi
done

