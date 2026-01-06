#!/bin/bash
exec > find_processes_output.txt 2>&1

echo "=== All node processes ==="
ps auxww | grep node | grep -v grep

echo ""
echo "=== All playwright processes ==="
ps auxww | grep playwright | grep -v grep

echo ""
echo "=== Port 3000 usage ==="
lsof -i:3000

echo ""
echo "=== Done ==="

