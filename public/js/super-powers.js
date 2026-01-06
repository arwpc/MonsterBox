/**
 * Super Powers Configuration JavaScript (ES5)
 * Handles jaw animation configuration UI and real-time monitoring
 * MonsterBox 5.5 - Halloween Edition 🎃
 */

(function() {
  'use strict';
  
  // Global state
  var currentCharacterId = null;
  var monitoringInterval = null;
  var isMonitoring = false;
  var currentConfig = {};
  
  // DOM elements (populated on init)
  var elements = {};
  
  /**
   * Initialize the Super Powers interface
   */
  function initSuperPowers() {
    console.log('🎃 Initializing Super Powers interface...');
    
    // Cache DOM elements
    cacheElements();
    
    // Bind event listeners
    bindEvents();
    
    // Get current character from navigation
    initCurrentCharacter();
    
    // Initialize tab handling
    initTabHandling();
    
    // Show appropriate sections
    if (currentCharacterId) {
      showSection('servosSummarySection');
      showSection('jawAnimationSection');
      loadCharacterConfig(currentCharacterId);
    } else {
      showSection('noCharacterSection');
      hideSection('servosSummarySection');
      hideSection('jawAnimationSection');
    }
  }
  
  /**
   * Cache frequently used DOM elements
   */
  function cacheElements() {
    elements = {
      // Sections
      jawAnimationSection: document.getElementById('jawAnimationSection'),
      loadingSection: document.getElementById('loadingSection'),
      noCharacterSection: document.getElementById('noCharacterSection'),
      servosSummarySection: document.getElementById('servosSummarySection'),
      
      // Configuration controls
      jawEnabled: document.getElementById('jawEnabled'),
      jawServoSelect: document.getElementById('jawServoSelect'),
      sensitivityRange: document.getElementById('sensitivityRange'),
      sensitivityValue: document.getElementById('sensitivityValue'),
      smoothingRange: document.getElementById('smoothingRange'),
      smoothingValue: document.getElementById('smoothingValue'),
      volumeThresholdRange: document.getElementById('volumeThresholdRange'),
      volumeThresholdValue: document.getElementById('volumeThresholdValue'),
      attackTime: document.getElementById('attackTime'),
      releaseTime: document.getElementById('releaseTime'),
      
      // Buttons
      saveConfigBtn: document.getElementById('saveConfigBtn'),
      applyToPartBtn: document.getElementById('applyToPartBtn'),
      testJawBtn: document.getElementById('testJawBtn'),
      startMonitoringBtn: document.getElementById('startMonitoringBtn'),
      stopMonitoringBtn: document.getElementById('stopMonitoringBtn'),
      emergencyStopBtn: document.getElementById('emergencyStopBtn'),
      
      // Status displays
      servoStatusIndicator: document.getElementById('servoStatusIndicator'),
      servoStatusText: document.getElementById('servoStatusText'),
      monitoringStatus: document.getElementById('monitoringStatus'),
      currentAmplitude: document.getElementById('currentAmplitude'),
      smoothedAmplitude: document.getElementById('smoothedAmplitude'),
      targetAngle: document.getElementById('targetAngle'),
      audioMeterFill: document.getElementById('audioMeterFill'),
      
      // Toast
      statusToast: document.getElementById('statusToast'),
      toastMessage: document.getElementById('toastMessage')
    };
  }
  
  /**
   * Bind event listeners
   */
  function bindEvents() {
    // Configuration controls
    if (elements.jawEnabled) {
      elements.jawEnabled.addEventListener('change', onJawEnabledChange);
    }
    
    if (elements.jawServoSelect) {
      elements.jawServoSelect.addEventListener('change', onServoSelectionChange);
    }
    
    // Range sliders
    if (elements.sensitivityRange) {
      elements.sensitivityRange.addEventListener('input', function() {
        elements.sensitivityValue.textContent = this.value;
      });
    }
    
    if (elements.smoothingRange) {
      elements.smoothingRange.addEventListener('input', function() {
        elements.smoothingValue.textContent = this.value;
      });
    }
    
    if (elements.volumeThresholdRange) {
      elements.volumeThresholdRange.addEventListener('input', function() {
        elements.volumeThresholdValue.textContent = this.value;
      });
    }
    
    // Buttons
    if (elements.saveConfigBtn) {
      elements.saveConfigBtn.addEventListener('click', saveConfiguration);
    }
    
    if (elements.applyToPartBtn) {
      elements.applyToPartBtn.addEventListener('click', applySettingsToPart);
    }
    
    if (elements.testJawBtn) {
      elements.testJawBtn.addEventListener('click', testJawMovement);
    }
    
    if (elements.startMonitoringBtn) {
      elements.startMonitoringBtn.addEventListener('click', startAudioMonitoring);
    }
    
    if (elements.stopMonitoringBtn) {
      elements.stopMonitoringBtn.addEventListener('click', stopAudioMonitoring);
    }
    
    if (elements.emergencyStopBtn) {
      elements.emergencyStopBtn.addEventListener('click', emergencyStop);
    }
  }
  
  /**
   * Initialize current character from navigation
   */
  function initCurrentCharacter() {
    // Get current character ID from the navigation component
    var charLabel = document.getElementById('charLabel');
    if (charLabel) {
      var characterId = charLabel.getAttribute('data-char-id');
      if (characterId && characterId !== '') {
        currentCharacterId = parseInt(characterId, 10);
        console.log('🎭 Current character from navigation:', currentCharacterId);
      }
    }
  }
  
  /**
   * Initialize tab handling
   */
  function initTabHandling() {
    // Handle tab switches to load content dynamically
    document.addEventListener('shown.bs.tab', function(event) {
      var targetId = event.target.getAttribute('aria-controls');
      console.log('🎯 Switched to tab:', targetId);
      
      switch (targetId) {
        case 'advanced-servos-pane':
          loadAdvancedServosTab();
          break;
        case 'audio-library-pane':
          loadAudioLibraryTab();
          break;
        case 'ai-chat-pane':
          loadAIChatTab();
          break;
      }
    });
  }
  
  /**
   * Load Advanced Servos tab content
   */
  function loadAdvancedServosTab() {
    if (!currentCharacterId) return;
    
    console.log('🔧 Loading advanced servos for character:', currentCharacterId);
    
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId)
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success && data.availableServos) {
          populateAdvancedServos(data.availableServos);
        }
      })
      .catch(function(error) {
        console.error('Error loading advanced servos:', error);
      });
  }
  
  /**
   * Populate advanced servos grid with individual controls
   */
  function populateAdvancedServos(servos) {
    var grid = document.getElementById('advancedServosGrid');
    var loading = document.getElementById('advancedServosLoading');
    var count = document.getElementById('advancedServosCount');
    
    if (!grid) return;
    
    // Hide loading
    if (loading) loading.style.display = 'none';
    
    // Update count
    if (count) count.textContent = servos.length + ' servos';
    
    // Clear existing cards
    var existingCards = grid.querySelectorAll('.advanced-servo-card');
    existingCards.forEach(function(card) {
      card.remove();
    });
    
    if (servos.length === 0) {
      grid.innerHTML += '<div class="col-12 text-center text-muted py-3"><i class="bi bi-exclamation-circle"></i> No servos available for this character</div>';
      return;
    }
    
    // Create servo control cards
    servos.forEach(function(servo) {
      var isJawActive = currentConfig.servoPartId === servo.id && currentConfig.enabled;
      var cardHtml = createAdvancedServoCard(servo, isJawActive);
      grid.innerHTML += cardHtml;
    });
    
    // Bind events for the new servo cards
    bindAdvancedServoEvents();
  }
  
  /**
   * Create HTML for advanced servo control card
   */
  function createAdvancedServoCard(servo, isJawActive) {
    var statusClass = servo.calibrated ? 'status-calibrated' : 'status-disconnected';
    var statusIcon = servo.calibrated ? 'bi-check-circle' : 'bi-x-circle';
    
    return '<div class="col-lg-6 col-xl-4 mb-4 advanced-servo-card">' +
             '<div class="card bg-dark border-secondary h-100' + (isJawActive ? ' border-warning' : '') + '">' +
               '<div class="card-header p-2">' +
                 '<div class="d-flex justify-content-between align-items-center">' +
                   '<h6 class="mb-0">' +
                     '<span class="' + statusClass + '"></span>' +
                     servo.name +
                     (servo.isJawCandidate ? ' 🦷' : '') +
                     (isJawActive ? ' <span class="badge bg-warning text-dark">JAW</span>' : '') +
                   '</h6>' +
                   '<small class="text-muted">ID: ' + servo.id + '</small>' +
                 '</div>' +
               '</div>' +
               '<div class="card-body p-2">' +
                 '<div class="mb-2">' +
                   '<label class="form-label small">Position (0-180°)</label>' +
                   '<input type="range" class="form-range servo-position-range" ' +
                          'min="0" max="180" value="90" data-servo-id="' + servo.id + '">' +
                   '<div class="d-flex justify-content-between">' +
                     '<small class="text-muted">0°</small>' +
                     '<span class="badge bg-info servo-position-value">90°</span>' +
                     '<small class="text-muted">180°</small>' +
                   '</div>' +
                 '</div>' +
                 '<div class="d-flex gap-1">' +
                   '<button class="btn btn-sm btn-outline-primary flex-grow-1 servo-test-btn" data-servo-id="' + servo.id + '">' +
                     '<i class="bi bi-play"></i> Test' +
                   '</button>' +
                   '<button class="btn btn-sm btn-outline-secondary servo-center-btn" data-servo-id="' + servo.id + '">' +
                     '<i class="bi bi-bullseye"></i> Center' +
                   '</button>' +
                 '</div>' +
                 '<div class="mt-2">' +
                   '<small class="text-muted">' +
                     '<i class="bi ' + statusIcon + '"></i> ' +
                     (servo.calibrated ? 'Calibrated' : 'Not Calibrated') +
                   '</small>' +
                 '</div>' +
               '</div>' +
             '</div>' +
           '</div>';
  }
  
  /**
   * Bind events for advanced servo controls
   */
  function bindAdvancedServoEvents() {
    // Position range sliders
    var ranges = document.querySelectorAll('.servo-position-range');
    ranges.forEach(function(range) {
      range.addEventListener('input', function() {
        var valueDisplay = this.parentElement.querySelector('.servo-position-value');
        if (valueDisplay) {
          valueDisplay.textContent = this.value + '°';
        }
      });
    });
    
    // Test buttons
    var testButtons = document.querySelectorAll('.servo-test-btn');
    testButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        var servoId = this.getAttribute('data-servo-id');
        var range = this.parentElement.parentElement.querySelector('.servo-position-range');
        var position = range ? range.value : 90;
        testAdvancedServo(servoId, position);
      });
    });
    
    // Center buttons
    var centerButtons = document.querySelectorAll('.servo-center-btn');
    centerButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        var servoId = this.getAttribute('data-servo-id');
        var range = this.parentElement.parentElement.querySelector('.servo-position-range');
        if (range) {
          range.value = 90;
          range.dispatchEvent(new Event('input'));
        }
        testAdvancedServo(servoId, 90);
      });
    });
  }
  
  /**
   * Test individual servo movement
   */
  function testAdvancedServo(servoId, position) {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    console.log('🔧 Testing servo', servoId, 'at position', position);
    
    fetch('/setup/super-powers/api/test-advanced-servo/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        servoId: parseInt(servoId),
        position: parseInt(position)
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        showToast('Servo ' + servoId + ' moved to ' + position + '° ⚙️', 'success');
      } else {
        showToast('Error testing servo: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error testing servo:', error);
      showToast('Failed to test servo', 'error');
    });
  }
  
  /**
   * Load Audio Library tab content
   */
  function loadAudioLibraryTab() {
    if (!currentCharacterId) return;
    
    console.log('🎵 Loading audio library for jaw animation testing...');
    
    var content = document.getElementById('audioLibraryContent');
    var loading = document.getElementById('audioLibraryLoading');
    
    if (!content) return;
    
    // Show loading
    if (loading) loading.style.display = 'block';
    
    fetch('/audio-library/api/library?sortBy=title&limit=20')
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success && data.audio) {
          populateAudioLibrary(data.audio);
        } else {
          showAudioLibraryError('Failed to load audio library');
        }
      })
      .catch(function(error) {
        console.error('Error loading audio library:', error);
        showAudioLibraryError('Failed to load audio library');
      });
  }
  
  /**
   * Populate audio library with selectable files
   */
  function populateAudioLibrary(audioFiles) {
    var content = document.getElementById('audioLibraryContent');
    var loading = document.getElementById('audioLibraryLoading');
    
    if (!content) return;
    
    // Hide loading
    if (loading) loading.style.display = 'none';
    
    if (audioFiles.length === 0) {
      content.innerHTML = '<div class="alert alert-info"><i class="bi bi-info-circle"></i> No audio files found. Upload some files in <a href="/audio-library" class="alert-link">Audio Library</a> first.</div>';
      return;
    }
    
    var html = '<div class="row">';
    
    audioFiles.forEach(function(audio) {
      var duration = audio.duration ? formatDuration(audio.duration) : 'Unknown';
      var category = audio.category || 'Uncategorized';
      
      html += 
        '<div class="col-lg-6 col-xl-4 mb-3">' +
          '<div class="card bg-dark border-secondary h-100 audio-test-card">' +
            '<div class="card-body p-3">' +
              '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<h6 class="card-title mb-0">' + escapeHtml(audio.title) + '</h6>' +
                '<span class="badge bg-secondary">' + escapeHtml(audio.format.toUpperCase()) + '</span>' +
              '</div>' +
              '<p class="card-text small text-muted mb-2">' +
                '<i class="bi bi-clock"></i> ' + duration + ' • ' +
                '<i class="bi bi-tag"></i> ' + escapeHtml(category) +
              '</p>' +
              (audio.description ? '<p class="card-text small mb-3">' + escapeHtml(audio.description) + '</p>' : '') +
              '<div class="d-flex gap-2">' +
                '<button class="btn btn-sm btn-outline-primary flex-grow-1 test-jaw-audio-btn" ' +
                        'data-audio-id="' + audio.id + '" data-audio-title="' + escapeHtml(audio.title) + '">' +
                  '<i class="bi bi-play"></i> Test Jaw Animation' +
                '</button>' +
                '<button class="btn btn-sm btn-outline-info play-audio-btn" ' +
                        'data-audio-id="' + audio.id + '" data-audio-title="' + escapeHtml(audio.title) + '">' +
                  '<i class="bi bi-headphones"></i>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
    });
    
    html += '</div>';
    content.innerHTML = html;
    
    // Bind events for audio testing
    bindAudioLibraryEvents();
  }
  
  /**
   * Bind events for audio library cards
   */
  function bindAudioLibraryEvents() {
    // Test jaw animation buttons
    var testButtons = document.querySelectorAll('.test-jaw-audio-btn');
    testButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        var audioId = this.getAttribute('data-audio-id');
        var audioTitle = this.getAttribute('data-audio-title');
        testJawWithAudio(audioId, audioTitle, this);
      });
    });
    
    // Play audio buttons
    var playButtons = document.querySelectorAll('.play-audio-btn');
    playButtons.forEach(function(button) {
      button.addEventListener('click', function() {
        var audioId = this.getAttribute('data-audio-id');
        var audioTitle = this.getAttribute('data-audio-title');
        playAudioFile(audioId, audioTitle, this);
      });
    });
  }
  
  /**
   * Test jaw animation with selected audio file
   */
  function testJawWithAudio(audioId, audioTitle, buttonElement) {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    if (!currentConfig.enabled || !currentConfig.servoPartId) {
      showToast('Jaw animation is not enabled or no servo selected. Configure jaw animation first.', 'error');
      return;
    }
    
    // Show loading state
    var originalHtml = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Testing...';
    
    console.log('🎵 Testing jaw animation with audio:', audioTitle);
    
    fetch('/setup/super-powers/api/test-jaw-with-audio/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioId: audioId,
        jawConfig: currentConfig
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalHtml;
      
      if (data.success) {
        showToast('Jaw animation test with "' + audioTitle + '" completed! 🦷🎵', 'success');
      } else {
        showToast('Error testing jaw animation: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error testing jaw with audio:', error);
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalHtml;
      showToast('Failed to test jaw animation with audio', 'error');
    });
  }
  
  /**
   * Play audio file on character speaker
   */
  function playAudioFile(audioId, audioTitle, buttonElement) {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    // Show loading state
    var originalHtml = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    
    fetch('/audio-library/api/audio/' + audioId + '/play', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        characterId: currentCharacterId,
        volume: 80
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalHtml;
      
      if (data.success) {
        showToast('Playing "' + audioTitle + '" on character speaker 🔊', 'success');
      } else {
        showToast('Error playing audio: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error playing audio:', error);
      buttonElement.disabled = false;
      buttonElement.innerHTML = originalHtml;
      showToast('Failed to play audio file', 'error');
    });
  }
  
  /**
   * Show audio library error
   */
  function showAudioLibraryError(message) {
    var content = document.getElementById('audioLibraryContent');
    var loading = document.getElementById('audioLibraryLoading');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.innerHTML = '<div class="alert alert-danger"><i class="bi bi-exclamation-triangle"></i> ' + message + '</div>';
    }
  }
  
  /**
   * Load AI Chat tab content
   */
  function loadAIChatTab() {
    if (!currentCharacterId) return;
    
    console.log('🤖 Loading AI chat interface for character:', currentCharacterId);
    
    var content = document.getElementById('aiChatContent');
    var loading = document.getElementById('aiChatLoading');
    
    if (!content) return;
    
    // Show loading
    if (loading) loading.style.display = 'block';
    
    // Check if ElevenLabs WebSocket service is available
    fetch('/setup/super-powers/api/ai-chat-status/' + currentCharacterId)
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          createAIChatInterface(data);
        } else {
          showAIChatError(data.error || 'AI Chat service not available');
        }
      })
      .catch(function(error) {
        console.error('Error checking AI chat status:', error);
        showAIChatError('Failed to connect to AI Chat service');
      });
  }
  
  /**
   * Create AI Chat interface
   */
  function createAIChatInterface(statusData) {
    var content = document.getElementById('aiChatContent');
    var loading = document.getElementById('aiChatLoading');
    
    if (!content) return;
    
    // Hide loading
    if (loading) loading.style.display = 'none';
    
    var html = 
      '<div class="row">' +
        '<div class="col-lg-8">' +
          '<!-- Chat Interface -->' +
          '<div class="card bg-dark border-secondary mb-3">' +
            '<div class="card-header">' +
              '<div class="d-flex justify-content-between align-items-center">' +
                '<h6 class="mb-0"><i class="bi bi-chat-dots"></i> AI Conversation</h6>' +
                '<div>' +
                  '<span class="badge bg-secondary me-2" id="aiChatStatus">Disconnected</span>' +
                  '<button class="btn btn-sm btn-outline-success" id="connectAIChatBtn">' +
                    '<i class="bi bi-power"></i> Connect' +
                  '</button>' +
                  '<button class="btn btn-sm btn-outline-danger d-none" id="disconnectAIChatBtn">' +
                    '<i class="bi bi-power"></i> Disconnect' +
                  '</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="card-body p-0">' +
              '<div class="chat-messages" id="aiChatMessages" style="height: 400px; overflow-y: auto; padding: 1rem;">' +
                '<div class="text-center text-muted">' +
                  '<i class="bi bi-robot"></i>' +
                  '<p>Click "Connect" to start AI conversation with jaw animation sync</p>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="card-footer">' +
              '<div class="input-group">' +
                '<input type="text" class="form-control" id="aiChatInput" ' +
                       'placeholder="Type your message..." disabled>' +
                '<button class="btn btn-outline-primary" id="sendAIChatBtn" disabled>' +
                  '<i class="bi bi-send"></i>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="col-lg-4">' +
          '<!-- Settings Panel -->' +
          '<div class="card bg-dark border-secondary">' +
            '<div class="card-header">' +
              '<h6 class="mb-0"><i class="bi bi-gear"></i> Chat Settings</h6>' +
            '</div>' +
            '<div class="card-body">' +
              '<div class="mb-3">' +
                '<label class="form-label small">Jaw Animation</label>' +
                '<div class="form-check form-switch">' +
                  '<input class="form-check-input" type="checkbox" id="jawAnimationSync" checked>' +
                  '<label class="form-check-label" for="jawAnimationSync">' +
                    'Sync jaw with AI voice' +
                  '</label>' +
                '</div>' +
              '</div>' +
              '<div class="mb-3">' +
                '<label class="form-label small">Voice Volume</label>' +
                '<input type="range" class="form-range" id="aiVolumeRange" ' +
                       'min="0" max="100" value="80">' +
                '<div class="d-flex justify-content-between">' +
                  '<small class="text-muted">0%</small>' +
                  '<span class="badge bg-info" id="aiVolumeValue">80%</span>' +
                  '<small class="text-muted">100%</small>' +
                '</div>' +
              '</div>' +
              '<div class="mb-3">' +
                '<label class="form-label small">Connection Status</label>' +
                '<div class="p-2 border rounded">' +
                  '<small class="text-muted" id="connectionDetails">Not connected</small>' +
                '</div>' +
              '</div>' +
              '<div class="alert alert-info small">' +
                '<i class="bi bi-info-circle"></i>' +
                '<strong>How it works:</strong><br>' +
                'AI responses will automatically trigger jaw animation based on your configured settings.' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    
    content.innerHTML = html;
    
    // Initialize AI chat interface
    initializeAIChat(statusData);
  }
  
  /**
   * Initialize AI Chat functionality
   */
  function initializeAIChat(statusData) {
    var connectBtn = document.getElementById('connectAIChatBtn');
    var disconnectBtn = document.getElementById('disconnectAIChatBtn');
    var sendBtn = document.getElementById('sendAIChatBtn');
    var chatInput = document.getElementById('aiChatInput');
    var volumeRange = document.getElementById('aiVolumeRange');
    var volumeValue = document.getElementById('aiVolumeValue');
    
    // Volume control
    if (volumeRange && volumeValue) {
      volumeRange.addEventListener('input', function() {
        volumeValue.textContent = this.value + '%';
      });
    }
    
    // Connect button
    if (connectBtn) {
      connectBtn.addEventListener('click', function() {
        connectToAIChat();
      });
    }
    
    // Disconnect button
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function() {
        disconnectFromAIChat();
      });
    }
    
    // Send button and enter key
    if (sendBtn && chatInput) {
      sendBtn.addEventListener('click', function() {
        sendAIChatMessage();
      });
      
      chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendAIChatMessage();
        }
      });
    }
  }
  
  /**
   * Connect to AI Chat WebSocket
   */
  function connectToAIChat() {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    console.log('🔌 Connecting to AI Chat WebSocket...');
    
    // Update UI state
    updateAIChatConnectionState('connecting', 'Connecting...');
    
    fetch('/setup/super-powers/api/ai-chat-connect/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jawAnimationSync: document.getElementById('jawAnimationSync')?.checked || true,
        volume: parseInt(document.getElementById('aiVolumeRange')?.value || 80)
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        updateAIChatConnectionState('connected', 'Connected to ' + data.agentName);
        addChatMessage('system', 'Connected to AI agent: ' + data.agentName, { isInfo: true });
        showToast('Connected to AI Chat! 🤖', 'success');
      } else {
        updateAIChatConnectionState('disconnected', 'Connection failed');
        showToast('Failed to connect: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error connecting to AI chat:', error);
      updateAIChatConnectionState('disconnected', 'Connection failed');
      showToast('Failed to connect to AI Chat', 'error');
    });
  }
  
  /**
   * Disconnect from AI Chat
   */
  function disconnectFromAIChat() {
    console.log('🔌 Disconnecting from AI Chat...');
    
    fetch('/setup/super-powers/api/ai-chat-disconnect/' + currentCharacterId, {
      method: 'POST'
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      updateAIChatConnectionState('disconnected', 'Disconnected');
      addChatMessage('system', 'Disconnected from AI agent', { isInfo: true });
      showToast('Disconnected from AI Chat', 'info');
    })
    .catch(function(error) {
      console.error('Error disconnecting:', error);
    });
  }
  
  /**
   * Send message to AI
   */
  function sendAIChatMessage() {
    var chatInput = document.getElementById('aiChatInput');
    if (!chatInput || !chatInput.value.trim()) return;
    
    var message = chatInput.value.trim();
    chatInput.value = '';
    
    // Add user message to chat
    addChatMessage('user', message);
    
    console.log('📤 Sending message to AI:', message);
    
    fetch('/setup/super-powers/api/ai-chat-send/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: message,
        jawAnimationSync: document.getElementById('jawAnimationSync')?.checked || true
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        // AI response will come through WebSocket, just log success
        console.log('✅ Message sent to AI agent');
      } else {
        showToast('Error sending message: ' + data.error, 'error');
        addChatMessage('system', 'Error: ' + data.error, { isError: true });
      }
    })
    .catch(function(error) {
      console.error('Error sending AI message:', error);
      showToast('Failed to send message', 'error');
      addChatMessage('system', 'Failed to send message', { isError: true });
    });
  }
  
  /**
   * Update AI Chat connection state
   */
  function updateAIChatConnectionState(state, details) {
    var status = document.getElementById('aiChatStatus');
    var connectBtn = document.getElementById('connectAIChatBtn');
    var disconnectBtn = document.getElementById('disconnectAIChatBtn');
    var chatInput = document.getElementById('aiChatInput');
    var sendBtn = document.getElementById('sendAIChatBtn');
    var connectionDetails = document.getElementById('connectionDetails');
    
    if (status) {
      status.className = 'badge me-2 bg-' + 
        (state === 'connected' ? 'success' : 
         state === 'connecting' ? 'warning' : 'secondary');
      status.textContent = state.charAt(0).toUpperCase() + state.slice(1);
    }
    
    if (connectBtn && disconnectBtn) {
      if (state === 'connected') {
        connectBtn.classList.add('d-none');
        disconnectBtn.classList.remove('d-none');
      } else {
        connectBtn.classList.remove('d-none');
        disconnectBtn.classList.add('d-none');
      }
    }
    
    if (chatInput && sendBtn) {
      var isConnected = state === 'connected';
      chatInput.disabled = !isConnected;
      sendBtn.disabled = !isConnected;
    }
    
    if (connectionDetails) {
      connectionDetails.textContent = details;
    }
  }
  
  /**
   * Add message to chat
   */
  function addChatMessage(type, message, options) {
    var chatMessages = document.getElementById('aiChatMessages');
    if (!chatMessages) return;
    
    options = options || {};
    var isUser = type === 'user';
    var isSystem = type === 'system';
    var isAI = type === 'assistant' || type === 'ai';
    
    var messageClass = isUser ? 'text-end' : (isSystem ? 'text-center' : '');
    var bubbleClass = 
      isUser ? 'bg-primary' : 
      isSystem ? (options.isError ? 'bg-danger' : 'bg-secondary') : 
      'bg-success';
    
    var icon = 
      isUser ? '<i class="bi bi-person"></i>' : 
      isSystem ? '<i class="bi bi-info-circle"></i>' : 
      '<i class="bi bi-robot"></i>';
    
    var messageHtml = 
      '<div class="mb-2 ' + messageClass + '">' +
        '<div class="d-inline-block ' + bubbleClass + ' text-white rounded px-3 py-2 mw-75">' +
          '<small class="d-block mb-1">' + icon + ' ' + 
            (isUser ? 'You' : isSystem ? 'System' : 'AI Assistant') +
          '</small>' +
          '<div>' + escapeHtml(message) + '</div>' +
        '</div>' +
      '</div>';
    
    chatMessages.innerHTML += messageHtml;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  /**
   * Show AI Chat error
   */
  function showAIChatError(message) {
    var content = document.getElementById('aiChatContent');
    var loading = document.getElementById('aiChatLoading');
    
    if (loading) loading.style.display = 'none';
    if (content) {
      content.innerHTML = 
        '<div class="alert alert-warning">' +
          '<h6><i class="bi bi-exclamation-triangle"></i> AI Chat Unavailable</h6>' +
          '<p>' + escapeHtml(message) + '</p>' +
          '<small class="text-muted">' +
            'Make sure ElevenLabs is configured and the WebSocket service is running.' +
          '</small>' +
        '</div>';
    }
  }
  
  /**
   * Load configuration for selected character
   */
  function loadCharacterConfig(characterId) {
    console.log('🦷 Loading jaw animation config for character:', characterId);
    
    showSection('loadingSection');
    hideSection('jawAnimationSection');
    hideSection('servosSummarySection');
    hideSection('noCharacterSection');
    
    fetch('/setup/super-powers/api/jaw-animation/' + characterId)
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          currentConfig = data.config;
          populateServoOptions(data.availableServos);
          populateConfigurationForm(data.config);
          
          hideSection('loadingSection');
          showSection('servosSummarySection');
          showSection('jawAnimationSection');
          
          // Start monitoring if enabled
          if (data.config.enabled) {
            startAudioMonitoring();
          }
        } else {
          showToast('Error loading configuration: ' + data.error, 'error');
          hideSection('loadingSection');
          showSection('noCharacterSection');
        }
      })
      .catch(function(error) {
        console.error('Error loading character config:', error);
        showToast('Failed to load configuration', 'error');
        hideSection('loadingSection');
        showSection('noCharacterSection');
      });
  }
  
  /**
   * Populate servo selection dropdown and overview
   */
  function populateServoOptions(servos) {
    // Populate dropdown
    elements.jawServoSelect.innerHTML = '<option value="">Select a servo...</option>';
    
    servos.forEach(function(servo) {
      var option = document.createElement('option');
      option.value = servo.id;
      option.textContent = servo.name + (servo.isJawCandidate ? ' 🦷' : '');
      
      if (currentConfig.servoPartId === servo.id) {
        option.selected = true;
      }
      
      elements.jawServoSelect.appendChild(option);
    });
    
    // Populate servos overview
    populateServosOverview(servos);
    
    // Update servo status display
    onServoSelectionChange();
  }
  
  /**
   * Populate the servos overview grid
   */
  function populateServosOverview(servos) {
    var overviewGrid = document.getElementById('servosOverviewGrid');
    var loadingElement = document.getElementById('servosLoading');
    
    if (!overviewGrid) return;
    
    // Remove loading indicator
    if (loadingElement) {
      loadingElement.style.display = 'none';
    }
    
    // Clear existing content except loading indicator
    var existingCards = overviewGrid.querySelectorAll('.servo-overview-card');
    existingCards.forEach(function(card) {
      card.remove();
    });
    
    if (servos.length === 0) {
      overviewGrid.innerHTML += '<div class="col-12 text-center text-muted py-3"><i class="bi bi-exclamation-circle"></i> No servos found for this character</div>';
      return;
    }
    
    // Create servo cards
    servos.forEach(function(servo) {
      var isCurrentJaw = currentConfig.servoPartId === servo.id;
      var statusClass = servo.calibrated ? 'status-calibrated' : 'status-disconnected';
      var statusIcon = servo.calibrated ? 'bi-check-circle' : 'bi-x-circle';
      
      var cardHtml = 
        '<div class="col-lg-4 col-md-6 mb-3 servo-overview-card">' +
          '<div class="card bg-dark border-secondary h-100' + (isCurrentJaw ? ' border-warning' : '') + '">' +
            '<div class="card-body p-2">' +
              '<div class="d-flex justify-content-between align-items-center">' +
                '<h6 class="card-title mb-1">' +
                  '<span class="' + statusClass + '"></span>' +
                  servo.name +
                  (servo.isJawCandidate ? ' 🦷' : '') +
                  (isCurrentJaw ? ' <span class="badge bg-warning text-dark">ACTIVE</span>' : '') +
                '</h6>' +
              '</div>' +
              '<small class="text-muted">' +
                '<i class="bi ' + statusIcon + '"></i> ' +
                (servo.calibrated ? 'Calibrated' : 'Not Calibrated') +
              '</small>' +
              '<br><small class="text-muted">ID: ' + servo.id + '</small>' +
            '</div>' +
          '</div>' +
        '</div>';
      
      overviewGrid.innerHTML += cardHtml;
    });
  }
  
  /**
   * Populate configuration form with loaded data
   */
  function populateConfigurationForm(config) {
    // Enable/disable switch
    elements.jawEnabled.checked = config.enabled || false;
    
    // Servo selection
    if (config.servoPartId) {
      elements.jawServoSelect.value = config.servoPartId;
    }
    
    // Range sliders
    elements.sensitivityRange.value = config.sensitivity || 1.0;
    elements.sensitivityValue.textContent = config.sensitivity || 1.0;
    
    elements.smoothingRange.value = config.smoothing || 0.6;
    elements.smoothingValue.textContent = config.smoothing || 0.6;
    
    elements.volumeThresholdRange.value = config.volumeThreshold || 0.02;
    elements.volumeThresholdValue.textContent = config.volumeThreshold || 0.02;
    
    // Timing inputs
    elements.attackTime.value = config.attackTime || 50;
    elements.releaseTime.value = config.releaseTime || 150;
    
    // Update form state
    updateFormState();
  }
  
  /**
   * Handle jaw enabled/disabled toggle
   */
  function onJawEnabledChange() {
    updateFormState();
  }
  
  /**
   * Handle servo selection change
   */
  function onServoSelectionChange() {
    var servoId = elements.jawServoSelect.value;
    
    if (!servoId) {
      elements.servoStatusIndicator.innerHTML = '';
      elements.servoStatusText.textContent = 'Select a servo to see its status';
      return;
    }
    
    // Find selected servo info
    var option = elements.jawServoSelect.selectedOptions[0];
    if (option) {
      // This is a simplified status display
      // In a real implementation, you'd fetch detailed servo status
      elements.servoStatusIndicator.innerHTML = '<span class="servo-status-indicator status-connected"></span>';
      elements.servoStatusText.textContent = 'Servo connected and ready';
    }
  }
  
  /**
   * Update form state based on enabled/disabled status
   */
  function updateFormState() {
    var enabled = elements.jawEnabled.checked;
    
    // Enable/disable all configuration inputs
    var configInputs = [
      elements.jawServoSelect,
      elements.sensitivityRange,
      elements.smoothingRange,
      elements.volumeThresholdRange,
      elements.attackTime,
      elements.releaseTime
    ];
    
    configInputs.forEach(function(input) {
      if (input) {
        input.disabled = !enabled;
      }
    });
    
    // Enable/disable action buttons
    if (elements.testJawBtn) {
      elements.testJawBtn.disabled = !enabled || !elements.jawServoSelect.value;
    }
    
    if (elements.startMonitoringBtn) {
      elements.startMonitoringBtn.disabled = !enabled || !elements.jawServoSelect.value;
    }
  }
  
  /**
   * Save configuration
   */
  function saveConfiguration() {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    var config = {
      enabled: elements.jawEnabled.checked,
      servoPartId: elements.jawServoSelect.value || null,
      sensitivity: parseFloat(elements.sensitivityRange.value),
      smoothing: parseFloat(elements.smoothingRange.value),
      volumeThreshold: parseFloat(elements.volumeThresholdRange.value),
      attackTime: parseInt(elements.attackTime.value),
      releaseTime: parseInt(elements.releaseTime.value)
    };
    
    // Validate configuration
    if (config.enabled && !config.servoPartId) {
      showToast('Please select a servo when jaw animation is enabled', 'error');
      return;
    }
    
    // Show loading state
    elements.saveConfigBtn.disabled = true;
    elements.saveConfigBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      elements.saveConfigBtn.disabled = false;
      elements.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Configuration';
      
      if (data.success) {
        currentConfig = config;
        showToast('Configuration saved successfully! 🎃', 'success');
        updateFormState();
      } else {
        showToast('Error saving configuration: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error saving configuration:', error);
      elements.saveConfigBtn.disabled = false;
      elements.saveConfigBtn.innerHTML = '<i class="bi bi-save"></i> Save Configuration';
      showToast('Failed to save configuration', 'error');
    });
  }
  
  /**
   * Apply current jaw animation settings to the servo part configuration
   */
  function applySettingsToPart() {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    var servoPartId = elements.jawServoSelect.value;
    if (!servoPartId) {
      showToast('Please select a servo part to apply settings to', 'error');
      return;
    }
    
    var settings = {
      sensitivity: parseFloat(elements.sensitivityRange.value),
      smoothing: parseFloat(elements.smoothingRange.value),
      volumeThreshold: parseFloat(elements.volumeThresholdRange.value),
      attackTime: parseInt(elements.attackTime.value),
      releaseTime: parseInt(elements.releaseTime.value)
    };
    
    // Show loading state
    elements.applyToPartBtn.disabled = true;
    elements.applyToPartBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Applying...';
    
    fetch('/setup/super-powers/api/apply-settings-to-part/' + currentCharacterId, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        servoPartId: parseInt(servoPartId),
        settings: settings
      })
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      elements.applyToPartBtn.disabled = false;
      elements.applyToPartBtn.innerHTML = '<i class="bi bi-arrow-up-right-circle"></i> Apply to Part';
      
      if (data.success) {
        showToast('Settings applied to part successfully! ⚙️', 'success');
        // Refresh the servos overview to show updated status
        if (data.availableServos) {
          populateServosOverview(data.availableServos);
        }
      } else {
        showToast('Error applying settings to part: ' + data.error, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error applying settings to part:', error);
      elements.applyToPartBtn.disabled = false;
      elements.applyToPartBtn.innerHTML = '<i class="bi bi-arrow-up-right-circle"></i> Apply to Part';
      showToast('Failed to apply settings to part', 'error');
    });
  }
  
  /**
   * Test jaw movement
   */
  function testJawMovement() {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    elements.testJawBtn.disabled = true;
    elements.testJawBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
    
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId + '/test', {
      method: 'POST'
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      elements.testJawBtn.disabled = false;
      elements.testJawBtn.innerHTML = '<i class="bi bi-play-circle"></i> Test Jaw';
      
      if (data.success) {
        showToast('Jaw test completed successfully! 👻', 'success');
      } else {
        showToast('Jaw test failed: ' + data.message, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error testing jaw:', error);
      elements.testJawBtn.disabled = false;
      elements.testJawBtn.innerHTML = '<i class="bi bi-play-circle"></i> Test Jaw';
      showToast('Failed to test jaw movement', 'error');
    });
  }
  
  /**
   * Start audio monitoring
   */
  function startAudioMonitoring() {
    if (!currentCharacterId || isMonitoring) {
      return;
    }
    
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId + '/start-monitoring', {
      method: 'POST'
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      if (data.success) {
        isMonitoring = true;
        elements.monitoringStatus.innerHTML = '<span class="text-success">Monitoring</span>';
        elements.startMonitoringBtn.disabled = true;
        elements.stopMonitoringBtn.disabled = false;
        
        // Start polling for audio levels
        startAudioLevelPolling();
        
        showToast('Audio monitoring started 👂', 'success');
      } else {
        showToast('Failed to start monitoring: ' + data.message, 'error');
      }
    })
    .catch(function(error) {
      console.error('Error starting monitoring:', error);
      showToast('Failed to start audio monitoring', 'error');
    });
  }
  
  /**
   * Stop audio monitoring
   */
  function stopAudioMonitoring() {
    if (!currentCharacterId || !isMonitoring) {
      return;
    }
    
    isMonitoring = false;
    
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }
    
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId + '/stop-monitoring', {
      method: 'POST'
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      elements.monitoringStatus.innerHTML = '<span class="text-warning">Stopped</span>';
      elements.startMonitoringBtn.disabled = false;
      elements.stopMonitoringBtn.disabled = true;
      
      // Reset displays
      updateAudioLevelDisplay(0, 0, 0);
      
      if (data.success) {
        showToast('Audio monitoring stopped', 'info');
      }
    })
    .catch(function(error) {
      console.error('Error stopping monitoring:', error);
      elements.monitoringStatus.innerHTML = '<span class="text-warning">Stopped</span>';
      elements.startMonitoringBtn.disabled = false;
      elements.stopMonitoringBtn.disabled = true;
      updateAudioLevelDisplay(0, 0, 0);
    });
  }
  
  /**
   * Emergency stop - immediately stop all jaw movement
   */
  function emergencyStop() {
    showToast('🚨 Emergency stop activated!', 'warning');
    stopAudioMonitoring();
    
    // Add visual feedback
    elements.emergencyStopBtn.classList.add('btn-outline-danger');
    elements.emergencyStopBtn.classList.remove('btn-danger');
    
    setTimeout(function() {
      elements.emergencyStopBtn.classList.remove('btn-outline-danger');
      elements.emergencyStopBtn.classList.add('btn-danger');
    }, 2000);
  }
  
  /**
   * Start polling for audio levels
   */
  function startAudioLevelPolling() {
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }
    
    monitoringInterval = setInterval(function() {
      if (!isMonitoring || !currentCharacterId) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        return;
      }
      
      pollAudioLevels();
    }, 100); // Poll every 100ms for responsive updates
  }
  
  /**
   * Poll current audio levels
   */
  function pollAudioLevels() {
    fetch('/setup/super-powers/api/jaw-animation/' + currentCharacterId + '/audio-levels')
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          var currentAmp = data.currentAmplitude || data.simulatedLevel || 0;
          var smoothedAmp = data.smoothedAmplitude || 0;
          
          // Calculate target angle for display
          var config = getCurrentConfig();
          var targetAngle = calculateTargetAngle(smoothedAmp, config);
          
          updateAudioLevelDisplay(currentAmp, smoothedAmp, targetAngle);
        }
      })
      .catch(function(error) {
        // Silently handle polling errors to avoid spam
        console.debug('Audio level polling error:', error);
      });
  }
  
  /**
   * Update audio level displays
   */
  function updateAudioLevelDisplay(current, smoothed, targetAngle) {
    // Update numeric displays
    elements.currentAmplitude.textContent = current.toFixed(3);
    elements.smoothedAmplitude.textContent = smoothed.toFixed(3);
    elements.targetAngle.textContent = Math.round(targetAngle) + '°';
    
    // Update audio meter
    var percentage = Math.min(100, current * 100);
    elements.audioMeterFill.style.width = percentage + '%';
    
    // Add visual feedback based on level
    if (current > 0.1) {
      elements.audioMeterFill.style.boxShadow = '0 0 10px rgba(255, 107, 53, 0.7)';
    } else {
      elements.audioMeterFill.style.boxShadow = 'none';
    }
  }
  
  /**
   * Get current configuration for calculations
   */
  function getCurrentConfig() {
    return {
      sensitivity: parseFloat(elements.sensitivityRange.value),
      smoothing: parseFloat(elements.smoothingRange.value),
      volumeThreshold: parseFloat(elements.volumeThresholdRange.value),
      minAngle: currentConfig.minAngle || 0,
      maxAngle: currentConfig.maxAngle || 180
    };
  }
  
  /**
   * Calculate target angle based on amplitude and config
   */
  function calculateTargetAngle(amplitude, config) {
    if (amplitude < config.volumeThreshold) {
      return config.minAngle;
    }
    
    var sensitiveAmplitude = Math.min(1.0, amplitude * config.sensitivity);
    var angleRange = config.maxAngle - config.minAngle;
    
    return config.minAngle + (sensitiveAmplitude * angleRange);
  }
  
  /**
   * Show a specific section
   */
  function showSection(sectionId) {
    var section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'block';
    }
  }
  
  /**
   * Hide a specific section
   */
  function hideSection(sectionId) {
    var section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'none';
    }
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * Format duration in seconds to MM:SS
   */
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0:00';
    var mins = Math.floor(seconds / 60);
    var secs = Math.floor(seconds % 60);
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }
  
  /**
   * Show toast notification
   */
  function showToast(message, type) {
    var toastEl = elements.statusToast;
    var toastMessage = elements.toastMessage;
    
    if (!toastEl || !toastMessage) return;
    
    // Set message
    toastMessage.textContent = message;
    
    // Update toast style based on type
    var toastHeader = toastEl.querySelector('.toast-header');
    var icon = toastHeader.querySelector('i');
    
    if (icon) {
      icon.className = 'me-2';
      switch (type) {
        case 'success':
          icon.className += ' bi bi-check-circle text-success';
          break;
        case 'error':
          icon.className += ' bi bi-exclamation-circle text-danger';
          break;
        case 'warning':
          icon.className += ' bi bi-exclamation-triangle text-warning';
          break;
        default:
          icon.className += ' bi bi-info-circle text-primary';
      }
    }
    
    // Show toast
    var toast = new bootstrap.Toast(toastEl);
    toast.show();
  }
  
  // Initialize when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSuperPowers);
  } else {
    initSuperPowers();
  }
  
})();