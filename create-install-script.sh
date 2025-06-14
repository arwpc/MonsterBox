# Create the installation script
cat > ~/install-dependencies.sh << 'EOF'
#!/bin/bash
# Install dependencies and start the application

cd ~/MB-TopMedia

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if installation was successful
if [ $? -eq 0 ]; then
  echo "✅ Dependencies installed successfully"
  
  # Start the application
  echo "🚀 Starting MonsterBox application..."
  npm start
else
  echo "❌ Failed to install dependencies"
  echo "Try running 'npm install' manually"
fi
EOF

# Make the script executable
chmod +x ~/install-dependencies.sh

echo "Script created. Run it with:"
echo "~/install-dependencies.sh"