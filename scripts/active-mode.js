// File: scripts/active-mode.js

$(document).ready(function() {
    let isArmed = false;
    let currentEventSource = null;

    $('#characterSelect').change(fetchCharacterInfo);
    $('#addScenes').click(addScenes);
    $('#removeScenes').click(removeScenes);
    $('#activatedScenes').sortable().selectable();
    $('#armButton').click(armSystem);
    $('#disarmButton').click(disarmSystem);
    $('#stopAllSteps').click(stopAllSteps);
    $('#testfireLinearActuator').click(testfireLinearActuator);

    // Load the first character by default
    loadFirstCharacter();

    function loadFirstCharacter() {
        const firstCharacter = $('#characterSelect option:first');
        if (firstCharacter.length > 0) {
            $('#characterSelect').val(firstCharacter.val()).trigger('change');
        }
    }

    function fetchCharacterInfo() {
        const characterId = $(this).val();
        if (characterId) {
            $.get(`/active-mode/character/${characterId}`, displayCharacterInfo)
                .fail(handleCharacterInfoError);
            fetchScenes(characterId);
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

    function handleCharacterInfoError(jqXHR, textStatus, errorThrown) {
        console.error("Error fetching character info:", textStatus, errorThrown);
        $('#characterInfo').html('<p>Failed to load character information. Please try again.</p>');
        $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
    }

    function clearCharacterInfo() {
        $('#characterInfo').empty();
        $('#availableScenes').empty();
        $('#activatedScenes').empty();
        $('#characterImage').attr('src', '/images/placeholder.jpg').attr('alt', 'Placeholder Image');
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
    }

    function removeScenes() {
        $('#activatedScenes li.ui-selected').each(function() {
            const sceneId = $(this).data('id');
            const sceneName = $(this).text();
            $('#availableScenes').append(`<option value="${sceneId}">${sceneName}</option>`);
            $(this).remove();
        });
    }

    function armSystem() {
        if ($('#activatedScenes li').length === 0) {
            alert('Please select at least one scene to activate.');
            return;
        }
        isArmed = true;
        $(this).prop('disabled', true);
        $('#disarmButton').prop('disabled', false);
        $('#armStatus').text('ARMED').removeClass('disarmed').addClass('armed');
        logArmedModeOutput('System armed. Starting Active Mode.');
        startActiveModeLoop();
    }

    function disarmSystem() {
        isArmed = false;
        $(this).prop('disabled', true);
        $('#armButton').prop('disabled', false);
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

        function runNextScene(index) {
            if (!isArmed) return;
            if (index >= scenes.length) {
                index = 0; // Reset to the beginning of the list
            }
            const sceneId = scenes[index];
            logArmedModeOutput(`Starting execution of scene ${sceneId}`);
            runScene(sceneId).then(() => {
                logArmedModeOutput(`Completed execution of scene ${sceneId}`);
                setTimeout(() => runNextScene(index + 1), 5000); // 5 seconds between scenes
            }).catch((error) => {
                logArmedModeOutput(`Error executing scene ${sceneId}: ${error.message}`);
                setTimeout(() => runNextScene(index + 1), 5000); // Continue to next scene even if there's an error
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

    function testfireLinearActuator() {
        const direction = $('#direction').val();
        const speed = $('#speed').val();
        const duration = $('#duration').val();
        const directionPin = $('#directionPin').val();
        const pwmPin = $('#pwmPin').val();
        const maxExtension = $('#maxExtension').val();
        const maxRetraction = $('#maxRetraction').val();

        $.ajax({
            url: '/parts/linear-actuator/testfire',
            method: 'POST',
            data: {
                direction,
                speed,
                duration,
                directionPin,
                pwmPin,
                maxExtension,
                maxRetraction
            },
            success: function(response) {
                if (response.success) {
                    logArmedModeOutput('Linear actuator testfire successful');
                    response.logs.forEach(log => logArmedModeOutput(log));
                } else {
                    logArmedModeOutput('Linear actuator testfire failed');
                    if (response.message) logArmedModeOutput(response.message);
                    if (response.logs) response.logs.forEach(log => logArmedModeOutput(log));
                    if (response.stderr) logArmedModeOutput('Error: ' + response.stderr);
                }
            },
            error: function(xhr, status, error) {
                console.error('Error during linear actuator testfire:', error);
                logArmedModeOutput('Error during linear actuator testfire: ' + error);
                if (xhr.responseJSON) {
                    if (xhr.responseJSON.message) logArmedModeOutput(xhr.responseJSON.message);
                    if (xhr.responseJSON.logs) xhr.responseJSON.logs.forEach(log => logArmedModeOutput(log));
                    if (xhr.responseJSON.stderr) logArmedModeOutput('Error: ' + xhr.responseJSON.stderr);
                }
            }
        });
    }
});
