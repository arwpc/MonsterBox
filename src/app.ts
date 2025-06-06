/**
 * MonsterBox Express Application
 * Main application setup with middleware, routes, and error handling
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { env, isDevelopment, ensureDirectories } from '../config/environment';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger, skipHealthCheck } from './middleware/requestLogger';
import healthRoutes from './routes/healthRoutes';

// Ensure required directories exist
ensureDirectories();

// Create Express application
const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: isDevelopment ? true : process.env.ALLOWED_ORIGINS?.split(',') || false,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging (skip health checks in production)
if (isDevelopment) {
  app.use(requestLogger);
} else {
  app.use(skipHealthCheck);
}

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/health', healthRoutes);
app.use('/api/health', healthRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'MonsterBox API',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

// API base route
app.get('/api', (req, res) => {
  res.json({
    name: 'MonsterBox API',
    version: process.env.npm_package_version || '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/api/health',
      animatronics: '/api/animatronics (coming soon)',
      scenes: '/api/scenes (coming soon)',
      characters: '/api/characters (coming soon)'
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
