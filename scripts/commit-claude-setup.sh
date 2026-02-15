#!/bin/bash
#
# Commit Claude Code integration setup to git
# Usage: bash scripts/commit-claude-setup.sh
#

set -e

cd /home/remote/MonsterBox

echo "📦 Staging Claude Code configuration files..."

git add \
  .vscode/settings.json \
  .vscode/tasks.json \
  .vscode/launch.json \
  .vscode/extensions.json \
  .vscode/README.md \
  CLAUDE.md \
  CLAUDE_CODE_SETUP.md \
  MonsterBox.code-workspace \
  .gitignore

echo "✅ Staged files:"
git status --short | grep '^[AM]'

echo ""
echo "📝 Creating commit..."

git commit -m "Add Claude Code integration with auto-restoration

- CLAUDE.md: Project memory (conventions, architecture, pitfalls)
- .vscode/: Auto-execution, RPI optimizations, 12 quick tasks
- MonsterBox.code-workspace: Workspace file for instant config load
- Auto-restoration: All settings committed to git, survive resets
- Performance: File watcher exclusions, git optimizations for RPI4B

Setup guide: CLAUDE_CODE_SETUP.md
VS Code guide: .vscode/README.md

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

echo ""
echo "✅ Committed successfully!"
echo ""
echo "📊 Commit details:"
git log -1 --stat

echo ""
echo "🚀 Next step: Push to remote"
echo "   git push"
