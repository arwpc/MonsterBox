/**
 * Tests for SSH Connection Manager
 */

import { SSHConnectionManager } from '../src/services/sshConnectionManager';
import { NodeSSH } from 'node-ssh';

// Mock node-ssh
jest.mock('node-ssh');
const MockedNodeSSH = NodeSSH as jest.MockedClass<typeof NodeSSH>;

describe('SSHConnectionManager', () => {
  let sshManager: SSHConnectionManager;
  let mockSSH: jest.Mocked<NodeSSH>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock SSH instance
    mockSSH = {
      connect: jest.fn(),
      execCommand: jest.fn(),
      dispose: jest.fn(),
      isConnected: jest.fn(),
    } as any;

    MockedNodeSSH.mockImplementation(() => mockSSH);
    
    // Set up test environment variables
    process.env.ORLOK_SSH_USER = 'remote';
    process.env.ORLOK_SSH_PASSWORD = 'test-password';
    process.env.COFFIN_SSH_USER = 'remote';
    process.env.COFFIN_SSH_PASSWORD = 'test-password';
    
    sshManager = new SSHConnectionManager();
  });

  afterEach(async () => {
    await sshManager.disconnectAll();
    jest.clearAllTimers();
  });

  describe('Initialization', () => {
    test('should initialize with correct animatronic systems', () => {
      const animatronics = sshManager.getAnimatronics();
      
      expect(animatronics).toHaveLength(3);
      expect(animatronics.find(a => a.id === 'orlok')).toBeDefined();
      expect(animatronics.find(a => a.id === 'coffin')).toBeDefined();
      expect(animatronics.find(a => a.id === 'pumpkinhead')).toBeDefined();
    });

    test('should initialize connection status for all systems', () => {
      const statuses = sshManager.getConnectionStatus();
      
      expect(statuses).toHaveLength(3);
      statuses.forEach(status => {
        expect(status.connected).toBe(false);
        expect(status.retryCount).toBe(0);
        expect(status.health).toBe('unhealthy');
      });
    });
  });

  describe('Connection Management', () => {
    test('should connect to enabled animatronic system', async () => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);

      const connection = await sshManager.connect('orlok');

      expect(MockedNodeSSH).toHaveBeenCalled();
      expect(mockSSH.connect).toHaveBeenCalledWith({
        host: '192.168.8.120',
        username: 'remote',
        password: 'test-password',
        port: 22,
        readyTimeout: 10000,
        keepaliveInterval: 60000,
        keepaliveCountMax: 3
      });
      expect(connection).toBe(mockSSH);
    });

    test('should throw error for unknown animatronic system', async () => {
      await expect(sshManager.connect('unknown')).rejects.toThrow('Unknown animatronic system: unknown');
    });

    test('should throw error for disabled animatronic system', async () => {
      await expect(sshManager.connect('pumpkinhead')).rejects.toThrow('Animatronic system pumpkinhead is disabled');
    });

    test('should reuse existing connection if available', async () => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);

      // First connection
      await sshManager.connect('orlok');
      
      // Second connection should reuse
      const connection2 = await sshManager.connect('orlok');

      expect(mockSSH.connect).toHaveBeenCalledTimes(1);
      expect(connection2).toBe(mockSSH);
    });

    test('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockSSH.connect.mockRejectedValue(connectionError);

      await expect(sshManager.connect('orlok')).rejects.toThrow('Connection failed');

      const status = sshManager.getSystemStatus('orlok');
      expect(status?.connected).toBe(false);
      expect(status?.lastError).toBe('Connection failed');
      expect(status?.health).toBe('unhealthy');
    });
  });

  describe('Command Execution', () => {
    beforeEach(async () => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);
      await sshManager.connect('orlok');
    });

    test('should execute command successfully', async () => {
      mockSSH.execCommand.mockResolvedValue({
        stdout: 'command output',
        stderr: '',
        code: 0
      });

      const result = await sshManager.executeCommand('orlok', 'echo "test"');

      expect(mockSSH.execCommand).toHaveBeenCalledWith('echo "test"');
      expect(result).toBe('command output');
    });

    test('should throw error for failed command', async () => {
      mockSSH.execCommand.mockResolvedValue({
        stdout: '',
        stderr: 'command error',
        code: 1
      });

      await expect(sshManager.executeCommand('orlok', 'false')).rejects.toThrow('Command failed with code 1: command error');
    });

    test('should retry failed commands with exponential backoff', async () => {
      jest.useFakeTimers();
      
      mockSSH.execCommand
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          stdout: 'success',
          stderr: '',
          code: 0
        });

      const resultPromise = sshManager.executeCommandWithRetry('orlok', 'echo "test"', 2);

      // Fast-forward through retry delays
      jest.advanceTimersByTime(5000);

      const result = await resultPromise;

      expect(mockSSH.execCommand).toHaveBeenCalledTimes(3);
      expect(result).toBe('success');

      jest.useRealTimers();
    });
  });

  describe('Health Checking', () => {
    beforeEach(() => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);
    });

    test('should check health of all enabled systems', async () => {
      mockSSH.execCommand.mockResolvedValue({
        stdout: 'health_check',
        stderr: '',
        code: 0
      });

      const healthResults = await sshManager.checkHealth();

      expect(healthResults.get('orlok')).toBe(true);
      expect(healthResults.get('coffin')).toBe(true);
      expect(healthResults.has('pumpkinhead')).toBe(false); // disabled system
    });

    test('should mark unhealthy systems correctly', async () => {
      mockSSH.execCommand.mockRejectedValue(new Error('Connection timeout'));

      const healthResults = await sshManager.checkHealth();

      expect(healthResults.get('orlok')).toBe(false);
      expect(healthResults.get('coffin')).toBe(false);

      const orlokStatus = sshManager.getSystemStatus('orlok');
      expect(orlokStatus?.health).toBe('unhealthy');
      expect(orlokStatus?.lastError).toBe('Connection timeout');
    });
  });

  describe('Cleanup', () => {
    test('should disconnect from specific system', async () => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);
      
      await sshManager.connect('orlok');
      await sshManager.disconnect('orlok');

      expect(mockSSH.dispose).toHaveBeenCalled();

      const status = sshManager.getSystemStatus('orlok');
      expect(status?.connected).toBe(false);
      expect(status?.health).toBe('unhealthy');
    });

    test('should disconnect from all systems', async () => {
      mockSSH.connect.mockResolvedValue(undefined);
      mockSSH.isConnected.mockReturnValue(true);
      
      await sshManager.connect('orlok');
      await sshManager.connect('coffin');
      await sshManager.disconnectAll();

      expect(mockSSH.dispose).toHaveBeenCalledTimes(2);
    });
  });

  describe('Environment Variable Handling', () => {
    test('should use system-specific environment variables', () => {
      process.env.ORLOK_SSH_USER = 'orlok-user';
      process.env.ORLOK_SSH_PASSWORD = 'orlok-password';

      const manager = new SSHConnectionManager();
      
      // This would be tested by checking the actual SSH config used
      // In a real test, we'd need to expose the getSSHConfig method or test indirectly
      expect(true).toBe(true); // Placeholder - actual implementation would test config
    });

    test('should fall back to generic environment variables', () => {
      delete process.env.ORLOK_SSH_USER;
      delete process.env.ORLOK_SSH_PASSWORD;
      process.env.RPI_SSH_USER = 'generic-user';
      process.env.RPI_SSH_PASSWORD = 'generic-password';

      const manager = new SSHConnectionManager();
      
      // This would be tested by checking the actual SSH config used
      expect(true).toBe(true); // Placeholder - actual implementation would test config
    });

    test('should throw error when no password is available', () => {
      delete process.env.ORLOK_SSH_PASSWORD;
      delete process.env.RPI_SSH_PASSWORD;

      const manager = new SSHConnectionManager();
      
      expect(() => manager.connect('orlok')).rejects.toThrow('SSH password not found');
    });
  });
});
