/**
 * Error Handling Middleware for MonsterBox
 */

import { Request, Response, NextFunction } from 'express';
import { env, isDevelopment } from '../../config/environment';

export interface MonsterBoxError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: MonsterBoxError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Determine status code
  const statusCode = error.statusCode || 500;

  // Prepare error response
  const errorResponse: any = {
    success: false,
    error: {
      message: error.message || 'Internal Server Error',
      code: error.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  };

  // Add details in development mode
  if (isDevelopment) {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = error.details;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error
 */
export function createError(
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: any
): MonsterBoxError {
  const error = new Error(message) as MonsterBoxError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}
