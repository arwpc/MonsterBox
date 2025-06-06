"use strict";
/**
 * Environment Configuration for MonsterBox
 * Type-safe environment variable handling with validation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasGitHubToken = exports.hasPerplexityKey = exports.hasGoogleKey = exports.hasOpenAIKey = exports.hasAnthropicKey = exports.isTest = exports.isProduction = exports.isDevelopment = exports.env = void 0;
exports.getSSHCredentials = getSSHCredentials;
exports.ensureDirectories = ensureDirectories;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
/**
 * Validate and parse environment variables
 */
function validateEnvironment() {
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
        NODE_ENV: nodeEnv,
        PORT: port,
        SESSION_SECRET: process.env.SESSION_SECRET,
        // API Keys
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        // SSH Credentials
        RPI_SSH_USER: process.env.RPI_SSH_USER,
        RPI_SSH_PASSWORD: process.env.RPI_SSH_PASSWORD,
        ORLOK_SSH_USER: process.env.ORLOK_SSH_USER,
        ORLOK_SSH_PASSWORD: process.env.ORLOK_SSH_PASSWORD,
        COFFIN_SSH_USER: process.env.COFFIN_SSH_USER,
        COFFIN_SSH_PASSWORD: process.env.COFFIN_SSH_PASSWORD,
        PUMPKINHEAD_SSH_USER: process.env.PUMPKINHEAD_SSH_USER,
        PUMPKINHEAD_SSH_PASSWORD: process.env.PUMPKINHEAD_SSH_PASSWORD,
        // Paths
        DATA_DIR: process.env.DATA_DIR || path_1.default.join(process.cwd(), 'data'),
        LOG_DIR: process.env.LOG_DIR || path_1.default.join(process.cwd(), 'logs'),
        CONFIG_DIR: process.env.CONFIG_DIR || path_1.default.join(process.cwd(), 'config')
    };
}
// Export validated configuration
exports.env = validateEnvironment();
// Export individual environment checkers
exports.isDevelopment = exports.env.NODE_ENV === 'development';
exports.isProduction = exports.env.NODE_ENV === 'production';
exports.isTest = exports.env.NODE_ENV === 'test';
// Export API key availability checkers
exports.hasAnthropicKey = !!exports.env.ANTHROPIC_API_KEY;
exports.hasOpenAIKey = !!exports.env.OPENAI_API_KEY;
exports.hasGoogleKey = !!exports.env.GOOGLE_API_KEY;
exports.hasPerplexityKey = !!exports.env.PERPLEXITY_API_KEY;
exports.hasGitHubToken = !!exports.env.GITHUB_TOKEN;
/**
 * Get SSH credentials for a specific animatronic system
 */
function getSSHCredentials(animatronicId) {
    const userEnvVar = `${animatronicId.toUpperCase()}_SSH_USER`;
    const passwordEnvVar = `${animatronicId.toUpperCase()}_SSH_PASSWORD`;
    const username = process.env[userEnvVar] || exports.env.RPI_SSH_USER;
    const password = process.env[passwordEnvVar] || exports.env.RPI_SSH_PASSWORD;
    return { username, password };
}
/**
 * Ensure required directories exist
 */
function ensureDirectories() {
    const fs = require('fs');
    [exports.env.DATA_DIR, exports.env.LOG_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}
exports.default = exports.env;
//# sourceMappingURL=environment.js.map