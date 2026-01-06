#!/bin/bash
{
  echo "=== Checking test status ===" 
  echo "Date: $(date)"
  echo ""
  
  echo "=== Node processes ===" 
  ps aux | grep node | grep -v grep || echo "No node processes"
  echo ""
  
  echo "=== Playwright processes ===" 
  ps aux | grep playwright | grep -v grep || echo "No playwright processes"
  echo ""
  
  echo "=== Port 3000 ===" 
  lsof -i:3000 || echo "Port 3000 is free"
  echo ""
  
  echo "=== Report file ===" 
  if [ -f playwright-report/report.json ]; then
    echo "File exists, size: $(wc -c < playwright-report/report.json) bytes"
    echo "Last modified: $(stat -c %y playwright-report/report.json)"
    echo "First 20 lines:"
    head -20 playwright-report/report.json
  else
    echo "No report file found"
  fi
} > /tmp/test_check_output.txt 2>&1

