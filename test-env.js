#!/usr/bin/env node

// Clear any existing environment variables
delete process.env.ORLOK_SSH_USER;
delete process.env.ORLOK_SSH_PASSWORD;
delete process.env.COFFIN_SSH_USER;
delete process.env.COFFIN_SSH_PASSWORD;

// Force reload dotenv
require('dotenv').config({ override: true });

console.log('Environment Variables Test:');
console.log('ORLOK_SSH_USER:', JSON.stringify(process.env.ORLOK_SSH_USER));
console.log('ORLOK_SSH_PASSWORD:', JSON.stringify(process.env.ORLOK_SSH_PASSWORD));
console.log('COFFIN_SSH_USER:', JSON.stringify(process.env.COFFIN_SSH_USER));
console.log('COFFIN_SSH_PASSWORD:', JSON.stringify(process.env.COFFIN_SSH_PASSWORD));
