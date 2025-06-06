/**
 * Jest Test Setup for MonsterBox
 */

import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Use test port
process.env.SESSION_SECRET = 'test-session-secret';
process.env.RPI_SSH_USER = 'test-user';
process.env.RPI_SSH_PASSWORD = 'test-password';

// Mock console methods in test environment
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Global test timeout
jest.setTimeout(10000);
