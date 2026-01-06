/**
 * MonsterBox 5.5 - WebSocket Real-Time Chat Client
 * Provides instant responses via WebSocket streaming
 */

function WebSocketChatClient() {
    this.ws = null;
    this.sessionId = null;
    this.isConnected = false;
    this.currentAgentId = null;
    this.messageQueue = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
}

/**
 * Connect to WebSocket server
 */
WebSocketChatClient.prototype.connect = function () {
    var self = this;

    try {
        var isSecure = window.location.protocol === 'https:';
        var wsProto = isSecure ? 'wss' : 'ws';
        // When on HTTPS, connect via reverse-proxied path so no port is needed
        var wsUrl = isSecure
            ? (wsProto + '://' + window.location.host + '/ai-chat')
            : (wsProto + '://' + window.location.hostname + ':8795');
        console.log('🔌 Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = function () {
            console.log('✅ WebSocket connected');
            self.isConnected = true;
            self.reconnectAttempts = 0;
            self.onConnectionStatusChange(true);

            // Process any queued messages
            self.processMessageQueue();
        };

        this.ws.onmessage = function (event) {
            try {
                var message = JSON.parse(event.data);
                self.handleServerMessage(message);
            } catch (error) {
                console.error('❌ Failed to parse WebSocket message:', error);
            }
        };

        this.ws.onclose = function (event) {
            console.log('🔌 WebSocket disconnected:', event.code, event.reason);
            self.isConnected = false;
            self.onConnectionStatusChange(false);

            // Attempt reconnection if not intentional
            if (event.code !== 1000 && self.reconnectAttempts < self.maxReconnectAttempts) {
                self.attemptReconnect();
            }
        };

        this.ws.onerror = function (error) {
            console.error('❌ WebSocket error:', error);
            self.onConnectionStatusChange(false);
        };

    } catch (error) {
        console.error('❌ Failed to create WebSocket connection:', error);
        this.onConnectionStatusChange(false);
    }
};

/**
 * Attempt to reconnect
 */
WebSocketChatClient.prototype.attemptReconnect = function () {
    var self = this;

    this.reconnectAttempts++;
    console.log('🔄 Attempting reconnect ' + this.reconnectAttempts + '/' + this.maxReconnectAttempts);

    setTimeout(function () {
        self.connect();
    }, this.reconnectDelay * this.reconnectAttempts);
};

/**
 * Start conversation with agent
 */
WebSocketChatClient.prototype.startConversation = function (agentId) {
    this.currentAgentId = agentId;

    var message = {
        type: 'start_conversation',
        agentId: agentId
    };

    this.sendMessage(message);
};

/**
 * Send chat message to agent
 */
WebSocketChatClient.prototype.sendChatMessage = function (text) {
    if (!text || !text.trim()) return;

    var message = {
        type: 'send_message',
        text: text.trim()
    };

    this.sendMessage(message);
};

/**
 * End current conversation
 */
WebSocketChatClient.prototype.endConversation = function () {
    var message = {
        type: 'end_conversation'
    };

    this.sendMessage(message);
    this.currentAgentId = null;
};

/**
 * Send message to server
 */
WebSocketChatClient.prototype.sendMessage = function (message) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
    } else {
        // Queue message for when connection is restored
        this.messageQueue.push(message);
        console.warn('⚠️ WebSocket not connected, message queued');
    }
};

/**
 * Process queued messages
 */
WebSocketChatClient.prototype.processMessageQueue = function () {
    while (this.messageQueue.length > 0) {
        var message = this.messageQueue.shift();
        this.sendMessage(message);
    }
};

/**
 * Handle message from server
 */
WebSocketChatClient.prototype.handleServerMessage = function (message) {
    switch (message.type) {
        case 'connected':
            this.sessionId = message.sessionId;
            console.log('🎭 Connected to chat server:', this.sessionId);
            break;

        case 'conversation_started':
            console.log('✅ Conversation started with agent:', message.agentId);
            this.onConversationStarted(message);
            break;

        case 'agent_response':
            console.log('🤖 Agent response received');
            this.onAgentResponse(message);
            break;

        case 'conversation_ended':
            console.log('🔚 Conversation ended');
            this.onConversationEnded(message);
            break;

        case 'error':
            console.error('❌ Server error:', message.message);
            this.onError(message);
            break;

        case 'interruption':
            console.log('⚠️ Conversation interrupted:', message.reason);
            if (this.onInterruption) {
                this.onInterruption(message);
            }
            break;

        case 'stt_partial':
            if (this.onPartialTranscript) this.onPartialTranscript(message);
            break;

        case 'stt_error':
            if (this.onSTTError) this.onSTTError(message);
            break;

        case 'debug':
            // Debug messages from server - log and optionally forward to UI
            console.log('🔍 Debug:', message.originalType, message.data);
            if (this.onDebug) this.onDebug(message);
            break;

        default:
            console.log('📨 Unknown message type:', message.type, message);
    }
};

/**
 * Disconnect from WebSocket
 */
WebSocketChatClient.prototype.disconnect = function () {
    if (this.ws) {
        this.ws.close(1000, 'Client disconnect');
        this.ws = null;
    }
    this.isConnected = false;
    this.sessionId = null;
    this.currentAgentId = null;
    this.messageQueue = [];
};

/**
 * Event handlers (to be overridden)
 */
WebSocketChatClient.prototype.onConnectionStatusChange = function (connected) {
    // Override this method to handle connection status changes
    console.log('Connection status:', connected ? 'Connected' : 'Disconnected');
};

WebSocketChatClient.prototype.onConversationStarted = function (message) {
    // Override this method to handle conversation start
    console.log('Conversation started:', message);
};

WebSocketChatClient.prototype.onAgentResponse = function (message) {
    // Override this method to handle agent responses
    console.log('Agent response:', message.text);
};

WebSocketChatClient.prototype.onConversationEnded = function (message) {
    // Override this method to handle conversation end
    console.log('Conversation ended:', message.message);
};

WebSocketChatClient.prototype.onError = function (message) {
    // Override this method to handle errors
    console.error('Chat error:', message.message);
};

/**
 * Get connection status
 */
WebSocketChatClient.prototype.getConnectionStatus = function () {
    return {
        connected: this.isConnected,
        sessionId: this.sessionId,
        currentAgentId: this.currentAgentId,
        queuedMessages: this.messageQueue.length
    };
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.WebSocketChatClient = WebSocketChatClient;
}
