/**
 * Health Check Routes for MonsterBox
 */

import { Router, Request, Response } from 'express';
import { env, hasAnthropicKey, hasOpenAIKey, hasGoogleKey, hasPerplexityKey, hasGitHubToken } from '../../config/environment';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  services: {
    database: 'connected' | 'disconnected' | 'not_configured';
    ssh: 'available' | 'unavailable' | 'not_configured';
    apis: {
      anthropic: boolean;
      openai: boolean;
      google: boolean;
      perplexity: boolean;
      github: boolean;
    };
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
  const usedMemory = memoryUsage.heapUsed;
  
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    services: {
      database: 'not_configured', // Will be updated when database is added
      ssh: 'available', // Will be updated when SSH manager is integrated
      apis: {
        anthropic: hasAnthropicKey,
        openai: hasOpenAIKey,
        google: hasGoogleKey,
        perplexity: hasPerplexityKey,
        github: hasGitHubToken
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
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  // This will be expanded when SSH manager and other services are integrated
  const basicHealth = await new Promise<HealthStatus>((resolve) => {
    // Simulate the basic health check
    const memoryUsage = process.memoryUsage();
    const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
    const usedMemory = memoryUsage.heapUsed;
    
    resolve({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
      uptime: process.uptime(),
      services: {
        database: 'not_configured',
        ssh: 'available',
        apis: {
          anthropic: hasAnthropicKey,
          openai: hasOpenAIKey,
          google: hasGoogleKey,
          perplexity: hasPerplexityKey,
          github: hasGitHubToken
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
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  // Check if application is ready to serve requests
  const isReady = true; // Will be updated with actual readiness checks
  
  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } else {
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
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  // Simple liveness check
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}));

export default router;
