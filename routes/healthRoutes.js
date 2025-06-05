const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');

/**
 * Health Check Routes for MonsterBox
 * 
 * These routes provide health status for API keys and services
 * without exposing sensitive information.
 */

// Basic health check
router.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'MonsterBox',
        version: require('../package.json').version
    });
});

// API Keys configuration status (no sensitive data)
router.get('/api-keys', (req, res) => {
    try {
        const apiKeyStatus = {
            anthropic: !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your_'),
            openai: !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('your_'),
            google: !!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.includes('your_'),
            replica: !!process.env.REPLICA_API_KEY && !process.env.REPLICA_API_KEY.includes('your_'),
            perplexity: !!process.env.PERPLEXITY_API_KEY && !process.env.PERPLEXITY_API_KEY.includes('your_'),
            mistral: !!process.env.MISTRAL_API_KEY && !process.env.MISTRAL_API_KEY.includes('your_'),
            xai: !!process.env.XAI_API_KEY && !process.env.XAI_API_KEY.includes('your_'),
            azure: !!process.env.AZURE_OPENAI_API_KEY && !process.env.AZURE_OPENAI_API_KEY.includes('your_'),
            ollama: !!process.env.OLLAMA_API_KEY && !process.env.OLLAMA_API_KEY.includes('your_')
        };

        const configuredCount = Object.values(apiKeyStatus).filter(Boolean).length;
        const totalCount = Object.keys(apiKeyStatus).length;

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            apiKeys: apiKeyStatus,
            summary: {
                configured: configuredCount,
                total: totalCount,
                percentage: Math.round((configuredCount / totalCount) * 100)
            }
        });

        logger.info('Health check: API keys status requested', { 
            configured: configuredCount, 
            total: totalCount 
        });

    } catch (error) {
        logger.error('Health check: API keys status failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Failed to check API key status'
        });
    }
});

// Environment variables status
router.get('/environment', (req, res) => {
    try {
        const envStatus = {
            nodeEnv: process.env.NODE_ENV || 'not-set',
            port: process.env.PORT || 'not-set',
            sessionSecret: !!process.env.SESSION_SECRET && !process.env.SESSION_SECRET.includes('your_'),
            hasEnvFile: require('fs').existsSync('.env')
        };

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: envStatus
        });

        logger.info('Health check: Environment status requested');

    } catch (error) {
        logger.error('Health check: Environment status failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Failed to check environment status'
        });
    }
});

// Quick API connectivity test (lightweight)
router.get('/connectivity', async (req, res) => {
    try {
        const results = {
            timestamp: new Date().toISOString(),
            tests: {}
        };

        // Test Replica API (most important for MonsterBox)
        if (process.env.REPLICA_API_KEY && !process.env.REPLICA_API_KEY.includes('your_')) {
            try {
                const ReplicaAPI = require('../scripts/replicaAPI');
                const replicaAPI = new ReplicaAPI();
                // Just test if we can create the instance (validates API key format)
                results.tests.replica = { status: 'configured', message: 'API instance created successfully' };
            } catch (error) {
                results.tests.replica = { status: 'error', message: 'Failed to create API instance' };
            }
        } else {
            results.tests.replica = { status: 'not-configured', message: 'API key not set' };
        }

        // Count successful configurations
        const configured = Object.values(results.tests).filter(test => test.status === 'configured').length;
        const total = Object.keys(results.tests).length;

        results.summary = {
            configured,
            total,
            status: configured > 0 ? 'partial' : 'none'
        };

        res.json(results);

        logger.info('Health check: Connectivity test completed', { 
            configured, 
            total 
        });

    } catch (error) {
        logger.error('Health check: Connectivity test failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Failed to test connectivity'
        });
    }
});

// Full system status
router.get('/status', (req, res) => {
    try {
        const status = {
            timestamp: new Date().toISOString(),
            service: 'MonsterBox',
            version: require('../package.json').version,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: {
                nodeVersion: process.version,
                platform: process.platform,
                nodeEnv: process.env.NODE_ENV
            },
            apiKeys: {
                configured: Object.entries({
                    anthropic: process.env.ANTHROPIC_API_KEY,
                    openai: process.env.OPENAI_API_KEY,
                    google: process.env.GOOGLE_API_KEY,
                    replica: process.env.REPLICA_API_KEY
                }).filter(([key, value]) => value && !value.includes('your_')).length
            }
        };

        res.json(status);

        logger.info('Health check: Full status requested');

    } catch (error) {
        logger.error('Health check: Full status failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: 'Failed to get system status'
        });
    }
});

module.exports = router;
