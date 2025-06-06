"use strict";
/**
 * MonsterBox Express Application
 * Main application setup with middleware, routes, and error handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const environment_1 = require("../config/environment");
const errorHandler_1 = require("./middleware/errorHandler");
const requestLogger_1 = require("./middleware/requestLogger");
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
// Ensure required directories exist
(0, environment_1.ensureDirectories)();
// Create Express application
const app = (0, express_1.default)();
// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);
// View engine setup
app.set('view engine', 'ejs');
app.set('views', path_1.default.join(__dirname, '../views'));
// Security middleware
app.use((0, helmet_1.default)({
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
app.use((0, cors_1.default)({
    origin: environment_1.isDevelopment ? true : process.env.ALLOWED_ORIGINS?.split(',') || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// Compression middleware
app.use((0, compression_1.default)());
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logging (skip health checks in production)
if (environment_1.isDevelopment) {
    app.use(requestLogger_1.requestLogger);
}
else {
    app.use(requestLogger_1.skipHealthCheck);
}
// Static files
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// API Routes
app.use('/health', healthRoutes_1.default);
app.use('/api/health', healthRoutes_1.default);
// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'MonsterBox API',
        version: process.env.npm_package_version || '1.0.0',
        environment: environment_1.env.NODE_ENV,
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
        environment: environment_1.env.NODE_ENV,
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
app.use(errorHandler_1.notFoundHandler);
// Global error handler
app.use(errorHandler_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map