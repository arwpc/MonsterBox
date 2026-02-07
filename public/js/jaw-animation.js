/**
 * Jaw Animation Configuration JavaScript (ES5)
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
   * Initialize the Jaw Animation interface
   */
  function initJawAnimation() {
    console.log('🎃 Initializing Jaw Animation interface...');
    
    // Cache DOM elements
    cacheElements();
    
    // Bind event listeners
    bindEvents();
    
    // Get current character from navigation
    initCurrentCharacter();
    
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
   * Load configuration for selected character
   */
  function loadCharacterConfig(characterId) {
    console.log('🦷 Loading jaw animation config for character:', characterId);
    
    showSection('loadingSection');
    hideSection('jawAnimationSection');
    hideSection('servosSummarySection');
    hideSection('noCharacterSection');
    
    fetch('/setup/jaw-animation/api/jaw-animation/' + characterId)
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
    
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId, {
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
   * Test jaw movement
   */
  function testJawMovement() {
    if (!currentCharacterId) {
      showToast('No character selected', 'error');
      return;
    }
    
    elements.testJawBtn.disabled = true;
    elements.testJawBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
    
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/test', {
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
    
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/start-monitoring', {
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
    
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/stop-monitoring', {
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
    elements.emergencyStopBtn.classList.add('btn-danger');
    elements.emergencyStopBtn.classList.remove('btn-outline-danger');
    
    setTimeout(function() {
      elements.emergencyStopBtn.classList.remove('btn-danger');
      elements.emergencyStopBtn.classList.add('btn-outline-danger');
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
    fetch('/setup/jaw-animation/api/jaw-animation/' + currentCharacterId + '/audio-levels')
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          var currentAmp = data.currentAmplitude || data.simulatedLevel || 0;
          var smoothedAmp = data.smoothedAmplitude || 0;
          
          // Calculate target angle for display
          var config = getCurrentConfig();
          var angle = calculateTargetAngle(smoothedAmp, config);
          
          updateAudioLevelDisplay(currentAmp, smoothedAmp, angle);
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
  function updateAudioLevelDisplay(current, smoothed, angle) {
    // Update numeric displays
    elements.currentAmplitude.textContent = current.toFixed(3);
    elements.smoothedAmplitude.textContent = smoothed.toFixed(3);
    elements.targetAngle.textContent = Math.round(angle) + '°';
    
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
    document.addEventListener('DOMContentLoaded', initJawAnimation);
  } else {
    initJawAnimation();
  }
  
})();
