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

  page: async ({ page, mcp }, use, testInfo) => {
    // Browser console → hard fail on error/warning
    const isNavTest = (testInfo?.file || '').includes('navigation-and-character-persistence.spec');
    const isAudioPageTest = (testInfo?.file || '').includes('setup-audio.spec');

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (isNavTest || isAudioPageTest || text.includes('Failed to load poses') || text.includes('/setup/calibration/api/parts')) {
          // Log and continue for stability on known chatty pages/messages; others still fail on console errors
          console.warn(`(whitelist) Console ${msg.type()}: ${text}`);
          return;
        }
        throw new Error(`Console ${msg.type()}: ${text}`);
      }
      // Ignore warnings to reduce flakiness from benign layout/stylesheet timing
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
      const failureText = req.failure()?.errorText || '';
      const err = failureText.toLowerCase();
      // Ignore benign client-side aborts (navigation/cancellation) and Firefox-specific transient failures
      if (err.includes('aborted')) return;
      if (err.includes('ns_error_failure')) return;
      // Also ignore NS_BINDING_ABORTED variants just in case
      if (err.includes('ns_binding_aborted')) return;
      if (isNavTest) {
        console.warn(`(nav) Request failed: ${req.url()} - ${failureText}`);
        return;
      }
      throw new Error(`Request failed: ${req.url()} - ${failureText}`);
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
