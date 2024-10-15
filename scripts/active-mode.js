$(document).ready(function() {
    function clientLog(level, message) {
        $.post('/log', { level: level, message: message })
            .fail(function(xhr, status, error) {
                clientLog('error', 'Failed to log to server: ' + error);
            });
    }

    clientLog('info', 'Document ready');

    // Rest of the file remains unchanged
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
        clientLog('info', 'Loading character info');
        try {
            const characterData = $('#characterData').text();
            clientLog('debug', 'Character data from hidden element: ' + characterData);
            const character = JSON.parse(characterData);
            clientLog('debug', 'Parsed character data: ' + JSON.stringify(character));
            if (character && character.id) {
                characterId = character.id;
                displayCharacterInfo(character);
                fetchScenes(character.id);
                fetchCharacterParts(character.id);
            } else {
                clientLog('error', 'Invalid character data: ' + JSON.stringify(character));
                $('#debugInfo').append('<p>Error: Invalid character data</p>');
            }
        } catch (error) {
            clientLog('error', 'Error parsing character data: ' + error.message);
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
        clientLog('info', 'Displaying character info');
        let infoHtml = `<h3>${character.char_name}</h3><p>${character.char_description}</p>`;
        $('#characterInfo').html(infoHtml);
        
        if (character.image) {
            $('#characterImage').attr('src', `/images/characters/${character.image}`).attr('alt', character.char_name);
        } else {
            $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        }
    }

    function fetchCharacterParts(characterId) {
        clientLog('info', 'Fetching character parts for ID: ' + characterId);
        $.get(`/active-mode/character/${characterId}/parts`)
            .done(function(data) {
                clientLog('info', 'Character parts fetched successfully: ' + JSON.stringify(data));
                displayCharacterParts(data);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                clientLog('error', "Error fetching character parts: " + textStatus + " - " + errorThrown);
                clientLog('error', "Response text: " + jqXHR.responseText);
                $('#characterParts').html('<p>Failed to load character parts information. Please try again.</p>');
                $('#debugInfo').append(`<p>Error fetching character parts: ${textStatus} - ${errorThrown}</p>`);
            });
    }

    function displayCharacterParts(parts) {
        clientLog('info', 'Displaying character parts: ' + JSON.stringify(parts));
        let partsHtml = '<h4>Character Parts:</h4>';
        if (!Array.isArray(parts) || parts.length === 0) {
            clientLog('info', 'No parts to display');
            partsHtml += '<p>No parts assigned to this character.</p>';
        } else {
            partsHtml += '<ul>';
            parts.forEach(part => {
                clientLog('debug', 'Processing part: ' + JSON.stringify(part));
                partsHtml += `<li>
                    <strong>${part.name || 'Unnamed Part'}</strong> (${part.type || 'Unknown Type'})
                    <br>Description: ${part.description || 'N/A'}
                    <br>Direction Pin: ${part.directionPin || 'N/A'}
                    <br>Speed Pin: ${part.speedPin || 'N/A'}
                </li>`;
            });
            partsHtml += '</ul>';
        }

        clientLog('debug', 'Final parts HTML: ' + partsHtml);
        $('#characterParts').html(partsHtml);
    }

    function fetchScenes(characterId) {
        clientLog('info', `Fetching scenes for character ID: ${characterId}`);
        $.get(`/active-mode/character/${characterId}/scenes`)
            .done(function(scenes) {
                clientLog('info', `Scenes fetched successfully: ${JSON.stringify(scenes)}`);
                if (Array.isArray(scenes)) {
                    clientLog('info', `Number of scenes fetched: ${scenes.length}`);
                    scenes.forEach(scene => {
                        sceneDetails[scene.id] = {
                            name: scene.scene_name,
                            stepCount: scene.steps.length
                        };
                    });
                } else {
                    clientLog('error', 'Fetched scenes is not an array: ' + JSON.stringify(scenes));
                }
                displayScenes(scenes);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                clientLog('error', "Error fetching scenes: " + textStatus + " - " + errorThrown);
                clientLog('error', "Response text: " + jqXHR.responseText);
                handleSceneFetchError(jqXHR, textStatus, errorThrown);
            });
    }

    function displayScenes(scenes) {
        clientLog('info', `Displaying scenes: ${JSON.stringify(scenes)}`);
        $('#availableScenes').empty();
        if (!Array.isArray(scenes) || scenes.length === 0) {
            clientLog('info', 'No scenes to display');
            $('#availableScenes').append('<option value="">No available scenes</option>');
        } else {
            scenes.forEach(function(scene) {
                clientLog('debug', `Adding scene to select: ID ${scene.id}, Name: ${scene.scene_name}`);
                $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
            });
        }
        $('#sceneSelectionArea').show();
        clientLog('debug', 'Scene selection area should now be visible');
        clientLog('debug', 'Scene selection area display style: ' + $('#sceneSelectionArea').css('display'));
        clientLog('debug', 'Available scenes HTML: ' + $('#availableScenes').html());
    }

    function handleSceneFetchError(jqXHR, textStatus, errorThrown) {
        clientLog('error', "Error fetching scenes: " + textStatus + " - " + errorThrown);
        $('#availableScenes').html('<option>Failed to load scenes</option>');
        $('#debugInfo').append(`<p>Error fetching scenes: ${textStatus} - ${errorThrown}</p>`);
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
            $.post(`/scenes/${currentSceneId}/stop`)
                .done(function(response) {
                    logArmedModeOutput('Current scene stopped: ' + response.message);
                })
                .fail(function(xhr, status, error) {
                    clientLog('error', 'Error stopping current scene: ' + error);
                    logArmedModeOutput('Error stopping current scene: ' + error);
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

        function runNextScene(index) {
            if (!isArmed) {
                logArmedModeOutput('System disarmed. Stopping Active Mode loop.');
                return;
            }
            
            if (index >= scenes.length) {
                logArmedModeOutput('All scenes completed. Restarting from the first scene.');
                index = 0; // Reset index to loop from the beginning
                resetConsecutiveFailures();
            }

            const sceneId = scenes[index];
            currentSceneId = sceneId; // Set currentSceneId when starting a scene
            updateCurrentScene(sceneId);
            const sceneName = sceneDetails[sceneId].name;
            const stepCount = sceneDetails[sceneId].stepCount;
            logArmedModeOutput(`Starting execution of scene ${sceneId}: ${sceneName}, ${stepCount} steps`);
            
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}: ${sceneName}`);
                retryCount = 0;
                resetConsecutiveFailures();
                if (isArmed) {
                    logArmedModeOutput(`Waiting ${delay/1000} seconds before starting next scene.`);
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${sceneName}: ${error.message}`, 'error');
                incrementConsecutiveFailures();
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    logArmedModeOutput(`Max consecutive failures (${MAX_CONSECUTIVE_FAILURES}) reached. Stopping Active Mode.`, 'error');
                    disarmSystem();
                    return;
                }
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    logArmedModeOutput(`Retrying scene ${sceneId}: ${sceneName} (Attempt ${retryCount} of ${MAX_RETRIES})`, 'warning');
                    setTimeout(() => runNextScene(index), delay);
                } else {
                    retryCount = 0;
                    logArmedModeOutput(`Max retries reached for scene ${sceneId}: ${sceneName}. Moving to next scene.`, 'warning');
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            clientLog('info', `Starting execution of scene ${sceneId}`);
            const eventSource = new EventSource(`/scenes/${sceneId}/play?characterId=${characterId}&_=${Date.now()}`, {
                withCredentials: true
            });

            let sceneTimeout = setTimeout(() => {
                logArmedModeOutput(`Scene ${sceneId}: ${sceneDetails[sceneId].name} timed out after ${SCENE_TIMEOUT/1000} seconds. Moving to next scene.`, 'warning');
                eventSource.close();
                reject(new Error(`Scene ${sceneId}: ${sceneDetails[sceneId].name} timed out`));
            }, SCENE_TIMEOUT);

            eventSource.onopen = function(event) {
                clientLog('info', `SSE connection opened for scene ${sceneId}`);
                logArmedModeOutput(`SSE connection opened for scene ${sceneId}: ${sceneDetails[sceneId].name}`);
            };

            eventSource.onmessage = function(event) {
                clientLog('debug', `Received SSE data for scene ${sceneId}: ${event.data}`);
                try {
                    const data = JSON.parse(event.data);
                    handleSceneUpdate(data);
                } catch (error) {
                    clientLog('error', `Error parsing SSE data for scene ${sceneId}: ${error}`);
                    logArmedModeOutput(`Error parsing SSE data for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.message}`, 'error');
                }
            };

            eventSource.onerror = function(error) {
                clientLog('error', `SSE Error for scene ${sceneId}: ${error}`);
                clientLog('error', `SSE ReadyState: ${eventSource.readyState}`);
                clientLog('error', `SSE URL: ${eventSource.url}`);
                eventSource.close();
                clearTimeout(sceneTimeout);
                logArmedModeOutput(`SSE Error for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.type}`, 'error');
                reject(new Error(`SSE Error for scene ${sceneId}: ${sceneDetails[sceneId].name}: ${error.type}`));
            };

            eventSource.addEventListener('scene_end', function(event) {
                clientLog('info', `Scene ${sceneId} completed`);
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
        clientLog(type, message);
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
