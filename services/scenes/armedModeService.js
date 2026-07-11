/**
 * Armed/Active Mode Service
 * Automated scene execution system with configurable timing and error handling
 */

import sceneExecutor from './sceneExecutor.js';
import scenesService from './scenesService.js';

class ArmedModeService {
  constructor() {
    this.isArmed = false;
    this.currentSceneIndex = 0;
    this.loopCount = 0;
    this.consecutiveFailures = 0;
    this.playlist = [];
    this.characterId = null;
    this.executionInterval = null;
    
    // Configuration
    this.config = {
      sceneDelay: 5000, // 5 seconds between scenes
      maxRetries: 3,
      sceneTimeout: 60000, // 60 seconds
      maxConsecutiveFailures: 5
    };
    
    // Status tracking
    this.status = {
      currentScene: null,
      loopCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      startTime: null
    };
  }

  /**
   * Arm the system with a playlist of scenes
   */
  async arm(characterId, sceneIds, config = {}) {
    if (this.isArmed) {
      throw new Error('System is already armed');
    }

    if (!characterId) {
      throw new Error('Character ID is required');
    }

    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      throw new Error('At least one scene ID is required');
    }

    // Update configuration
    this.config = { ...this.config, ...config };
    this.characterId = characterId;
    this.playlist = sceneIds;
    this.currentSceneIndex = 0;
    this.loopCount = 0;
    this.consecutiveFailures = 0;
    this.isArmed = true;
    
    this.status = {
      currentScene: null,
      loopCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      startTime: new Date().toISOString()
    };

    console.log(`🔫 Armed Mode: System armed with ${sceneIds.length} scenes for character ${characterId}`);
    
    // Start execution loop
    this.startExecutionLoop();
    
    return this.getStatus();
  }

  /**
   * Disarm the system
   */
  async disarm() {
    if (!this.isArmed) {
      return { success: true, message: 'System was not armed' };
    }

    this.isArmed = false;
    
    if (this.executionInterval) {
      clearTimeout(this.executionInterval);
      this.executionInterval = null;
    }

    console.log(`🔫 Armed Mode: System disarmed after ${this.loopCount} loops`);
    
    const finalStatus = this.getStatus();
    
    // Reset state
    this.currentSceneIndex = 0;
    this.loopCount = 0;
    this.consecutiveFailures = 0;
    this.playlist = [];
    this.characterId = null;
    
    return { success: true, message: 'System disarmed', finalStatus };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isArmed: this.isArmed,
      characterId: this.characterId,
      playlist: this.playlist,
      currentSceneIndex: this.currentSceneIndex,
      currentScene: this.status.currentScene,
      loopCount: this.status.loopCount,
      consecutiveFailures: this.status.consecutiveFailures,
      lastError: this.status.lastError,
      startTime: this.status.startTime,
      config: this.config
    };
  }

  /**
   * Update playlist
   */
  async updatePlaylist(sceneIds) {
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) {
      throw new Error('At least one scene ID is required');
    }

    this.playlist = sceneIds;
    this.currentSceneIndex = 0;
    
    console.log(`🔫 Armed Mode: Playlist updated with ${sceneIds.length} scenes`);
    
    return { success: true, playlist: this.playlist };
  }

  /**
   * Update configuration
   */
  async updateConfig(config) {
    this.config = { ...this.config, ...config };
    console.log(`🔫 Armed Mode: Configuration updated`, this.config);
    return { success: true, config: this.config };
  }

  /**
   * Start the execution loop
   */
  startExecutionLoop() {
    if (!this.isArmed) {
      return;
    }

    // Execute next scene
    this.executeNextScene();
  }

  /**
   * Execute the next scene in the playlist
   */
  async executeNextScene() {
    if (!this.isArmed) {
      return;
    }

    // Check if we've exceeded max consecutive failures
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      console.error(`🔫 Armed Mode: Max consecutive failures (${this.config.maxConsecutiveFailures}) reached. Auto-disarming.`);
      await this.disarm();
      return;
    }

    // Get next scene
    const sceneId = this.playlist[this.currentSceneIndex];
    
    if (!sceneId) {
      console.error(`🔫 Armed Mode: No scene at index ${this.currentSceneIndex}`);
      this.currentSceneIndex = 0;
      this.loopCount++;
      this.status.loopCount = this.loopCount;
      
      // Schedule next loop
      this.executionInterval = setTimeout(() => this.executeNextScene(), this.config.sceneDelay);
      return;
    }

    try {
      // Load scene
      const scene = await scenesService.getSceneById(sceneId, this.characterId);
      
      if (!scene) {
        throw new Error(`Scene ${sceneId} not found`);
      }

      this.status.currentScene = {
        id: sceneId,
        name: scene.name,
        index: this.currentSceneIndex
      };

      console.log(`🔫 Armed Mode: Executing scene ${sceneId} (${scene.name}) - Loop ${this.loopCount}, Index ${this.currentSceneIndex}`);

      // Execute scene with a timeout. Node can't abort an in-flight executeScene,
      // so on timeout we do NOT just move on (that started the next scene while the
      // timed-out one was still driving hardware). Instead we wait for the scene to
      // actually settle before proceeding, and always clear the timer.
      let timeoutHandle = null;
      const scenePromise = sceneExecutor.executeScene(scene, this.characterId, null, { dryRun: false });
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Scene execution timeout')), this.config.sceneTimeout);
      });

      let result;
      try {
        result = await Promise.race([scenePromise, timeoutPromise]);
      } catch (raceErr) {
        // Timeout (or scene rejection): let the running scene finish before the
        // next one starts so their hardware operations never overlap.
        await scenePromise.catch(() => {});
        throw raceErr;
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      if (result.success) {
        console.log(`🔫 Armed Mode: Scene ${sceneId} completed successfully`);
        this.consecutiveFailures = 0;
        this.status.consecutiveFailures = 0;
        this.status.lastError = null;
      } else {
        throw new Error(result.error || 'Scene execution failed');
      }

    } catch (error) {
      console.error(`🔫 Armed Mode: Scene ${sceneId} failed:`, error.message);
      this.consecutiveFailures++;
      this.status.consecutiveFailures = this.consecutiveFailures;
      this.status.lastError = {
        sceneId,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }

    // Move to next scene
    this.currentSceneIndex++;
    
    // Check if we've completed the playlist
    if (this.currentSceneIndex >= this.playlist.length) {
      this.currentSceneIndex = 0;
      this.loopCount++;
      this.status.loopCount = this.loopCount;
      console.log(`🔫 Armed Mode: Completed loop ${this.loopCount}`);
    }

    // Schedule next scene
    if (this.isArmed) {
      this.executionInterval = setTimeout(() => this.executeNextScene(), this.config.sceneDelay);
    }
  }
}

// Export singleton instance
const armedModeService = new ArmedModeService();
export default armedModeService;

