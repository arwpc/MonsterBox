# Create the isolation script
cat > ~/run-isolation-with-env.sh << 'EOF'
#!/bin/bash
# Create and run the isolation scripts while preserving environment variables

# First, clone the repository if it doesn't exist
if [ ! -d ~/MB-TopMedia ]; then
  echo "Cloning MonsterBox repository to MB-TopMedia..."
  git clone https://github.com/arwpc/MonsterBox.git ~/MB-TopMedia
  
  # Copy the .env file to preserve API keys
  echo "Copying .env file to preserve API keys..."
  cp .env ~/MB-TopMedia/
else
  echo "Directory MB-TopMedia already exists"
fi

# Create the git isolation script
cat > ~/isolate-git-environment.sh << 'EOG'
#!/bin/bash
# Isolate your Git environment in MB-TopMedia

cd ~/MB-TopMedia

# Create a local config that overrides global settings
git config --local user.name "Your Name"
git config --local user.email "your.email@example.com"

# Disable automatic fetching for this repository
git config --local fetch.prune false
git config --local pull.rebase false

# Rename the remote to make it distinct
git remote rename origin my-origin

# Check your configuration
echo "Current Git configuration:"
git config --local --list

echo "Current remotes:"
git remote -v
EOG

# Create the branch isolation script
cat > ~/create-isolated-branch.sh << 'EOG'
#!/bin/bash
# Create an isolated branch for your work

cd ~/MB-TopMedia

# Create and switch to a new branch with a unique name
git checkout -b my-isolated-work-branch

# Verify current branch
echo "Now working on branch: $(git branch --show-current)"
EOG

# Make scripts executable
chmod +x ~/isolate-git-environment.sh
chmod +x ~/create-isolated-branch.sh

# Run the scripts
echo "Running isolation scripts..."
~/isolate-git-environment.sh
~/create-isolated-branch.sh

echo "Setup complete! You now have an isolated environment in ~/MB-TopMedia"
echo "Your TopMediai API key has been preserved in the .env file"
EOF

# Make the script executable
chmod +x ~/run-isolation-with-env.sh

echo "Script created. Run it with:"
echo "~/run-isolation-with-env.sh"