#!/usr/bin/env node
/**
 * Webcam Error Debugging Script
 * Analyzes common console errors and issues in webcam functionality
 */

const fs = require('fs').promises;
const path = require('path');

class WebcamErrorDebugger {
    constructor() {
        this.commonErrors = [];
        this.potentialFixes = [];
        this.analysisResults = {};
    }

    async analyzeWebcamCode() {
        console.log('🔍 Analyzing webcam code for potential errors...');

        // Analyze the main webcam form
        await this.analyzeFile('views/part-forms/webcam.ejs', 'webcam-form');
        
        // Analyze webcam service
        await this.analyzeFile('services/webcamService.js', 'webcam-service');
        
        // Analyze webcam routes
        await this.analyzeFile('routes/webcamRoutes.js', 'webcam-routes');
        
        // Analyze API routes
        await this.analyzeFile('routes/api/webcamApiRoutes.js', 'webcam-api');

        // Generate report
        await this.generateReport();
    }

    async analyzeFile(filePath, category) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const issues = this.findPotentialIssues(content, filePath);
            
            this.analysisResults[category] = {
                file: filePath,
                issues: issues,
                lineCount: content.split('\n').length
            };

            console.log(`📄 Analyzed ${filePath}: ${issues.length} potential issues found`);
        } catch (error) {
            console.error(`❌ Error analyzing ${filePath}:`, error.message);
        }
    }

    findPotentialIssues(content, filePath) {
        const issues = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for common JavaScript error patterns
            this.checkForCommonErrors(line, lineNumber, issues);
            
            // Check for async/await issues
            this.checkForAsyncIssues(line, lineNumber, issues);
            
            // Check for error handling issues
            this.checkForErrorHandling(line, lineNumber, issues);
            
            // Check for console.log statements (should be logger)
            this.checkForConsoleUsage(line, lineNumber, issues);
            
            // Check for potential null/undefined access
            this.checkForNullAccess(line, lineNumber, issues);
            
            // Check for webcam-specific issues
            this.checkForWebcamIssues(line, lineNumber, issues);
        });

        return issues;
    }

    checkForCommonErrors(line, lineNumber, issues) {
        // Missing semicolons
        if (line.trim().match(/^(var|let|const|function|if|for|while).*[^;{}]$/)) {
            issues.push({
                type: 'syntax',
                severity: 'low',
                line: lineNumber,
                message: 'Potential missing semicolon',
                code: line.trim()
            });
        }

        // Undefined variables
        if (line.includes('undefined') && !line.includes('!== undefined') && !line.includes('=== undefined')) {
            issues.push({
                type: 'undefined-check',
                severity: 'medium',
                line: lineNumber,
                message: 'Potential undefined variable usage',
                code: line.trim()
            });
        }

        // Missing error handling in fetch
        if (line.includes('fetch(') && !line.includes('catch')) {
            issues.push({
                type: 'error-handling',
                severity: 'high',
                line: lineNumber,
                message: 'Fetch without error handling',
                code: line.trim()
            });
        }
    }

    checkForAsyncIssues(line, lineNumber, issues) {
        // Async function without await
        if (line.includes('async function') || line.includes('async (')) {
            // This is just a marker, we'd need more complex analysis
        }

        // Await without async
        if (line.includes('await ') && !line.includes('async')) {
            issues.push({
                type: 'async-await',
                severity: 'high',
                line: lineNumber,
                message: 'Await used without async function',
                code: line.trim()
            });
        }
    }

    checkForErrorHandling(line, lineNumber, issues) {
        // Try without catch
        if (line.trim().startsWith('try {') && !line.includes('catch')) {
            issues.push({
                type: 'error-handling',
                severity: 'medium',
                line: lineNumber,
                message: 'Try block should have corresponding catch',
                code: line.trim()
            });
        }

        // Empty catch blocks
        if (line.includes('catch') && line.includes('{}')) {
            issues.push({
                type: 'error-handling',
                severity: 'high',
                line: lineNumber,
                message: 'Empty catch block - errors will be silently ignored',
                code: line.trim()
            });
        }
    }

    checkForConsoleUsage(line, lineNumber, issues) {
        if (line.includes('console.log') || line.includes('console.error') || line.includes('console.warn')) {
            issues.push({
                type: 'logging',
                severity: 'low',
                line: lineNumber,
                message: 'Consider using logger instead of console',
                code: line.trim()
            });
        }
    }

    checkForNullAccess(line, lineNumber, issues) {
        // Potential null/undefined property access
        const nullAccessPattern = /\w+\.\w+/g;
        if (nullAccessPattern.test(line) && !line.includes('&&') && !line.includes('?.')) {
            issues.push({
                type: 'null-safety',
                severity: 'medium',
                line: lineNumber,
                message: 'Potential null/undefined property access - consider using optional chaining',
                code: line.trim()
            });
        }
    }

    checkForWebcamIssues(line, lineNumber, issues) {
        // Missing device validation
        if (line.includes('deviceId') && !line.includes('validate') && !line.includes('check')) {
            issues.push({
                type: 'webcam-validation',
                severity: 'medium',
                line: lineNumber,
                message: 'Device ID usage without validation',
                code: line.trim()
            });
        }

        // Camera controls without error handling
        if (line.includes('setCameraControls') || line.includes('applyControls')) {
            issues.push({
                type: 'webcam-controls',
                severity: 'medium',
                line: lineNumber,
                message: 'Camera controls operation - ensure proper error handling',
                code: line.trim()
            });
        }

        // Stream operations
        if (line.includes('stream') && (line.includes('start') || line.includes('stop'))) {
            issues.push({
                type: 'webcam-streaming',
                severity: 'medium',
                line: lineNumber,
                message: 'Streaming operation - ensure proper cleanup and error handling',
                code: line.trim()
            });
        }
    }

    async generateReport() {
        console.log('\n📊 WEBCAM ERROR ANALYSIS REPORT');
        console.log('=====================================');

        let totalIssues = 0;
        let highSeverityIssues = 0;
        let mediumSeverityIssues = 0;
        let lowSeverityIssues = 0;

        for (const [category, result] of Object.entries(this.analysisResults)) {
            console.log(`\n📁 ${category.toUpperCase()} (${result.file})`);
            console.log(`   Lines of code: ${result.lineCount}`);
            console.log(`   Issues found: ${result.issues.length}`);

            if (result.issues.length > 0) {
                const groupedIssues = this.groupIssuesByType(result.issues);
                
                for (const [type, issues] of Object.entries(groupedIssues)) {
                    console.log(`\n   🔸 ${type.toUpperCase()} (${issues.length} issues):`);
                    
                    issues.slice(0, 3).forEach(issue => {
                        console.log(`     Line ${issue.line}: ${issue.message}`);
                        if (issue.severity === 'high') highSeverityIssues++;
                        else if (issue.severity === 'medium') mediumSeverityIssues++;
                        else lowSeverityIssues++;
                    });

                    if (issues.length > 3) {
                        console.log(`     ... and ${issues.length - 3} more`);
                    }
                }
            }

            totalIssues += result.issues.length;
        }

        console.log('\n📈 SUMMARY');
        console.log('===========');
        console.log(`Total issues found: ${totalIssues}`);
        console.log(`🔴 High severity: ${highSeverityIssues}`);
        console.log(`🟡 Medium severity: ${mediumSeverityIssues}`);
        console.log(`🟢 Low severity: ${lowSeverityIssues}`);

        // Generate recommendations
        this.generateRecommendations();

        // Save detailed report
        await this.saveDetailedReport();
    }

    groupIssuesByType(issues) {
        const grouped = {};
        issues.forEach(issue => {
            if (!grouped[issue.type]) {
                grouped[issue.type] = [];
            }
            grouped[issue.type].push(issue);
        });
        return grouped;
    }

    generateRecommendations() {
        console.log('\n💡 RECOMMENDATIONS');
        console.log('==================');
        
        const recommendations = [
            '1. Add comprehensive error handling to all async operations',
            '2. Implement proper validation for all user inputs and device IDs',
            '3. Use optional chaining (?.) for safer property access',
            '4. Replace console.log statements with proper logging',
            '5. Add timeout handling for camera operations',
            '6. Implement proper cleanup for streaming operations',
            '7. Add user-friendly error messages for common failures',
            '8. Consider implementing retry logic for network operations'
        ];

        recommendations.forEach(rec => console.log(`   ${rec}`));
    }

    async saveDetailedReport() {
        const reportPath = path.join('test-results', 'webcam-error-analysis.json');
        
        try {
            await fs.mkdir('test-results', { recursive: true });
            await fs.writeFile(reportPath, JSON.stringify({
                timestamp: new Date().toISOString(),
                analysis: this.analysisResults,
                summary: {
                    totalFiles: Object.keys(this.analysisResults).length,
                    totalIssues: Object.values(this.analysisResults).reduce((sum, result) => sum + result.issues.length, 0)
                }
            }, null, 2));
            
            console.log(`\n💾 Detailed report saved to: ${reportPath}`);
        } catch (error) {
            console.error('❌ Failed to save report:', error.message);
        }
    }
}

// Run the analysis
if (require.main === module) {
    const analyzer = new WebcamErrorDebugger();
    analyzer.analyzeWebcamCode()
        .then(() => {
            console.log('\n✅ Analysis complete!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = WebcamErrorDebugger;
