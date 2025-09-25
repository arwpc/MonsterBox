/**
 * Poses Setup JavaScript
 * Handles pose management interface
 */

class PosesSetup {
    constructor() {
        this.poses = [];
        this.templates = {};
        this.parts = [];
        this.currentPose = null;
        this.init();
    }

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.renderPoses();
        this.renderTemplates();
    }

    async loadData() {
        try {
            // Load poses
            const posesResponse = await mb.apiCall('/setup/poses/api/poses');
            if (posesResponse.success) {
                this.poses = posesResponse.poses || [];
            }

            // Load templates
            const templatesResponse = await mb.apiCall('/setup/poses/api/templates');
            if (templatesResponse.success) {
                this.templates = templatesResponse.templates || {};
            }

            // Load parts from parts API
            const partsResponse = await mb.apiCall('/setup/parts/api/parts');
            if (partsResponse.success) {
                // Extract all parts for pose creation (not just servos)
                this.parts = partsResponse.parts || [];
            }
        } catch (error) {
            console.error('Failed to load poses data:', error);
            mb.showNotification('Failed to load poses data', 'error');
        }
    }

    getPartsByType(type) {
        return this.parts.filter(part => part.type === type);
    }

    getAvailablePartTypes() {
        const types = [...new Set(this.parts.map(part => part.type))];
        return types.sort();
    }

    setupEventListeners() {
        // Create pose button
        document.getElementById('createPoseBtn').addEventListener('click', () => {
            this.handleCreatePose();
        });

        // Template selection
        document.getElementById('templateName').addEventListener('change', (e) => {
            this.handleTemplateChange(e.target.value);
        });

        // Tab switching
        document.querySelectorAll('#createPoseTabs button').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                this.handleTabSwitch(e.target.getAttribute('data-bs-target'));
            });
        });
    }

    renderPoses() {
        const container = document.getElementById('poses-list');

        if (this.poses.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-person-arms-up fs-1"></i>
                    <h5 class="mt-3">No poses created yet</h5>
                    <p>Create your first pose using the templates or custom configuration.</p>
                    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createPoseModal">
                        <i class="bi bi-plus-circle"></i> Create First Pose
                    </button>
                </div>
            `;
            return;
        }

        const posesHtml = this.poses.map(pose => `
            <div class="card pose-card mb-3" data-pose-id="${pose.id}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h6 class="card-title mb-1">
                                <i class="bi bi-person-arms-up"></i>
                                ${pose.name}
                            </h6>
                            <p class="card-text text-muted small mb-2">${pose.description || 'No description'}</p>
                            <div class="d-flex gap-2 flex-wrap">
                                <span class="badge bg-secondary">${pose.category || 'uncategorized'}</span>
                                <span class="badge bg-info">${pose.parts.length} part${pose.parts.length !== 1 ? 's' : ''}</span>
                                ${pose.concurrent ? '<span class="badge bg-warning">Concurrent</span>' : ''}
                            </div>
                        </div>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-test" onclick="posesSetup.testPose(${pose.id})" title="Test Pose">
                                <i class="bi bi-play"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-primary" onclick="posesSetup.editPose(${pose.id})" title="Edit">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="posesSetup.deletePose(${pose.id})" title="Delete">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mt-2">
                        <small class="text-muted">
                            Parts: ${pose.parts.map(p => `Part ${p.partId}`).join(', ')}
                        </small>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = posesHtml;
    }

    renderTemplates() {
        const container = document.getElementById('templates-list');
        const templateSelect = document.getElementById('templateName');

        if (Object.keys(this.templates).length === 0) {
            container.innerHTML = '<p class="text-muted">No templates available</p>';
            return;
        }

        // Populate template select
        templateSelect.innerHTML = '<option value="">Select a template...</option>';
        Object.keys(this.templates).forEach(key => {
            const template = this.templates[key];
            templateSelect.innerHTML += `<option value="${key}">${template.name}</option>`;
        });

        // Render template cards
        const templatesHtml = Object.keys(this.templates).map(key => {
            const template = this.templates[key];
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <h6 class="card-title">
                            <i class="bi bi-template"></i>
                            ${template.name}
                        </h6>
                        <div class="d-flex flex-wrap gap-1">
                            ${template.options.map(option => `
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="posesSetup.quickCreateFromTemplate('${key}', '${option.name}')">
                                    ${option.name}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = templatesHtml;

        // Populate parts select with all parts grouped by type
        const partsSelect = document.getElementById('templatePartId');
        partsSelect.innerHTML = '<option value="">Select a part...</option>';

        const partTypes = this.getAvailablePartTypes();
        partTypes.forEach(type => {
            const partsOfType = this.getPartsByType(type);
            if (partsOfType.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = type.charAt(0).toUpperCase() + type.slice(1) + ' Parts';
                partsOfType.forEach(part => {
                    const option = document.createElement('option');
                    option.value = part.id;
                    option.textContent = part.name || `${type} #${part.id}`;
                    optgroup.appendChild(option);
                });
                partsSelect.appendChild(optgroup);
            }
        });
    }

    handleTemplateChange(templateKey) {
        const optionSelect = document.getElementById('templateOption');

        if (!templateKey) {
            optionSelect.innerHTML = '<option value="">Select template first...</option>';
            return;
        }

        const template = this.templates[templateKey];
        if (!template) return;

        optionSelect.innerHTML = '<option value="">Select an option...</option>';
        template.options.forEach(option => {
            optionSelect.innerHTML += `<option value="${option.name}">${option.name}</option>`;
        });
    }

    handleTabSwitch(target) {
        // Reset forms when switching tabs
        if (target === '#template-pane') {
            document.getElementById('templatePoseForm').reset();
        } else if (target === '#custom-pane') {
            document.getElementById('customPoseForm').reset();
        }
    }

    async handleCreatePose() {
        const activeTab = document.querySelector('#createPoseTabs .nav-link.active').getAttribute('data-bs-target');

        if (activeTab === '#template-pane') {
            await this.createFromTemplate();
        } else {
            await this.createCustomPose();
        }
    }

    async createFromTemplate() {
        const form = document.getElementById('templatePoseForm');
        if (!mb.validateForm(form)) {
            mb.showNotification('Please fill in all required fields', 'warning');
            return;
        }

        const templateName = document.getElementById('templateName').value;
        const option = document.getElementById('templateOption').value;
        const partId = document.getElementById('templatePartId').value;
        const customName = document.getElementById('templateCustomName').value;

        try {
            const response = await mb.apiCall('/setup/poses/api/poses/from-template', {
                method: 'POST',
                body: { templateName, option, partId, customName }
            });

            if (response.success) {
                mb.showNotification('Pose created successfully', 'success');
                this.poses.push(response.pose);
                this.renderPoses();
                bootstrap.Modal.getInstance(document.getElementById('createPoseModal')).hide();
                mb.resetForm(form);
            }
        } catch (error) {
            mb.showNotification('Failed to create pose: ' + error.message, 'error');
        }
    }

    async createCustomPose() {
        const form = document.getElementById('customPoseForm');
        if (!mb.validateForm(form)) {
            mb.showNotification('Please fill in all required fields', 'warning');
            return;
        }

        const name = document.getElementById('customName').value;
        const description = document.getElementById('customDescription').value;
        const category = document.getElementById('customCategory').value;

        // For now, create a basic pose structure that can be edited
        const poseData = {
            name: name,
            description: description,
            category: category || 'custom',
            concurrent: false,
            parts: [] // Empty parts array - user will need to edit to add parts
        };

        try {
            const response = await mb.apiCall('/setup/poses/api/poses', {
                method: 'POST',
                body: poseData
            });

            if (response.success) {
                mb.showNotification('Custom pose created successfully. Click Edit to configure parts.', 'success');
                this.poses.push(response.pose);
                this.renderPoses();
                bootstrap.Modal.getInstance(document.getElementById('createPoseModal')).hide();
                mb.resetForm(form);

                // Automatically open edit modal for the new pose
                setTimeout(() => {
                    this.editPose(response.pose.id);
                }, 500);
            }
        } catch (error) {
            mb.showNotification('Failed to create custom pose: ' + error.message, 'error');
        }
    }

    async quickCreateFromTemplate(templateKey, optionName) {
        // Quick create with first available appropriate part
        if (this.parts.length === 0) {
            mb.showNotification('No parts available', 'warning');
            return;
        }

        // Try to find a servo part first, then any part
        let selectedPart = this.parts.find(p => p.type === 'servo');
        if (!selectedPart) {
            selectedPart = this.parts[0];
        }

        const partId = selectedPart.id;

        try {
            const response = await mb.apiCall('/setup/poses/api/poses/from-template', {
                method: 'POST',
                body: {
                    templateName: templateKey,
                    option: optionName,
                    partId: partId.toString()
                }
            });

            if (response.success) {
                mb.showNotification('Pose created successfully', 'success');
                this.poses.push(response.pose);
                this.renderPoses();
            }
        } catch (error) {
            mb.showNotification('Failed to create pose: ' + error.message, 'error');
        }
    }

    async testPose(poseId) {
        const pose = this.poses.find(p => p.id === poseId);
        if (!pose) return;

        // Use a simple confirm dialog instead of modal to avoid focus issues
        if (!confirm(`Are you sure you want to test the pose "${pose.name}"? Make sure the animatronic is in a safe position.`)) {
            return;
        }

        try {
            const poseCard = document.querySelector(`[data-pose-id="${poseId}"]`);
            if (poseCard) poseCard.classList.add('executing');

            mb.showNotification(`Testing pose "${pose.name}"...`, 'info');

            const response = await mb.apiCall(`/setup/poses/api/poses/${poseId}/test`, {
                method: 'POST'
            });

            if (response.success) {
                mb.showNotification(`Pose "${pose.name}" executed successfully`, 'success');
            } else {
                mb.showNotification('Pose execution failed: ' + (response.error || response.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            mb.showNotification('Failed to test pose: ' + error.message, 'error');
        } finally {
            setTimeout(() => {
                const poseCard = document.querySelector(`[data-pose-id="${poseId}"]`);
                if (poseCard) poseCard.classList.remove('executing');
            }, 2000);
        }
    }

    async editPose(poseId) {
        const pose = this.poses.find(p => p.id === poseId);
        if (!pose) return;

        // Create edit modal dynamically
        const editModal = this.createEditModal(pose);
        document.body.appendChild(editModal);

        const modal = new bootstrap.Modal(editModal);
        modal.show();

        // Clean up modal when hidden
        editModal.addEventListener('hidden.bs.modal', () => {
            editModal.remove();
        });
    }

    createEditModal(pose) {
        const modalHtml = `
            <div class="modal fade" id="editPoseModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Pose: ${pose.name}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editPoseForm">
                                <div class="mb-3">
                                    <label for="editPoseName" class="form-label">Pose Name</label>
                                    <input type="text" class="form-control" id="editPoseName" value="${pose.name}" required>
                                </div>
                                <div class="mb-3">
                                    <label for="editPoseDescription" class="form-label">Description</label>
                                    <textarea class="form-control" id="editPoseDescription" rows="2">${pose.description || ''}</textarea>
                                </div>
                                <div class="mb-3">
                                    <label for="editPoseCategory" class="form-label">Category</label>
                                    <input type="text" class="form-control" id="editPoseCategory" value="${pose.category || ''}">
                                </div>
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="editPoseConcurrent" ${pose.concurrent ? 'checked' : ''}>
                                        <label class="form-check-label" for="editPoseConcurrent">
                                            Execute parts concurrently
                                        </label>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Parts Configuration</label>
                                    <div id="editPoseParts">
                                        ${this.renderPosePartsEditor(pose.parts)}
                                    </div>
                                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="posesSetup.addPartToPose()">
                                        <i class="bi bi-plus"></i> Add Part
                                    </button>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="posesSetup.saveEditedPose(${pose.id})">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        return div.firstElementChild;
    }

    renderPosePartsEditor(parts) {
        return parts.map((part, index) => `
            <div class="card mb-2" data-part-index="${index}">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <label class="form-label">Part</label>
                            <select class="form-select part-select" data-part-index="${index}">
                                ${this.renderPartOptions(part.partId)}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Target Configuration</label>
                            <textarea class="form-control target-config" rows="2" data-part-index="${index}">${JSON.stringify(part.target, null, 2)}</textarea>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">&nbsp;</label>
                            <button type="button" class="btn btn-outline-danger btn-sm d-block" onclick="posesSetup.removePartFromPose(${index})">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderPartOptions(selectedPartId) {
        let options = '<option value="">Select a part...</option>';
        const partTypes = this.getAvailablePartTypes();
        partTypes.forEach(type => {
            const partsOfType = this.getPartsByType(type);
            if (partsOfType.length > 0) {
                options += `<optgroup label="${type.charAt(0).toUpperCase() + type.slice(1)} Parts">`;
                partsOfType.forEach(part => {
                    const selected = part.id == selectedPartId ? 'selected' : '';
                    options += `<option value="${part.id}" ${selected}>${part.name || `${type} #${part.id}`}</option>`;
                });
                options += '</optgroup>';
            }
        });
        return options;
    }

    addPartToPose() {
        const container = document.getElementById('editPoseParts');
        const newIndex = container.children.length - 1; // -1 for the Add Part button
        const newPartHtml = `
            <div class="card mb-2" data-part-index="${newIndex}">
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-4">
                            <label class="form-label">Part</label>
                            <select class="form-select part-select" data-part-index="${newIndex}">
                                ${this.renderPartOptions()}
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Target Configuration</label>
                            <textarea class="form-control target-config" rows="2" data-part-index="${newIndex}">{}</textarea>
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">&nbsp;</label>
                            <button type="button" class="btn btn-outline-danger btn-sm d-block" onclick="posesSetup.removePartFromPose(${newIndex})">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert before the Add Part button
        const addButton = container.lastElementChild;
        addButton.insertAdjacentHTML('beforebegin', newPartHtml);
    }

    removePartFromPose(index) {
        const partCard = document.querySelector(`[data-part-index="${index}"]`);
        if (partCard) {
            partCard.remove();
        }
    }

    async saveEditedPose(poseId) {
        const form = document.getElementById('editPoseForm');
        if (!mb.validateForm(form)) {
            mb.showNotification('Please fill in all required fields', 'warning');
            return;
        }

        const name = document.getElementById('editPoseName').value;
        const description = document.getElementById('editPoseDescription').value;
        const category = document.getElementById('editPoseCategory').value;
        const concurrent = document.getElementById('editPoseConcurrent').checked;

        // Collect parts configuration
        const parts = [];
        const partCards = document.querySelectorAll('#editPoseParts .card[data-part-index]');
        partCards.forEach(card => {
            const partSelect = card.querySelector('.part-select');
            const targetConfig = card.querySelector('.target-config');

            if (partSelect.value && targetConfig.value.trim()) {
                try {
                    const target = JSON.parse(targetConfig.value);
                    const part = this.parts.find(p => p.id == partSelect.value);
                    parts.push({
                        partId: parseInt(partSelect.value),
                        type: part ? part.type : 'unknown',
                        target: target
                    });
                } catch (e) {
                    mb.showNotification(`Invalid JSON in part configuration: ${e.message}`, 'error');
                    return;
                }
            }
        });

        if (parts.length === 0) {
            mb.showNotification('At least one part must be configured', 'warning');
            return;
        }

        try {
            const response = await mb.apiCall(`/setup/poses/api/poses/${poseId}`, {
                method: 'PUT',
                body: { name, description, category, concurrent, parts }
            });

            if (response.success) {
                mb.showNotification('Pose updated successfully', 'success');

                // Update local poses array
                const poseIndex = this.poses.findIndex(p => p.id === poseId);
                if (poseIndex !== -1) {
                    this.poses[poseIndex] = response.pose;
                }

                this.renderPoses();
                bootstrap.Modal.getInstance(document.getElementById('editPoseModal')).hide();
            }
        } catch (error) {
            mb.showNotification('Failed to update pose: ' + error.message, 'error');
        }
    }

    async deletePose(poseId) {
        const pose = this.poses.find(p => p.id === poseId);
        if (!pose) return;

        const confirmed = await mb.confirmAction(
            `Are you sure you want to delete the pose "${pose.name}"? This action cannot be undone.`,
            'Delete Pose'
        );

        if (!confirmed) return;

        try {
            const response = await mb.apiCall(`/setup/poses/api/poses/${poseId}`, {
                method: 'DELETE'
            });

            if (response.success) {
                mb.showNotification('Pose deleted successfully', 'success');
                this.poses = this.poses.filter(p => p.id !== poseId);
                this.renderPoses();
            }
        } catch (error) {
            mb.showNotification('Failed to delete pose: ' + error.message, 'error');
        }
    }
}

// Initialize poses setup
const posesSetup = new PosesSetup();
