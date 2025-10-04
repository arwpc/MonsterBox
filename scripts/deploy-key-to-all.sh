#!/bin/bash

KEY="sk_0c38afcf2b8be6681eb01edbc2e5e9bbfe034d6b1d714a94"

for IP in 192.168.8.150 192.168.8.140 192.168.8.130; do
    echo "=== Deploying to $IP ==="
    ssh remote@$IP "sudo mkdir -p /etc/monsterbox && echo '$KEY' | sudo tee /etc/monsterbox/elevenlabs.key > /dev/null && sudo chmod 600 /etc/monsterbox/elevenlabs.key && ls -l /etc/monsterbox/elevenlabs.key"
    echo "✓ Key deployed to $IP"
    echo ""
done

echo "All keys deployed!"

