/**
 * Health Check Routes for MonsterBox
 */
declare const router: import("express-serve-static-core").Router;
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
export default router;
//# sourceMappingURL=healthRoutes.d.ts.map