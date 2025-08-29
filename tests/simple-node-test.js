#!/usr/bin/env node

/**
 * Simple Node.js Test - No Mocha, just basic assertions
 */

require('dotenv').config();

console.log('🧪 Running Simple Node.js Tests...\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (error) {
        console.log(`❌ ${name}: ${error.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Test 1: Environment Variables
test('NODE_ENV should be test', () => {
    assert(process.env.NODE_ENV === 'test', `Expected 'test', got '${process.env.NODE_ENV}'`);
});



test('TopMediai API key should be configured', () => {
    assert(process.env.TOPMEDIAI_API_KEY, 'TopMediai API key not found');
    assert(process.env.TOPMEDIAI_API_KEY.length > 10, 'TopMediai API key too short');
});

test('SESSION_SECRET should be configured', () => {
    assert(process.env.SESSION_SECRET, 'SESSION_SECRET not found');
    assert(process.env.SESSION_SECRET.length >= 16, 'SESSION_SECRET too short');
});

// Test 2: File System
test('Package.json should be accessible', () => {
    const fs = require('fs');
    const path = require('path');
    const packagePath = path.join(__dirname, '..', 'package.json');
    
    assert(fs.existsSync(packagePath), 'package.json not found');
    
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    assert(packageData.name === 'monsterbox', 'Package name incorrect');
});

// Test 3: Basic Module Loading
test('Should be able to load logger module', () => {
    const logger = require('../scripts/logger');
    assert(typeof logger.info === 'function', 'Logger info method not found');
});

test('Should be able to load TopMediai API module', () => {
    const TopMediaiAPI = require('../scripts/topMediaiAPI');
    assert(typeof TopMediaiAPI === 'function', 'TopMediaiAPI not a constructor');
});

// Test 4: Skip flags
test('Test skip flags should be configured', () => {
    assert(process.env.SKIP_SSH_TESTS === 'true', 'SKIP_SSH_TESTS not set');
    assert(process.env.SKIP_HARDWARE_TESTS === 'true', 'SKIP_HARDWARE_TESTS not set');
});

console.log('\n📊 Test Results:');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📋 Total: ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ Some tests failed');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
