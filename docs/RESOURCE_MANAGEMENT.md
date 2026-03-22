# MonsterBox Resource Management — Design Document

## Overview

Resource management for a Node.js application running on Raspberry Pi 4B with 8GB RAM. Covers single-instance enforcement, process priority, memory monitoring, environment-based test isolation, graceful shutdown, and startup health checks. All implemented within the existing Node.js/Express architecture.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  server.js startup                │
│                                                    │
│  1. PID file check/acquire                        │
│  2. Startup health check (RAM, CPU, disk)         │
│  3. Set process priority (os.nice)                │
│  4. Environment validation (MONSTERBOX_ENV)       │
│  5. Normal Express initialization                 │
│  6. Register shutdown handlers                    │
│                                                    │
│            ↓ running ↓                             │
│                                                    │
│  Memory monitor (interval, configurable)          │
│  Performance collector (existing, 5-min)          │
│                                                    │
│            ↓ SIGTERM/SIGINT/SIGHUP ↓              │
│                                                    │
│  Ordered shutdown sequence (10s timeout)          │
└──────────────────────────────────────────────────┘
```

## Component Design

### 1. Single Instance Manager (`services/resource/singleInstance.js`)

Prevents multiple MonsterBox processes from running simultaneously, which would cause GPIO/I2C conflicts.

**PID file location:** `data/monsterbox.pid`

**Startup sequence:**
```javascript
async function acquireLock() {
  const pidFile = path.join(dataDir, 'monsterbox.pid');

  if (await fileExists(pidFile)) {
    const existingPid = parseInt(await fs.readFile(pidFile, 'utf8'), 10);

    if (isProcessRunning(existingPid)) {
      // Another instance is actually running
      console.error(`MonsterBox already running (PID ${existingPid}). Exiting.`);
      process.exit(1);
    } else {
      // Stale PID file from crash
      console.warn(`Removing stale PID file (PID ${existingPid} not running)`);
      await fs.unlink(pidFile);
    }
  }

  // Write our PID
  await fs.writeFile(pidFile, String(process.pid));
  return true;
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return true;
  } catch {
    return false;
  }
}
```

**Stale process handling:**
- If PID file exists but process is dead → remove PID file, proceed
- If PID file exists and process is alive → log error, exit with code 1
- On clean shutdown → remove PID file (part of shutdown sequence)

**Safe hardware release before init:**
- After acquiring lock, before initializing hardware services, call cleanup for any orphaned Python processes:
```javascript
async function cleanupOrphanedProcesses() {
  // Kill any lingering jaw_servo_daemon.py, head_tracking_cli.py processes
  const patterns = ['jaw_servo_daemon', 'head_tracking_cli', 'servo_cli'];
  for (const pattern of patterns) {
    try {
      execSync(`pkill -f "${pattern}.py"`, { timeout: 2000 });
    } catch { /* no matching process, fine */ }
  }
}
```

### 2. Process Priority (`services/resource/processPriority.js`)

Elevate MonsterBox process priority for responsive hardware control.

**Implementation:**
```javascript
import os from 'os';

function setProcessPriority() {
  try {
    // Nice value -15 (higher priority, requires root or CAP_SYS_NICE)
    os.setPriority(process.pid, -15);
    console.log('Process priority set to -15 (elevated)');
    return { success: true, nice: -15 };
  } catch (err) {
    // Graceful degradation without root
    console.warn(`Could not set process priority: ${err.message}. Running at default priority.`);
    return { success: false, nice: os.getPriority(process.pid), error: err.message };
  }
}
```

**SCHED_RR for servo/audio threads:**
- Not directly available in Node.js without native addons
- Instead, use `nice -n -15` when spawning critical Python wrappers:
```javascript
// In hardwareService/exec.js, for servo commands:
const childProcess = spawn(pythonPath, args, {
  ...options,
  // Inherit parent's nice value (already elevated)
});
```

**Graceful degradation:** If not running as root or without CAP_SYS_NICE, log warning and continue at default priority. Never crash over priority failure.

### 3. Memory Monitor (`services/resource/memoryMonitor.js`)

Watches RSS memory usage and warns before OOM.

**Implementation:**
```javascript
class MemoryMonitor {
  constructor(options = {}) {
    this.warningThresholdMB = options.warningThresholdMB || 512;
    this.criticalThresholdMB = options.criticalThresholdMB || 1024;
    this.checkIntervalMs = options.checkIntervalMs || 30000; // 30s
    this.intervalHandle = null;
    this.lastWarning = 0;
    this.warningCooldownMs = 300000; // 5 min between warnings
  }

  start() {
    this.intervalHandle = setInterval(() => this.check(), this.checkIntervalMs);
    // Don't prevent process exit
    this.intervalHandle.unref();
  }

  check() {
    const usage = process.memoryUsage();
    const rssMB = usage.rss / (1024 * 1024);
    const heapUsedMB = usage.heapUsed / (1024 * 1024);
    const heapTotalMB = usage.heapTotal / (1024 * 1024);

    const result = {
      rssMB: Math.round(rssMB * 10) / 10,
      heapUsedMB: Math.round(heapUsedMB * 10) / 10,
      heapTotalMB: Math.round(heapTotalMB * 10) / 10,
      systemFreeMB: Math.round(os.freemem() / (1024 * 1024)),
      systemTotalMB: Math.round(os.totalmem() / (1024 * 1024)),
      level: 'normal'
    };

    const now = Date.now();
    if (rssMB > this.criticalThresholdMB) {
      result.level = 'critical';
      if (now - this.lastWarning > this.warningCooldownMs) {
        console.error(`CRITICAL: Memory RSS ${rssMB.toFixed(0)}MB exceeds ${this.criticalThresholdMB}MB threshold`);
        this.lastWarning = now;
      }
    } else if (rssMB > this.warningThresholdMB) {
      result.level = 'warning';
      if (now - this.lastWarning > this.warningCooldownMs) {
        console.warn(`WARNING: Memory RSS ${rssMB.toFixed(0)}MB exceeds ${this.warningThresholdMB}MB threshold`);
        this.lastWarning = now;
      }
    }

    this.lastReading = result;
    return result;
  }

  getLastReading() {
    return this.lastReading || this.check();
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
```

**mlockall() attempt:**
- Not available in Node.js without native addons
- Skip — Node.js GC manages memory adequately for this workload
- Focus on monitoring and warning instead

### 4. Environment Isolation (`services/resource/environment.js`)

Environment variable `MONSTERBOX_ENV` controls runtime mode.

**Values:**
- `production` (default if unset) — Full hardware access, all features enabled
- `development` — Full hardware access, verbose logging
- `test` — Hardware mocks injected, no GPIO/I2C access

**Implementation:**
```javascript
const MONSTERBOX_ENV = process.env.MONSTERBOX_ENV ||
  (process.env.MB_TEST_MODE === '1' ? 'test' : 'production');

function getEnvironment() {
  return MONSTERBOX_ENV;
}

function isTestMode() {
  return MONSTERBOX_ENV === 'test' || process.env.MB_TEST_MODE === '1';
}

function isProduction() {
  return MONSTERBOX_ENV === 'production' && !process.env.MB_TEST_MODE;
}

function isDevelopment() {
  return MONSTERBOX_ENV === 'development';
}
```

**Test mode auto-injection:**
- When `isTestMode()`, hardwareService/exec.js returns mock responses instead of spawning Python
- This is already partially implemented via `MB_TEST_MODE` checks throughout the codebase
- `MONSTERBOX_ENV=test` becomes the canonical way, with `MB_TEST_MODE` as backward-compat alias

**Production safety:**
- In production mode, log a warning if test-related environment variables are detected
- Do NOT refuse startup if test modules are detected — this would break the existing test infrastructure which imports the running server

### 5. Shutdown Handler (`services/resource/shutdownHandler.js`)

Ordered, timeout-bounded shutdown sequence.

**Shutdown sequence (10-second total timeout):**
```
Signal received (SIGTERM/SIGINT/SIGHUP)
    │
    ├─ 1. Stop accepting new HTTP requests (server.close())
    ├─ 2. Wait for in-flight requests to complete (2s max)
    ├─ 3. Stop scene queue and idle loop
    ├─ 4. Complete pending hardware commands (1s max)
    ├─ 5. Move servos to safe positions (home/neutral)
    ├─ 6. Release camera (stop mjpg-streamer integration)
    ├─ 7. Stop audio playback and jaw daemon
    ├─ 8. Release GPIO (cleanup Python processes)
    ├─ 9. Remove PID file
    ├─ 10. Final log entry
    │
    └─ 10-second hard timeout: force process.exit(1)
```

**Implementation approach:**
Extend the existing `gracefulShutdown()` in server.js rather than creating a separate service. The shutdown handler module provides the ordered step execution:

```javascript
class ShutdownHandler {
  constructor() {
    this.steps = [];
    this.isShuttingDown = false;
    this.hardTimeoutMs = 10000;
  }

  register(name, priority, fn) {
    // Lower priority number = runs first
    this.steps.push({ name, priority, fn });
    this.steps.sort((a, b) => a.priority - b.priority);
  }

  async execute(signal) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`Shutdown initiated by ${signal}`);

    const hardTimeout = setTimeout(() => {
      console.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.hardTimeoutMs);
    hardTimeout.unref();

    for (const step of this.steps) {
      try {
        console.log(`Shutdown step: ${step.name}`);
        await Promise.race([
          step.fn(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('step timeout')), 3000)
          )
        ]);
      } catch (err) {
        console.error(`Shutdown step "${step.name}" failed: ${err.message}`);
        // Continue with remaining steps
      }
    }

    clearTimeout(hardTimeout);
    console.log('Shutdown complete');
    process.exit(0);
  }
}
```

**Safe servo positions:**
- On shutdown, attempt to move servos to their calibrated "home" position
- If no home position defined, leave servo at current position (do not send random commands)
- Timeout per servo: 500ms. Skip if hardware unresponsive.

### 6. Startup Health Check (`services/resource/startupHealthCheck.js`)

Runs at server start, logs results, reports to Systems area.

**Checks:**
```javascript
async function runStartupHealthCheck() {
  const results = {
    timestamp: new Date().toISOString(),
    pid: process.pid,
    environment: getEnvironment(),
    checks: {}
  };

  // 1. Free RAM
  const freeMB = Math.round(os.freemem() / (1024 * 1024));
  const totalMB = Math.round(os.totalmem() / (1024 * 1024));
  results.checks.memory = {
    freeMB, totalMB,
    percentFree: Math.round(freeMB / totalMB * 100),
    status: freeMB > 500 ? 'ok' : freeMB > 200 ? 'warning' : 'critical'
  };

  // 2. CPU load
  const loadAvg = os.loadavg();
  const cpuCount = os.cpus().length;
  results.checks.cpu = {
    load1m: loadAvg[0],
    load5m: loadAvg[1],
    load15m: loadAvg[2],
    cores: cpuCount,
    status: loadAvg[0] < cpuCount * 0.8 ? 'ok' :
            loadAvg[0] < cpuCount * 1.5 ? 'warning' : 'critical'
  };

  // 3. Disk space
  try {
    const { stdout } = await execAsync('df -BM --output=avail / | tail -1');
    const availMB = parseInt(stdout.trim());
    results.checks.disk = {
      availableMB: availMB,
      status: availMB > 1000 ? 'ok' : availMB > 500 ? 'warning' : 'critical'
    };
  } catch {
    results.checks.disk = { status: 'unknown', error: 'Could not check disk' };
  }

  // 4. I2C bus (for PCA9685 servo driver)
  if (!isTestMode()) {
    try {
      await execAsync('i2cdetect -y 1 2>/dev/null | head -1', { timeout: 2000 });
      results.checks.i2c = { status: 'ok' };
    } catch {
      results.checks.i2c = { status: 'warning', error: 'I2C bus not accessible' };
    }
  }

  // 5. Python availability
  try {
    await execAsync('python3 --version', { timeout: 2000 });
    results.checks.python = { status: 'ok' };
  } catch {
    results.checks.python = { status: 'critical', error: 'Python3 not found' };
  }

  // Log results
  const overallStatus = Object.values(results.checks)
    .some(c => c.status === 'critical') ? 'CRITICAL' :
    Object.values(results.checks)
    .some(c => c.status === 'warning') ? 'WARNING' : 'OK';

  console.log(`Startup health check: ${overallStatus}`);
  for (const [name, check] of Object.entries(results.checks)) {
    const icon = check.status === 'ok' ? '✓' : check.status === 'warning' ? '⚠' : '✗';
    console.log(`  ${icon} ${name}: ${check.status}${check.error ? ` (${check.error})` : ''}`);
  }

  // Save for dashboard display
  results.overallStatus = overallStatus;
  await fs.writeFile(
    path.join(dataDir, 'startup-health.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}
```

## API Endpoints

```
GET /api/resource/health         → startup health check results
GET /api/resource/memory         → current memory monitor reading
GET /api/resource/status         → { pid, uptime, environment, priority, memory, cpu }
GET /api/resource/pid            → { pid, startedAt, uptimeSeconds }
```

## Dashboard Integration — Resource Health Panel

Add to Systems page (`views/setup/system.ejs`) as a new tab or section:

**Resource Health Panel contents:**
- PID and uptime display
- Process priority (nice value)
- Memory RSS with bar chart (green/yellow/red zones)
- MONSTERBOX_ENV indicator badge
- CPU load averages (1m/5m/15m)
- Last startup health check results (expandable)
- Auto-refresh every 30 seconds via existing polling pattern

## File Structure

```
services/resource/
├── singleInstance.js      # PID file management
├── processPriority.js     # Nice value setting
├── memoryMonitor.js       # RSS monitoring with thresholds
├── environment.js         # MONSTERBOX_ENV handling
├── shutdownHandler.js     # Ordered shutdown sequence
└── startupHealthCheck.js  # Boot-time system validation

routes/api/
└── resource.js            # REST API for resource info

data/
├── monsterbox.pid         # PID lock file (runtime only)
└── startup-health.json    # Last health check results
```

## Integration with server.js

**Startup additions (in order):**
```javascript
// Early in server.js, before Express setup:
import { acquireLock, removeLock } from './services/resource/singleInstance.js';
import { setProcessPriority } from './services/resource/processPriority.js';
import { MemoryMonitor } from './services/resource/memoryMonitor.js';
import { getEnvironment } from './services/resource/environment.js';
import { ShutdownHandler } from './services/resource/shutdownHandler.js';
import { runStartupHealthCheck } from './services/resource/startupHealthCheck.js';

// 1. Single instance
await acquireLock();

// 2. Process priority
const priorityResult = setProcessPriority();

// 3. Environment check
console.log(`Environment: ${getEnvironment()}`);

// 4. Startup health check
const healthResults = await runStartupHealthCheck();

// 5. Memory monitor
const memoryMonitor = new MemoryMonitor();
memoryMonitor.start();

// 6. Shutdown handler (extend existing gracefulShutdown)
// ... register shutdown steps ...
```

**Shutdown integration:**
Extend the existing `gracefulShutdown()` function in server.js to include PID file removal and ordered step execution. Do NOT replace the existing function — add to it.

## Constraints

- No new npm dependencies
- No native addons (no mlockall, no SCHED_RR from Node.js)
- PID file in `data/` directory (already writable, on same filesystem)
- Memory monitor interval uses `.unref()` to not prevent process exit
- All health check commands have 2-second timeouts
- Startup health check is non-blocking: warnings logged, never prevents startup
- Compatible with existing MB_TEST_MODE=1 pattern
- SD card aware: minimize writes (health check writes once at startup, memory monitor only logs to console)
