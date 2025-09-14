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
                this.poses = posesResponse.poses;
                this.templates = posesResponse.templates;
            }

            // Load parts (from main data)
            const partsResponse = await mb.apiCall('/poses');
            if (partsResponse.success) {
                // Extract servo parts for pose creation
                this.parts = await this.getServoParts();
            }
        } catch (error) {
            console.error('Failed to load poses data:', error);
            mb.showNotification('Failed to load poses data', 'error');
        }
    }

    async getServoParts() {
        // This would normally fetch from /api/parts, but for now simulate
        return [
            { id: 29, name: 'Orlok Head Servo', type: 'servo' },
            { id: 30, name: 'Orloks Elbow', type: 'servo' },
            { id: 33, name: 'Skull Talking Jaw', type: 'servo' }
        ];
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

        // Populate parts select
        const partsSelect = document.getElementById('templatePartId');
        partsSelect.innerHTML = '<option value="">Select a part...</option>';
        this.parts.forEach(part => {
            partsSelect.innerHTML += `<option value="${part.id}">${part.name}</option>`;
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
        mb.showNotification('Custom pose creation not yet implemented', 'info');
    }

    async quickCreateFromTemplate(templateKey, optionName) {
        // Quick create with first available servo part
        if (this.parts.length === 0) {
            mb.showNotification('No servo parts available', 'warning');
            return;
        }

        const partId = this.parts[0].id;
        
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

        const confirmed = await mb.confirmAction(
            `Are you sure you want to test the pose "${pose.name}"? Make sure the animatronic is in a safe position.`,
            'Test Pose'
        );

        if (!confirmed) return;

        try {
            const poseCard = document.querySelector(`[data-pose-id="${poseId}"]`);
            poseCard.classList.add('executing');

            const response = await mb.apiCall(`/setup/poses/api/poses/${poseId}/test`, {
                method: 'POST'
            });

            if (response.success) {
                mb.showNotification(`Pose "${pose.name}" executed successfully`, 'success');
            } else {
                mb.showNotification('Pose execution failed: ' + response.error, 'error');
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
        mb.showNotification('Pose editing not yet implemented', 'info');
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
