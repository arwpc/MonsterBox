#!/usr/bin/env node
/**
 * MonsterBox Server with Integrated Webcam Functionality
 * Complete working server for RPI4b deployment
 */

const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Initialize Express app
const app = express();

// SSL Certificate configuration
let sslConfig = null;
let httpsServer = null;

// Try to load SSL certificates
try {
    const sslConfigPath = '/etc/ssl/monsterbox/ssl-config.json';
    if (fs.existsSync(sslConfigPath)) {
        const sslConfigData = fs.readFileSync(sslConfigPath, 'utf8');
        sslConfig = JSON.parse(sslConfigData);

        // Load SSL certificates
        const privateKey = fs.readFileSync(sslConfig.certificates.key, 'utf8');
        const certificate = fs.readFileSync(sslConfig.certificates.cert, 'utf8');

        const credentials = {
            key: privateKey,
            cert: certificate
        };

        // Create HTTPS server
        httpsServer = https.createServer(credentials, app);
        log('🔐 SSL certificates loaded successfully for webcam server');
    }
} catch (sslError) {
    log(`⚠️ SSL certificates not available for webcam server, running HTTP only: ${sslError.message}`, 'warn');
}

// Create HTTP server (always available)
const server = http.createServer(app);
const port = process.env.PORT || 80;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Global variables for stream management
let activeStreams = new Map();
let streamClients = new Map();

// Utility function to log with timestamp
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
}

// Load character data
function loadCharacterData() {
    try {
        const charactersData = fs.readFileSync('./data/characters.json', 'utf8');
        const partsData = fs.readFileSync('./data/parts.json', 'utf8');

        const characters = JSON.parse(charactersData);
        const parts = JSON.parse(partsData);

        return { characters, parts };
    } catch (error) {
        log(`Error loading data: ${error.message}`, 'error');
        return { characters: [], parts: [] };
    }
}

// Get webcam for character
function getWebcamForCharacter(characterId) {
    const { characters, parts } = loadCharacterData();

    const character = characters.find(c => c.id === parseInt(characterId));
    if (!character) return null;

    const webcam = parts.find(p =>
        p.characterId === parseInt(characterId) &&
        p.type === 'webcam'
    );

    if (!webcam) return null;

    // Parse resolution if it exists (e.g., "1280x720")
    let width = 640, height = 480;
    if (webcam.resolution) {
        const [w, h] = webcam.resolution.split('x').map(Number);
        if (w && h) {
            width = w;
            height = h;
        }
    }

    // Return webcam with normalized properties
    return {
        ...webcam,
        width: width,
        height: height,
        fps: webcam.fps || 30
    };
}

// Stop conflicting camera processes
async function stopConflictingCameraProcesses(devicePath) {
    const deviceId = devicePath.replace('/dev/video', '');
    log(`Checking for conflicting processes using camera ${deviceId}`);

    try {
        const { spawn } = require('child_process');

        // Find processes using the camera device
        const psProcess = spawn('ps', ['aux']);
        const grepProcess = spawn('grep', ['-E', `(webcam|camera|video${deviceId})`]);
        const grep2Process = spawn('grep', ['-v', 'grep']);

        psProcess.stdout.pipe(grepProcess.stdin);
        grepProcess.stdout.pipe(grep2Process.stdin);

        let output = '';
        grep2Process.stdout.on('data', (data) => {
            output += data.toString();
        });

        return new Promise((resolve) => {
            grep2Process.on('close', () => {
                const lines = output.split('\n').filter(line => line.trim());
                const pidsToKill = [];

                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length > 1) {
                        const pid = parts[1];
                        if (pid && !isNaN(pid)) {
                            pidsToKill.push(pid);
                        }
                    }
                });

                if (pidsToKill.length > 0) {
                    log(`Found ${pidsToKill.length} conflicting processes, stopping them`);
                    pidsToKill.forEach(pid => {
                        try {
                            process.kill(pid, 'SIGTERM');
                            log(`Stopped process ${pid}`);
                        } catch (error) {
                            log(`Failed to stop process ${pid}: ${error.message}`, 'error');
                        }
                    });

                    // Wait a moment for processes to stop
                    setTimeout(resolve, 1000);
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        log(`Error checking for conflicting processes: ${error.message}`, 'error');
    }
}

// Start webcam stream process
function startWebcamStream(characterId, webcam) {
    log(`Starting webcam stream for character ${characterId}`);

    try {
        // Webcam streaming is now handled by the WebSocket webcam service
        log(`Webcam streaming migrated to WebSocket service on port 8774`, 'info');

        // This functionality is deprecated - use the WebSocket webcam service instead
        throw new Error('Webcam streaming migrated to WebSocket service. Use ws://localhost:8774 instead.');

        log(`Stream process started for character ${characterId}`);

        // Store stream info
        activeStreams.set(characterId, {
            process: streamProcess,
            startTime: new Date(),
            webcam: webcam
        });

        // Handle process events
        streamProcess.on('error', (error) => {
            log(`Stream process error for character ${characterId}: ${error.message}`, 'error');
            activeStreams.delete(characterId);
        });

        streamProcess.on('close', (code) => {
            log(`Stream process closed for character ${characterId} with code ${code}`);
            activeStreams.delete(characterId);
        });

        return streamProcess;

    } catch (error) {
        log(`Error starting stream for character ${characterId}: ${error.message}`, 'error');
        return null;
    }
}

// API Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'MonsterBox Webcam Server',
        activeStreams: activeStreams.size,
        timestamp: new Date().toISOString()
    });
});

// Webcam detection
app.get('/api/webcam/detect', async (req, res) => {
    log('Webcam detection requested');

    try {
        const scriptPath = path.join(__dirname, 'scripts', 'webcam_detect.py');
        const detectProcess = spawn('python3', [scriptPath]);

        let output = '';
        let error = '';

        detectProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        detectProcess.stderr.on('data', (data) => {
            error += data.toString();
        });

        detectProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    // Parse JSON from output
                    const jsonMatch = output.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const result = JSON.parse(jsonMatch[0]);
                        res.json(result);
                    } else {
                        res.json({ success: false, error: 'No JSON output found' });
                    }
                } catch (parseError) {
                    res.json({ success: false, error: 'Failed to parse detection result' });
                }
            } else {
                res.json({ success: false, error: error || 'Detection failed' });
            }
        });

    } catch (error) {
        log(`Webcam detection error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stream status
app.get('/api/streaming/status/:characterId', (req, res) => {
    const characterId = req.params.characterId;
    const webcam = getWebcamForCharacter(characterId);

    if (!webcam) {
        return res.json({
            success: false,
            error: 'No webcam configured for this character'
        });
    }

    const streamInfo = activeStreams.get(characterId);
    const isActive = streamInfo && streamInfo.process && !streamInfo.process.killed;

    res.json({
        success: true,
        characterId: parseInt(characterId),
        webcam: webcam,
        streaming: isActive,
        startTime: streamInfo ? streamInfo.startTime : null,
        clients: streamClients.get(characterId) ? streamClients.get(characterId).size : 0
    });
});

// Start stream
app.post('/api/streaming/start/:characterId', async (req, res) => {
    const characterId = req.params.characterId;
    const webcam = getWebcamForCharacter(characterId);

    if (!webcam) {
        return res.json({
            success: false,
            error: 'No webcam configured for this character'
        });
    }

    // Check if already streaming
    const existingStream = activeStreams.get(characterId);
    if (existingStream && existingStream.process && !existingStream.process.killed) {
        return res.json({
            success: true,
            message: 'Stream already active',
            characterId: parseInt(characterId)
        });
    }

    // Stop any conflicting camera processes before starting
    await stopConflictingCameraProcesses(webcam.devicePath);

    // Start new stream
    const streamProcess = startWebcamStream(characterId, webcam);

    if (streamProcess) {
        res.json({
            success: true,
            message: 'Stream started',
            characterId: parseInt(characterId)
        });
    } else {
        res.json({
            success: false,
            error: 'Failed to start stream'
        });
    }
});

// Stream endpoint
app.get('/api/streaming/stream/:characterId', (req, res) => {
    const characterId = req.params.characterId;
    const webcam = getWebcamForCharacter(characterId);

    if (!webcam) {
        return res.status(404).send('No webcam configured for this character');
    }

    log(`New stream client for character ${characterId}`);

    // Set MJPEG headers
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Start stream if not already active
    let streamInfo = activeStreams.get(characterId);
    if (!streamInfo || !streamInfo.process || streamInfo.process.killed) {
        const streamProcess = startWebcamStream(characterId, webcam);
        if (!streamProcess) {
            return res.status(500).send('Failed to start stream');
        }
        streamInfo = activeStreams.get(characterId);
    }

    // Add client to stream clients
    if (!streamClients.has(characterId)) {
        streamClients.set(characterId, new Set());
    }
    streamClients.get(characterId).add(res);

    // Pipe stream data to client
    streamInfo.process.stdout.pipe(res, { end: false });

    // Handle client disconnect
    res.on('close', () => {
        log(`Stream client disconnected for character ${characterId}`);
        const clients = streamClients.get(characterId);
        if (clients) {
            clients.delete(res);
            if (clients.size === 0) {
                log(`No more clients for character ${characterId}, stopping stream`);
                const stream = activeStreams.get(characterId);
                if (stream && stream.process && !stream.process.killed) {
                    stream.process.kill();
                }
                activeStreams.delete(characterId);
                streamClients.delete(characterId);
            }
        }
    });
});

// Main interface
app.get('/', (req, res) => {
    const { characters } = loadCharacterData();

    const characterOptions = characters
        .filter(c => getWebcamForCharacter(c.id))
        .map(c => `<option value="${c.id}">${c.char_name}</option>`)
        .join('');

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>🎭 MonsterBox Webcam System</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: white; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .controls { background: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .stream-container { text-align: center; margin: 20px 0; }
        img { max-width: 100%; border: 2px solid #333; border-radius: 8px; }
        select, button { padding: 10px; margin: 5px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; }
        button { background: #007bff; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
        .success { background: #28a745; }
        .error { background: #dc3545; }
        .info { background: #17a2b8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎭 MonsterBox Webcam System</h1>
            <p>Live streaming from animatronic characters</p>
        </div>
        
        <div class="controls">
            <label for="characterSelect">Select Character:</label>
            <select id="characterSelect">
                ${characterOptions}
            </select>
            <button onclick="loadStream()">Load Stream</button>
            <button onclick="checkStatus()">Check Status</button>
            <button onclick="detectCameras()">Detect Cameras</button>
        </div>
        
        <div id="status"></div>
        
        <div class="stream-container">
            <h2>Live Stream:</h2>
            <img id="stream" src="" alt="Select a character to view stream" style="display: none;" />
            <div id="streamPlaceholder">Select a character and click "Load Stream" to begin</div>
        </div>
    </div>
    
    <script>
        function showStatus(message, type = 'info') {
            document.getElementById('status').innerHTML = 
                '<div class="status ' + type + '">' + message + '</div>';
        }
        
        function loadStream() {
            const characterId = document.getElementById('characterSelect').value;
            if (!characterId) {
                showStatus('Please select a character', 'error');
                return;
            }
            
            showStatus('Loading stream...', 'info');
            
            const streamImg = document.getElementById('stream');
            const placeholder = document.getElementById('streamPlaceholder');
            
            // Use protocol-aware URL for streaming
            const streamUrl = window.protocolUtils ?
                window.protocolUtils.getStreamingUrl(characterId, 'mjpeg') :
                '/api/streaming/stream/' + characterId + '?' + new Date().getTime();

            streamImg.src = streamUrl;
            streamImg.style.display = 'block';
            placeholder.style.display = 'none';

            showStatus('Stream loaded for character ' + characterId, 'success');
        }
        
        function checkStatus() {
            const characterId = document.getElementById('characterSelect').value;
            if (!characterId) {
                showStatus('Please select a character', 'error');
                return;
            }
            
            fetch('/api/streaming/status/' + characterId)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const status = data.streaming ? 'Active' : 'Inactive';
                        const clients = data.clients || 0;
                        showStatus('Stream Status: ' + status + ' | Clients: ' + clients, 'success');
                    } else {
                        showStatus('Status check failed: ' + data.error, 'error');
                    }
                })
                .catch(error => {
                    showStatus('Status check error: ' + error.message, 'error');
                });
        }
        
        function detectCameras() {
            showStatus('Detecting cameras...', 'info');
            
            fetch('/api/webcam/detect')
                .then(response => response.json())
                .then(data => {
                    if (data.success && data.cameras) {
                        showStatus('Found ' + data.cameras.length + ' camera(s)', 'success');
                    } else {
                        showStatus('Camera detection failed: ' + (data.error || 'Unknown error'), 'error');
                    }
                })
                .catch(error => {
                    showStatus('Detection error: ' + error.message, 'error');
                });
        }
        
        // Auto-refresh stream every 30 seconds
        setInterval(() => {
            const streamImg = document.getElementById('stream');
            if (streamImg.style.display !== 'none' && streamImg.src) {
                const characterId = document.getElementById('characterSelect').value;
                if (characterId) {
                    streamImg.src = '/api/streaming/stream/' + characterId + '?' + new Date().getTime();
                }
            }
        }, 30000);
    </script>
</body>
</html>
    `);
});

// Start servers
server.listen(port, () => {
    log(`🎭 MonsterBox Webcam HTTP Server started on port ${port}`);
    log(`📱 Web interface: http://localhost:${port}/`);
    log(`🎥 Stream API: http://localhost:${port}/api/streaming/stream/{characterId}`);
    log(`📊 Status API: http://localhost:${port}/api/streaming/status/{characterId}`);

    // Start HTTPS server if SSL is configured
    if (httpsServer && sslConfig) {
        const httpsPort = sslConfig.https.port || 8080;
        httpsServer.listen(httpsPort, () => {
            log(`🔐 MonsterBox Webcam HTTPS Server started on port ${httpsPort}`);
            log(`📱 Secure web interface: https://localhost:${httpsPort}/`);
            log(`🎥 Secure stream API: https://localhost:${httpsPort}/api/streaming/stream/{characterId}`);
            log(`📊 Secure status API: https://localhost:${httpsPort}/api/streaming/status/{characterId}`);
        });

        httpsServer.on('error', (error) => {
            log(`HTTPS server error: ${error.message}`, 'error');
            if (error.code === 'EADDRINUSE') {
                log(`HTTPS port ${httpsPort} is already in use`, 'error');
            }
        });
    }
});

// Cleanup on exit
function gracefulShutdown(signal) {
    log(`Received ${signal}, shutting down servers...`);

    // Kill all active streams
    for (const [characterId, streamInfo] of activeStreams) {
        if (streamInfo.process && !streamInfo.process.killed) {
            log(`Stopping stream for character ${characterId}`);
            streamInfo.process.kill();
        }
    }

    // Close servers
    let serversToClose = 1;
    let serversClosed = 0;

    if (httpsServer) {
        serversToClose = 2;
    }

    const onServerClosed = () => {
        serversClosed++;
        if (serversClosed === serversToClose) {
            log('All webcam servers closed');
            process.exit(0);
        }
    };

    server.close(() => {
        log('HTTP webcam server closed');
        onServerClosed();
    });

    if (httpsServer) {
        httpsServer.close(() => {
            log('HTTPS webcam server closed');
            onServerClosed();
        });
    }

    // Force exit after 5 seconds
    setTimeout(() => {
        log('Force closing webcam servers');
        process.exit(1);
    }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
