#!/bin/bash
# === Reset SSH Key for GitHub (MonsterBox) ===

EMAIL="arwpersonal@gmail.com"
KEYFILE="$HOME/.ssh/id_ed25519"

echo "🔑 Removing old SSH key (if it exists)..."
rm -f "$KEYFILE" "$KEYFILE.pub"

echo "🔑 Generating new SSH key for $EMAIL..."
ssh-keygen -t ed25519 -C "$EMAIL" -f "$KEYFILE" -N ""

echo "🚀 Starting ssh-agent..."
eval "$(ssh-agent -s)"

echo "➕ Adding new SSH key to agent..."
ssh-add "$KEYFILE"

echo ""
echo "📋 Copy the public key below into GitHub (Settings → SSH and GPG Keys):"
echo "------------------------------------------------------------"
cat "$KEYFILE.pub"
echo "------------------------------------------------------------"

echo "✅ Setting remote to SSH for MonsterBox..."
cd ~/MonsterBox || exit 1
git remote set-url origin git@github.com:arwpc/MonsterBox.git
git remote -v

echo ""
echo "⚡ Done! After you add the key to GitHub, test with:"
echo "    ssh -T git@github.com"
echo "and pull your repo with:"
echo "    git pull"
