#!/usr/bin/env node
/**
 * Test environment variable loading
 */

// Clear any existing environment variables
delete process.env.ORLOK_SSH_USER;
delete process.env.ORLOK_SSH_PASSWORD;

console.log('Before loading .env:');
console.log('ORLOK_SSH_USER:', JSON.stringify(process.env.ORLOK_SSH_USER));
console.log('ORLOK_SSH_PASSWORD:', JSON.stringify(process.env.ORLOK_SSH_PASSWORD));

// Load .env file
require('dotenv').config();

console.log('\nAfter loading .env:');
console.log('ORLOK_SSH_USER:', JSON.stringify(process.env.ORLOK_SSH_USER));
console.log('ORLOK_SSH_PASSWORD:', JSON.stringify(process.env.ORLOK_SSH_PASSWORD));

// Test the SSH credentials manager
const sshCredentials = require('./scripts/ssh-credentials');
console.log('\nSSH Credentials for orlok:');
console.log(JSON.stringify(sshCredentials.getCredentials('orlok'), null, 2));

console.log('\nSSH Command test:');
console.log(sshCredentials.buildSSHCommand('orlok', '192.168.8.120', 'echo test'));
