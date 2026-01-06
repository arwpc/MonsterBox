#!/bin/bash
{
  ps auxww | grep -E "(node|playwright|firefox)" | grep -v grep
  echo "---"
  lsof -i:3000 2>&1 || echo "Port 3000 free"
  echo "---"
  find . -name "report.json" -type f -exec ls -lh {} \; 2>/dev/null
} > status_output.txt 2>&1

