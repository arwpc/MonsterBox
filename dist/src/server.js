"use strict";
/**
 * MonsterBox Server
 * Server startup and graceful shutdown handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.gracefulShutdown = gracefulShutdown;
const app_1 = __importDefault(require("./app"));
const environment_1 = require("../config/environment");
let server;
/**
 * Start the server
 */
function startServer() {
    return new Promise((resolve, reject) => {
        try {
            server = app_1.default.listen(environment_1.env.PORT, () => {
                console.log(`🎃 MonsterBox server started successfully!`);
                console.log(`📍 Environment: ${environment_1.env.NODE_ENV}`);
                console.log(`🌐 Server running on port ${environment_1.env.PORT}`);
                console.log(`🔗 Health check: http://localhost:${environment_1.env.PORT}/health`);
                console.log(`📡 API base: http://localhost:${environment_1.env.PORT}/api`);
                console.log(`⏰ Started at: ${new Date().toISOString()}`);
                resolve(server);
            });
            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.error(`❌ Port ${environment_1.env.PORT} is already in use`);
                }
                else {
                    console.error('❌ Server error:', error);
                }
                reject(error);
            });
        }
        catch (error) {
            console.error('❌ Failed to start server:', error);
            reject(error);
        }
    });
}
/**
 * Graceful shutdown
 */
function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    if (server) {
        server.close((error) => {
            if (error) {
                console.error('❌ Error during server shutdown:', error);
                process.exit(1);
            }
            console.log('✅ Server closed successfully');
            console.log('👋 MonsterBox shutdown complete');
            process.exit(0);
        });
        // Force shutdown after 10 seconds
        setTimeout(() => {
            console.error('⚠️ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    }
    else {
        process.exit(0);
    }
}
// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});
// Start server if this file is run directly
if (require.main === module) {
    startServer().catch((error) => {
        console.error('💥 Failed to start MonsterBox server:', error);
        process.exit(1);
    });
}
exports.default = app_1.default;
//# sourceMappingURL=server.js.map