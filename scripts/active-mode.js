$(document).ready(function() {
    function log(level, message) {
        axios.post('/client-log', { level, message })
            .catch(function(error) {
                // Replace console.error with another axios call to log the error
                axios.post('/client-log', { level: 'error', message: 'Failed to log to server: ' + error.message });
            });
    }

    log('info', 'Document ready');

    let isArmed = false;
    let currentSceneId = null;
    let retryCount = 0;
    let characterId = null;
    let MAX_RETRIES = 3;
    let SCENE_TIMEOUT = 120000; // 2 minutes timeout for each scene
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 5;
    let sceneDetails = {}; // Store scene names and step counts

    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable({
        update: updateArmButtonState
    }).selectable();
    $('#armButton').click(armSystem);
    $('#disarmButton').click(disarmSystem);

    $('#sceneSelectionArea').show();

    loadCharacterInfo();
    loadSavedSettings();

    function loadCharacterInfo() {
        log('info', 'Loading character info');
        try {
            const characterData = $('#characterData').text();
            log('debug', 'Character data from hidden element: ' + characterData);
            const character = JSON.parse(characterData);
            log('debug', 'Parsed character data: ' + JSON.stringify(character));
            if (character && character.id) {
                characterId = character.id;
                displayCharacterInfo(character);
                fetchScenes(character.id);
                fetchCharacterParts(character.id);
            } else {
                log('error', 'Invalid character data: ' + JSON.stringify(character));
                $('#debugInfo').append('<p>Error: Invalid character data</p>');
            }
        } catch (error) {
            log('error', 'Error parsing character data: ' + error.message);
            $('#debugInfo').append(`<p>Error parsing character data: ${error.message}</p>`);
        }
    }

    function loadSavedSettings() {
        const savedMaxRetries = localStorage.getItem('maxRetries');
        const savedSceneTimeout = localStorage.getItem('sceneTimeout');

        if (savedMaxRetries) {
            $('#maxRetries').val(savedMaxRetries);
            MAX_RETRIES = parseInt(savedMaxRetries);
        }

        if (savedSceneTimeout) {
            $('#sceneTimeout').val(savedSceneTimeout);
            SCENE_TIMEOUT = parseInt(savedSceneTimeout) * 1000; // Convert to milliseconds
        }
    }

    function saveSettings() {
        localStorage.setItem('maxRetries', MAX_RETRIES);
        localStorage.setItem('sceneTimeout', SCENE_TIMEOUT / 1000); // Save in seconds
    }

    function displayCharacterInfo(character) {
        log('info', 'Displaying character info');
        let infoHtml = `<h3>${character.char_name}</h3><p>${character.char_description}</p>`;
        $('#characterInfo').html(infoHtml);
        
        if (character.image) {
            $('#characterImage').attr('src', `/images/characters/${character.image}`).attr('alt', character.char_name);
        } else {
            $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        }
    }

    function fetchCharacterParts(characterId) {
        log('info', 'Fetching character parts for ID: ' + characterId);
        axios.get(`/active-mode/character/${characterId}/parts`)
            .then(function(response) {
                log('info', 'Character parts fetched successfully: ' + JSON.stringify(response.data));
                displayCharacterParts(response.data);
            })
            .catch(function(error) {
                log('error', "Error fetching character parts: " + error.message);
                $('#characterParts').html('<p>Failed to load character parts information. Please try again.</p>');
                $('#debugInfo').append(`<p>Error fetching character parts: ${error.message}</p>`);
            });
    }

    function displayCharacterParts(parts) {
        log('info', 'Displaying character parts: ' + JSON.stringify(parts));
        let partsHtml = '<h4>Character Parts:</h4>';
        if (!Array.isArray(parts) || parts.length === 0) {
            log('info', 'No parts to display');
            partsHtml += '<p>No parts assigned to this character.</p>';
        } else {
            partsHtml += '<ul>';
            parts.forEach(part => {
                log('debug', 'Processing part: ' + JSON.stringify(part));
                partsHtml += `<li>
                    <strong>${part.name || 'Unnamed Part'}</strong> (${part.type || 'Unknown Type'})
                    <br>Description: ${part.description || 'N/A'}
                    <br>Direction Pin: ${part.directionPin || 'N/A'}
                    <br>Speed Pin: ${part.speedPin || 'N/A'}
                </li>`;
            });
            partsHtml += '</ul>';
        }

        log('debug', 'Final parts HTML: ' + partsHtml);
        $('#characterParts').html(partsHtml);
    }

    function fetchScenes(characterId) {
        log('info', `Fetching scenes for character ID: ${characterId}`);
        axios.get(`/active-mode/character/${characterId}/scenes`)
            .then(function(response) {
                const scenes = response.data;
                log('info', `Scenes fetched successfully: ${JSON.stringify(scenes)}`);
                if (Array.isArray(scenes)) {
                    log('info', `Number of scenes fetched: ${scenes.length}`);
                    scenes.forEach(scene => {
                        sceneDetails[scene.id] = {
                            name: scene.scene_name,
                            stepCount: scene.steps.length
                        };
                    });
                } else {
                    log('error', 'Fetched scenes is not an array: ' + JSON.stringify(scenes));
                }
                displayScenes(scenes);
            })
            .catch(function(error) {
                log('error', "Error fetching scenes: " + error.message);
                handleSceneFetchError(error);
            });
    }

    function displayScenes(scenes) {
        log('info', `Displaying scenes: ${JSON.stringify(scenes)}`);
        $('#availableScenes').empty();
        if (!Array.isArray(scenes) || scenes.length === 0) {
            log('info', 'No scenes to display');
            $('#availableScenes').append('<option value="">No available scenes</option>');
        } else {
            scenes.forEach(function(scene) {
                log('debug', `Adding scene to select: ID ${scene.id}, Name: ${scene.scene_name}`);
                $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
            });
        }
        $('#sceneSelectionArea').show();
        log('debug', 'Scene selection area should now be visible');
        log('debug', 'Scene selection area display style: ' + $('#sceneSelectionArea').css('display'));
        log('debug', 'Available scenes HTML: ' + $('#availableScenes').html());
    }

    function handleSceneFetchError(error) {
        log('error', "Error fetching scenes: " + error.message);
        $('#availableScenes').html('<option>Failed to load scenes</option>');
        $('#debugInfo').append(`<p>Error fetching scenes: ${error.message}</p>`);
    }

    function addScenes() {
        $('#availableScenes option:selected').each(function() {
            const sceneId = $(this).val();
            const sceneName = $(this).text();
            $('#activatedScenes').append(`<li data-id="${sceneId}">${sceneName}</li>`);
            $(this).remove();
        });
        updateArmButtonState();
    }

    function removeScenes() {
        $('#activatedScenes li.ui-selected').each(function() {
            const sceneId = $(this).data('id');
            const sceneName = $(this).text();
            $('#availableScenes').append(`<option value="${sceneId}">${sceneName}</option>`);
            $(this).remove();
        });
        updateArmButtonState();
    }

    function updateArmButtonState() {
        const hasActivatedScenes = $('#activatedScenes li').length > 0;
        $('#armButton').prop('disabled', !hasActivatedScenes);
    }

    function armSystem() {
        if ($('#activatedScenes li').length === 0) {
            alert('Please select at least one scene to activate.');
            return;
        }
        isArmed = true;
        $('#armButton').prop('disabled', true);
        $('#disarmButton').prop('disabled', false);
        $('#armStatus').text('ARMED').removeClass('disarmed').addClass('armed');
        logArmedModeOutput('System armed. Starting Active Mode.');
        
        // Update MAX_RETRIES and SCENE_TIMEOUT from input fields
        MAX_RETRIES = parseInt($('#maxRetries').val());
        SCENE_TIMEOUT = parseInt($('#sceneTimeout').val()) * 1000; // Convert to milliseconds
        saveSettings();
        
        resetSystemInfo();
        startActiveModeLoop();
    }

    function disarmSystem() {
        isArmed = false;
        $('#armButton').prop('disabled', false);
        $('#disarmButton').prop('disabled', true);
        $('#armStatus').text('DISARMED').removeClass('armed').addClass('disarmed');
        logArmedModeOutput('System disarmed. Active Mode stopped.');
        resetSystemInfo();
        stopCurrentScene();
    }

    function stopCurrentScene() {
        if (currentSceneId) {
            axios.post(`/scenes/${currentSceneId}/stop`)
                .then(function(response) {
                    logArmedModeOutput('Current scene stopped: ' + response.data.message);
                })
                .catch(function(error) {
                    log('error', 'Error stopping current scene: ' + error.message);
                    logArmedModeOutput('Error stopping current scene: ' + error.message);
                });
        } else {
            logArmedModeOutput('No current scene to stop.');
        }
        currentSceneId = null;
        updateCurrentScene('None');
    }

    function startActiveModeLoop() {
        const scenes = $('#activatedScenes li').map(function() {
            return $(this).data('id');
        }).get();
        const delay = parseInt($('#sceneDelay').val()) * 1000 || 5000;
        let loopCount = 0;

        function runNextScene(index) {
            if (!isArmed) {
                logArmedModeOutput('System disarmed. Stopping Active Mode loop.');
                return;
            }
            
            if (index >= scenes.length) {
                loopCount++;
                logArmedModeOutput(`Playlist loop #${loopCount} completed. Restarting from the first scene.`);
                index = 0; // Reset index to loop from the beginning
                resetConsecutiveFailures();
            }

            const sceneId = scenes[index];
            currentSceneId = sceneId; // Set currentSceneId when starting a scene
            updateCurrentScene(sceneId);
            const sceneName = sceneDetails[sceneId].name;
            const stepCount = sceneDetails[sceneId].stepCount;
            logArmedModeOutput(`Starting execution of scene ${index + 1}/${scenes.length}: ${sceneId}: ${sceneName}, ${stepCount} steps`);
            
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${index + 1}/${scenes.length}: ${sceneId}: ${sceneName}`);
                retryCount = 0;
                resetConsecutiveFailures();
                if (isArmed) {
                    logArmedModeOutput(`Waiting ${delay/1000} seconds before starting next scene.`);
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${index + 1}/${scenes.length}: ${sceneId}: ${sceneName}: ${error.message}`, 'error');
                incrementConsecutiveFailures();
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    logArmedModeOutput(`Max consecutive failures (${MAX_CONSECUTIVE_FAILURES}) reached. Stopping Active Mode.`, 'error');
                    disarmSystem();
                    return;
                }
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    logArmedModeOutput(`Retrying scene ${index + 1}/${scenes.length}: ${sceneId}: ${sceneName} (Attempt ${retryCount} of ${MAX_RETRIES})`, 'warning');
                    setTimeout(() => runNextScene(index), delay);
                } else {
                    retryCount = 0;
                    logArmedModeOutput(`Max retries reached for scene ${index + 1}/${scenes.length}: ${sceneId}: ${sceneName}. Moving to next scene.`, 'warning');
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            log('info', `Starting execution of scene ${sceneId}`);
            const eventSource = new EventSource(`/scenes/${sceneId}/play?characterId=${characterId}&_=${Date.now()}`, {
                withCredentials: true
            });

            let sceneTimeout = setTimeout(() => {
                logArmedModeOutput(`Scene ${sceneId}: ${sceneDetails[sceneId].name} timed out after ${SCENE_TIMEOUT/1000} seconds. Moving to next scene.`, 'warning');
                eventSource.close();
                reject(new Error(`Scene ${sceneId}: ${sceneDetails[sceneId].name} timed out`));
            }, SCENE_TIMEOUT);

            eventSource.onopen = function(event) {
                log('info', `SSE connection opened for scene ${sceneId}`);
                logArmedModeOutput(`SSE connection opened for scene ${sceneId}: ${sceneDetails[sceneId].name}`);
            };

            eventSource.onmessage = function(event) {
                log('debug', `Received SSE data for scene ${sceneId}: ${event.data}`);
                try {
                    const data = JSON.parse(event.data);
                    handleSceneUpdate(data);
                } catch (error) {
                    log('error', `Error parsing SSE data for scene ${sceneId}: ${error}`);
                    logArmedModeOutput(`Error parsing SSE data for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.message}`, 'error');
                }
            };

            eventSource.onerror = function(error) {
                log('error', `SSE Error for scene ${sceneId}: ${error}`);
                log('error', `SSE ReadyState: ${eventSource.readyState}`);
                log('error', `SSE URL: ${eventSource.url}`);
                eventSource.close();
                clearTimeout(sceneTimeout);
                logArmedModeOutput(`SSE Error for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.type}`, 'error');
                reject(new Error(`SSE Error for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.type}`));
            };

            eventSource.addEventListener('scene_end', function(event) {
                log('info', `Scene ${sceneId} completed`);
                logArmedModeOutput(`Scene ${sceneId}: ${sceneDetails[sceneId].name} completed`);
                eventSource.close();
                clearTimeout(sceneTimeout);
                resolve();
            });

            currentSceneId = sceneId;
        });
    }

    function handleSceneUpdate(data) {
        if (data.message) {
            logArmedModeOutput(data.message);
        }
        if (data.currentStep !== undefined) {
            logArmedModeOutput(`Current Step: ${data.currentStep}`);
        }
        if (data.progress) {
            logArmedModeOutput(`Progress: ${data.progress}`);
        }
        if (data.error) {
            logArmedModeOutput(`Error: ${data.error}`, 'error');
        }
    }

    function logArmedModeOutput(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        let cssClass = '';
        switch (type) {
            case 'error':
                cssClass = 'text-danger';
                break;
            case 'warning':
                cssClass = 'text-warning';
                break;
            default:
                cssClass = 'text-info';
        }
        $('#armedModeOutput').append(`<p class="${cssClass}">[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
        log(type, message);
    }

    function updateCurrentScene(sceneId) {
        const sceneName = sceneId === 'None' ? 'None' : `${sceneId}: ${sceneDetails[sceneId].name}`;
        $('#currentScene').text(sceneName);
    }

    function incrementConsecutiveFailures() {
        consecutiveFailures++;
        $('#consecutiveFailures').text(consecutiveFailures);
    }

    function resetConsecutiveFailures() {
        consecutiveFailures = 0;
        $('#consecutiveFailures').text(consecutiveFailures);
    }

    function resetSystemInfo() {
        updateCurrentScene('None');
        resetConsecutiveFailures();
        $('#maxRetries').text(MAX_RETRIES);
        $('#sceneTimeout').text(SCENE_TIMEOUT / 1000);
    }
});
