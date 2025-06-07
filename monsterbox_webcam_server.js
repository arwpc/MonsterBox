#!/usr/bin/env node
/**
 * MonsterBox Server with Integrated Webcam Functionality
 * Complete working server for RPI4b deployment
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

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
        p.character_id === parseInt(characterId) && 
        p.part_type === 'webcam'
    );
    
    return webcam;
}

// Start webcam stream process
function startWebcamStream(characterId, webcam) {
    log(`Starting webcam stream for character ${characterId}`);
    
    try {
        const scriptPath = path.join(__dirname, 'scripts', 'webcam_persistent_stream.py');
        
        const streamProcess = spawn('python3', [
            scriptPath,
            '--device-id', webcam.devicePath.replace('/dev/video', ''),
            '--width', webcam.width.toString(),
            '--height', webcam.height.toString(),
            '--fps', webcam.fps.toString(),
            '--quality', '85',
            '--persistent'
        ]);
        
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
app.post('/api/streaming/start/:characterId', (req, res) => {
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
            
            streamImg.src = '/api/streaming/stream/' + characterId + '?' + new Date().getTime();
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

// Start server
server.listen(port, () => {
    log(`🎭 MonsterBox Webcam Server started on port ${port}`);
    log(`📱 Web interface: http://localhost:${port}/`);
    log(`🎥 Stream API: http://localhost:${port}/api/streaming/stream/{characterId}`);
    log(`📊 Status API: http://localhost:${port}/api/streaming/status/{characterId}`);
});

// Cleanup on exit
process.on('SIGINT', () => {
    log('Shutting down server...');
    
    // Kill all active streams
    for (const [characterId, streamInfo] of activeStreams) {
        if (streamInfo.process && !streamInfo.process.killed) {
            log(`Stopping stream for character ${characterId}`);
            streamInfo.process.kill();
        }
    }
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...');
    process.exit(0);
});
