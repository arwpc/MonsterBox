/**
 * Audio Library Frontend JavaScript
 * Table-based file management interface
 * ES5 IIFE pattern — no const/let, no arrow functions, no template literals, no class, no async/await
 */
(function() {
    'use strict';

    var audioFiles = [];
    var categories = [];
    var selectedFiles = [];
    var currentCharacter = null;
    var searchTimeout = null;
    var currentlyPlayingId = null;

    // Speaker selection state
    var speakers = [];
    var selectedSpeakerPartId = null;

    // ─── Initialization ─────────────────────────────────────────────

    function init() {
        loadCurrentCharacter()
            .then(function() { return loadSpeakers(); })
            .then(function() {
                renderSpeakerSelector();
                return loadAudioLibrary();
            })
            .then(function() {
                populateCategoryFilters();
                setupEventListeners();
                setupDragAndDrop();
                initTooltips();
            })
            .catch(function(err) {
                console.error('Audio library init error:', err);
            });
    }

    // ─── Event Listeners ────────────────────────────────────────────

    function setupEventListeners() {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(function() { filterAudioFiles(); }, 300);
            });
        }

        var categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', function() { filterAudioFiles(); });
        }

        var sortBy = document.getElementById('sortBy');
        if (sortBy) {
            sortBy.addEventListener('change', function() { filterAudioFiles(); });
        }

        var favoritesOnly = document.getElementById('favoritesOnly');
        if (favoritesOnly) {
            favoritesOnly.addEventListener('change', function() { filterAudioFiles(); });
        }

        var fileInput = document.getElementById('audioFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                handleFileSelection(e.target.files);
            });
        }

        var uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', function() {
                uploadFiles();
            });
        }

        var uploadModal = document.getElementById('uploadModal');
        if (uploadModal) {
            uploadModal.addEventListener('hidden.bs.modal', function() {
                resetUploadForm();
            });
        }

        var stopAllBtn = document.getElementById('stopAllBtn');
        if (stopAllBtn) {
            stopAllBtn.addEventListener('click', function() { stopAll(); });
        }

        var nowPlayingStop = document.getElementById('nowPlayingStop');
        if (nowPlayingStop) {
            nowPlayingStop.addEventListener('click', function() { stopAll(); });
        }
    }

    function setupDragAndDrop() {
        var dropZone = document.getElementById('dragDropZone');
        if (!dropZone) return;

        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            var files = [];
            var dtFiles = e.dataTransfer.files;
            for (var i = 0; i < dtFiles.length; i++) {
                if (dtFiles[i].type.indexOf('audio/') === 0) {
                    files.push(dtFiles[i]);
                }
            }

            if (files.length > 0) {
                handleFileSelection(files);
            }
        });

        dropZone.addEventListener('click', function(e) {
            if (e.target === dropZone || e.target.closest('.mb-drop-zone')) {
                document.getElementById('audioFileInput').click();
            }
        });
    }

    // ─── Data Loading ───────────────────────────────────────────────

    function loadCurrentCharacter() {
        var charId = window.__MB_CHAR_ID || null;
        if (charId) {
            currentCharacter = { id: charId };
            return Promise.resolve();
        }
        return fetch('/setup/characters/api/current')
            .then(function(r) { return r.json(); })
            .then(function(d) {
                currentCharacter = { id: (d.success && d.selectedCharacter) ? d.selectedCharacter : 1 };
            })
            .catch(function() {
                currentCharacter = { id: 1 };
            });
    }

    function loadSpeakers() {
        return fetch('/api/parts?type=speaker')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data && data.success && Array.isArray(data.parts)) {
                    var cid = currentCharacter && currentCharacter.id;
                    var byCharacter = data.parts.filter(function(p) {
                        return String(p.characterId) === String(cid);
                    });
                    speakers = byCharacter.length ? byCharacter : data.parts;
                    selectedSpeakerPartId = (speakers[0] && speakers[0].id) || null;
                } else {
                    speakers = [];
                    selectedSpeakerPartId = null;
                }
            })
            .catch(function() {
                speakers = [];
                selectedSpeakerPartId = null;
            });
    }

    function renderSpeakerSelector() {
        var sel = document.getElementById('speakerSelect');
        if (!sel) return;
        sel.innerHTML = '';
        if (!speakers || speakers.length === 0) {
            var opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Default System Output';
            sel.appendChild(opt);
            sel.disabled = true;
            return;
        }
        for (var i = 0; i < speakers.length; i++) {
            var sp = speakers[i];
            var label = (sp.name || 'Speaker ' + sp.id) + (sp.characterId ? ' (Char ' + sp.characterId + ')' : '');
            var option = document.createElement('option');
            option.value = sp.id;
            option.textContent = label;
            sel.appendChild(option);
        }
        if (selectedSpeakerPartId) sel.value = String(selectedSpeakerPartId);
        sel.disabled = false;
        sel.addEventListener('change', function(e) {
            selectedSpeakerPartId = e.target.value || null;
        });
    }

    function loadAudioLibrary() {
        return fetch('/audio-library/api/library')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    audioFiles = data.audio || data.files || [];
                    categories = data.categories || [];
                    updateStats(data);
                    renderTable();
                }
            })
            .catch(function(err) {
                console.error('Error loading audio library:', err);
            });
    }

    // ─── Stats ──────────────────────────────────────────────────────

    function updateStats(data) {
        var el = document.getElementById('totalFiles');
        if (el) el.textContent = (data.totalFiles || audioFiles.length || 0) + ' files';

        var sizeEl = document.getElementById('totalSize');
        if (sizeEl) sizeEl.textContent = formatFileSize(data.totalSize || 0);

        var catEl = document.getElementById('totalCategories');
        if (catEl) {
            var catCount = data.categories ? data.categories.length : categories.length;
            catEl.textContent = catCount + ' categories';
        }
    }

    // ─── Table Rendering ────────────────────────────────────────────

    function renderTable() {
        var tbody = document.getElementById('audioTableBody');
        var emptyState = document.getElementById('emptyState');
        var table = document.getElementById('audioTable');

        if (!tbody) return;

        // Dispose existing tooltips before clearing rows to prevent orphaned popovers
        var oldTooltips = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
        for (var t = 0; t < oldTooltips.length; t++) {
            var inst = bootstrap.Tooltip.getInstance(oldTooltips[t]);
            if (inst) inst.dispose();
        }

        if (!audioFiles || audioFiles.length === 0) {
            if (table) table.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        if (table) table.style.display = '';
        if (emptyState) emptyState.style.display = 'none';

        var html = '';
        for (var i = 0; i < audioFiles.length; i++) {
            var audio = audioFiles[i];
            var isPlaying = currentlyPlayingId === audio.id;
            var rowClass = isPlaying ? 'table-active' : '';
            var playIcon = isPlaying ? 'bi-stop-fill' : 'bi-play-fill';
            var playColor = isPlaying ? 'btn-danger' : 'btn-success';
            var favIcon = audio.favorite ? 'bi-heart-fill text-danger' : 'bi-heart';

            html += '<tr class="' + rowClass + '" data-audio-id="' + escapeAttr(audio.id) + '">'
                + '<td><button class="btn ' + playColor + ' btn-sm px-2 py-0 play-btn" data-audio-id="' + escapeAttr(audio.id) + '" data-bs-toggle="tooltip" data-bs-placement="top" title="' + (isPlaying ? 'Stop playback' : 'Play on character speaker') + '"><i class="bi ' + playIcon + '"></i></button></td>'
                + '<td><i class="bi ' + favIcon + ' fav-btn" role="button" data-audio-id="' + escapeAttr(audio.id) + '" style="cursor:pointer;" data-bs-toggle="tooltip" data-bs-placement="top" title="Toggle favorite"></i></td>'
                + '<td>' + escapeHtml(audio.title || 'Untitled') + '</td>'
                + '<td><span class="badge bg-secondary">' + escapeHtml(capitalizeFirst(audio.category || 'other')) + '</span></td>'
                + '<td class="text-muted small">' + formatDuration(audio.duration) + '</td>'
                + '<td class="text-muted small">' + escapeHtml((audio.format || '').toUpperCase()) + '</td>'
                + '<td class="text-muted small">' + formatFileSize(audio.fileSize || 0) + '</td>'
                + '<td>'
                + '<div class="btn-group btn-group-sm">'
                + '<button class="btn btn-outline-info btn-sm px-1 py-0 loop-btn" data-audio-id="' + escapeAttr(audio.id) + '" data-bs-toggle="tooltip" data-bs-placement="top" title="Loop this track"><i class="bi bi-arrow-repeat"></i></button>'
                + '<button class="btn btn-outline-secondary btn-sm px-1 py-0 edit-btn" data-audio-id="' + escapeAttr(audio.id) + '" data-bs-toggle="tooltip" data-bs-placement="top" title="Edit file details"><i class="bi bi-pencil"></i></button>'
                + '<button class="btn btn-outline-secondary btn-sm px-1 py-0 download-btn" data-audio-id="' + escapeAttr(audio.id) + '" data-bs-toggle="tooltip" data-bs-placement="top" title="Download audio file"><i class="bi bi-download"></i></button>'
                + '<button class="btn btn-outline-danger btn-sm px-1 py-0 delete-btn" data-audio-id="' + escapeAttr(audio.id) + '" data-bs-toggle="tooltip" data-bs-placement="top" title="Delete audio file"><i class="bi bi-trash"></i></button>'
                + '</div>'
                + '</td>'
                + '</tr>';
        }

        tbody.innerHTML = html;
        attachRowListeners();
    }

    function initTooltips(container) {
        var root = container || document;
        var tooltipEls = root.querySelectorAll('[data-bs-toggle="tooltip"]');
        for (var i = 0; i < tooltipEls.length; i++) {
            var existing = bootstrap.Tooltip.getInstance(tooltipEls[i]);
            if (existing) existing.dispose();
            new bootstrap.Tooltip(tooltipEls[i]);
        }
        // Also init elements using data-bs-tooltip (for buttons that use data-bs-toggle="modal")
        var altEls = root.querySelectorAll('[data-bs-tooltip="tooltip"]');
        for (var j = 0; j < altEls.length; j++) {
            var existingAlt = bootstrap.Tooltip.getInstance(altEls[j]);
            if (existingAlt) existingAlt.dispose();
            new bootstrap.Tooltip(altEls[j]);
        }
    }

    function attachRowListeners() {
        var tbody = document.getElementById('audioTableBody');
        if (!tbody) return;

        // Initialize tooltips on dynamically rendered rows
        initTooltips(tbody);

        // Play buttons
        var playBtns = tbody.querySelectorAll('.play-btn');
        for (var i = 0; i < playBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-audio-id');
                    if (currentlyPlayingId === id) {
                        stopAll();
                    } else {
                        playOnCharacter(id);
                    }
                });
            })(playBtns[i]);
        }

        // Favorite buttons
        var favBtns = tbody.querySelectorAll('.fav-btn');
        for (var i = 0; i < favBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    toggleFavorite(btn.getAttribute('data-audio-id'));
                });
            })(favBtns[i]);
        }

        // Edit buttons
        var editBtns = tbody.querySelectorAll('.edit-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-audio-id');
                    var audio = findAudioById(id);
                    if (audio) openEditModal(audio);
                });
            })(editBtns[i]);
        }

        // Loop buttons
        var loopBtns = tbody.querySelectorAll('.loop-btn');
        for (var i = 0; i < loopBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    playLoop(btn.getAttribute('data-audio-id'));
                });
            })(loopBtns[i]);
        }

        // Download buttons
        var downloadBtns = tbody.querySelectorAll('.download-btn');
        for (var i = 0; i < downloadBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-audio-id');
                    window.open('/audio-library/api/audio/' + encodeURIComponent(id) + '/download');
                });
            })(downloadBtns[i]);
        }

        // Delete buttons
        var deleteBtns = tbody.querySelectorAll('.delete-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-audio-id');
                    var audio = findAudioById(id);
                    deleteAudio(id, audio ? audio.title : id);
                });
            })(deleteBtns[i]);
        }
    }

    // ─── Playback ───────────────────────────────────────────────────

    function playOnCharacter(audioId) {
        var charId = currentCharacter ? currentCharacter.id : null;
        if (!charId) {
            showError('No character selected');
            return;
        }

        var body = { characterId: charId, volume: 100 };
        if (selectedSpeakerPartId) {
            body.speakerPartId = selectedSpeakerPartId;
        }

        fetch('/audio-library/api/audio/' + encodeURIComponent(audioId) + '/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                currentlyPlayingId = audioId;
                var audio = findAudioById(audioId);
                showNowPlaying(audio ? audio.title : audioId);
                renderTable();
            } else {
                showError(data.error || 'Failed to play audio');
            }
        })
        .catch(function(err) {
            console.error('Play error:', err);
            showError('Failed to play audio');
        });
    }

    function playLoop(audioId) {
        var charId = currentCharacter ? currentCharacter.id : null;
        if (!charId) {
            showError('No character selected');
            return;
        }

        var body = { characterId: charId, volume: 100, loop: true };
        if (selectedSpeakerPartId) {
            body.speakerPartId = selectedSpeakerPartId;
        }

        fetch('/audio-library/api/audio/' + encodeURIComponent(audioId) + '/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                currentlyPlayingId = audioId;
                var audio = findAudioById(audioId);
                showNowPlaying((audio ? audio.title : audioId) + ' (looping)');
                renderTable();
            } else {
                showError(data.error || 'Failed to loop audio');
            }
        })
        .catch(function(err) {
            console.error('Loop error:', err);
            showError('Failed to loop audio');
        });
    }

    function stopAll() {
        currentlyPlayingId = null;
        hideNowPlaying();
        fetch('/api/audio/stop-all', { method: 'POST' }).catch(function() {});
        fetch('/api/audio-loop/stop-all', { method: 'POST' }).catch(function() {});
        renderTable();
    }

    function showNowPlaying(title) {
        var el = document.getElementById('nowPlaying');
        var titleEl = document.getElementById('nowPlayingTitle');
        if (el) el.classList.remove('d-none');
        if (titleEl) titleEl.textContent = title;
    }

    function hideNowPlaying() {
        var el = document.getElementById('nowPlaying');
        if (el) el.classList.add('d-none');
    }

    // ─── Filtering ──────────────────────────────────────────────────

    function filterAudioFiles() {
        var search = document.getElementById('searchInput') ? document.getElementById('searchInput').value : '';
        var category = document.getElementById('categoryFilter') ? document.getElementById('categoryFilter').value : 'all';
        var sortByVal = document.getElementById('sortBy') ? document.getElementById('sortBy').value : 'title';
        var favOnly = document.getElementById('favoritesOnly') ? document.getElementById('favoritesOnly').checked : false;

        var params = 'search=' + encodeURIComponent(search)
            + '&category=' + encodeURIComponent(category)
            + '&sortBy=' + encodeURIComponent(sortByVal)
            + '&favorite=' + favOnly;

        fetch('/audio-library/api/library?' + params)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    audioFiles = data.audio || data.files || [];
                    updateStats(data);
                    renderTable();
                }
            })
            .catch(function(err) {
                console.error('Filter error:', err);
            });
    }

    // ─── CRUD Operations ────────────────────────────────────────────

    function toggleFavorite(audioId) {
        var audio = findAudioById(audioId);
        if (!audio) return;

        fetch('/audio-library/api/audio/' + encodeURIComponent(audioId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ favorite: !audio.favorite })
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                audio.favorite = data.audio.favorite;
                renderTable();
            }
        })
        .catch(function(err) {
            console.error('Favorite error:', err);
        });
    }

    function deleteAudio(audioId, title) {
        if (!confirm('Delete "' + title + '"? This cannot be undone.')) return;

        fetch('/audio-library/api/audio/' + encodeURIComponent(audioId), { method: 'DELETE' })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    showSuccess('Deleted "' + title + '"');
                    loadAudioLibrary();
                } else {
                    showError(data.error || 'Failed to delete audio');
                }
            })
            .catch(function(err) {
                console.error('Delete error:', err);
                showError('Failed to delete audio');
            });
    }

    // ─── Edit Modal ─────────────────────────────────────────────────

    function openEditModal(audio) {
        if (!document.getElementById('editAudioModal')) {
            createEditModal();
        }

        // Update category options in edit modal
        var editCat = document.getElementById('editCategory');
        if (editCat) {
            editCat.innerHTML = '';
            for (var i = 0; i < categories.length; i++) {
                var opt = document.createElement('option');
                opt.value = categories[i];
                opt.textContent = capitalizeFirst(categories[i]);
                editCat.appendChild(opt);
            }
        }

        document.getElementById('editTitle').value = audio.title || '';
        document.getElementById('editDescription').value = audio.description || '';
        document.getElementById('editCategory').value = audio.category || 'other';
        document.getElementById('editTags').value = Array.isArray(audio.tags) ? audio.tags.join(', ') : '';
        document.getElementById('editFavorite').checked = audio.favorite || false;

        document.getElementById('editAudioModal').dataset.audioId = audio.id;

        var modal = new bootstrap.Modal(document.getElementById('editAudioModal'));
        modal.show();
    }

    function createEditModal() {
        var modalHTML = '<div class="modal fade" id="editAudioModal" tabindex="-1">'
            + '<div class="modal-dialog">'
            + '<div class="modal-content">'
            + '<div class="modal-header">'
            + '<h5 class="modal-title"><i class="bi bi-pencil"></i> Edit Audio File</h5>'
            + '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>'
            + '</div>'
            + '<div class="modal-body">'
            + '<form id="editAudioForm">'
            + '<div class="mb-3">'
            + '<label class="form-label">Title</label>'
            + '<input type="text" class="form-control" id="editTitle" required>'
            + '</div>'
            + '<div class="mb-3">'
            + '<label class="form-label">Description</label>'
            + '<textarea class="form-control" id="editDescription" rows="3"></textarea>'
            + '</div>'
            + '<div class="mb-3">'
            + '<label class="form-label">Category</label>'
            + '<select class="form-select" id="editCategory"></select>'
            + '</div>'
            + '<div class="mb-3">'
            + '<label class="form-label">Tags (comma separated)</label>'
            + '<input type="text" class="form-control" id="editTags" placeholder="spooky, halloween, monster">'
            + '</div>'
            + '<div class="mb-3">'
            + '<div class="form-check">'
            + '<input class="form-check-input" type="checkbox" id="editFavorite">'
            + '<label class="form-check-label" for="editFavorite">Mark as Favorite</label>'
            + '</div>'
            + '</div>'
            + '</form>'
            + '</div>'
            + '<div class="modal-footer">'
            + '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>'
            + '<button type="button" class="btn btn-primary" id="editSaveBtn">Save Changes</button>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '</div>';

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        document.getElementById('editSaveBtn').addEventListener('click', function() {
            saveAudioEdit();
        });
    }

    function saveAudioEdit() {
        var modal = document.getElementById('editAudioModal');
        var audioId = modal.dataset.audioId;

        var tagsRaw = document.getElementById('editTags').value;
        var tags = tagsRaw.split(',').map(function(tag) { return tag.trim(); }).filter(function(tag) { return tag; });

        var updates = {
            title: document.getElementById('editTitle').value,
            description: document.getElementById('editDescription').value,
            category: document.getElementById('editCategory').value,
            tags: tags,
            favorite: document.getElementById('editFavorite').checked
        };

        fetch('/audio-library/api/audio/' + encodeURIComponent(audioId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                showSuccess('Audio file updated');
                bootstrap.Modal.getInstance(modal).hide();
                loadAudioLibrary();
            } else {
                showError(data.error || 'Failed to update audio file');
            }
        })
        .catch(function(err) {
            console.error('Error updating audio:', err);
            showError('Failed to update audio file');
        });
    }

    // ─── Upload ─────────────────────────────────────────────────────

    function handleFileSelection(files) {
        selectedFiles = [];
        for (var i = 0; i < files.length; i++) {
            selectedFiles.push(files[i]);
        }
        displaySelectedFiles();
        var uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.disabled = selectedFiles.length === 0;
    }

    function displaySelectedFiles() {
        var filesList = document.getElementById('filesList');
        var selectedFilesList = document.getElementById('selectedFilesList');

        if (selectedFiles.length === 0) {
            if (selectedFilesList) selectedFilesList.style.display = 'none';
            return;
        }

        if (selectedFilesList) selectedFilesList.style.display = 'block';

        var html = '';
        for (var i = 0; i < selectedFiles.length; i++) {
            var file = selectedFiles[i];
            html += '<div class="d-flex justify-content-between align-items-center py-1">'
                + '<span><i class="bi bi-music-note"></i> '
                + escapeHtml(file.name) + ' (' + formatFileSize(file.size) + ')</span>'
                + '<button class="btn btn-sm btn-outline-danger remove-file-btn" data-index="' + i + '">'
                + '<i class="bi bi-x"></i></button>'
                + '</div>';
        }

        if (filesList) {
            filesList.innerHTML = html;
            // Attach remove handlers
            var removeBtns = filesList.querySelectorAll('.remove-file-btn');
            for (var j = 0; j < removeBtns.length; j++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var idx = parseInt(btn.getAttribute('data-index'), 10);
                        removeSelectedFile(idx);
                    });
                })(removeBtns[j]);
            }
        }
    }

    function removeSelectedFile(index) {
        selectedFiles.splice(index, 1);
        displaySelectedFiles();
        var uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.disabled = selectedFiles.length === 0;
    }

    function uploadFiles() {
        if (selectedFiles.length === 0) return;

        var formData = new FormData();
        var form = document.getElementById('uploadForm');

        // Add form fields
        if (form) {
            var inputs = form.querySelectorAll('input, select, textarea');
            for (var i = 0; i < inputs.length; i++) {
                var input = inputs[i];
                if (input.name) {
                    formData.append(input.name, input.value);
                }
            }
        }

        // Add files
        for (var j = 0; j < selectedFiles.length; j++) {
            formData.append('audioFiles', selectedFiles[j]);
        }

        showUploadProgress();
        updateUploadStatus('Preparing upload...');

        var xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                var percentComplete = (e.loaded / e.total) * 100;
                updateUploadProgress(percentComplete);
                updateUploadStatus('Uploading... ' + Math.round(percentComplete) + '%');
            }
        });

        xhr.addEventListener('load', function() {
            if (xhr.status === 200) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (data.success) {
                        updateUploadProgress(100);
                        updateUploadStatus('Processing files...');

                        var message = 'Successfully uploaded ' + data.uploaded.length + ' file(s)';
                        if (data.errors && data.errors.length > 0) {
                            message += ', ' + data.errors.length + ' file(s) failed';
                        }

                        showSuccess(message);
                        hideUploadProgress();
                        var modalEl = document.getElementById('uploadModal');
                        var modalInst = bootstrap.Modal.getInstance(modalEl);
                        if (modalInst) modalInst.hide();
                        loadAudioLibrary();
                    } else {
                        showError(data.error || 'Upload failed');
                        hideUploadProgress();
                    }
                } catch (e) {
                    showError('Upload failed: invalid response');
                    hideUploadProgress();
                }
            } else {
                showError('Upload failed with status: ' + xhr.status);
                hideUploadProgress();
            }
        });

        xhr.addEventListener('error', function() {
            showError('Upload failed due to network error');
            hideUploadProgress();
        });

        xhr.open('POST', '/audio-library/api/upload');
        xhr.send(formData);
    }

    function updateUploadProgress(percent) {
        var progressBar = document.querySelector('.upload-progress .progress-bar');
        if (progressBar) {
            progressBar.style.width = percent + '%';
            progressBar.setAttribute('aria-valuenow', percent);
        }
    }

    function updateUploadStatus(status) {
        var el = document.getElementById('uploadStatus');
        if (el) el.textContent = status;
    }

    function showUploadProgress() {
        var el = document.querySelector('.upload-progress');
        if (el) el.style.display = 'block';
        var btn = document.getElementById('uploadBtn');
        if (btn) btn.disabled = true;
    }

    function hideUploadProgress() {
        var el = document.querySelector('.upload-progress');
        if (el) el.style.display = 'none';
        var btn = document.getElementById('uploadBtn');
        if (btn) btn.disabled = false;
    }

    function resetUploadForm() {
        var form = document.getElementById('uploadForm');
        if (form) form.reset();
        var fileInput = document.getElementById('audioFileInput');
        if (fileInput) fileInput.value = '';
        selectedFiles = [];
        var selectedFilesList = document.getElementById('selectedFilesList');
        if (selectedFilesList) selectedFilesList.style.display = 'none';
        var uploadBtn = document.getElementById('uploadBtn');
        if (uploadBtn) uploadBtn.disabled = true;
        hideUploadProgress();
    }

    // ─── Category Filters ───────────────────────────────────────────

    function populateCategoryFilters() {
        var categoryFilter = document.getElementById('categoryFilter');
        var uploadCategory = document.getElementById('uploadCategory');

        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="all">All Categories</option>';
            for (var i = 0; i < categories.length; i++) {
                var opt = document.createElement('option');
                opt.value = categories[i];
                opt.textContent = capitalizeFirst(categories[i]);
                categoryFilter.appendChild(opt);
            }
        }

        if (uploadCategory) {
            uploadCategory.innerHTML = '';
            for (var j = 0; j < categories.length; j++) {
                var opt2 = document.createElement('option');
                opt2.value = categories[j];
                opt2.textContent = capitalizeFirst(categories[j]);
                uploadCategory.appendChild(opt2);
            }
        }
    }

    // ─── Audio Player Modal ─────────────────────────────────────────

    function openAudioPlayer(audio) {
        var modalEl = document.getElementById('audioPlayerModal');
        if (!modalEl) return;

        var modal = new bootstrap.Modal(modalEl);
        var titleEl = document.getElementById('playerTitle');
        if (titleEl) {
            titleEl.innerHTML = '<i class="bi bi-play-circle"></i> ' + escapeHtml(audio.title || 'Untitled');
        }

        if (window.advancedPlayer) {
            window.advancedPlayer.destroy();
        }

        if (!window.AdvancedAudioPlayer) {
            var script = document.createElement('script');
            script.src = '/js/audio-player.js';
            script.onload = function() {
                window.advancedPlayer = new AdvancedAudioPlayer('audioPlayerContainer');
                window.advancedPlayer.loadAudio(audio);
            };
            document.head.appendChild(script);
        } else {
            window.advancedPlayer = new AdvancedAudioPlayer('audioPlayerContainer');
            window.advancedPlayer.loadAudio(audio);
        }

        modal.show();
    }

    // ─── Helpers ────────────────────────────────────────────────────

    function findAudioById(id) {
        for (var i = 0; i < audioFiles.length; i++) {
            if (audioFiles[i].id === id) return audioFiles[i];
        }
        return null;
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    function formatDuration(seconds) {
        if (!seconds) return '--:--';
        var mins = Math.floor(seconds / 60);
        var secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }

    function capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
    }

    function escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function showSuccess(message) {
        if (window.showToast) {
            window.showToast(message, 'success');
        }
    }

    function showError(message) {
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }

    // ─── Public API ─────────────────────────────────────────────────

    window.audioLibrary = {
        stopAll: stopAll,
        loadAudioLibrary: loadAudioLibrary,
        removeSelectedFile: removeSelectedFile,
        saveAudioEdit: saveAudioEdit
    };

    // ─── Initialize on DOM ready ────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
