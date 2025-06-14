# Create the environment fix script
echo '#!/bin/bash
# Fix environment variables and restart the application

cd ~/MB-TopMedia

# Create or update .env file with all required variables
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

echo "Restarting the application..."
npm start
' > ~/fix-env.sh

# Make it executable
chmod +x ~/fix-env.sh

echo "Environment fix script created. Run it with:"
echo "~/fix-env.sh"