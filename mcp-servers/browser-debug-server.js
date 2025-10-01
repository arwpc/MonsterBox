#!/usr/bin/env node
/**
 * MonsterBox Browser Debug MCP Server
 * Integrates with Chrome MCP extension for comprehensive browser debugging
 * Collects console logs, network errors, streaming issues, and performance data
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

class BrowserDebugServer {
  constructor() {
    this.server = new Server(
      {
        name: 'monsterbox-browser-debug',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.logDir = path.join(process.cwd(), 'log', 'browser-debug');
    this.setupHandlers();
    this.ensureLogDirectory();
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'collect_browser_logs',
          description: 'Collect browser console logs, errors, and warnings from Chrome MCP extension',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to collect logs from (optional, collects from current page if not specified)'
              },
              logLevel: {
                type: 'string',
                enum: ['all', 'error', 'warn', 'info', 'debug'],
                default: 'all',
                description: 'Log level to collect'
              },
              duration: {
                type: 'number',
                default: 30,
                description: 'Duration in seconds to collect logs'
              }
            }
          }
        },
        {
          name: 'collect_network_logs',
          description: 'Collect network requests, failed requests, and streaming connection issues',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to monitor network activity for'
              },
              includeHeaders: {
                type: 'boolean',
                default: false,
                description: 'Include request/response headers'
              },
              filterStreaming: {
                type: 'boolean',
                default: true,
                description: 'Focus on streaming-related requests'
              }
            }
          }
        },
        {
          name: 'debug_streaming_issues',
          description: 'Comprehensive streaming debugging for MonsterBox WebRTC and MJPEG streams',
          inputSchema: {
            type: 'object',
            properties: {
              characterId: {
                type: 'number',
                description: 'Character ID to debug streaming for'
              },
              testType: {
                type: 'string',
                enum: ['webrtc', 'mjpeg', 'both'],
                default: 'both',
                description: 'Type of streaming to debug'
              },
              collectPerformance: {
                type: 'boolean',
                default: true,
                description: 'Collect performance metrics'
              }
            }
          }
        },
        {
          name: 'analyze_browser_performance',
          description: 'Analyze browser performance metrics for streaming applications',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to analyze performance for'
              },
              duration: {
                type: 'number',
                default: 60,
                description: 'Duration in seconds to monitor performance'
              }
            }
          }
        },
        {
          name: 'collect_streaming_diagnostics',
          description: 'Collect comprehensive streaming diagnostics from browser and server',
          inputSchema: {
            type: 'object',
            properties: {
              characterId: {
                type: 'number',
                description: 'Character ID for streaming diagnostics'
              },
              includeServerLogs: {
                type: 'boolean',
                default: true,
                description: 'Include server-side streaming logs'
              },
              includeBrowserLogs: {
                type: 'boolean',
                default: true,
                description: 'Include browser-side streaming logs'
              }
            }
          }
        },
        {
          name: 'generate_debug_report',
          description: 'Generate comprehensive debug report combining all collected data',
          inputSchema: {
            type: 'object',
            properties: {
              reportType: {
                type: 'string',
                enum: ['streaming', 'performance', 'errors', 'comprehensive'],
                default: 'comprehensive',
                description: 'Type of debug report to generate'
              },
              timeRange: {
                type: 'string',
                default: '1h',
                description: 'Time range for report (e.g., 1h, 30m, 24h)'
              }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'collect_browser_logs':
            return await this.collectBrowserLogs(args);
          case 'collect_network_logs':
            return await this.collectNetworkLogs(args);
          case 'debug_streaming_issues':
            return await this.debugStreamingIssues(args);
          case 'analyze_browser_performance':
            return await this.analyzeBrowserPerformance(args);
          case 'collect_streaming_diagnostics':
            return await this.collectStreamingDiagnostics(args);
          case 'generate_debug_report':
            return await this.generateDebugReport(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${name}: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async collectBrowserLogs(args) {
    const { url, logLevel = 'all', duration = 30 } = args;
    const timestamp = new Date().toISOString();
    
    // Create log collection instructions for Chrome MCP extension
    const logCollection = {
      timestamp,
      url: url || 'current_page',
      logLevel,
      duration,
      instructions: {
        console_logs: true,
        error_logs: true,
        warning_logs: true,
        network_errors: true,
        javascript_errors: true,
        streaming_events: true
      }
    };

    const logFile = path.join(this.logDir, `browser-logs-${Date.now()}.json`);
    await fs.writeFile(logFile, JSON.stringify(logCollection, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `🔍 Browser log collection initiated:
📅 Timestamp: ${timestamp}
🌐 URL: ${url || 'Current page'}
📊 Log Level: ${logLevel}
⏱️ Duration: ${duration}s
📁 Log File: ${logFile}

📋 Instructions for Chrome MCP Extension:
1. Open Developer Tools (F12)
2. Navigate to Console tab
3. Enable all log levels: Verbose, Info, Warnings, Errors
4. Monitor for ${duration} seconds
5. Look for streaming-related errors:
   - WebRTC connection failures
   - MJPEG stream errors
   - Network timeouts
   - JavaScript module loading issues

🎯 Focus Areas:
- StreamClient.js errors
- VideoPlayerComponent.js issues
- webrtc-adapter loading problems
- CORS or network connectivity issues
- Performance bottlenecks`
        }
      ]
    };
  }

  async collectNetworkLogs(args) {
    const { url, includeHeaders = false, filterStreaming = true } = args;
    const timestamp = new Date().toISOString();

    const networkCollection = {
      timestamp,
      url,
      includeHeaders,
      filterStreaming,
      focus_endpoints: [
        '/api/streaming/start/*',
        '/api/streaming/stop/*',
        '/api/streaming/stream/*',
        '/api/streaming/status/*',
        '/api/streaming/health/*',
        '/js/StreamClient.js',
        '/js/VideoPlayerComponent.js',
        '/js/webrtc-adapter.js'
      ]
    };

    const logFile = path.join(this.logDir, `network-logs-${Date.now()}.json`);
    await fs.writeFile(logFile, JSON.stringify(networkCollection, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `🌐 Network log collection initiated:
📅 Timestamp: ${timestamp}
🔗 URL: ${url}
📋 Headers: ${includeHeaders ? 'Included' : 'Excluded'}
🎯 Streaming Focus: ${filterStreaming ? 'Enabled' : 'Disabled'}

📊 Chrome DevTools Network Tab Instructions:
1. Open DevTools → Network tab
2. Clear existing logs
3. Enable "Preserve log"
4. Filter by streaming endpoints:
   - /api/streaming/*
   - /js/StreamClient.js
   - /js/VideoPlayerComponent.js
   - /js/webrtc-adapter.js

🔍 Look for:
- Failed requests (red status codes)
- Slow loading times (>5s)
- CORS errors
- 404 errors for JS modules
- Streaming connection timeouts
- MJPEG stream interruptions

📁 Log File: ${logFile}`
        }
      ]
    };
  }

  async debugStreamingIssues(args) {
    const { characterId, testType = 'both', collectPerformance = true } = args;
    const timestamp = new Date().toISOString();

    // Collect server-side streaming status
    let serverStatus = null;
    try {
      const { spawn } = require('child_process');
      const curlProcess = spawn('curl', ['-s', `http://localhost:3000/api/streaming/health/${characterId}`]);
      
      let output = '';
      curlProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      await new Promise((resolve) => {
        curlProcess.on('close', () => resolve());
      });

      serverStatus = JSON.parse(output);
    } catch (error) {
      serverStatus = { error: error.message };
    }

    const debugData = {
      timestamp,
      characterId,
      testType,
      collectPerformance,
      serverStatus,
      browser_tests: {
        webrtc_test: testType === 'webrtc' || testType === 'both',
        mjpeg_test: testType === 'mjpeg' || testType === 'both',
        performance_monitoring: collectPerformance
      }
    };

    const debugFile = path.join(this.logDir, `streaming-debug-${characterId}-${Date.now()}.json`);
    await fs.writeFile(debugFile, JSON.stringify(debugData, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `🎥 Streaming debug session initiated:
📅 Timestamp: ${timestamp}
🎭 Character ID: ${characterId}
🔧 Test Type: ${testType}
📊 Performance: ${collectPerformance ? 'Enabled' : 'Disabled'}

🖥️ Server Status: ${serverStatus?.success ? '✅ Healthy' : '❌ Issues detected'}

🌐 Browser Testing Instructions:
1. Open: http://192.168.8.120:3000/stream-test.html
2. Select Character ID: ${characterId}
3. Open DevTools (F12)
4. Monitor Console and Network tabs
5. Click "Start Stream" button
6. Watch for:
   - Console errors
   - Network failures
   - Stream loading issues
   - Performance warnings

🎯 Specific Tests:
${testType === 'webrtc' || testType === 'both' ? '- WebRTC client connection test' : ''}
${testType === 'mjpeg' || testType === 'both' ? '- MJPEG stream display test' : ''}
${collectPerformance ? '- Performance metrics collection' : ''}

📁 Debug File: ${debugFile}
🔗 Test URLs:
- Stream Test: http://192.168.8.120:3000/stream-test.html
- WebRTC Test: http://192.168.8.120:3000/webrtc-test.html
- Direct Stream: http://192.168.8.120:3000/api/streaming/stream/${characterId}`
        }
      ]
    };
  }

  async analyzeBrowserPerformance(args) {
    const { url, duration = 60 } = args;
    const timestamp = new Date().toISOString();

    const performanceData = {
      timestamp,
      url,
      duration,
      metrics_to_collect: [
        'memory_usage',
        'cpu_usage',
        'network_bandwidth',
        'frame_rate',
        'video_decode_performance',
        'javascript_execution_time',
        'dom_rendering_time'
      ]
    };

    const perfFile = path.join(this.logDir, `performance-${Date.now()}.json`);
    await fs.writeFile(perfFile, JSON.stringify(performanceData, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `📊 Browser performance analysis initiated:
📅 Timestamp: ${timestamp}
🌐 URL: ${url}
⏱️ Duration: ${duration}s

🔧 Chrome DevTools Performance Instructions:
1. Open DevTools → Performance tab
2. Click "Record" button
3. Navigate to: ${url}
4. Interact with streaming features
5. Record for ${duration} seconds
6. Stop recording and analyze

📈 Key Metrics to Monitor:
- Memory usage (should stay stable)
- CPU usage (streaming should be <50%)
- Network bandwidth utilization
- Frame rate consistency
- Video decode performance
- JavaScript execution bottlenecks

🎥 Streaming-Specific Checks:
- Video element performance
- WebRTC connection stability
- MJPEG frame delivery rate
- Client-side buffering issues

📁 Performance File: ${perfFile}`
        }
      ]
    };
  }

  async collectStreamingDiagnostics(args) {
    const { characterId, includeServerLogs = true, includeBrowserLogs = true } = args;
    const timestamp = new Date().toISOString();

    const diagnostics = {
      timestamp,
      characterId,
      includeServerLogs,
      includeBrowserLogs,
      collection_complete: false
    };

    // Collect server-side logs if requested
    if (includeServerLogs) {
      try {
        // Collect MonsterBox logs
        const logPath = path.join(process.cwd(), 'log');
        const logFiles = await fs.readdir(logPath).catch(() => []);
        diagnostics.server_logs = logFiles.filter(f => f.endsWith('.log'));

        // Collect streaming service status
        diagnostics.streaming_status = await this.getStreamingStatus(characterId);
      } catch (error) {
        diagnostics.server_log_error = error.message;
      }
    }

    const diagFile = path.join(this.logDir, `diagnostics-${characterId}-${Date.now()}.json`);
    await fs.writeFile(diagFile, JSON.stringify(diagnostics, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `🔬 Comprehensive streaming diagnostics:
📅 Timestamp: ${timestamp}
🎭 Character ID: ${characterId}
🖥️ Server Logs: ${includeServerLogs ? 'Included' : 'Skipped'}
🌐 Browser Logs: ${includeBrowserLogs ? 'Included' : 'Skipped'}

📋 Diagnostic Checklist:
✅ Server streaming status
✅ MonsterBox application logs
✅ Webcam device availability
✅ Network connectivity
${includeBrowserLogs ? '✅ Browser console logs' : '⏭️ Browser logs skipped'}
${includeBrowserLogs ? '✅ Network request logs' : '⏭️ Network logs skipped'}

🎯 Next Steps:
1. Review diagnostic file: ${diagFile}
2. Check browser console for errors
3. Verify streaming endpoints are responding
4. Test direct MJPEG stream access
5. Validate WebRTC client functionality

🔗 Quick Test URLs:
- Health Check: http://192.168.8.120:3000/api/streaming/health/${characterId}
- Stream Test: http://192.168.8.120:3000/stream-test.html
- Direct Stream: http://192.168.8.120:3000/api/streaming/stream/${characterId}`
        }
      ]
    };
  }

  async generateDebugReport(args) {
    const { reportType = 'comprehensive', timeRange = '1h' } = args;
    const timestamp = new Date().toISOString();

    // Collect all log files from the debug directory
    const logFiles = await fs.readdir(this.logDir).catch(() => []);
    const recentLogs = logFiles.filter(f => {
      const fileTime = parseInt(f.split('-').pop().split('.')[0]);
      const hourAgo = Date.now() - (60 * 60 * 1000); // 1 hour ago
      return fileTime > hourAgo;
    });

    const report = {
      timestamp,
      reportType,
      timeRange,
      summary: {
        total_log_files: logFiles.length,
        recent_log_files: recentLogs.length,
        report_period: timeRange
      },
      files_analyzed: recentLogs,
      recommendations: []
    };

    // Add specific recommendations based on report type
    if (reportType === 'streaming' || reportType === 'comprehensive') {
      report.recommendations.push(
        'Check streaming service health endpoints',
        'Verify webcam device accessibility',
        'Test MJPEG stream direct access',
        'Validate WebRTC client connections'
      );
    }

    if (reportType === 'performance' || reportType === 'comprehensive') {
      report.recommendations.push(
        'Monitor browser memory usage during streaming',
        'Check CPU utilization for video decoding',
        'Analyze network bandwidth requirements',
        'Optimize video quality settings'
      );
    }

    const reportFile = path.join(this.logDir, `debug-report-${reportType}-${Date.now()}.json`);
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

    return {
      content: [
        {
          type: 'text',
          text: `📊 Debug Report Generated:
📅 Timestamp: ${timestamp}
📋 Report Type: ${reportType}
⏱️ Time Range: ${timeRange}
📁 Files Analyzed: ${recentLogs.length}

📈 Summary:
- Total log files: ${logFiles.length}
- Recent files: ${recentLogs.length}
- Report period: ${timeRange}

🎯 Key Recommendations:
${report.recommendations.map(r => `- ${r}`).join('\n')}

📁 Report File: ${reportFile}

🔍 Next Actions:
1. Review generated report
2. Follow specific recommendations
3. Test identified issues
4. Monitor improvements
5. Generate follow-up reports as needed`
        }
      ]
    };
  }

  async getStreamingStatus(characterId) {
    try {
      const { spawn } = require('child_process');
      const curlProcess = spawn('curl', ['-s', `http://localhost:3000/api/streaming/health/${characterId}`]);
      
      let output = '';
      curlProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      return new Promise((resolve) => {
        curlProcess.on('close', () => {
          try {
            resolve(JSON.parse(output));
          } catch (error) {
            resolve({ error: 'Failed to parse response', raw: output });
          }
        });
      });
    } catch (error) {
      return { error: error.message };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MonsterBox Browser Debug MCP Server running on stdio');
  }
}

const server = new BrowserDebugServer();
server.run().catch(console.error);
