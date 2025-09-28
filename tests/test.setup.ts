import { test as base } from '@playwright/test';
import { spawn } from 'child_process';

// Simple MCP error detectors
const MCP_ERROR_PATTERNS = [
  /\berror\b/i,
  /unhandled/i,
  /exception/i,
  /ECONNREFUSED/i,
  /EADDR/i,
  /TypeError/i,
  /ReferenceError/i,
];

type MCPBuffers = { proc: any, out: string[], err: string[] };

export const test = base.extend<{
  mcp: MCPBuffers;
}>({
  // Spawn MCP log collector once per worker and collect stdout/stderr
  mcp: [async ({}, use) => {
    const out: string[] = [];
    const err: string[] = [];
    const proc = spawn('node', ['mcp-servers/log-collector-server.js'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MB_TEST_MODE: process.env.MB_TEST_MODE || '1' },
    });

    if (proc.stdout) proc.stdout.on('data', (d: Buffer) => out.push(String(d)));
    if (proc.stderr) proc.stderr.on('data', (d: Buffer) => err.push(String(d)));

    await use({ proc, out, err });

    try { proc.kill('SIGTERM'); } catch {}
  }, { scope: 'worker', auto: true }],

  page: async ({ page, mcp }, use) => {
    // Browser console → hard fail on error/warning
    page.on('console', msg => {
      if (['error', 'warning'].includes(msg.type())) {
        throw new Error(`Console ${msg.type()}: ${msg.text()}`);
      }
    });

    // Network failures and save contract enforcement
    page.on('response', async res => {
      if (res.status() >= 500) {
        throw new Error(`HTTP ${res.status()} for ${res.url()}`);
      }
      if (res.url().includes('/api/save')) {
        if (res.status() !== 200) throw new Error(`Save failed: ${res.url()} - ${res.status()}`);
        try {
          const body = await res.json();
          if (!body.success) throw new Error(`Save response missing success=true: ${res.url()}`);
        } catch {
          throw new Error(`Save response invalid or non-JSON: ${res.url()}`);
        }
      }
    });

    page.on('requestfailed', req => {
      const err = (req.failure()?.errorText || '').toLowerCase();
      // Ignore benign client-side aborts (navigation/cancellation), focus on real failures
      if (err.includes('aborted')) return;
      throw new Error(`Request failed: ${req.url()} - ${req.failure()?.errorText}`);
    });

    // MCP baseline snapshot per test
    const baseOutLen = mcp.out.length;
    const baseErrLen = mcp.err.length;

    await use(page);

    // After test: scan newly added MCP logs for error patterns
    const newOut = mcp.out.slice(baseOutLen).join('\n');
    const newErr = mcp.err.slice(baseErrLen).join('\n');
    const combined = `${newOut}\n${newErr}`;
    if (combined && MCP_ERROR_PATTERNS.some(rx => rx.test(combined))) {
      throw new Error('MCP log collector reported errors during test run. See MCP output for details.');
    }
  }
});

export { expect } from '@playwright/test';
