// public/js/AudioPlaybackService.js

class AudioPlaybackService {
    constructor() {
        this.audioSocket = null;
        this.audioContext = null;
        this.isSocketConnected = false;
        this.audioQueue = []; // Queue for pending audio data to play
        this.isPlaying = false;

        this._initializeAudioContext();
        this._connectSocket();
    }

    _initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext initialized.');
        } catch (e) {
            console.error('Web Audio API is not supported in this browser.', e);
            // Provide fallback or disable audio playback features
        }
    }

    _connectSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.audioSocket = new WebSocket(`${protocol}//${window.location.host}/audiostream`);

        this.audioSocket.onopen = () => {
            this.isSocketConnected = true;
            console.log('AudioPlaybackService WebSocket connected to /audiostream');
            // Process any queued audio that arrived before connection was fully established (unlikely but good practice)
            this._playNextInQueue(); 
        };

        this.audioSocket.onmessage = async (event) => {
            if (!this.audioContext) {
                console.warn('AudioContext not available, cannot play audio.');
                return;
            }

            try {
                // Assuming server sends audio data that needs to be decoded
                // This could be ArrayBuffer, or JSON with base64 encoded audio
                let audioDataToDecode;

                if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
                    audioDataToDecode = await this._blobToArrayBuffer(event.data);
                } else if (typeof event.data === 'string') {
                    const message = JSON.parse(event.data);
                    if (message.type === 'audioBroadcast' && message.data) {
                        // Assuming base64 encoded audio string
                        audioDataToDecode = this._base64ToArrayBuffer(message.data);
                    } else if (message.type === 'systemMessage') {
                        console.log('AudioPlaybackService received system message:', message);
                        // Handle other system messages if needed
                        return;
                    } else {
                        console.log('AudioPlaybackService received unhandled JSON message:', message);
                        return;
                    }
                } else {
                    console.warn('Received unknown audio data format from server.');
                    return;
                }

                if (audioDataToDecode) {
                    this.audioQueue.push(audioDataToDecode);
                    this._playNextInQueue();
                }
            } catch (error) {
                console.error('Error processing received audio data:', error);
            }
        };

        this.audioSocket.onclose = () => {
            this.isSocketConnected = false;
            console.log('AudioPlaybackService WebSocket disconnected.');
        };

        this.audioSocket.onerror = (error) => {
            this.isSocketConnected = false;
            console.error('AudioPlaybackService WebSocket error:', error);
        };
    }

    async _playNextInQueue() {
        if (this.isPlaying || this.audioQueue.length === 0 || !this.audioContext) {
            return;
        }
        this.isPlaying = true;
        const audioData = this.audioQueue.shift();

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0)); // Use slice(0) to create a copy for decodeAudioData
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.onended = () => {
                this.isPlaying = false;
                this._playNextInQueue(); // Play next item if queue is not empty
            };
            source.start(0);
            console.log('Playing received audio.');
        } catch (e) {
            console.error('Error decoding or playing audio data:', e);
            this.isPlaying = false;
            this._playNextInQueue(); // Attempt to play next item even if current one fails
        }
    }

    _blobToArrayBuffer(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
    }

    _base64ToArrayBuffer(base64) {
        try {
            const binaryString = window.atob(base64);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (error) {
            console.error('Error decoding base64 to ArrayBuffer:', error);
            return null;
        }
    }
    
    // Call this method to ensure AudioContext is resumed after user interaction
    resumeAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully.');
            }).catch(e => console.error('Error resuming AudioContext:', e));
        }
    }

    dispose() {
        if (this.audioSocket && this.audioSocket.readyState === WebSocket.OPEN) {
            this.audioSocket.close();
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioQueue = [];
        this.isPlaying = false;
        console.log('AudioPlaybackService disposed.');
    }
}

// Export if using modules, or attach to window for global access
// export default AudioPlaybackService;
// window.AudioPlaybackService = AudioPlaybackService;
