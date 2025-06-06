/**
 * Animatronic Service - High-level interface for animatronic operations
 */
import { SSHConnectionManager, AnimatronicSystem } from './sshConnectionManager';
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
export declare class AnimatronicService extends EventEmitter {
    private sshManager;
    private commandHistory;
    private commandCounter;
    constructor(sshManager?: SSHConnectionManager);
    private setupEventListeners;
    getAnimatronics(): Promise<AnimatronicSystem[]>;
    getAnimatronicStatuses(): Promise<AnimatronicStatus[]>;
    executeCommand(animatronicId: string, command: string): Promise<AnimatronicCommand>;
    getSystemInfo(animatronicId: string): Promise<any>;
    testConnectivity(): Promise<Map<string, boolean>>;
    getCommandHistory(limit?: number): AnimatronicCommand[];
    cleanup(): Promise<void>;
}
export declare const animatronicService: AnimatronicService;
export default animatronicService;
//# sourceMappingURL=animatronicService.d.ts.map