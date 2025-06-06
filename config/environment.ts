/**
 * Environment Configuration for MonsterBox
 * Type-safe environment variable handling with validation
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export interface EnvironmentConfig {
  // Application
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  SESSION_SECRET: string;
  
  // API Keys
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  GITHUB_TOKEN?: string;
  
  // SSH Credentials
  RPI_SSH_USER: string;
  RPI_SSH_PASSWORD: string;
  ORLOK_SSH_USER?: string;
  ORLOK_SSH_PASSWORD?: string;
  COFFIN_SSH_USER?: string;
  COFFIN_SSH_PASSWORD?: string;
  PUMPKINHEAD_SSH_USER?: string;
  PUMPKINHEAD_SSH_PASSWORD?: string;
  
  // Paths
  DATA_DIR: string;
  LOG_DIR: string;
  CONFIG_DIR: string;
}

/**
 * Validate and parse environment variables
 */
function validateEnvironment(): EnvironmentConfig {
  const requiredVars = [
    'SESSION_SECRET',
    'RPI_SSH_USER',
    'RPI_SSH_PASSWORD'
  ];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Required environment variable ${varName} is not set`);
    }
  }

  // Parse and validate PORT
  const port = parseInt(process.env.PORT || '3000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid number between 1 and 65535');
  }

  // Validate NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test');
  }

  return {
    // Application
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    PORT: port,
    SESSION_SECRET: process.env.SESSION_SECRET!,
    
    // API Keys
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    
    // SSH Credentials
    RPI_SSH_USER: process.env.RPI_SSH_USER!,
    RPI_SSH_PASSWORD: process.env.RPI_SSH_PASSWORD!,
    ORLOK_SSH_USER: process.env.ORLOK_SSH_USER,
    ORLOK_SSH_PASSWORD: process.env.ORLOK_SSH_PASSWORD,
    COFFIN_SSH_USER: process.env.COFFIN_SSH_USER,
    COFFIN_SSH_PASSWORD: process.env.COFFIN_SSH_PASSWORD,
    PUMPKINHEAD_SSH_USER: process.env.PUMPKINHEAD_SSH_USER,
    PUMPKINHEAD_SSH_PASSWORD: process.env.PUMPKINHEAD_SSH_PASSWORD,
    
    // Paths
    DATA_DIR: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
    LOG_DIR: process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
    CONFIG_DIR: process.env.CONFIG_DIR || path.join(process.cwd(), 'config')
  };
}

// Export validated configuration
export const env = validateEnvironment();

// Export individual environment checkers
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Export API key availability checkers
export const hasAnthropicKey = !!env.ANTHROPIC_API_KEY;
export const hasOpenAIKey = !!env.OPENAI_API_KEY;
export const hasGoogleKey = !!env.GOOGLE_API_KEY;
export const hasPerplexityKey = !!env.PERPLEXITY_API_KEY;
export const hasGitHubToken = !!env.GITHUB_TOKEN;

/**
 * Get SSH credentials for a specific animatronic system
 */
export function getSSHCredentials(animatronicId: string): { username: string; password: string } {
  const userEnvVar = `${animatronicId.toUpperCase()}_SSH_USER`;
  const passwordEnvVar = `${animatronicId.toUpperCase()}_SSH_PASSWORD`;
  
  const username = process.env[userEnvVar] || env.RPI_SSH_USER;
  const password = process.env[passwordEnvVar] || env.RPI_SSH_PASSWORD;
  
  return { username, password };
}

/**
 * Ensure required directories exist
 */
export function ensureDirectories(): void {
  const fs = require('fs');
  
  [env.DATA_DIR, env.LOG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export default env;
