/**
 * MonsterBox Server
 * Server startup and graceful shutdown handling
 */
import app from './app';
import { Server } from 'http';
/**
 * Start the server
 */
declare function startServer(): Promise<Server>;
/**
 * Graceful shutdown
 */
declare function gracefulShutdown(signal: string): void;
export { startServer, gracefulShutdown };
export default app;
//# sourceMappingURL=server.d.ts.map