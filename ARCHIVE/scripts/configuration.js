document.addEventListener('DOMContentLoaded', function() {
    const cleanupBtn = document.getElementById('cleanupBtn');
    const rebootBtn = document.getElementById('rebootBtn');
    const cleanupModal = document.getElementById('cleanupModal');
    const cleanupFileList = document.getElementById('cleanupFileList');
    const cleanupFileStats = document.getElementById('cleanupFileStats');
    const cleanupModalError = document.getElementById('cleanupModalError');
    const confirmCleanupBtn = document.getElementById('confirmCleanupBtn');
    const cancelCleanupBtn = document.getElementById('cancelCleanupBtn');
    const statusMessage = document.getElementById('statusMessage');
    const errorMessage = document.getElementById('errorMessage');

    // Cleanup functionality
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', async function() {
            cleanupBtn.disabled = true;
            cleanupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            clearMessages();
            
            try {
                cleanupFileList.innerHTML = '<div>Sound files will be analyzed and unused files will be deleted</div>';
                cleanupFileStats.innerHTML = 'Click "Delete Files" to remove any unused sound files';
                cleanupModalError.textContent = '';
                cleanupModal.style.display = 'flex';
            } catch (err) {
                console.error('Cleanup preparation error:', err);
                showError('Error preparing for cleanup: ' + err.message);
            } finally {
                cleanupBtn.disabled = false;
                cleanupBtn.innerHTML = '<i class="fas fa-broom"></i> Cleanup Unused Sound Files';
            }
        });
    }

    // Cancel cleanup
    if (cancelCleanupBtn) {
        cancelCleanupBtn.addEventListener('click', function() {
            cleanupModal.style.display = 'none';
        });
    }

    // Confirm cleanup
    if (confirmCleanupBtn) {
        confirmCleanupBtn.addEventListener('click', async function() {
            confirmCleanupBtn.disabled = true;
            cancelCleanupBtn.disabled = true;
            confirmCleanupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            cleanupModalError.textContent = '';
            
            try {
                const response = await axios.post('/cleanup/run');
                
                if (!response.data.success) {
                    throw new Error(response.data.error || 'Cleanup failed');
                }
                
                // Close the modal
                cleanupModal.style.display = 'none';
                
                // Show success message
                const message = response.data.message || 'Cleanup completed';
                let displayMessage = message;
                
                // Display missing files information if available
                if (response.data.missingFiles && response.data.missingFiles.length > 0) {
                    const missingFilesList = response.data.missingFiles.map(f => 
                        `ID: ${f.id}, Name: ${f.name}, Missing file: ${f.filename}`
                    ).join('<br>');
                    displayMessage += '<br><br><strong>Files missing from disk:</strong><br>' + missingFilesList;
                }
                
                showStatus(displayMessage);
                
                // Auto-hide success message after 5 seconds
                setTimeout(() => {
                    clearMessages();
                }, 5000);
                
            } catch (error) {
                console.error('Cleanup error:', error);
                let errorMsg = 'Cleanup failed: ';
                
                if (error.response && error.response.data && error.response.data.details) {
                    errorMsg += error.response.data.details;
                } else if (error.response && error.response.data && error.response.data.error) {
                    errorMsg += error.response.data.error;
                } else if (error.message) {
                    errorMsg += error.message;
                } else {
                    errorMsg += 'Unknown error occurred';
                }
                
                cleanupModalError.textContent = errorMsg;
            } finally {
                confirmCleanupBtn.disabled = false;
                cancelCleanupBtn.disabled = false;
                confirmCleanupBtn.innerHTML = 'Delete Files';
            }
        });
    }

    // Reboot functionality
    if (rebootBtn) {
        rebootBtn.addEventListener('click', async function() {
            if (!confirm('Are you sure you want to reboot the system? This will disconnect all users and restart all services.')) {
                return;
            }

            rebootBtn.disabled = true;
            rebootBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rebooting...';
            clearMessages();

            try {
                const response = await axios.post('/configuration/reboot');
                
                if (response.data.success) {
                    showStatus('System reboot initiated. The system will restart in a few seconds...');
                    
                    // Disable all buttons and show countdown
                    const allButtons = document.querySelectorAll('button, a.button');
                    allButtons.forEach(btn => btn.disabled = true);
                    
                    // Show countdown
                    let countdown = 10;
                    const countdownInterval = setInterval(() => {
                        showStatus(`System rebooting... Please wait ${countdown} seconds before refreshing the page.`);
                        countdown--;
                        
                        if (countdown <= 0) {
                            clearInterval(countdownInterval);
                            showStatus('System should be restarting now. Please refresh the page in a moment.');
                        }
                    }, 1000);
                    
                } else {
                    throw new Error(response.data.error || 'Reboot failed');
                }
            } catch (error) {
                console.error('Reboot error:', error);
                let errorMsg = 'Failed to reboot system: ';
                
                if (error.response && error.response.data && error.response.data.details) {
                    errorMsg += error.response.data.details;
                } else if (error.response && error.response.data && error.response.data.error) {
                    errorMsg += error.response.data.error;
                } else if (error.message) {
                    errorMsg += error.message;
                } else {
                    errorMsg += 'Unknown error occurred';
                }
                
                showError(errorMsg);
                
                // Re-enable reboot button
                rebootBtn.disabled = false;
                rebootBtn.innerHTML = '<i class="fas fa-power-off"></i> Reboot System';
            }
        });
    }

    // Utility functions
    function showStatus(message) {
        statusMessage.innerHTML = message;
        statusMessage.style.display = 'block';
        statusMessage.style.color = 'var(--primary-color)';
        statusMessage.style.background = 'rgba(0, 255, 0, 0.1)';
        statusMessage.style.padding = '15px';
        statusMessage.style.borderRadius = '4px';
        statusMessage.style.border = '1px solid var(--primary-color)';
        errorMessage.style.display = 'none';
    }

    function showError(message) {
        errorMessage.innerHTML = message;
        errorMessage.style.display = 'block';
        errorMessage.style.background = 'rgba(255, 68, 68, 0.1)';
        errorMessage.style.padding = '15px';
        errorMessage.style.borderRadius = '4px';
        errorMessage.style.border = '1px solid #ff4444';
        statusMessage.style.display = 'none';
    }

    function clearMessages() {
        statusMessage.style.display = 'none';
        errorMessage.style.display = 'none';
    }

    // Close modal when clicking outside
    cleanupModal.addEventListener('click', function(e) {
        if (e.target === cleanupModal) {
            cleanupModal.style.display = 'none';
        }
    });
});
