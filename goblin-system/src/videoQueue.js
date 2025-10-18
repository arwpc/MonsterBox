/**
 * Video Queue Manager
 * Manages sequential video playback with queue controls
 */

const fs = require('fs').promises;
const path = require('path');

class VideoQueue {
  constructor(mediaPlayer) {
    this.mediaPlayer = mediaPlayer;
    this.queue = [];
    this.originalQueue = [];
    this.priorityQueue = [];
    this.running = false;
    this.paused = false;
    this.stopRequested = false;
    this.skipRequested = false;
    this.currentVideo = null;
    this.mode = 'sequential'; // 'sequential' or 'loop'
    this.stateFile = '/home/remote/goblin/queue-state.json';

    console.log('📋 Video queue manager initialized');
  }

  /**
   * Get current queue status
   */
  getStatus() {
    return {
      running: this.running,
      paused: this.paused,
      mode: this.mode,
      currentVideo: this.currentVideo,
      queueLength: this.queue.length,
      priorityLength: this.priorityQueue.length,
      queue: this.queue.map(item => ({
        filename: item.filename,
        options: item.options
      })),
      priorityQueue: this.priorityQueue.map(item => ({
        filename: item.filename,
        options: item.options
      }))
    };
  }

  /**
   * Add video to end of queue
   */
  enqueue(filename, options = {}) {
    this.queue.push({ filename, options });

    if (this.mode === 'loop' && this.originalQueue.length === 0) {
      this.originalQueue = [...this.queue];
    }

    console.log(`📋 Added to queue: ${filename} (queue length: ${this.queue.length})`);

    return this.getStatus();
  }

  /**
   * Add video to priority queue (plays next)
   */
  enqueuePriority(filename, options = {}) {
    this.priorityQueue.push({ filename, options });
    console.log(`⚡ Added to priority queue: ${filename}`);

    return this.getStatus();
  }

  /**
   * Start queue with array of videos
   * Returns immediately - queue runs in background
   */
  async startQueue(videos, mode = 'sequential') {
    this.queue = videos.map(v => ({
      filename: typeof v === 'string' ? v : v.filename,
      options: typeof v === 'object' ? v.options || {} : {}
    }));

    this.mode = mode;
    this.originalQueue = mode === 'loop' ? [...this.queue] : [];
    this.stopRequested = false;
    this.paused = false;

    console.log(`📋 Starting queue with ${this.queue.length} videos (mode: ${mode})`);

    // Run queue in background - don't await
    setImmediate(() => {
      this.runQueue().catch(error => {
        console.error('❌ Queue error:', error);
        this.running = false;
      });
    });

    // Save state for auto-resume after reboot
    await this.saveState();

    return this.getStatus();
  }

  /**
   * Main queue processing loop
   */
  async runQueue() {
    if (this.running) {
      console.log('⚠️  Queue already running');
      return;
    }

    this.running = true;
      // Persist state immediately so reboot auto-restore works
      await this.saveState();


    try {
      while (!this.stopRequested) {
        // Check for pause
        while (this.paused && !this.stopRequested) {
          await this.sleep(100);
        }

        if (this.stopRequested) break;

        // Get next video (priority first, then regular queue)
        let next = this.priorityQueue.length > 0
          ? this.priorityQueue.shift()
          : null;

        if (!next) {
          if (this.queue.length === 0) {
            // Queue empty - check if we should loop
            if (this.mode === 'loop' && this.originalQueue.length > 0) {
              this.queue = [...this.originalQueue];
              console.log('🔄 Looping queue');
              // Update saved state with refreshed queue
              await this.saveState();
            } else {
              console.log('✅ Queue finished');
              break;
            }
          }

          next = this.queue.shift();
        }

        if (!next) break;

        // Play the video
        this.skipRequested = false;
        await this.playVideoWithMonitoring(next);
      }
    } finally {
      this.running = false;
      this.stopRequested = false;
      this.paused = false;
      this.skipRequested = false;
      this.currentVideo = null;

      // Clear state if queue finished naturally (not in loop mode)
      if (this.mode !== 'loop') {
        await this.clearState();
      }

      console.log('📋 Queue stopped');
    }
  }

  /**
   * Play video and monitor for completion or skip
   */
  async playVideoWithMonitoring(videoItem) {
    try {
      this.currentVideo = videoItem.filename;
      console.log(`🎬 Playing from queue: ${videoItem.filename}`);

      // Start video playback
      const result = await this.mediaPlayer.playVideo(
        videoItem.filename,
        { ...videoItem.options, loop: false } // Never loop individual videos in queue
      );

      if (!result.success) {
        console.error(`❌ Failed to play ${videoItem.filename}:`, result.error);
        return;
      }

      // Monitor playback status with timeout (max 2 hours per video)
      const maxWaitTime = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
      const startTime = Date.now();

      while (this.mediaPlayer.playbackStatus.video.playing && !this.skipRequested && !this.stopRequested) {
        await this.sleep(500);

        // Safety timeout - prevent infinite loop
        if (Date.now() - startTime > maxWaitTime) {
          console.error(`❌ Video playback timeout after 2 hours: ${videoItem.filename}`);
          await this.mediaPlayer.stopVideo();
          break;
        }
      }

      if (this.skipRequested) {
        console.log('⏭️  Skipping video');
        await this.mediaPlayer.stopVideo();
      }

      // Small delay between videos for clean transitions
      await this.sleep(100);

    } catch (error) {
      console.error(`❌ Error playing video from queue:`, error);
    } finally {
      this.currentVideo = null;
    }
  }

  /**
   * Pause queue
   */
  pause() {
    if (!this.running) {
      return { success: false, error: 'Queue not running' };
    }

    this.paused = true;
    console.log('⏸️  Queue paused');

    return this.getStatus();
  }

  /**
   * Resume queue
   */
  resume() {
    if (!this.running) {
      return { success: false, error: 'Queue not running' };
    }

    this.paused = false;
    console.log('▶️  Queue resumed');

    return this.getStatus();
  }

  /**
   * Skip current video
   */
  skip() {
    if (!this.running || !this.currentVideo) {
      return { success: false, error: 'No video playing' };
    }

    this.skipRequested = true;
    console.log('⏭️  Skip requested');

    return this.getStatus();
  }

  /**
   * Stop queue
   */
  async stop() {
    this.stopRequested = true;

    // Stop current video
    if (this.mediaPlayer.playbackStatus.video.playing) {
      await this.mediaPlayer.stopVideo();
    }

    console.log('⏹️  Queue stop requested');

    // Clear saved state since queue is stopped
    await this.clearState();

    return this.getStatus();
  }

  /**
   * Clear queue
   */
  clear() {
    this.queue = [];
    this.priorityQueue = [];
    this.originalQueue = [];

    console.log('🗑️  Queue cleared');

    return this.getStatus();
  }

  /**
   * Helper: sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Save queue state to disk for auto-resume after reboot
   */
  async saveState() {
    try {
      const state = {
        mode: this.mode,
        queue: this.queue,
        originalQueue: this.originalQueue,
        running: this.running,
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
      console.log('💾 Queue state saved');
    } catch (error) {
      console.error('❌ Failed to save queue state:', error.message);
    }
  }

  /**
   * Load queue state from disk
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      const state = JSON.parse(data);

      console.log(`📂 Loaded queue state from ${state.timestamp}`);
      return state;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to load queue state:', error.message);
      }
      return null;
    }
  }

  /**
   * Delete saved queue state
   */
  async clearState() {
    try {
      await fs.unlink(this.stateFile);
      console.log('🗑️  Queue state cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('❌ Failed to clear queue state:', error.message);
      }
    }
  }

  /**
   * Restore queue from saved state and auto-start
   */
  async restoreFromState() {
    const state = await this.loadState();

    if (!state || !state.running || !state.queue || state.queue.length === 0) {
      console.log('ℹ️  No queue state to restore');
      return false;
    }

    console.log(`🔄 Restoring queue: ${state.queue.length} videos, mode: ${state.mode}`);

    // Restore queue state
    this.queue = state.queue;
    this.originalQueue = state.originalQueue;
    this.mode = state.mode;

    // Auto-start the queue
    await this.startQueue(this.queue.map(item => item.filename), this.mode);

    return true;
  }
}

module.exports = VideoQueue;

