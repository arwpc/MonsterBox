class CleanReporter {
    constructor(runner) {
        let passes = 0;
        let failures = 0;

        runner.on('pass', function(test) {
            passes++;
            process.stdout.write('.');
        });

        runner.on('fail', function(test, err) {
            failures++;
            console.log('\n');
            console.log(`  ❌ ${test.fullTitle()}`);
            console.log(`     ${err.message}`);
            // Only show the most relevant part of the stack trace
            const relevantStack = err.stack.split('\n').slice(1, 3).join('\n');
            console.log(`     ${relevantStack}`);
        });

        runner.on('end', function() {
            console.log('\n');
            console.log('  Summary:');
            console.log(`    ✓ ${passes} passing`);
            if (failures > 0) {
                console.log(`    ✗ ${failures} failing`);
            }
            console.log('\n');
        });
    }
}

module.exports = CleanReporter;
