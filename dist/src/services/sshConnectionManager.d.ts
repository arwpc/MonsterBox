/**
 * SSH Connection Manager for MonsterBox Animatronic Systems
 * Manages secure connections to Raspberry Pi systems with connection pooling,
 * retry logic, and health monitoring.
 */
import { NodeSSH } from 'node-ssh';
import { EventEmitter } from 'events';
export interface SSHConfig {
    host: string;
    username: string;
    password: string;
    port?: number;
    readyTimeout?: number;
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
}
export interface AnimatronicSystem {
    id: string;
    name: string;
    host: string;
    description: string;
    enabled: boolean;
}
export interface ConnectionStatus {
    id: string;
    connected: boolean;
    lastConnected?: Date;
    lastError?: string;
    retryCount: number;
    health: 'healthy' | 'degraded' | 'unhealthy';
}
export declare class SSHConnectionManager extends EventEmitter {
    private connections;
    private connectionStatus;
    private retryTimeouts;
    private healthCheckInterval?;
    private readonly maxRetries;
    private readonly baseRetryDelay;
    private readonly maxRetryDelay;
    private readonly healthCheckIntervalMs;
    private readonly animatronics;
    constructor();
    /**
     * Initialize connection status for all animatronic systems
     */
    private initializeConnectionStatus;
    /**
     * Get SSH configuration for a specific animatronic system
     */
    private getSSHConfig;
    /**
     * Connect to a specific animatronic system
     */
    connect(animatronicId: string): Promise<NodeSSH>;
    /**
     * Execute a command on a specific animatronic system
     */
    executeCommand(animatronicId: string, command: string): Promise<string>;
    /**
     * Execute a command with retry logic and exponential backoff
     */
    executeCommandWithRetry(animatronicId: string, command: string, maxRetries?: number): Promise<string>;
    /**
     * Get connection status for all systems
     */
    getConnectionStatus(): ConnectionStatus[];
    /**
     * Get list of available animatronic systems
     */
    getAnimatronics(): AnimatronicSystem[];
    /**
     * Check health of all enabled systems
     */
    checkHealth(): Promise<Map<string, boolean>>;
    /**
     * Start periodic health checking
     */
    private startHealthChecking;
    /**
     * Update connection status for a system
     */
    private updateConnectionStatus;
    /**
     * Sleep utility for retry delays
     */
    private sleep;
    /**
     * Disconnect from all systems
     */
    disconnectAll(): Promise<void>;
    /**
     * Disconnect from a specific animatronic system
     */
    disconnect(animatronicId: string): Promise<void>;
}
export declare const sshManager: SSHConnectionManager;
export default sshManager;
//# sourceMappingURL=sshConnectionManager.d.ts.map