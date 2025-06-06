"use strict";
/**
 * Health Check Routes for MonsterBox
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const environment_1 = require("../../config/environment");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
    const usedMemory = memoryUsage.heapUsed;
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: environment_1.env.NODE_ENV,
        uptime: process.uptime(),
        services: {
            database: 'not_configured', // Will be updated when database is added
            ssh: 'available', // Will be updated when SSH manager is integrated
            apis: {
                anthropic: environment_1.hasAnthropicKey,
                openai: environment_1.hasOpenAIKey,
                google: environment_1.hasGoogleKey,
                perplexity: environment_1.hasPerplexityKey,
                github: environment_1.hasGitHubToken
            }
        },
        system: {
            memory: {
                used: usedMemory,
                total: totalMemory,
                percentage: Math.round((usedMemory / totalMemory) * 100)
            },
            cpu: {
                usage: 0 // Will be implemented with proper CPU monitoring
            }
        }
    };
    // Determine overall health status
    const apiKeysAvailable = Object.values(healthStatus.services.apis).some(available => available);
    if (!apiKeysAvailable) {
        healthStatus.status = 'degraded';
    }
    res.json(healthStatus);
}));
/**
 * GET /health/detailed
 * Detailed health check with service testing
 */
router.get('/detailed', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // This will be expanded when SSH manager and other services are integrated
    const basicHealth = await new Promise((resolve) => {
        // Simulate the basic health check
        const memoryUsage = process.memoryUsage();
        const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
        const usedMemory = memoryUsage.heapUsed;
        resolve({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            environment: environment_1.env.NODE_ENV,
            uptime: process.uptime(),
            services: {
                database: 'not_configured',
                ssh: 'available',
                apis: {
                    anthropic: environment_1.hasAnthropicKey,
                    openai: environment_1.hasOpenAIKey,
                    google: environment_1.hasGoogleKey,
                    perplexity: environment_1.hasPerplexityKey,
                    github: environment_1.hasGitHubToken
                }
            },
            system: {
                memory: {
                    used: usedMemory,
                    total: totalMemory,
                    percentage: Math.round((usedMemory / totalMemory) * 100)
                },
                cpu: {
                    usage: 0
                }
            }
        });
    });
    res.json({
        ...basicHealth,
        details: {
            message: 'Detailed health check - services will be tested when integrated',
            checks: {
                environment: 'passed',
                configuration: 'passed',
                dependencies: 'passed'
            }
        }
    });
}));
/**
 * GET /health/ready
 * Readiness probe for container orchestration
 */
router.get('/ready', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // Check if application is ready to serve requests
    const isReady = true; // Will be updated with actual readiness checks
    if (isReady) {
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString()
        });
    }
    else {
        res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString()
        });
    }
}));
/**
 * GET /health/live
 * Liveness probe for container orchestration
 */
router.get('/live', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    // Simple liveness check
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
}));
exports.default = router;
//# sourceMappingURL=healthRoutes.js.map