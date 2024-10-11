$(document).ready(function() {
    console.log('Document ready');

    let isArmed = false;
    let currentSceneId = null;
    let retryCount = 0;
    let characterId = null;
    const MAX_RETRIES = 3;
    const POLLING_INTERVAL = 1000; // 1 second

    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable({
        update: updateArmButtonState
    }).selectable();
    $('#armButton').click(armSystem);
    $('#disarmButton').click(disarmSystem);

    $('#sceneSelectionArea').show();

    loadCharacterInfo();

    function loadCharacterInfo() {
        console.log('Loading character info');
        try {
            const characterData = $('#characterData').text();
            console.log('Character data from hidden element:', characterData);
            const character = JSON.parse(characterData);
            console.log('Parsed character data:', character);
            if (character && character.id) {
                characterId = character.id;
                displayCharacterInfo(character);
                fetchScenes(character.id);
                fetchCharacterParts(character.id);
            } else {
                console.error('Invalid character data:', character);
                $('#debugInfo').append('<p>Error: Invalid character data</p>');
            }
        } catch (error) {
            console.error('Error parsing character data:', error);
            $('#debugInfo').append(`<p>Error parsing character data: ${error.message}</p>`);
        }
    }

    function displayCharacterInfo(character) {
        console.log('Displaying character info');
        let infoHtml = `<h3>${character.char_name}</h3><p>${character.char_description}</p>`;
        $('#characterInfo').html(infoHtml);
        
        if (character.image) {
            $('#characterImage').attr('src', `/images/characters/${character.image}`).attr('alt', character.char_name);
        } else {
            $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        }
    }

    function fetchCharacterParts(characterId) {
        console.log('Fetching character parts for ID:', characterId);
        $.get(`/active-mode/character/${characterId}/parts`)
            .done(function(data) {
                console.log('Character parts fetched successfully:', data);
                displayCharacterParts(data);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Error fetching character parts:", textStatus, errorThrown);
                console.error("Response text:", jqXHR.responseText);
                $('#characterParts').html('<p>Failed to load character parts information. Please try again.</p>');
                $('#debugInfo').append(`<p>Error fetching character parts: ${textStatus} - ${errorThrown}</p>`);
            });
    }

    function displayCharacterParts(parts) {
        console.log('Displaying character parts:', parts);
        let partsHtml = '<h4>Character Parts:</h4>';
        if (!Array.isArray(parts) || parts.length === 0) {
            console.log('No parts to display');
            partsHtml += '<p>No parts assigned to this character.</p>';
        } else {
            partsHtml += '<ul>';
            parts.forEach(part => {
                console.log('Processing part:', part);
                partsHtml += `<li>
                    <strong>${part.name || 'Unnamed Part'}</strong> (${part.type || 'Unknown Type'})
                    <br>Description: ${part.description || 'N/A'}
                    <br>Direction Pin: ${part.directionPin || 'N/A'}
                    <br>Speed Pin: ${part.speedPin || 'N/A'}
                </li>`;
            });
            partsHtml += '</ul>';
        }

        console.log('Final parts HTML:', partsHtml);
        $('#characterParts').html(partsHtml);
    }

    function fetchScenes(characterId) {
        console.log(`Fetching scenes for character ID: ${characterId}`);
        $.get(`/active-mode/character/${characterId}/scenes`)
            .done(function(scenes) {
                console.log(`Scenes fetched successfully:`, scenes);
                if (Array.isArray(scenes)) {
                    console.log(`Number of scenes fetched: ${scenes.length}`);
                } else {
                    console.error('Fetched scenes is not an array:', scenes);
                }
                displayScenes(scenes);
            })
            .fail(function(jqXHR, textStatus, errorThrown) {
                console.error("Error fetching scenes:", textStatus, errorThrown);
                console.error("Response text:", jqXHR.responseText);
                handleSceneFetchError(jqXHR, textStatus, errorThrown);
            });
    }

    function displayScenes(scenes) {
        console.log(`Displaying scenes:`, scenes);
        $('#availableScenes').empty();
        if (!Array.isArray(scenes) || scenes.length === 0) {
            console.log('No scenes to display');
            $('#availableScenes').append('<option value="">No available scenes</option>');
        } else {
            scenes.forEach(function(scene) {
                console.log(`Adding scene to select: ID ${scene.id}, Name: ${scene.scene_name}`);
                $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
            });
        }
        $('#sceneSelectionArea').show();
        console.log('Scene selection area should now be visible');
        console.log('Scene selection area display style:', $('#sceneSelectionArea').css('display'));
        console.log('Available scenes HTML:', $('#availableScenes').html());
    }

    function handleSceneFetchError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching scenes:", textStatus, errorThrown);
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
        startActiveModeLoop();
    }

    function disarmSystem() {
        isArmed = false;
        $('#armButton').prop('disabled', false);
        $('#disarmButton').prop('disabled', true);
        $('#armStatus').text('DISARMED').removeClass('armed').addClass('disarmed');
        logArmedModeOutput('System disarmed. Active Mode stopped.');
        stopCurrentScene();
    }

    function stopCurrentScene() {
        if (currentSceneId) {
            $.post(`/scenes/${currentSceneId}/stop`)
                .done(function(response) {
                    logArmedModeOutput('Current scene stopped: ' + response.message);
                })
                .fail(function(xhr, status, error) {
                    console.error('Error stopping current scene:', error);
                    logArmedModeOutput('Error stopping current scene: ' + error);
                });
        }
        currentSceneId = null;
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
            }

            const sceneId = scenes[index];
            logArmedModeOutput(`Starting execution of scene ${sceneId}`);
            
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}`);
                retryCount = 0;
                if (isArmed) {
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${error.message}`);
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    logArmedModeOutput(`Retrying scene ${sceneId} (Attempt ${retryCount} of ${MAX_RETRIES})`);
                    setTimeout(() => runNextScene(index), delay);
                } else {
                    retryCount = 0;
                    logArmedModeOutput(`Max retries reached for scene ${sceneId}. Moving to next scene.`);
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            console.log(`Starting execution of scene ${sceneId}`);
            const eventSource = new EventSource(`/scenes/${sceneId}/play?characterId=${characterId}&_=${Date.now()}`, {
                withCredentials: true
            });

            eventSource.onopen = function(event) {
                console.log(`SSE connection opened for scene ${sceneId}`);
                logArmedModeOutput(`SSE connection opened for scene ${sceneId}`);
            };

            eventSource.onmessage = function(event) {
                console.log(`Received SSE data for scene ${sceneId}:`, event.data);
                try {
                    const data = JSON.parse(event.data);
                    handleSceneUpdate(data);
                } catch (error) {
                    console.error(`Error parsing SSE data for scene ${sceneId}:`, error);
                    logArmedModeOutput(`Error parsing SSE data for scene ${sceneId}: ${error.message}`, 'error');
                }
            };

            eventSource.onerror = function(error) {
                console.error(`SSE Error for scene ${sceneId}:`, error);
                console.error(`SSE ReadyState: ${eventSource.readyState}`);
                console.error(`SSE URL: ${eventSource.url}`);
                eventSource.close();
                logArmedModeOutput(`SSE Error for scene ${sceneId}: ${error.type}`, 'error');
                reject(new Error(`SSE Error for scene ${sceneId}: ${error.type}`));
            };

            eventSource.addEventListener('scene_end', function(event) {
                console.log(`Scene ${sceneId} completed`);
                logArmedModeOutput(`Scene ${sceneId} completed`);
                eventSource.close();
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
    }
});
