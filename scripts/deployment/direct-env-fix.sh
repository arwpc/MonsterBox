# Direct commands to fix the environment and start the application
cd ~/MB-TopMedia

# Create .env file with all required variables
echo "Creating complete .env file..."
cat > .env << EOF
REPLICA_API_KEY="dummy-value-not-used-anymore"
TOPMEDIAI_API_KEY="3d31edf8c9a24824b72bf325f0d46ced"
PORT=3000
NODE_ENV=development
USE_TOPMEDIAI=true
REPLICA_FALLBACK=false
EOF

echo "Updated .env file contents:"
cat .env

echo "Starting the application..."
npm start