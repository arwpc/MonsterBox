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

export class SSHConnectionManager extends EventEmitter {
  private connections: Map<string, NodeSSH> = new Map();
  private connectionStatus: Map<string, ConnectionStatus> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  
  private readonly maxRetries = 5;
  private readonly baseRetryDelay = 1000; // 1 second
  private readonly maxRetryDelay = 30000; // 30 seconds
  private readonly healthCheckIntervalMs = 60000; // 1 minute

  // Animatronic system configurations
  private readonly animatronics: AnimatronicSystem[] = [
    {
      id: 'orlok',
      name: 'Orlok',
      host: '192.168.8.120',
      description: 'Vampire animatronic with moving arms and glowing eyes',
      enabled: true
    },
    {
      id: 'coffin',
      name: 'Coffin Breaker',
      host: '192.168.8.140',
      description: 'Coffin-based animatronic system',
      enabled: true
    },
    {
      id: 'pumpkinhead',
      name: 'Pumpkinhead',
      host: '192.168.1.101',
      description: 'Pumpkinhead animatronic (currently offline)',
      enabled: false
    }
  ];

  constructor() {
    super();
    this.initializeConnectionStatus();
    this.startHealthChecking();
  }

  /**
   * Initialize connection status for all animatronic systems
   */
  private initializeConnectionStatus(): void {
    this.animatronics.forEach(animatronic => {
      this.connectionStatus.set(animatronic.id, {
        id: animatronic.id,
        connected: false,
        retryCount: 0,
        health: 'unhealthy'
      });
    });
  }

  /**
   * Get SSH configuration for a specific animatronic system
   */
  private getSSHConfig(animatronicId: string): SSHConfig {
    const animatronic = this.animatronics.find(a => a.id === animatronicId);
    if (!animatronic) {
      throw new Error(`Unknown animatronic system: ${animatronicId}`);
    }

    // Get credentials from environment variables
    const userEnvVar = `${animatronicId.toUpperCase()}_SSH_USER`;
    const passwordEnvVar = `${animatronicId.toUpperCase()}_SSH_PASSWORD`;
    
    const username = process.env[userEnvVar] || process.env.RPI_SSH_USER || 'remote';
    const password = process.env[passwordEnvVar] || process.env.RPI_SSH_PASSWORD;

    if (!password) {
      throw new Error(`SSH password not found for ${animatronicId}. Set ${passwordEnvVar} or RPI_SSH_PASSWORD`);
    }

    return {
      host: animatronic.host,
      username,
      password,
      port: 22,
      readyTimeout: 10000,
      keepaliveInterval: 60000,
      keepaliveCountMax: 3
    };
  }

  /**
   * Connect to a specific animatronic system
   */
  async connect(animatronicId: string): Promise<NodeSSH> {
    const animatronic = this.animatronics.find(a => a.id === animatronicId);
    if (!animatronic) {
      throw new Error(`Unknown animatronic system: ${animatronicId}`);
    }

    if (!animatronic.enabled) {
      throw new Error(`Animatronic system ${animatronicId} is disabled`);
    }

    // Return existing connection if available and connected
    const existingConnection = this.connections.get(animatronicId);
    if (existingConnection && existingConnection.isConnected()) {
      return existingConnection;
    }

    const config = this.getSSHConfig(animatronicId);
    const ssh = new NodeSSH();

    try {
      await ssh.connect(config);
      
      // Store successful connection
      this.connections.set(animatronicId, ssh);
      this.updateConnectionStatus(animatronicId, {
        connected: true,
        lastConnected: new Date(),
        lastError: undefined,
        retryCount: 0,
        health: 'healthy'
      });

      this.emit('connected', animatronicId);
      return ssh;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateConnectionStatus(animatronicId, {
        connected: false,
        lastError: errorMessage,
        health: 'unhealthy'
      });

      this.emit('connectionError', animatronicId, error);
      throw error;
    }
  }

  /**
   * Execute a command on a specific animatronic system
   */
  async executeCommand(animatronicId: string, command: string): Promise<string> {
    const ssh = await this.connect(animatronicId);
    
    try {
      const result = await ssh.execCommand(command);
      
      if (result.code !== 0) {
        throw new Error(`Command failed with code ${result.code}: ${result.stderr}`);
      }
      
      return result.stdout;
    } catch (error) {
      this.emit('commandError', animatronicId, command, error);
      throw error;
    }
  }

  /**
   * Execute a command with retry logic and exponential backoff
   */
  async executeCommandWithRetry(
    animatronicId: string, 
    command: string, 
    maxRetries: number = this.maxRetries
  ): Promise<string> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeCommand(animatronicId, command);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          break;
        }

        // Calculate exponential backoff delay
        const delay = Math.min(
          this.baseRetryDelay * Math.pow(2, attempt),
          this.maxRetryDelay
        );
        
        this.emit('retrying', animatronicId, command, attempt + 1, delay);
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Get connection status for all systems
   */
  getConnectionStatus(): ConnectionStatus[] {
    return Array.from(this.connectionStatus.values());
  }

  /**
   * Get list of available animatronic systems
   */
  getAnimatronics(): AnimatronicSystem[] {
    return [...this.animatronics];
  }

  /**
   * Check health of all enabled systems
   */
  async checkHealth(): Promise<Map<string, boolean>> {
    const healthResults = new Map<string, boolean>();
    
    const enabledSystems = this.animatronics.filter(a => a.enabled);
    
    for (const system of enabledSystems) {
      try {
        await this.executeCommand(system.id, 'echo "health_check"');
        healthResults.set(system.id, true);
        
        this.updateConnectionStatus(system.id, {
          health: 'healthy'
        });
      } catch (error) {
        healthResults.set(system.id, false);
        
        this.updateConnectionStatus(system.id, {
          health: 'unhealthy',
          lastError: error instanceof Error ? error.message : 'Health check failed'
        });
      }
    }
    
    return healthResults;
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
        this.emit('healthCheck');
      } catch (error) {
        this.emit('healthCheckError', error);
      }
    }, this.healthCheckIntervalMs);
  }

  /**
   * Update connection status for a system
   */
  private updateConnectionStatus(
    animatronicId: string, 
    updates: Partial<ConnectionStatus>
  ): void {
    const current = this.connectionStatus.get(animatronicId);
    if (current) {
      this.connectionStatus.set(animatronicId, { ...current, ...updates });
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from all systems
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(id => 
      this.disconnect(id)
    );
    
    await Promise.all(disconnectPromises);
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Disconnect from a specific animatronic system
   */
  async disconnect(animatronicId: string): Promise<void> {
    const ssh = this.connections.get(animatronicId);
    if (ssh) {
      ssh.dispose();
      this.connections.delete(animatronicId);
      
      this.updateConnectionStatus(animatronicId, {
        connected: false,
        health: 'unhealthy'
      });
      
      this.emit('disconnected', animatronicId);
    }
  }
}

// Export singleton instance
export const sshManager = new SSHConnectionManager();
export default sshManager;
