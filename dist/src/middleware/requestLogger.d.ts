/**
 * Request Logging Middleware for MonsterBox
 */
import { Request, Response, NextFunction } from 'express';
export interface LogEntry {
    timestamp: string;
    method: string;
    url: string;
    statusCode: number;
    responseTime: number;
    userAgent?: string;
    ip: string;
    contentLength?: number;
}
/**
 * Request logging middleware
 */
export declare function requestLogger(req: Request, res: Response, next: NextFunction): void;
/**
 * Health check request filter (skip logging for health checks)
 */
export declare function skipHealthCheck(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=requestLogger.d.ts.map