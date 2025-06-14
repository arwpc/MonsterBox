/**
 * Environment and Configuration Tests
 * Tests that don't require full app initialization
 */

require('dotenv').config();
const { expect } = require('chai');

describe('🔧 Environment Configuration Tests', function() {
    this.timeout(5000);

    describe('Environment Variables', function() {
        it('should have NODE_ENV set to test', function() {
            expect(process.env.NODE_ENV).to.equal('test');
        });

        it('should have SESSION_SECRET configured', function() {
            const sessionSecret = process.env.SESSION_SECRET;
            expect(sessionSecret).to.exist;
            expect(sessionSecret.length).to.be.at.least(16);
            console.log('✅ SESSION_SECRET configured');
        });

        it('should have PORT configured', function() {
            const port = process.env.PORT;
            expect(port).to.exist;
            const portNumber = parseInt(port, 10);
            expect(portNumber).to.be.a('number');
            expect(portNumber).to.be.above(0);
            console.log(`✅ PORT configured: ${port}`);
        });

        it('should have OpenAI API key configured', function() {
            const apiKey = process.env.OPENAI_API_KEY;
            expect(apiKey).to.exist;
            expect(apiKey.length).to.be.above(50);
            expect(apiKey).to.include('sk-proj-');
            console.log('✅ OpenAI API key configured');
        });

        it('should have TopMediai API key configured', function() {
            const apiKey = process.env.TOPMEDIAI_API_KEY;
            expect(apiKey).to.exist;
            expect(apiKey.length).to.be.above(10);
            console.log('✅ TopMediai API key configured');
        });

        it('should have Anthropic API key configured', function() {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            expect(apiKey).to.exist;
            expect(apiKey).to.include('sk-ant-');
            console.log('✅ Anthropic API key configured');
        });
    });

    describe('Test Configuration', function() {
        it('should have test flags configured', function() {
            expect(process.env.SKIP_SSH_TESTS).to.equal('true');
            expect(process.env.SKIP_HARDWARE_TESTS).to.equal('true');
            console.log('✅ Test skip flags configured');
        });

        it('should have test-specific settings', function() {
            expect(process.env.TEST_PORT).to.exist;
            expect(process.env.TEST_SESSION_SECRET).to.exist;
            console.log('✅ Test-specific settings configured');
        });
    });

    describe('File System Access', function() {
        it('should be able to access package.json', function() {
            const fs = require('fs');
            const path = require('path');
            const packagePath = path.join(__dirname, '..', 'package.json');
            
            expect(fs.existsSync(packagePath)).to.be.true;
            
            const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            expect(packageData.name).to.equal('monsterbox');
            console.log(`✅ Package.json accessible: ${packageData.name} v${packageData.version}`);
        });

        it('should be able to access test files', function() {
            const fs = require('fs');
            const path = require('path');
            const testsDir = path.join(__dirname);
            
            expect(fs.existsSync(testsDir)).to.be.true;
            
            const testFiles = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
            expect(testFiles.length).to.be.above(0);
            console.log(`✅ Test directory accessible: ${testFiles.length} test files found`);
        });
    });
});
