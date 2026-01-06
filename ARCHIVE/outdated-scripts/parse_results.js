const fs = require('fs');

const data = JSON.parse(fs.readFileSync('playwright-report/report.json', 'utf8'));

let total = 0, passed = 0, failed = 0, skipped = 0, timedOut = 0;
const failedTests = [];

for (const suite of data.suites || []) {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      for (const result of test.results || []) {
        total++;
        const status = result.status || 'unknown';
        if (status === 'passed') passed++;
        else if (status === 'failed') {
          failed++;
          failedTests.push({
            title: spec.title,
            file: spec.file,
            error: (result.error && result.error.message) || 'No error message'
          });
        }
        else if (status === 'skipped') skipped++;
        else if (status === 'timedOut') timedOut++;
      }
    }
  }
}

let output = `Total: ${total}\nPassed: ${passed}\nFailed: ${failed}\nSkipped: ${skipped}\nTimedOut: ${timedOut}\n\n`;

if (failedTests.length > 0) {
  output += 'Failed tests:\n';
  failedTests.slice(0, 20).forEach(test => {
    output += `\n  File: ${test.file}\n`;
    output += `  Test: ${test.title}\n`;
    output += `  Error: ${test.error.substring(0, 300)}\n`;
  });
}

fs.writeFileSync('TEST_RESULTS.txt', output);
console.log(output);

