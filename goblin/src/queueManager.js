const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const DEFAULT_BASE_DIR = '/home/remote/goblin';
const TMPFS_DIR = '/dev/shm/goblin';
const TMPFS_LIMIT_BYTES = 512 * 1024 * 1024; // 512MB cap
const CACHE_DIR = '/home/remote/goblin/cache/720p60';
const QUICK_EXIT_MS = 3000;
const MAX_RESPAWN_DELAY_MS = 60000;

class QueueManager {
  constructor(mpvController, options = {}) {
    this.mpv = mpvController;
    this.baseDir = options.baseDir || DEFAULT_BASE_DIR;
    this.queueFile = options.queueFile || path.join(this.baseDir, 'queue.json');
    this.stateFile = options.stateFile || path.join(this.baseDir, 'state.json');
    // Last non-empty queue. A Goblin must come back from a power cut playing its show
    // with no controller on the network, so this survives a lost or emptied queue.json.
    this.showFile = options.showFile || path.join(this.baseDir, 'show.json');

    this.queue = { videos: [], currentIndex: 0, loopMode: 'none', playing: false };
    this.saveTimer = null;

    // Transcode control for universal cache
    this._transcodeActive = false;
    this._transcoding = new Set();

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
    // Goblins lose power without a shutdown. A queue.json caught mid-write used to fail
    // JSON.parse here and be overwritten with an EMPTY queue, so the unit booted dark until
    // a controller re-sent its show (Goblins 2 and 3, 2026-10-10/11).
    const loaded = await this._readQueueFile(this.queueFile);
    if (loaded && loaded.videos.length > 0) {
      this.queue = loaded;
      return;
    }
    const show = await this._readQueueFile(this.showFile);
    if (show && show.videos.length > 0) {
      this.queue = { ...show, currentIndex: 0, playing: true };
      console.log(`queue.json ${loaded ? 'empty' : 'unreadable'}; restored ${show.videos.length} video(s) from show.json`);
    } else {
      const fallback = await this._fallbackQueue();
      if (fallback) {
        this.queue = fallback;
        console.log(`queue.json ${loaded ? 'empty' : 'unreadable'} and no show.json; built a queue of ${fallback.videos.length} local video(s)`);
      } else if (loaded) {
        this.queue = loaded;
      }
    }
    await this.save();
  }

  async _readQueueFile(file) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!parsed || !Array.isArray(parsed.videos)) return null;
      return {
        videos: parsed.videos.filter(v => v && typeof v.filename === 'string'),
        currentIndex: Number.isInteger(parsed.currentIndex) ? parsed.currentIndex : 0,
        loopMode: ['none', 'single', 'queue'].includes(parsed.loopMode) ? parsed.loopMode : 'queue',
        playing: parsed.playing !== false
      };
    } catch (_) {
      return null;
    }
  }

  // Nothing to restore: play the unit's own reel(s) if it has any, else every clip it holds.
  async _fallbackQueue() {
    const mediaRoot = this.mpv && this.mpv.mediaRoot ? this.mpv.mediaRoot : '/home/remote/media/video';
    let names;
    try {
      names = (await fs.readdir(mediaRoot)).filter(n => /\.(mp4|mov|avi|mkv)$/i.test(n)).sort();
    } catch (_) {
      return null;
    }
    const reels = names.filter(n => /^reel-/i.test(n));
    const picked = reels.length > 0 ? reels : names;
    if (picked.length === 0) return null;
    const now = Date.now();
    return {
      videos: picked.map((filename, i) => ({ id: String(now + i), filename, addedAt: new Date(now).toISOString(), playCount: 0 })),
      currentIndex: 0,
      loopMode: 'queue',
      playing: true
    };
  }

  // Temp file + fsync + rename, so a power cut leaves the old file or the new one, never a
  // truncated one.
  async _writeAtomic(file, text) {
    const tmp = `${file}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(text);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, file);
  }

  async save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        await this.ensureDirs();
        await this._writeAtomic(this.queueFile, JSON.stringify(this.queue, null, 2));
        if (this.queue.videos.length > 0) {
          const show = { videos: this.queue.videos, loopMode: this.queue.loopMode };
          const text = JSON.stringify(show, null, 2);
          // playCount changes every pass; rewrite show.json only when the line-up changes.
          const key = JSON.stringify([show.loopMode, show.videos.map(v => v.filename)]);
          if (key !== this._lastShowKey) {
            await this._writeAtomic(this.showFile, text);
            this._lastShowKey = key;
          }
        }
      } catch (e) {
        console.error('queue save failed:', e.message);
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
    // No transcoding needed - videos are pre-optimized 720p30
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

    // All videos are pre-optimized 720p30 - play directly, no transcoding needed
    const videoPath = await this._originalAbsolute(video.filename);
    // One clip looping is ONE mpv process (--loop), whether the mode says 'single' or
    // the whole queue is that one clip. Respawning mpv for every pass flashed the
    // screen black each time and killed a hardware-decoding mpv every loop — the
    // kill path this file already guards against for kernel panics (2026-09-26).
    const loop = this.queue.loopMode === 'single'
      || (this.queue.loopMode === 'queue' && this.queue.videos.length === 1);

    // Play directly - videos are already optimized for Pi3
    this._lastSpawnAt = Date.now();
    await this.mpv.play(videoPath, { loop });
    video.playCount++;
    await this.save();
  }

  // An mpv that dies right after spawning (no HDMI sink, DRM busy, unreadable file) used to be
  // respawned at once, forever: 65 spawns in 23 s on Goblin 4 (2026-10-12), which starved the box
  // until SSH and HTTP stopped answering and it looked like it had dropped off the network.
  // Quick exits now back off 2 s, 4 s, ... up to 60 s; a pass that ran normally resets it.
  _respawnDelayMs() {
    const ranMs = Date.now() - (this._lastSpawnAt || 0);
    if (ranMs >= QUICK_EXIT_MS) {
      this._quickExits = 0;
      return 0;
    }
    this._quickExits = (this._quickExits || 0) + 1;
    if (this._quickExits < 2) return 0;
    const delay = Math.min(MAX_RESPAWN_DELAY_MS, 1000 * 2 ** (this._quickExits - 1));
    console.error(`mpv exited after ${ranMs} ms (${this._quickExits} quick exits in a row); next start in ${delay / 1000} s`);
    return delay;
  }

  async onVideoEnd() {
    if (!this.queue.playing) return;
    const delay = this._respawnDelayMs();
    if (delay > 0) {
      clearTimeout(this._respawnTimer);
      await new Promise(resolve => { this._respawnTimer = setTimeout(resolve, delay); });
      // A stop, or a new start, during the wait owns the player now.
      if (!this.queue.playing || (this.mpv && this.mpv.process)) return;
    }
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

  // ===== tmpfs prefetch helpers =====
  async _ensureTmpfsDir() {
    try { await fs.mkdir(TMPFS_DIR, { recursive: true }); } catch (_) { }
  }

  _hashOf(str) {
    try { return crypto.createHash('md5').update(str).digest('hex').slice(0, 8); } catch (_) { return 'na'; }
  }

  async _originalAbsolute(p) {
    if (path.isAbsolute(p)) return p;
    const mediaRoot = this.mpv && this.mpv.mediaRoot ? this.mpv.mediaRoot : '/home/remote/goblin/media/video';
    return path.join(mediaRoot, p);
  }

  async _tmpfsCandidatePath(originalPath) {
    const abs = await this._originalAbsolute(originalPath);
    const base = path.basename(abs);
    const h = this._hashOf(abs);
    return path.join(TMPFS_DIR, `${h}-${base}`);
  }

  async _resolvePlaybackPath(filename) {
    // 0) Prefer cached version if it exists
    try {
      const cached5994 = await this._cacheCandidatePath5994(filename);
      await fs.access(cached5994);
      return cached5994;
    } catch (_) { }
    try {
      const cached60 = await this._cacheCandidatePath(filename);
      await fs.access(cached60);
      return cached60;
    } catch (_) { }

    const abs = await this._originalAbsolute(filename);
    const cand = await this._tmpfsCandidatePath(filename);
    // 1) If tmpfs hashed copy exists, use it
    try { await fs.access(cand); return cand; } catch (_) { }

    // 2) If the provided filename is absolute and exists, use it
    if (path.isAbsolute(filename)) {
      try { await fs.access(filename); return filename; } catch (_) { }
      // 3) Fallback: try media root + basename
      try {
        const mediaRoot = this.mpv && this.mpv.mediaRoot ? this.mpv.mediaRoot : '/home/remote/goblin/media/video';
        const mediaAbs = path.join(mediaRoot, path.basename(abs));
        await fs.access(mediaAbs); return mediaAbs;
      } catch (_) { }
      // 4) Last resort: return original absolute even if missing
      return filename;
    }

    // If relative, use resolved abs
    return abs;
  }

  async _tmpfsTotalBytes() {
    try {
      const entries = await fs.readdir(TMPFS_DIR);
      let total = 0;
      for (const e of entries) {
        try {
          const st = await fs.stat(path.join(TMPFS_DIR, e));
          if (st.isFile()) total += st.size;
        } catch (_) { }
      }
      return total;
    } catch (_) { return 0; }
  }

  async _clearTmpfsExcept(keepPaths) {
    await this._ensureTmpfsDir();
    const keepSet = new Set((keepPaths || []).filter(Boolean).map(p => path.resolve(p)));
    try {
      const entries = await fs.readdir(TMPFS_DIR);
      for (const e of entries) {
        const p = path.resolve(path.join(TMPFS_DIR, e));
        if (!keepSet.has(p)) {
          try { await fs.unlink(p); } catch (_) { }
        }
      }
    } catch (_) { }
  }

  async _prefetchToTmpfs(filename) {
    await this._ensureTmpfsDir();
    const src = await this._originalAbsolute(filename);
    let st;
    try { st = await fs.stat(src); } catch (_) { return; }
    if (!st.isFile()) return;
    if (st.size > TMPFS_LIMIT_BYTES) return; // too large
    const dst = await this._tmpfsCandidatePath(filename);
    try { await fs.access(dst); return; } catch (_) { }

    // Ensure capacity: keep at most current/next (cleanup is handled outside),
    // but also check size threshold.
    const used = await this._tmpfsTotalBytes();
    if (used + st.size > TMPFS_LIMIT_BYTES) {
      await this._clearTmpfsExcept([]);
    }

    // Final size check
    const used2 = await this._tmpfsTotalBytes();
    if (used2 + st.size > TMPFS_LIMIT_BYTES) return;

    // Copy without blocking main flow
    try {
      // Use streams to avoid blocking event loop with huge buffers
      await fs.copyFile(src, dst);
    } catch (_) { /* swallow */ }
  }

  // ===== universal 720p/60 cache helpers =====
  async _ensureCacheDir() {
    try { await fs.mkdir(CACHE_DIR, { recursive: true }); } catch (_) { }
  }

  async _ffmpegExists() {
    return await new Promise((resolve) => {
      try {
        const p = spawn('ffmpeg', ['-version']);
        let resolved = false;
        p.on('error', () => { if (!resolved) { resolved = true; resolve(false); } });
        p.on('close', () => { if (!resolved) { resolved = true; resolve(true); } });
        setTimeout(() => { if (!resolved) { resolved = true; try { p.kill('SIGKILL'); } catch (_) { } resolve(true); } }, 1000);
      } catch (_) { resolve(false); }
    });
  }

  async _cacheCandidatePath(originalPath) {
    await this._ensureCacheDir();
    const abs = await this._originalAbsolute(originalPath);
    const base = path.basename(abs, path.extname(abs));
    const h = this._hashOf(abs);
    return path.join(CACHE_DIR, `${h}-${base}-720p60.mp4`);
  }

  async _cacheCandidatePath5994(originalPath) {
    await this._ensureCacheDir();
    const abs = await this._originalAbsolute(originalPath);
    const base = path.basename(abs, path.extname(abs));
    const h = this._hashOf(abs);
    return path.join(CACHE_DIR, `${h}-${base}-720p59.94.mp4`);
  }

  async _ensureCachedSoon(filename) {
    try {
      const ff = await this._ffmpegExists();
      if (!ff) return; // ffmpeg not available; skip quietly
      const src = await this._originalAbsolute(filename);
      const dst = await this._cacheCandidatePath5994(filename);

      // Skip if already transcoding this source
      const key = src;
      if (this._transcoding.has(key)) return;

      // Check freshness
      let srcStat, dstStat;
      try { srcStat = await fs.stat(src); } catch (_) { return; }
      try { dstStat = await fs.stat(dst); } catch (_) { dstStat = null; }
      if (dstStat && dstStat.mtimeMs >= srcStat.mtimeMs && dstStat.size > 0) return;

      // Only one active transcode at a time to protect CPU
      if (this._transcodeActive) return; // another job is running; next cycle will pick this up
      console.log('[cache] starting transcode', src, '->', dst);
      this._transcodeActive = true;
      this._transcoding.add(key);

      const tmpDst = dst + '.part';
      try {
        // Ensure parent dir exists
        await this._ensureCacheDir();
        // Launch ffmpeg transcode: 720p with exact 60.000 fps CFR
        const args = [
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', src,
          '-vf', "scale=-2:720:flags=bicubic,fps=60000/1001",
          '-vsync', 'cfr',
          '-pix_fmt', 'yuv420p',
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
          '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
          '-f', 'mp4',
          tmpDst
        ];
        await new Promise((resolve) => {
          try {
            const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
            try {
              const fsSync = require('fs');
              const logPath = '/home/remote/goblin/logs/cache-ffmpeg.log';
              p.stderr.on('data', (buf) => { try { fsSync.appendFile(logPath, buf, () => { }); } catch (_) { } });
            } catch (_) { }
            p.on('close', () => resolve());
            p.on('error', () => resolve());
          } catch (_) { resolve(); }
        });
        // If tmp exists and non-empty, atomically move into place
        try {
          const st = await fs.stat(tmpDst);
          if (st && st.size > 0) {
            try { await fs.rename(tmpDst, dst); } catch (_) { }
          }
        } catch (_) { /* no tmp created */ }
      } catch (_) { /* swallow */ }
      finally {
        try { await fs.unlink(tmpDst); } catch (_) { }
        console.log('[cache] complete', dst);
        this._transcoding.delete(key);
        this._transcodeActive = false;
      }
    } catch (_) { /* swallow */ }
  }
}

module.exports = QueueManager;

