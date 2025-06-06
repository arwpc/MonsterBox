/**
 * MonsterBox Server
 * Server startup and graceful shutdown handling
 */

import app from './app';
import { env } from '../config/environment';
import { Server } from 'http';

let server: Server;

/**
 * Start the server
 */
function startServer(): Promise<Server> {
  return new Promise((resolve, reject) => {
    try {
      server = app.listen(env.PORT, () => {
        console.log(`🎃 MonsterBox server started successfully!`);
        console.log(`📍 Environment: ${env.NODE_ENV}`);
        console.log(`🌐 Server running on port ${env.PORT}`);
        console.log(`🔗 Health check: http://localhost:${env.PORT}/health`);
        console.log(`📡 API base: http://localhost:${env.PORT}/api`);
        console.log(`⏰ Started at: ${new Date().toISOString()}`);
        
        resolve(server);
      });

      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${env.PORT} is already in use`);
        } else {
          console.error('❌ Server error:', error);
        }
        reject(error);
      });

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      reject(error);
    }
  });
}

/**
 * Graceful shutdown
 */
function gracefulShutdown(signal: string): void {
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
  } else {
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

export { startServer, gracefulShutdown };
export default app;
