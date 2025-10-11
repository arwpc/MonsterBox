#!/usr/bin/env python3
import json
import sys

with open('playwright-report/report.json', 'r') as f:
    data = json.load(f)

total = 0
passed = 0
failed = 0
skipped = 0
timedOut = 0

failed_tests = []

for suite in data.get('suites', []):
    for spec in suite.get('specs', []):
        for test in spec.get('tests', []):
            for result in test.get('results', []):
                total += 1
                status = result.get('status', 'unknown')
                if status == 'passed':
                    passed += 1
                elif status == 'failed':
                    failed += 1
                    failed_tests.append({
                        'title': spec.get('title', 'Unknown'),
                        'file': spec.get('file', 'Unknown'),
                        'error': result.get('error', {}).get('message', 'No error message')
                    })
                elif status == 'skipped':
                    skipped += 1
                elif status == 'timedOut':
                    timedOut += 1

print(f"Total: {total}")
print(f"Passed: {passed}")
print(f"Failed: {failed}")
print(f"Skipped: {skipped}")
print(f"TimedOut: {timedOut}")
print()

if failed_tests:
    print("Failed tests:")
    for test in failed_tests[:20]:  # Limit to first 20
        print(f"\n  File: {test['file']}")
        print(f"  Test: {test['title']}")
        print(f"  Error: {test['error'][:200]}")  # First 200 chars of error

