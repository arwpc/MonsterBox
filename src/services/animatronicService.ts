/**
 * Animatronic Service - High-level interface for animatronic operations
 */

import { sshManager, SSHConnectionManager, AnimatronicSystem, ConnectionStatus } from './sshConnectionManager';
import { EventEmitter } from 'events';

export interface AnimatronicCommand {
  id: string;
  animatronicId: string;
  command: string;
  timestamp: Date;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  executionTime?: number;
}

export interface AnimatronicStatus {
  id: string;
  name: string;
  online: boolean;
  lastSeen?: Date;
  currentScene?: string;
  health: 'healthy' | 'degraded' | 'unhealthy';
  systemInfo?: {
    uptime: string;
    temperature: string;
    memoryUsage: string;
    diskUsage: string;
  };
}

export class AnimatronicService extends EventEmitter {
  private commandHistory: Map<string, AnimatronicCommand> = new Map();
  private commandCounter = 0;

  constructor(private sshManager: SSHConnectionManager = sshManager) {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.sshManager.on('connected', (animatronicId: string) => {
      this.emit('animatronicConnected', animatronicId);
    });

    this.sshManager.on('disconnected', (animatronicId: string) => {
      this.emit('animatronicDisconnected', animatronicId);
    });

    this.sshManager.on('connectionError', (animatronicId: string, error: Error) => {
      this.emit('animatronicError', animatronicId, error);
    });
  }

  async getAnimatronics(): Promise<AnimatronicSystem[]> {
    return this.sshManager.getAnimatronics();
  }

  async getAnimatronicStatuses(): Promise<AnimatronicStatus[]> {
    const animatronics = this.sshManager.getAnimatronics();
    const connectionStatuses = this.sshManager.getConnectionStatus();
    
    const statuses: AnimatronicStatus[] = [];

    for (const animatronic of animatronics) {
      const connectionStatus = connectionStatuses.find(cs => cs.id === animatronic.id);
      
      let systemInfo;
      if (connectionStatus?.connected && animatronic.enabled) {
        try {
          systemInfo = await this.getSystemInfo(animatronic.id);
        } catch (error) {
          // System info collection failed, but don't throw error
        }
      }

      statuses.push({
        id: animatronic.id,
        name: animatronic.name,
        online: connectionStatus?.connected || false,
        lastSeen: connectionStatus?.lastConnected,
        health: connectionStatus?.health || 'unhealthy',
        systemInfo
      });
    }

    return statuses;
  }

  async executeCommand(animatronicId: string, command: string): Promise<AnimatronicCommand> {
    const commandId = `cmd_${++this.commandCounter}_${Date.now()}`;
    const startTime = Date.now();

    const animatronicCommand: AnimatronicCommand = {
      id: commandId,
      animatronicId,
      command,
      timestamp: new Date(),
      status: 'pending'
    };

    this.commandHistory.set(commandId, animatronicCommand);
    this.emit('commandStarted', animatronicCommand);

    try {
      animatronicCommand.status = 'executing';
      this.commandHistory.set(commandId, animatronicCommand);

      const result = await this.sshManager.executeCommandWithRetry(animatronicId, command);
      
      animatronicCommand.status = 'completed';
      animatronicCommand.result = result;
      animatronicCommand.executionTime = Date.now() - startTime;
      
      this.commandHistory.set(commandId, animatronicCommand);
      this.emit('commandCompleted', animatronicCommand);

      return animatronicCommand;

    } catch (error) {
      animatronicCommand.status = 'failed';
      animatronicCommand.error = error instanceof Error ? error.message : 'Unknown error';
      animatronicCommand.executionTime = Date.now() - startTime;
      
      this.commandHistory.set(commandId, animatronicCommand);
      this.emit('commandFailed', animatronicCommand);

      throw error;
    }
  }

  async getSystemInfo(animatronicId: string): Promise<any> {
    const commands = {
      uptime: 'uptime -p',
      temperature: 'vcgencmd measure_temp 2>/dev/null || echo "temp=N/A"',
      memoryUsage: 'free -h | grep Mem | awk \'{print $3 "/" $2}\'',
      diskUsage: 'df -h / | tail -1 | awk \'{print $3 "/" $2 " (" $5 " used)"}\''
    };

    const systemInfo: any = {};

    for (const [key, command] of Object.entries(commands)) {
      try {
        const result = await this.sshManager.executeCommand(animatronicId, command);
        systemInfo[key] = result.trim();
      } catch (error) {
        systemInfo[key] = 'N/A';
      }
    }

    return systemInfo;
  }

  async testConnectivity(): Promise<Map<string, boolean>> {
    return await this.sshManager.checkHealth();
  }

  getCommandHistory(limit: number = 100): AnimatronicCommand[] {
    const commands = Array.from(this.commandHistory.values());
    return commands
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async cleanup(): Promise<void> {
    await this.sshManager.disconnectAll();
    this.commandHistory.clear();
  }
}

export const animatronicService = new AnimatronicService();
export default animatronicService;
