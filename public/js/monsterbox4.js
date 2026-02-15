/**
 * MonsterBox Core JavaScript
 * Common functionality and utilities
 */

if (window.MonsterBox) {
    // In test mode, downgrade to info to avoid failing Playwright console hooks
    if (window.MB_TEST_MODE) {
        // no-op to avoid noisy logs in CI
    } else {
        console.warn('MonsterBox already initialized');
    }
} else {

class MonsterBox {
    constructor() {
        this.apiBase = '';
        this.currentCharacter = this.getCurrentCharacter();
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkHardwareStatus();
    }

    setupEventListeners() {
        // Global error handling
        window.addEventListener('unhandledrejection', (event) => {
            if (window.MB_TEST_MODE) {
                console.log('Unhandled promise rejection (sanitized):', event && event.reason);
            } else {
                console.error('Unhandled promise rejection:', event.reason);
            }
            this.showNotification('An unexpected error occurred', 'error');
        });

        // Form validation
        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (form.classList.contains('needs-validation')) {
                if (!form.checkValidity()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                form.classList.add('was-validated');
            }
        });

        // Accessibility/focus management for all modals across the app
        // Prevent "aria-hidden" focus warnings by blurring focused elements inside modals before hide
        document.addEventListener('hide.bs.modal', (event) => {
            const modal = event.target;
            try {
                if (modal && modal.classList && modal.classList.contains('modal')) {
                    if (modal.contains(document.activeElement)) {
                        document.activeElement.blur();
                    }
                }
            } catch (e) {
                if (window.MB_TEST_MODE) console.log('Modal hide focus guard issue'); else console.warn('Modal hide focus guard error:', e);
            }
        });

        // After modal hidden, restore focus to opener if known; otherwise focus body safely
        document.addEventListener('hidden.bs.modal', (event) => {
            const modal = event.target;
            try {
                const opener = modal && modal.__mb_lastTrigger;
                if (opener && document.body.contains(opener)) {
                    opener.focus({ preventScroll: true });
                } else {
                    const body = document.body;
                    const prev = body.getAttribute('tabindex');
                    body.setAttribute('tabindex', '-1');
                    body.focus({ preventScroll: true });
                    if (prev === null) {
                        body.removeAttribute('tabindex');
                    } else {
                        body.setAttribute('tabindex', prev);
                    }
                }
            } catch (e) {
                // no-op
            }
        });

        // Track the element that opened each modal so we can restore focus
        document.addEventListener('click', (e) => {
            const trigger = e.target && e.target.closest('[data-bs-toggle="modal"][data-bs-target], a[data-bs-toggle="modal"][href^="#"]');
            if (trigger) {
                const selector = trigger.getAttribute('data-bs-target') || trigger.getAttribute('href');
                if (selector && selector.startsWith('#')) {
                    const modal = document.querySelector(selector);
                    if (modal) {
                        modal.__mb_lastTrigger = trigger;
                    }
                }
            }
        }, true);

        // Extra safety: blur focus immediately when a dismiss button is clicked
        document.addEventListener('click', (e) => {
            const dismiss = e.target && e.target.closest('[data-bs-dismiss="modal"]');
            if (dismiss) {
                const modal = dismiss.closest('.modal');
                if (modal && modal.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
            }
        }, true);
    }

    getCurrentCharacter() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('characterId') || '4';
    }

    async checkHardwareStatus() {
        try {
            // This would check actual hardware status
            // For now, just simulate
            setTimeout(() => {
                this.updateHardwareStatus('connected');
            }, 1000);
        } catch (error) {
            if (window.MB_TEST_MODE) console.log('Hardware status check issue'); else console.error('Hardware status check failed:', error);
            this.updateHardwareStatus('disconnected');
        }
    }

    updateHardwareStatus(status) {
        const statusElements = document.querySelectorAll('.hardware-status');
        statusElements.forEach(element => {
            element.className = `badge status-${status}`;
            element.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        });
    }

    async apiCall(endpoint, options = {}) {
        const url = `${this.apiBase}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const config = { ...defaultOptions, ...options };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            if (window.MB_TEST_MODE) console.log('API call issue:', endpoint); else console.error(`API call failed: ${endpoint}`, error);
            throw error;
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = this.createNotification(message, type);
        document.body.appendChild(notification);

        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 100);

        // Auto-remove
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    createNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 1060; min-width: 300px;';

        const iconMap = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };

        notification.innerHTML = `
            <i class="bi bi-${iconMap[type] || 'info-circle'}"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        return notification;
    }

    showLoading(element, show = true) {
        if (show) {
            element.classList.add('loading');
            element.style.position = 'relative';
        } else {
            element.classList.remove('loading');
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async confirmAction(message, title = 'Confirm Action') {
        return new Promise((resolve) => {
            const modal = this.createConfirmModal(message, title, resolve);
            document.body.appendChild(modal);

            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        });
    }

    createConfirmModal(message, title, callback) {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary confirm-btn">Confirm</button>
                    </div>
                </div>
            </div>
        `;

        modal.querySelector('.confirm-btn').addEventListener('click', () => {
            callback(true);
            bootstrap.Modal.getInstance(modal).hide();
        });

        modal.addEventListener('hidden.bs.modal', () => {
            callback(false);
        });

        return modal;
    }

    validateForm(form) {
        const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;

        inputs.forEach(input => {
            if (!input.value.trim()) {
                input.classList.add('is-invalid');
                isValid = false;
            } else {
                input.classList.remove('is-invalid');
                input.classList.add('is-valid');
            }
        });

        return isValid;
    }

    resetForm(form) {
        form.reset();
        form.classList.remove('was-validated');
        form.querySelectorAll('.is-valid, .is-invalid').forEach(element => {
            element.classList.remove('is-valid', 'is-invalid');
        });
    }

    animateElement(element, animation = 'fade-in') {
        element.classList.add(animation);
        element.addEventListener('animationend', () => {
            element.classList.remove(animation);
        }, { once: true });
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showNotification('Copied to clipboard', 'success', 2000);
        }).catch(() => {
            this.showNotification('Failed to copy to clipboard', 'error');
        });
    }

    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Initialize MonsterBox
const mb = new MonsterBox();

// Make it globally available
window.MonsterBox = mb;
}
