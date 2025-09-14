#!/usr/bin/env node

/**
 * MonsterBox UI Integration Test Suite
 * Tests Phase 2 (Backend Integration) and Phase 3 (Testing & Validation)
 * Moved from root directory during cleanup
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TEST_CHARACTER_ID = 4; // Skulltalker

class UIIntegrationTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async runTest(testName, testFunction) {
        console.log(`\n🧪 Running test: ${testName}`);
        try {
            await testFunction();
            console.log(`✅ PASSED: ${testName}`);
            this.results.passed++;
            this.results.tests.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            console.log(`❌ FAILED: ${testName} - ${error.message}`);
            this.results.failed++;
            this.results.tests.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async testCharacterPartsPage() {
        const response = await axios.get(`${BASE_URL}/characters/${TEST_CHARACTER_ID}/parts`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.includes('Assigned Hardware Parts')) {
            throw new Error('Character parts page does not contain expected content');
        }
    }

    async testCharacterAIPage() {
        const response = await axios.get(`${BASE_URL}/characters/${TEST_CHARACTER_ID}/ai`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.includes('Assigned AI Instances')) {
            throw new Error('Character AI page does not contain expected content');
        }
    }

    async testHardwareAPIStatus() {
        const response = await axios.get(`${BASE_URL}/api/hardware/status`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.success) {
            throw new Error('Hardware API status returned success: false');
        }
    }

    async testHardwareAPIServices() {
        const response = await axios.get(`${BASE_URL}/api/hardware/services`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.success) {
            throw new Error('Hardware API services returned success: false');
        }
    }

    async testCharacterDataStructure() {
        const charactersPath = path.join(__dirname, 'data', 'characters.json');
        const charactersData = await fs.readFile(charactersPath, 'utf8');
        const characters = JSON.parse(charactersData);
        
        const testCharacter = characters.find(c => c.id === TEST_CHARACTER_ID);
        if (!testCharacter) {
            throw new Error(`Test character ${TEST_CHARACTER_ID} not found`);
        }
        
        if (!testCharacter.ai_instances) {
            throw new Error('Character does not have ai_instances field');
        }
        
        if (!Array.isArray(testCharacter.ai_instances)) {
            throw new Error('ai_instances is not an array');
        }
    }



    async testPartsPage() {
        const response = await axios.get(`${BASE_URL}/parts`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.includes('Hardware Parts Management')) {
            throw new Error('Parts page does not contain expected content');
        }
    }

    async testCharactersPage() {
        const response = await axios.get(`${BASE_URL}/characters`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.includes('Character Management')) {
            throw new Error('Characters page does not contain expected content');
        }
        // Check for new action buttons
        if (!response.data.includes('🔧 Parts') || !response.data.includes('🧠 AI')) {
            throw new Error('Characters page missing new action buttons');
        }
    }



    async testHardwareMonitorPage() {
        const response = await axios.get(`${BASE_URL}/hardware-monitor.html`);
        if (response.status !== 200) {
            throw new Error(`Expected status 200, got ${response.status}`);
        }
        if (!response.data.includes('Hardware Monitor')) {
            throw new Error('Hardware monitor page does not contain expected content');
        }
    }

    async runAllTests() {
        console.log('🚀 Starting MonsterBox UI Integration Test Suite\n');
        console.log('=' .repeat(60));

        // Phase 2: Backend Integration Tests
        console.log('\n📋 Phase 2: Backend Integration Tests');
        await this.runTest('Character Parts Page', () => this.testCharacterPartsPage());
        await this.runTest('Character AI Page', () => this.testCharacterAIPage());
        await this.runTest('Hardware API Status', () => this.testHardwareAPIStatus());
        await this.runTest('Hardware API Services', () => this.testHardwareAPIServices());
        await this.runTest('Character Data Structure', () => this.testCharacterDataStructure());


        // Phase 3: Testing & Validation
        console.log('\n📋 Phase 3: Testing & Validation');
        await this.runTest('Parts Page', () => this.testPartsPage());
        await this.runTest('Characters Page', () => this.testCharactersPage());

        await this.runTest('Hardware Monitor Page', () => this.testHardwareMonitorPage());

        // Results Summary
        console.log('\n' + '=' .repeat(60));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('=' .repeat(60));
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📈 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);

        if (this.results.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.results.tests.filter(t => t.status === 'FAILED').forEach(test => {
                console.log(`   - ${test.name}: ${test.error}`);
            });
        }

        console.log('\n🎯 MonsterBox UI Integration Test Suite Complete!');
        return this.results.failed === 0;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new UIIntegrationTester();
    tester.runAllTests()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test suite failed:', error);
            process.exit(1);
        });
}

module.exports = UIIntegrationTester;
