#!/bin/bash
echo "🎯 Agent Coordination Dashboard"
echo "=============================="
echo ""

echo "📋 Current Agent Status:"
echo "Agent 1 (AI Integration): $(git log --oneline -1 agent-1-ai-fixes 2>/dev/null || echo 'No commits yet')"
echo "Agent 2 (ChatterPi Chat): $(git log --oneline -1 agent-2-chatterpi-fixes 2>/dev/null || echo 'No commits yet')"
echo "Agent 3 (Main App): $(git log --oneline -1 agent-3-main-app-fixes 2>/dev/null || echo 'No commits yet')"
echo ""

echo "📊 Task Master Status:"
export PATH=~/.npm-global/bin:$PATH
task-master get-tasks --status pending 2>/dev/null || echo "Task Master not available"

echo ""
echo "🔧 Available Commands:"
echo "1. ./start-agent-1.sh  - Start Agent 1 (AI Integration)"
echo "2. ./start-agent-2.sh  - Start Agent 2 (ChatterPi Chat)"
echo "3. ./start-agent-3.sh  - Start Agent 3 (Main Application)"
echo "4. npm test            - Run all tests"
echo "5. git status          - Check current branch and changes"
echo "6. task-master get-tasks - View all tasks"
echo ""

echo "🎯 Merge Instructions (when agents complete):"
echo "git checkout main"
echo "git merge agent-1-ai-fixes"
echo "git merge agent-2-chatterpi-fixes"
echo "git merge agent-3-main-app-fixes"
echo "git push origin main"
