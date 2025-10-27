import { test as base, ConsoleMessage, expect, Request, Response } from '@playwright/test';
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

type MCPBuffers = { proc: any; out: string[]; err: string[] };

export const test = base.extend<{ mcp: MCPBuffers }>({
  // Worker-scoped MCP collector (toggle with MB_NO_MCP=1)
  mcp: [async ({ }, use) => {
    if (process.env.MB_NO_MCP === '1' || process.env.MB_NO_MCP === 'true') {
      await use({ proc: null, out: [], err: [] });
      return;
    }
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
    try { proc.kill('SIGTERM'); } catch { }
  }, { scope: 'worker' }],

  // Override page to add strict error monitoring and MCP correlation
  page: async ({ page, mcp }, use) => {
    // Browser console → hard fail on error/warning (except benign layout warning)
    page.on('console', (msg: ConsoleMessage) => {
      if (['error', 'warning'].includes(msg.type())) {
        const text = msg.text() || '';
        if (msg.type() === 'warning' && text.includes('Layout was forced before the page was fully loaded')) return;
        throw new Error(`Console ${msg.type()}: ${text}`);
      }
    });

    // Network failures and save contract enforcement
    page.on('response', async (res: Response) => {
      if (res.status() >= 500) throw new Error(`HTTP ${res.status()} for ${res.url()}`);
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

    page.on('requestfailed', (req: Request) => {
      const err = (req.failure()?.errorText || '').toLowerCase();
      if (err.includes('aborted') || err.includes('ns_error_failure') || err.includes('ns_binding_aborted')) return;
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
  },
});

export { expect };
