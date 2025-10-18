/**
 * Video Queue Manager
 * Manages sequential video playback with queue controls
 */

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
    
    await this.runQueue();
    
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
      
      // Monitor playback status
      while (this.mediaPlayer.playbackStatus.video.playing && !this.skipRequested && !this.stopRequested) {
        await this.sleep(500);
      }
      
      if (this.skipRequested) {
        console.log('⏭️  Skipping video');
        await this.mediaPlayer.stopVideo();
      }
      
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
}

module.exports = VideoQueue;

