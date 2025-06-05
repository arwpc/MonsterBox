const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sshCredentials = require('../scripts/ssh-credentials');

// Load environment variables
require('dotenv').config();

const LOG_DIR = path.join(__dirname, '..', 'log');
const LINES_PER_PAGE = 100;

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';

        logger.debug(`Accessing logs page ${page} with search: "${search}"`);

        // Get list of log files
        const files = await fs.readdir(LOG_DIR);
        const logFiles = await Promise.all(
            files
                .filter(file => {
                    // Match both patterns: name.log and name-YYYY-MM-DD.log
                    return /^(combined|error|exceptions|rejections)(-\d{4}-\d{2}-\d{2})?\.log$/.test(file);
                })
                .map(async file => {
                    const stats = await fs.stat(path.join(LOG_DIR, file));
                    return { 
                        name: file, 
                        mtime: stats.mtime,
                        type: file.split(/[-\.]/)[0] // Extract log type (combined, error, etc)
                    };
                })
        );
        
        // Sort files by modification time, most recent first
        logFiles.sort((a, b) => b.mtime - a.mtime);

        if (logFiles.length === 0) {
            logger.warn('No log files found');
            return res.render('logs', {
                logs: ['No log files found. The application may not have generated any logs yet.'],
                currentPage: 1,
                totalPages: 1,
                search: search,
                error: 'No log files found'
            });
        }

        // Read content from all log files
        let allLogs = [];
        for (const file of logFiles) {
            const content = await fs.readFile(path.join(LOG_DIR, file.name), 'utf8');
            // Parse each line as JSON and format it
            const lines = content.split('\n')
                .filter(line => line.trim() !== '')
                .map(line => {
                    try {
                        const parsed = JSON.parse(line);
                        return `[${parsed.timestamp}] ${parsed.level}: ${parsed.message}`;
                    } catch (e) {
                        // If JSON parsing fails, try to format it nicely anyway
                        return line.includes('timestamp') ? line : `[LOG] ${line}`;
                    }
                });
            
            // Add file type header
            allLogs.push(`=== ${file.type.toUpperCase()} LOGS (${file.name}) ===`);
            allLogs = allLogs.concat(lines);
            allLogs.push(''); // Empty line between different log files
        }

        // Reverse to show newest logs first
        allLogs.reverse();

        let filteredLogs = allLogs;
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filteredLogs = allLogs.filter(line => searchRegex.test(line));
            logger.debug(`Filtered logs for search "${search}". Found ${filteredLogs.length} matching lines.`);
        }

        const totalPages = Math.ceil(filteredLogs.length / LINES_PER_PAGE);
        const startIndex = (page - 1) * LINES_PER_PAGE;
        const endIndex = startIndex + LINES_PER_PAGE;
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

        logger.debug(`Rendering logs page ${page} of ${totalPages}`);

        res.render('logs', {
            logs: paginatedLogs,
            currentPage: page,
            totalPages: totalPages,
            search: search
        });
    } catch (error) {
        logger.error('Error reading log files:', error);
        res.status(500).render('logs', {
            logs: ['An error occurred while reading the log files.'],
            currentPage: 1,
            totalPages: 1,
            search: '',
            error: error.message
        });
    }
});

router.post('/clear', async (req, res) => {
    try {
        logger.info('Attempting to clear all log files');

        const files = await fs.readdir(LOG_DIR);
        const logFiles = files.filter(file => {
            return /^(combined|error|exceptions|rejections)(-\d{4}-\d{2}-\d{2})?\.log$/.test(file);
        });

        for (const file of logFiles) {
            await fs.writeFile(path.join(LOG_DIR, file), '', 'utf8');
            logger.debug(`Cleared contents of log file: ${file}`);
        }

        logger.info('All log files have been cleared successfully');
        res.json({ success: true, message: 'All logs cleared successfully' });
    } catch (error) {
        logger.error('Error clearing log files:', error);
        res.status(500).json({ success: false, error: 'Failed to clear logs: ' + error.message });
    }
});

// ===== MCP LOG COLLECTION ENDPOINTS =====

// Browser log collection endpoint
router.post('/browser', async (req, res) => {
    try {
        const { logs, session, timestamp } = req.body;

        if (!logs || !Array.isArray(logs)) {
            return res.status(400).json({ error: 'Invalid logs format' });
        }

        // Process and store browser logs
        const processedLogs = logs.map(log => ({
            ...log,
            source: 'browser',
            sessionId: session?.sessionId,
            receivedAt: new Date().toISOString(),
            clientTimestamp: log.timestamp
        }));

        // Log to Winston
        processedLogs.forEach(log => {
            const logLevel = log.level === 'error' || log.type.includes('error') ? 'error' :
                           log.level === 'warn' ? 'warn' : 'info';

            logger[logLevel]('Browser log collected', {
                type: log.type,
                message: log.message,
                url: log.url,
                sessionId: log.sessionId,
                timestamp: log.timestamp
            });
        });

        // Store in dedicated browser log file
        await storeBrowserLogs(processedLogs);

        res.json({
            success: true,
            received: logs.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to process browser logs', { error: error.message });
        res.status(500).json({ error: 'Failed to process logs' });
    }
});

// System log collection endpoint
router.get('/system', async (req, res) => {
    try {
        const { source = 'local', lines = 100, since } = req.query;

        let logs = {};

        if (source === 'local') {
            logs = await collectLocalSystemLogs(lines, since);
        } else {
            logs = await collectRemoteSystemLogs(source, lines, since);
        }

        res.json({
            success: true,
            source: source,
            logs: logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to collect system logs', { error: error.message });
        res.status(500).json({ error: 'Failed to collect system logs' });
    }
});

// RPI log collection endpoint
router.get('/rpi/:host', async (req, res) => {
    try {
        const { host } = req.params;
        const { lines = 100, service } = req.query;

        const logs = await collectRPiLogs(host, lines, service);

        res.json({
            success: true,
            host: host,
            logs: logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to collect RPI logs', {
            error: error.message,
            host: req.params.host
        });
        res.status(500).json({ error: 'Failed to collect RPI logs' });
    }
});

// MonsterBox application logs API
router.get('/application', async (req, res) => {
    try {
        const { level = 'info', since, file } = req.query;

        const logs = await collectApplicationLogs(level, since, file);

        res.json({
            success: true,
            logs: logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to collect application logs', { error: error.message });
        res.status(500).json({ error: 'Failed to collect application logs' });
    }
});

// Log analysis endpoint
router.post('/analyze', async (req, res) => {
    try {
        const { sources, pattern, timeRange } = req.body;

        const analysis = await analyzeLogs(sources, pattern, timeRange);

        res.json({
            success: true,
            analysis: analysis,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to analyze logs', { error: error.message });
        res.status(500).json({ error: 'Failed to analyze logs' });
    }
});

// Real-time log streaming endpoint
router.get('/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const { source = 'application' } = req.query;

    const streamId = setupLogStream(source, (logData) => {
        res.write(`data: ${JSON.stringify(logData)}\n\n`);
    });

    req.on('close', () => {
        cleanupLogStream(streamId);
    });
});

// ===== HELPER FUNCTIONS =====

async function storeBrowserLogs(logs) {
    const browserLogFile = path.join(LOG_DIR, 'browser.log');

    try {
        await fs.mkdir(LOG_DIR, { recursive: true });

        const logEntries = logs.map(log => JSON.stringify(log)).join('\n') + '\n';
        await fs.appendFile(browserLogFile, logEntries);

    } catch (error) {
        logger.error('Failed to store browser logs', { error: error.message });
    }
}

async function collectLocalSystemLogs(lines, since) {
    const logs = {};

    try {
        const logCommands = {
            system: `journalctl -n ${lines} --no-pager`,
            auth: `journalctl -u ssh -n ${lines} --no-pager`,
            kernel: `journalctl -k -n ${lines} --no-pager`
        };

        if (since) {
            Object.keys(logCommands).forEach(key => {
                logCommands[key] += ` --since "${since}"`;
            });
        }

        for (const [type, command] of Object.entries(logCommands)) {
            try {
                const { stdout } = await execAsync(command);
                logs[type] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[type] = [`Error collecting ${type} logs: ${error.message}`];
            }
        }

    } catch (error) {
        throw new Error(`Failed to collect local system logs: ${error.message}`);
    }

    return logs;
}

async function collectRemoteSystemLogs(host, lines, since) {
    const logs = {};

    try {
        const journalCmd = `sudo journalctl -n ${lines} --no-pager`;
        const sinceFlag = since ? ` --since '${since}'` : '';
        const baseCommand = journalCmd + sinceFlag;

        const logCommands = {
            system: sshCredentials.buildSSHCommandByHost(host, baseCommand, { batchMode: false }),
            auth: sshCredentials.buildSSHCommandByHost(host, `${baseCommand} -u ssh`, { batchMode: false }),
            kernel: sshCredentials.buildSSHCommandByHost(host, `${baseCommand} -k`, { batchMode: false })
        };

        for (const [type, command] of Object.entries(logCommands)) {
            try {
                const { stdout } = await execAsync(command);
                logs[type] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[type] = [`Error collecting ${type} logs from ${host}: ${error.message}`];
            }
        }

    } catch (error) {
        throw new Error(`Failed to collect remote system logs from ${host}: ${error.message}`);
    }

    return logs;
}

async function collectRPiLogs(host, lines, service) {
    try {
        let journalCmd = `sudo journalctl -n ${lines} --no-pager`;

        if (service) {
            journalCmd += ` -u ${service}`;
        }

        const command = sshCredentials.buildSSHCommandByHost(host, journalCmd, { batchMode: false });

        const { stdout } = await execAsync(command);

        return {
            raw: stdout,
            lines: stdout.split('\n').filter(line => line.trim()),
            service: service || 'all',
            host: host
        };

    } catch (error) {
        throw new Error(`Failed to collect RPI logs from ${host}: ${error.message}`);
    }
}

async function collectApplicationLogs(level, since, file) {
    try {
        const files = await fs.readdir(LOG_DIR);
        const logFiles = file ? [file] : files.filter(f => f.endsWith('.log'));

        const logs = {};

        for (const logFile of logFiles) {
            try {
                const content = await fs.readFile(path.join(LOG_DIR, logFile), 'utf8');
                const lines = content.split('\n').filter(line => {
                    if (!line.trim()) return false;

                    if (level === 'error' && !line.includes('"level":"error"')) return false;
                    if (level === 'warn' && !line.includes('"level":"warn"') && !line.includes('"level":"error"')) return false;

                    if (since) {
                        const sinceDate = new Date(since);
                        try {
                            const logData = JSON.parse(line);
                            const logDate = new Date(logData.timestamp);
                            return logDate >= sinceDate;
                        } catch {
                            return true;
                        }
                    }

                    return true;
                });

                logs[logFile] = lines;
            } catch (error) {
                logs[logFile] = [`Error reading ${logFile}: ${error.message}`];
            }
        }

        return logs;

    } catch (error) {
        throw new Error(`Failed to collect application logs: ${error.message}`);
    }
}

async function analyzeLogs(sources, pattern, timeRange) {
    const analysis = {
        timestamp: new Date().toISOString(),
        sources: sources || [],
        pattern: pattern,
        timeRange: timeRange,
        findings: [],
        summary: {
            totalLogs: 0,
            errors: 0,
            warnings: 0,
            patterns: 0
        }
    };

    if (sources && sources.includes('application')) {
        try {
            const appLogs = await collectApplicationLogs('info');

            Object.entries(appLogs).forEach(([file, lines]) => {
                analysis.summary.totalLogs += lines.length;

                lines.forEach(line => {
                    if (line.includes('"level":"error"')) analysis.summary.errors++;
                    if (line.includes('"level":"warn"')) analysis.summary.warnings++;
                    if (pattern && line.includes(pattern)) analysis.summary.patterns++;
                });
            });

        } catch (error) {
            analysis.findings.push({
                type: 'error',
                message: `Failed to analyze application logs: ${error.message}`
            });
        }
    }

    analysis.findings.push({
        type: 'info',
        message: `Analysis completed for ${sources?.length || 0} sources`
    });

    return analysis;
}

// Log streaming helpers
const activeStreams = new Map();
let streamCounter = 0;

function setupLogStream(source, callback) {
    const streamId = ++streamCounter;

    const watcher = {
        id: streamId,
        source: source,
        callback: callback
    };

    activeStreams.set(streamId, watcher);

    callback({
        type: 'connection',
        message: `Connected to ${source} log stream`,
        timestamp: new Date().toISOString()
    });

    return streamId;
}

function cleanupLogStream(streamId) {
    const stream = activeStreams.get(streamId);
    if (stream) {
        activeStreams.delete(streamId);
        logger.info('Log stream closed', { streamId, source: stream.source });
    }
}

module.exports = router;
