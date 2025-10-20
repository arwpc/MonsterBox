const fs = require('fs').promises;
const path = require('path');

const DEFAULT_BASE_DIR = '/home/remote/goblin';

class QueueManager {
  constructor(mpvController, options = {}) {
    this.mpv = mpvController;
    this.baseDir = options.baseDir || DEFAULT_BASE_DIR;
    this.queueFile = options.queueFile || path.join(this.baseDir, 'queue.json');
    this.stateFile = options.stateFile || path.join(this.baseDir, 'state.json');

    this.queue = { videos: [], currentIndex: 0, loopMode: 'none', playing: false };
    this.saveTimer = null;

    // Bind callback
    if (this.mpv) {
      this.mpv.onEnd = this.onVideoEnd.bind(this);
    }
  }

  async ensureDirs() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async load() {
    await this.ensureDirs();
    try {
      const data = await fs.readFile(this.queueFile, 'utf8');
      this.queue = JSON.parse(data);
    } catch (_) {
      await this.save();
    }
  }

  async save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await this.ensureDirs();
        await fs.writeFile(this.queueFile, JSON.stringify(this.queue, null, 2));
      } catch (e) {
        // noop
      }
    }, 75);
  }

  async add(filename, position = 'end') {
    const video = {
      id: Date.now().toString(),
      filename,
      addedAt: new Date().toISOString(),
      playCount: 0
    };

    if (position === 'next') {
      this.queue.videos.splice(this.queue.currentIndex + 1, 0, video);
    } else {
      this.queue.videos.push(video);
    }
    await this.save();
    return video;
  }

  async remove(id) {
    const idx = this.queue.videos.findIndex(v => v.id === id);
    if (idx === -1) return false;

    if (idx < this.queue.currentIndex) {
      this.queue.currentIndex--;
    } else if (idx === this.queue.currentIndex && this.queue.playing) {
      await this.stop();
    }
    this.queue.videos.splice(idx, 1);
    await this.save();
    return true;
  }

  async clear() {
    await this.stop();
    this.queue.videos = [];
    this.queue.currentIndex = 0;
    await this.save();
  }

  async start(options = {}) {
    if (this.queue.videos.length === 0) throw new Error('Queue is empty');
    if (options.loopMode) this.queue.loopMode = options.loopMode;
    this.queue.playing = true;
    await this.save();
    await this.playNext();
  }

  async playNext() {
    if (!this.queue.playing) return;

    const video = this.queue.videos[this.queue.currentIndex];
    if (!video) {
      if (this.queue.loopMode === 'queue') {
        this.queue.currentIndex = 0;
        return this.playNext();
      } else {
        this.queue.playing = false;
        await this.save();
        return;
      }
    }

    const loop = this.queue.loopMode === 'single';
    await this.mpv.play(video.filename, { loop });
    video.playCount++;
    await this.save();
  }

  async onVideoEnd() {
    if (!this.queue.playing) return;
    if (this.queue.loopMode !== 'single') {
      this.queue.currentIndex += 1;
      await this.playNext();
    } else {
      // single loop handled by mpv --loop
      await this.playNext();
    }
  }

  async stop() {
    this.queue.playing = false;
    await this.mpv.stop();
    await this.save();
  }

  async skip() {
    if (!this.queue.playing) return;
    this.queue.currentIndex += 1;
    await this.playNext();
  }

  async previous() {
    if (!this.queue.playing) return;
    this.queue.currentIndex = Math.max(0, this.queue.currentIndex - 1);
    await this.playNext();
  }

  getStatus() {
    return {
      videos: this.queue.videos,
      currentIndex: this.queue.currentIndex,
      currentVideo: this.queue.videos[this.queue.currentIndex] || null,
      loopMode: this.queue.loopMode,
      playing: this.queue.playing,
      mpvRunning: !!(this.mpv && this.mpv.currentVideo)
    };
  }
}

module.exports = QueueManager;

