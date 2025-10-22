/**
 * MonsterBox 5.3 - Chrome DevTools Browser MCP Validation Helpers
 * 
 * These utilities document the expected Browser MCP validation workflow.
 * Actual MCP invocations happen through Copilot's MCP integration.
 * 
 * Use these patterns when asking Copilot to validate UI changes.
 */

/**
 * Browser MCP Validation Patterns
 * 
 * These are prompts you can give to Copilot to trigger Browser MCP validation.
 */

export const MCPValidationPrompts = {
  /**
   * Basic page load validation
   * 
   * Usage: Tell Copilot:
   * "Validate /setup/calibration page loads without console errors"
   */
  pageLoad: (path) => `
    Navigate to http://localhost:3000${path} and validate:
    1. Page loads (HTTP 200)
    2. No console errors or warnings
    3. No network failures
    4. Page title is correct
  `,

  /**
   * Form submission validation
   * 
   * Usage: Tell Copilot:
   * "Test calibration form submission with Browser MCP"
   */
  formSubmission: (path, formSelector, submitSelector) => `
    Navigate to http://localhost:3000${path}
    1. Fill form: ${formSelector}
    2. Click submit: ${submitSelector}
    3. Check console for errors
    4. Verify success response
    5. Check network tab for 200 status
  `,

  /**
   * Modal interaction validation
   * 
   * Usage: Tell Copilot:
   * "Test modal opens and closes without errors"
   */
  modalInteraction: (path, modalTriggerSelector) => `
    Navigate to http://localhost:3000${path}
    1. Click modal trigger: ${modalTriggerSelector}
    2. Wait for modal to appear
    3. Check console for Bootstrap errors
    4. Close modal (X or Escape)
    5. Verify no memory leaks in Performance tab
  `,

  /**
   * Webcam stream validation
   * 
   * Usage: Tell Copilot:
   * "Validate webcam stream displays correctly"
   */
  webcamStream: (path) => `
    Navigate to http://localhost:3000${path}
    1. Check console for MJPEG stream connection
    2. Verify img src="http://localhost:8090/?action=stream"
    3. Check Network tab for streaming response
    4. Take screenshot to verify frames render
    5. Check for CORS or network errors
  `,

  /**
   * Audio playback validation
   * 
   * Usage: Tell Copilot:
   * "Test TTS playback with Browser MCP"
   */
  audioPlayback: (path, playButtonSelector) => `
    Navigate to http://localhost:3000${path}
    1. Click play button: ${playButtonSelector}
    2. Check console for Web Audio API errors
    3. Verify fetch to /api/elevenlabs/* succeeds
    4. Check audio element <audio> is created
    5. Monitor console during playback
  `,

  /**
   * Navigation persistence validation
   * 
   * Usage: Tell Copilot:
   * "Verify character selection persists across navigation"
   */
  navigationPersistence: (startPath, endPath, stateKey) => `
    Navigate to http://localhost:3000${startPath}
    1. Select/change state: ${stateKey}
    2. Navigate to ${endPath}
    3. Check localStorage for ${stateKey}
    4. Verify state persisted correctly
    5. Check console for errors
  `,

  /**
   * Real-time WebSocket validation
   * 
   * Usage: Tell Copilot:
   * "Test conversation WebSocket with Browser MCP"
   */
  websocketConnection: (path, wsUrl) => `
    Navigate to http://localhost:3000${path}
    1. Open DevTools Network → WS tab
    2. Verify WebSocket connects to ${wsUrl}
    3. Check console for connection errors
    4. Send test message
    5. Verify response received
    6. Check for message format errors
  `,

  /**
   * Performance validation
   * 
   * Usage: Tell Copilot:
   * "Check page performance with Browser MCP"
   */
  performance: (path) => `
    Navigate to http://localhost:3000${path}
    1. Open DevTools Performance tab
    2. Record page load
    3. Check for long tasks (>50ms)
    4. Verify DOMContentLoaded < 1s
    5. Check for memory leaks (Heap snapshots)
    6. Report any red flags
  `,
};

/**
 * Expected MCP Tool Usage Patterns
 * 
 * These document how Copilot should use Browser MCP tools internally.
 */

export const MCPToolPatterns = {
  /**
   * Pattern: Navigate and check console
   */
  navigateAndCheckConsole: `
    1. mcp_microsoft_pla_browser_navigate({ url: 'http://localhost:3000/path' })
    2. mcp_microsoft_pla_browser_snapshot() // Get page structure
    3. mcp_microsoft_pla_browser_console_messages({ onlyErrors: true })
    4. If console.length > 0: FAIL with error details
    5. Else: PASS
  `,

  /**
   * Pattern: Click and validate
   */
  clickAndValidate: `
    1. mcp_microsoft_pla_browser_navigate({ url: '...' })
    2. mcp_microsoft_pla_browser_snapshot() // Find element ref
    3. mcp_microsoft_pla_browser_click({ ref: '...', element: 'Save button' })
    4. mcp_microsoft_pla_browser_wait_for({ time: 1 })
    5. mcp_microsoft_pla_browser_console_messages({ onlyErrors: true })
    6. mcp_microsoft_pla_browser_network_requests() // Check for 2xx
    7. Validate results
  `,

  /**
   * Pattern: Form fill and submit
   */
  formFillAndSubmit: `
    1. mcp_microsoft_pla_browser_navigate({ url: '...' })
    2. mcp_microsoft_pla_browser_snapshot()
    3. mcp_microsoft_pla_browser_fill_form({ 
         fields: [
           { ref: '...', name: 'Min Angle', type: 'textbox', value: '10' },
           { ref: '...', name: 'Max Angle', type: 'textbox', value: '170' }
         ]
       })
    4. mcp_microsoft_pla_browser_click({ ref: '...', element: 'Save' })
    5. mcp_microsoft_pla_browser_wait_for({ text: 'Saved successfully' })
    6. mcp_microsoft_pla_browser_console_messages({ onlyErrors: true })
    7. Assert no errors
  `,

  /**
   * Pattern: Screenshot comparison
   */
  screenshotComparison: `
    1. mcp_microsoft_pla_browser_navigate({ url: '...' })
    2. mcp_microsoft_pla_browser_take_screenshot({ 
         filename: 'baseline.png',
         fullPage: true
       })
    3. Make code change
    4. mcp_microsoft_pla_browser_navigate({ url: '...' })
    5. mcp_microsoft_pla_browser_take_screenshot({ 
         filename: 'updated.png',
         fullPage: true
       })
    6. Compare screenshots (Copilot can visually inspect)
    7. Report visual regressions
  `,
};

/**
 * Console Error Detection Rules
 * 
 * What counts as a "console error" that should fail tests.
 */

export const ConsoleErrorRules = {
  /**
   * Always fail on these
   */
  alwaysFail: [
    'Uncaught TypeError',
    'Uncaught ReferenceError',
    'Uncaught SyntaxError',
    'Failed to fetch',
    'NetworkError',
    'CORS error',
    'WebSocket connection failed',
    '404 Not Found',
    '500 Internal Server Error',
  ],

  /**
   * Ignore these benign warnings
   */
  ignore: [
    'Layout was forced before the page was fully loaded',
    '[Violation] Added non-passive event listener',
    'DevTools failed to load source map',
    'Resource interpreted as Stylesheet but transferred with MIME type text/html',
  ],

  /**
   * Warn but don't fail
   */
  warn: [
    'Deprecated API usage',
    'console.log is not allowed in production',
    'Performance: Long task detected',
  ],
};

/**
 * Example: Copilot validation workflow for calibration page
 * 
 * Human: "Validate the calibration page works correctly"
 * 
 * Copilot (internally):
 * 1. Navigate to /setup/calibration
 * 2. Take snapshot
 * 3. Check console
 * 4. Test form interactions
 * 5. Verify API responses
 * 6. Report results
 * 
 * Copilot (responds):
 * "✅ Calibration page validated:
 *  - No console errors
 *  - Form submission works
 *  - API returns success
 *  - Screenshot shows correct UI"
 */

export const ExampleValidations = {
  /**
   * Calibration page full validation
   */
  calibrationPage: async () => {
    // Pseudo-code for what Copilot does with Browser MCP
    
    // 1. Navigate
    await browser_navigate({ url: 'http://localhost:3000/setup/calibration' });
    
    // 2. Get page structure
    const snapshot = await browser_snapshot();
    
    // 3. Check console (should be empty)
    const errors = await browser_console_messages({ onlyErrors: true });
    if (errors.length > 0) {
      throw new Error(`Console errors detected: ${JSON.stringify(errors)}`);
    }
    
    // 4. Test character selection
    const characterSelect = snapshot.find(el => el.id === 'characterSelect');
    await browser_click({ ref: characterSelect.ref, element: 'Character select' });
    await browser_select_option({ 
      ref: characterSelect.ref, 
      element: 'Character select',
      values: ['3'] // Orlok
    });
    
    // 5. Test part selection
    const partSelect = snapshot.find(el => el.id === 'partSelect');
    await browser_select_option({
      ref: partSelect.ref,
      element: 'Part select',
      values: ['servo-jaw']
    });
    
    // 6. Test jog controls
    const jogUp = snapshot.find(el => el.id === 'jogUp');
    await browser_click({ ref: jogUp.ref, element: 'Jog Up button' });
    await browser_wait_for({ time: 0.5 });
    
    // 7. Check network requests
    const requests = await browser_network_requests();
    const jogRequest = requests.find(r => r.url.includes('/jog'));
    if (!jogRequest || jogRequest.status !== 200) {
      throw new Error('Jog API request failed');
    }
    
    // 8. Final console check
    const finalErrors = await browser_console_messages({ onlyErrors: true });
    if (finalErrors.length > 0) {
      throw new Error(`Console errors after interactions: ${JSON.stringify(finalErrors)}`);
    }
    
    // 9. Take screenshot for visual verification
    await browser_take_screenshot({ filename: 'calibration-validated.png' });
    
    return {
      success: true,
      message: 'Calibration page fully validated',
      consoleErrors: 0,
      networkErrors: 0,
    };
  },
};

/**
 * Integration with Playwright tests
 * 
 * Playwright tests already enforce console error detection via tests/test.setup.ts.
 * Browser MCP validation is complementary and used for:
 * - Quick ad-hoc validation during development
 * - Visual regression checks
 * - Performance profiling
 * - WebSocket/streaming validation
 */

export const PlaywrightIntegration = `
  Playwright tests (tests/playwright/*.spec.js) already:
  
  ✅ Fail on console errors
  ✅ Fail on HTTP 5xx
  ✅ Fail on network failures
  ✅ Fail on save endpoints without {success: true}
  
  Browser MCP adds:
  
  🔍 Visual inspection (screenshots)
  🔍 Performance profiling
  🔍 Real-time WebSocket debugging
  🔍 Ad-hoc validation without writing test code
  
  Use Browser MCP when:
  - Debugging a Playwright test failure
  - Validating a quick UI tweak
  - Checking console in a specific scenario
  - Taking screenshots for docs/issues
`;

/**
 * Summary: How to use Browser MCP for validation
 * 
 * 1. Make code change
 * 2. Run Playwright tests: npm run test:e2e
 * 3. If tests pass, validate with Copilot:
 *    "Navigate to /my/page and check for console errors"
 * 4. Copilot uses Browser MCP to validate
 * 5. Copilot reports results
 * 6. If all green, commit
 */

export default {
  MCPValidationPrompts,
  MCPToolPatterns,
  ConsoleErrorRules,
  ExampleValidations,
  PlaywrightIntegration,
};
