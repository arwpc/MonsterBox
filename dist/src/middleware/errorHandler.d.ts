/**
 * Error Handling Middleware for MonsterBox
 */
import { Request, Response, NextFunction } from 'express';
export interface MonsterBoxError extends Error {
    statusCode?: number;
    code?: string;
    details?: any;
}
/**
 * Global error handler middleware
 */
export declare function errorHandler(error: MonsterBoxError, req: Request, res: Response, next: NextFunction): void;
/**
 * 404 Not Found handler
 */
export declare function notFoundHandler(req: Request, res: Response): void;
/**
 * Async error wrapper for route handlers
 */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Create custom error
 */
export declare function createError(message: string, statusCode?: number, code?: string, details?: any): MonsterBoxError;
//# sourceMappingURL=errorHandler.d.ts.map