#!/bin/bash
echo "🦴 Starting Jaw Calibration on Skulltalker RPI4b"
echo "================================================="
echo "Remote Target: 192.168.8.130"
echo "Hardware: MG90S Servo on GPIO Pin 18"
echo ""

# Create calibration execution script
cat > temp-jaw-calibration.sh << 'EOF'
#!/bin/bash
echo '🦴 Jaw Calibration Starting on Skulltalker RPI4b'
cd /home/remote/MonsterBox || exit 1

echo 'Checking Python environment...'
python3 --version
echo 'Checking GPIO library...'
python3 -c "import lgpio; print('lgpio available')" 2>/dev/null || echo 'lgpio not available'

echo 'Starting jaw calibration...'
python3 scripts/chatterpi/jaw_calibration.py

echo 'Calibration complete. Results saved to jaw_calibration_results.json'
ls -la jaw_calibration_results.json 2>/dev/null || echo 'No results file found'
EOF

echo "Uploading calibration script to Skulltalker..."
scp temp-jaw-calibration.sh remote@192.168.8.130:/tmp/

echo "Executing jaw calibration on remote hardware..."
ssh remote@192.168.8.130 "chmod +x /tmp/temp-jaw-calibration.sh && /tmp/temp-jaw-calibration.sh"

echo ""
echo "🔧 Post-Calibration Commands:"
echo "View results: ssh remote@192.168.8.130 'cat /home/remote/MonsterBox/jaw_calibration_results.json'"
echo "Test jaw movement: ssh remote@192.168.8.130 'cd /home/remote/MonsterBox && python3 scripts/chatterpi/minimal_jaw_server.py'"

# Cleanup
rm -f temp-jaw-calibration.sh

echo ""
echo "Calibration complete! Check the output above for results."
