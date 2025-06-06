/**
 * Request Logging Middleware for MonsterBox
 */

import { Request, Response, NextFunction } from 'express';
import { isDevelopment } from '../../config/environment';

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
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Store original end function
  const originalEnd = res.end;
  
  // Override end function to capture response details
  res.end = function(chunk?: any, encoding?: any): Response {
    const responseTime = Date.now() - startTime;
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      contentLength: res.get('Content-Length') ? parseInt(res.get('Content-Length')!) : undefined
    };
    
    // Log based on environment
    if (isDevelopment) {
      console.log(`${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} - ${logEntry.responseTime}ms`);
    } else {
      console.log(JSON.stringify(logEntry));
    }
    
    // Call original end function
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
}

/**
 * Health check request filter (skip logging for health checks)
 */
export function skipHealthCheck(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }
  
  requestLogger(req, res, next);
}
