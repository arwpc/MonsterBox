// File: scripts/active-mode.js

$(document).ready(function() {
    let isArmed = false;
    let currentEventSource = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    $('#characterSelect').change(fetchCharacterInfo);
    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable({
        update: updateSceneTimeline
    }).selectable();
    $('#armButton').click(confirmArmSystem);
    $('#disarmButton').click(confirmDisarmSystem);
    $('#stopAllSteps').click(stopAllSteps);
    $('#sceneDelay').on('input', updateSceneTimeline);

    // Load the first character by default
    loadFirstCharacter();

    function loadFirstCharacter() {
        const firstCharacter = $('#characterSelect option:eq(1)');
        if (firstCharacter.length > 0) {
            $('#characterSelect').val(firstCharacter.val()).trigger('change');
        }
    }

    function fetchCharacterInfo() {
        const characterId = $(this).val();
        if (characterId) {
            $.get(`/active-mode/character/${characterId}`, function(character) {
                displayCharacterInfo(character);
                fetchScenes(characterId);
                fetchPartsAndSounds(characterId);
            }).fail(handleCharacterInfoError);
        } else {
            clearCharacterInfo();
        }
    }

    function displayCharacterInfo(character) {
        let infoHtml = `<h3>${character.char_name}</h3><p>${character.char_description}</p>`;
        $('#characterInfo').html(infoHtml);
        
        if (character.image) {
            $('#characterImage').attr('src', `/images/characters/${character.image}`).attr('alt', character.char_name);
        } else {
            $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        }
    }

    function fetchPartsAndSounds(characterId) {
        $.get(`/active-mode/character/${characterId}/parts-and-sounds`, function(data) {
            displayPartsAndSounds(data);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Error fetching parts and sounds:", textStatus, errorThrown);
            $('#partsAndSounds').html('<p>Failed to load parts and sounds information. Please try again.</p>');
        });
    }

    function displayPartsAndSounds(data) {
        let partsHtml = '<h4>Parts:</h4><ul>';
        data.parts.forEach(part => {
            partsHtml += `<li>${part.part_name} (${part.part_type})</li>`;
        });
        partsHtml += '</ul>';

        let soundsHtml = '<h4>Sounds:</h4><ul>';
        data.sounds.forEach(sound => {
            soundsHtml += `<li>${sound.sound_name}</li>`;
        });
        soundsHtml += '</ul>';

        $('#partsAndSounds').html(partsHtml + soundsHtml);
    }

    function handleCharacterInfoError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching character info:", textStatus, errorThrown);
        $('#characterInfo').html('<p>Failed to load character information. Please try again.</p>');
        $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        $('#partsAndSounds').empty();
    }

    function clearCharacterInfo() {
        $('#characterInfo').empty();
        $('#availableScenes').empty();
        $('#activatedScenes').empty();
        $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
        $('#partsAndSounds').empty();
        updateSceneTimeline();
    }

    function fetchScenes(characterId) {
        $.get(`/active-mode/character/${characterId}/scenes`, displayScenes)
            .fail(handleSceneFetchError);
    }

    function displayScenes(scenes) {
        $('#availableScenes').empty();
        scenes.forEach(function(scene) {
            $('#availableScenes').append(`<option value="${scene.id}">${scene.scene_name}</option>`);
        });
    }

    function handleSceneFetchError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching scenes:", textStatus, errorThrown);
        $('#availableScenes').html('<option>Failed to load scenes</option>');
    }

    function addScenes() {
        $('#availableScenes option:selected').each(function() {
            const sceneId = $(this).val();
            const sceneName = $(this).text();
            $('#activatedScenes').append(`<li data-id="${sceneId}">${sceneName}</li>`);
            $(this).remove();
        });
        updateSceneTimeline();
    }

    function removeScenes() {
        $('#activatedScenes li.ui-selected').each(function() {
            const sceneId = $(this).data('id');
            const sceneName = $(this).text();
            $('#availableScenes').append(`<option value="${sceneId}">${sceneName}</option>`);
            $(this).remove();
        });
        updateSceneTimeline();
    }

    function updateSceneTimeline() {
        const delay = parseInt($('#sceneDelay').val()) || 5;
        let totalTime = 0;
        const timelineHtml = $('#activatedScenes li').map(function(index) {
            const sceneName = $(this).text();
            const startTime = totalTime;
            totalTime += delay;
            return `<div class="timeline-item">
                        <strong>${sceneName}</strong><br>
                        Start: ${formatTime(startTime)}, End: ${formatTime(totalTime)}
                    </div>`;
        }).get().join('');
        
        $('#sceneTimeline').html(timelineHtml);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function confirmArmSystem() {
        if ($('#activatedScenes li').length === 0) {
            alert('Please select at least one scene to activate.');
            return;
        }
        if (confirm('Are you sure you want to arm the system and start executing scenes?')) {
            armSystem();
        }
    }

    function armSystem() {
        isArmed = true;
        $('#armButton').prop('disabled', true);
        $('#disarmButton').prop('disabled', false);
        $('#armStatus').text('ARMED').removeClass('disarmed').addClass('armed');
        logArmedModeOutput('System armed. Starting Active Mode.');
        startActiveModeLoop();
    }

    function confirmDisarmSystem() {
        if (confirm('Are you sure you want to disarm the system and stop executing scenes?')) {
            disarmSystem();
        }
    }

    function disarmSystem() {
        isArmed = false;
        $('#armButton').prop('disabled', false);
        $('#disarmButton').prop('disabled', true);
        $('#armStatus').text('DISARMED').removeClass('armed').addClass('disarmed');
        logArmedModeOutput('System disarmed. Active Mode stopped.');
        stopAllSteps();
    }

    function stopAllSteps() {
        if (currentEventSource) {
            currentEventSource.close();
        }
        $.post('/scenes/stop-all')
            .done(function(response) {
                logArmedModeOutput('All steps stopped: ' + response.message);
            })
            .fail(function(xhr, status, error) {
                console.error('Error stopping all steps:', error);
                logArmedModeOutput('Error stopping all steps: ' + error);
            });
    }

    function startActiveModeLoop() {
        const scenes = $('#activatedScenes li').map(function() {
            return $(this).data('id');
        }).get();
        const delay = parseInt($('#sceneDelay').val()) * 1000 || 5000;

        function runNextScene(index) {
            if (!isArmed) return;
            if (index >= scenes.length) {
                index = 0; // Reset to the beginning of the list
            }
            const sceneId = scenes[index];
            logArmedModeOutput(`Starting execution of scene ${sceneId}`);
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}`);
                retryCount = 0; // Reset retry count on successful execution
                setTimeout(() => runNextScene(index + 1), delay);
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${error.message}`);
                if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    logArmedModeOutput(`Retrying scene ${sceneId} (Attempt ${retryCount} of ${MAX_RETRIES})`);
                    setTimeout(() => runNextScene(index), delay);
                } else {
                    retryCount = 0; // Reset retry count
                    logArmedModeOutput(`Max retries reached for scene ${sceneId}. Moving to next scene.`);
                    setTimeout(() => runNextScene(index + 1), delay);
                }
            });
        }

        runNextScene(0);
    }

    function runScene(sceneId) {
        return new Promise((resolve, reject) => {
            if (currentEventSource) {
                currentEventSource.close();
            }
            currentEventSource = new EventSource(`/scenes/${sceneId}/play`);

            currentEventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleSceneExecutionUpdate(data);
            };

            currentEventSource.onerror = function(error) {
                console.error('EventSource failed:', error);
                currentEventSource.close();
                reject(new Error(`Failed to execute scene ${sceneId}`));
            };

            currentEventSource.addEventListener('close', function(event) {
                currentEventSource.close();
                resolve();
            });

            // Add a timeout to prevent hanging if the server doesn't respond
            setTimeout(() => {
                if (currentEventSource.readyState !== EventSource.CLOSED) {
                    currentEventSource.close();
                    reject(new Error(`Timeout while executing scene ${sceneId}`));
                }
            }, 60000); // 60 second timeout
        });
    }

    function handleSceneExecutionUpdate(data) {
        if (data.error) {
            logArmedModeOutput(`Error: ${data.error}`);
        } else if (data.message) {
            logArmedModeOutput(data.message);
        }
    }

    function logArmedModeOutput(message) {
        const timestamp = new Date().toLocaleTimeString();
        $('#armedModeOutput').append(`<p>[${timestamp}] ${message}</p>`);
        $('#armedModeOutput').scrollTop($('#armedModeOutput')[0].scrollHeight);
    }
});