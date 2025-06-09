/**
 * User Notification System
 * 
 * Creates clear user feedback mechanism for prevention events,
 * connection status updates, and troubleshooting guidance
 * for the PowerShell fallback prevention system.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/logger');

class UserNotificationSystem extends EventEmitter {
    constructor() {
        super();
        
        this.isActive = false;
        this.notifications = [];
        this.activeNotifications = new Map();
        this.notificationCount = 0;
        
        // Configuration
        this.config = {
            enabled: true,
            maxNotifications: 100,
            notificationTimeout: 30000, // 30 seconds
            enableToast: true,
            enableConsole: true,
            enableWebUI: true,
            enableEmail: false,
            notificationLevels: {
                info: true,
                warning: true,
                error: true,
                critical: true
            },
            categories: {
                connection: true,
                prevention: true,
                security: true,
                system: true
            }
        };
        
        // Notification templates
        this.templates = {
            CONNECTION_LOST: {
                title: "SSH Connection Lost",
                message: "Remote connection to {host} has been lost. Local execution is blocked.",
                level: "warning",
                category: "connection",
                actions: ["Reconnect", "Check Network", "View Logs"]
            },
            CONNECTION_RESTORED: {
                title: "SSH Connection Restored",
                message: "Remote connection to {host} has been restored. Normal operation resumed.",
                level: "info",
                category: "connection",
                actions: ["Continue"]
            },
            EXECUTION_BLOCKED: {
                title: "Local Execution Blocked",
                message: "Attempted local PowerShell execution blocked: {command}",
                level: "warning",
                category: "prevention",
                actions: ["View Details", "Troubleshoot", "Ignore"]
            },
            SECURITY_ALERT: {
                title: "Security Alert",
                message: "Multiple unauthorized execution attempts detected ({count} events)",
                level: "error",
                category: "security",
                actions: ["View Audit Log", "Emergency Shutdown", "Investigate"]
            },
            VALIDATION_FAILED: {
                title: "Remote Context Validation Failed",
                message: "Unable to verify remote execution environment: {reason}",
                level: "error",
                category: "security",
                actions: ["Retry Validation", "Check SSH", "View Details"]
            },
            EMERGENCY_SHUTDOWN: {
                title: "Emergency Shutdown Initiated",
                message: "Emergency shutdown protocol activated due to security breach",
                level: "critical",
                category: "security",
                actions: ["View Report", "Restart System", "Contact Admin"]
            }
        };
        
        this.initialize();
    }
    
    /**
     * Initialize the user notification system
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Initialize notification channels
            await this.initializeNotificationChannels();
            
            this.isActive = true;
            logger.info('User Notification System initialized and active');
            
        } catch (error) {
            logger.error('Failed to initialize User Notification System:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/notification-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            this.config = { ...this.config, ...loadedConfig };
            
        } catch (error) {
            logger.warn('Could not load notification configuration, using defaults');
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/notification-config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save notification configuration:', error);
        }
    }
    
    /**
     * Setup event handlers for other services
     */
    setupEventHandlers() {
        // These would be connected to other services
        this.on('connectionLost', (data) => {
            this.showNotification('CONNECTION_LOST', data);
        });
        
        this.on('connectionRestored', (data) => {
            this.showNotification('CONNECTION_RESTORED', data);
        });
        
        this.on('executionBlocked', (data) => {
            this.showNotification('EXECUTION_BLOCKED', data);
        });
        
        this.on('securityAlert', (data) => {
            this.showNotification('SECURITY_ALERT', data);
        });
        
        this.on('validationFailed', (data) => {
            this.showNotification('VALIDATION_FAILED', data);
        });
        
        this.on('emergencyShutdown', (data) => {
            this.showNotification('EMERGENCY_SHUTDOWN', data);
        });
    }
    
    /**
     * Initialize notification channels
     */
    async initializeNotificationChannels() {
        // Create notification UI directory if it doesn't exist
        const uiPath = path.join(__dirname, '../../public/notifications');
        try {
            await fs.mkdir(uiPath, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
        
        // Create notification log file
        const logPath = path.join(__dirname, '../../log/notifications.log');
        try {
            await fs.writeFile(logPath, '', { flag: 'a' });
        } catch (error) {
            logger.error('Failed to initialize notification log file:', error);
        }
    }
    
    /**
     * Show notification to user
     */
    async showNotification(templateKey, data = {}) {
        if (!this.config.enabled) {
            return;
        }
        
        const template = this.templates[templateKey];
        if (!template) {
            logger.error(`Unknown notification template: ${templateKey}`);
            return;
        }
        
        // Check if category is enabled
        if (!this.config.categories[template.category]) {
            return;
        }
        
        // Check if level is enabled
        if (!this.config.notificationLevels[template.level]) {
            return;
        }
        
        this.notificationCount++;
        
        const notification = {
            id: `notification_${this.notificationCount}_${Date.now()}`,
            templateKey,
            title: this.interpolateTemplate(template.title, data),
            message: this.interpolateTemplate(template.message, data),
            level: template.level,
            category: template.category,
            actions: template.actions,
            data,
            timestamp: new Date().toISOString(),
            dismissed: false,
            seen: false
        };
        
        // Store notification
        this.notifications.push(notification);
        this.activeNotifications.set(notification.id, notification);
        
        // Trim old notifications
        if (this.notifications.length > this.config.maxNotifications) {
            this.notifications = this.notifications.slice(-this.config.maxNotifications);
        }
        
        // Send to notification channels
        await this.sendToChannels(notification);
        
        // Set auto-dismiss timer
        if (this.config.notificationTimeout > 0) {
            setTimeout(() => {
                this.dismissNotification(notification.id);
            }, this.config.notificationTimeout);
        }
        
        this.emit('notificationShown', notification);
        
        return notification;
    }
    
    /**
     * Interpolate template with data
     */
    interpolateTemplate(template, data) {
        return template.replace(/\{(\w+)\}/g, (match, key) => {
            return data[key] || match;
        });
    }
    
    /**
     * Send notification to all enabled channels
     */
    async sendToChannels(notification) {
        const promises = [];
        
        // Console notification
        if (this.config.enableConsole) {
            promises.push(this.sendToConsole(notification));
        }
        
        // Toast notification
        if (this.config.enableToast) {
            promises.push(this.sendToToast(notification));
        }
        
        // Web UI notification
        if (this.config.enableWebUI) {
            promises.push(this.sendToWebUI(notification));
        }
        
        // Email notification
        if (this.config.enableEmail) {
            promises.push(this.sendToEmail(notification));
        }
        
        await Promise.allSettled(promises);
    }
    
    /**
     * Send notification to console
     */
    async sendToConsole(notification) {
        const levelColors = {
            info: '\x1b[36m',    // Cyan
            warning: '\x1b[33m', // Yellow
            error: '\x1b[31m',   // Red
            critical: '\x1b[35m' // Magenta
        };
        
        const color = levelColors[notification.level] || '\x1b[0m';
        const reset = '\x1b[0m';
        
        console.log(`${color}[${notification.level.toUpperCase()}] ${notification.title}${reset}`);
        console.log(`${color}${notification.message}${reset}`);
        
        if (notification.actions.length > 0) {
            console.log(`${color}Actions: ${notification.actions.join(', ')}${reset}`);
        }
        
        console.log(''); // Empty line for spacing
    }
    
    /**
     * Send notification to toast system
     */
    async sendToToast(notification) {
        // This would integrate with a toast notification library
        // For now, we'll create a simple file-based toast system
        
        const toastData = {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            level: notification.level,
            timestamp: notification.timestamp,
            actions: notification.actions
        };
        
        const toastPath = path.join(__dirname, '../../public/notifications/toast.json');
        
        try {
            // Read existing toasts
            let toasts = [];
            try {
                const existingData = await fs.readFile(toastPath, 'utf8');
                toasts = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist or is empty
            }
            
            // Add new toast
            toasts.push(toastData);
            
            // Keep only last 10 toasts
            if (toasts.length > 10) {
                toasts = toasts.slice(-10);
            }
            
            // Write back to file
            await fs.writeFile(toastPath, JSON.stringify(toasts, null, 2));
            
        } catch (error) {
            logger.error('Failed to write toast notification:', error);
        }
    }
    
    /**
     * Send notification to web UI
     */
    async sendToWebUI(notification) {
        // Create notification for web UI consumption
        const webNotification = {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            level: notification.level,
            category: notification.category,
            timestamp: notification.timestamp,
            actions: notification.actions,
            dismissed: false
        };
        
        const webUIPath = path.join(__dirname, '../../public/notifications/web-notifications.json');
        
        try {
            // Read existing notifications
            let webNotifications = [];
            try {
                const existingData = await fs.readFile(webUIPath, 'utf8');
                webNotifications = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist or is empty
            }
            
            // Add new notification
            webNotifications.push(webNotification);
            
            // Keep only last 50 notifications
            if (webNotifications.length > 50) {
                webNotifications = webNotifications.slice(-50);
            }
            
            // Write back to file
            await fs.writeFile(webUIPath, JSON.stringify(webNotifications, null, 2));
            
        } catch (error) {
            logger.error('Failed to write web UI notification:', error);
        }
    }
    
    /**
     * Send notification via email
     */
    async sendToEmail(notification) {
        // This would integrate with an email service
        // For now, we'll just log the email notification
        
        logger.info(`Email notification would be sent: ${notification.title}`);
        
        // In a real implementation, this would use nodemailer or similar
        // to send actual email notifications
    }
    
    /**
     * Dismiss notification
     */
    dismissNotification(notificationId) {
        const notification = this.activeNotifications.get(notificationId);
        if (notification) {
            notification.dismissed = true;
            this.activeNotifications.delete(notificationId);
            
            this.emit('notificationDismissed', notification);
            logger.debug(`Notification dismissed: ${notificationId}`);
        }
    }
    
    /**
     * Mark notification as seen
     */
    markNotificationSeen(notificationId) {
        const notification = this.activeNotifications.get(notificationId);
        if (notification) {
            notification.seen = true;
            this.emit('notificationSeen', notification);
        }
    }
    
    /**
     * Get active notifications
     */
    getActiveNotifications() {
        return Array.from(this.activeNotifications.values())
            .filter(n => !n.dismissed)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    /**
     * Get notification history
     */
    getNotificationHistory(limit = 50) {
        return this.notifications
            .slice(-limit)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    
    /**
     * Clear all notifications
     */
    clearAllNotifications() {
        this.activeNotifications.clear();
        this.notifications = [];
        this.emit('allNotificationsCleared');
        logger.info('All notifications cleared');
    }
    
    /**
     * Create custom notification
     */
    async createCustomNotification(title, message, level = 'info', category = 'system', actions = []) {
        const notification = {
            id: `custom_${this.notificationCount}_${Date.now()}`,
            templateKey: 'CUSTOM',
            title,
            message,
            level,
            category,
            actions,
            data: {},
            timestamp: new Date().toISOString(),
            dismissed: false,
            seen: false
        };
        
        this.notificationCount++;
        this.notifications.push(notification);
        this.activeNotifications.set(notification.id, notification);
        
        await this.sendToChannels(notification);
        
        this.emit('notificationShown', notification);
        
        return notification;
    }
    
    /**
     * Get notification statistics
     */
    getStatistics() {
        const levelCounts = {};
        const categoryCounts = {};
        
        for (const notification of this.notifications) {
            levelCounts[notification.level] = (levelCounts[notification.level] || 0) + 1;
            categoryCounts[notification.category] = (categoryCounts[notification.category] || 0) + 1;
        }
        
        return {
            isActive: this.isActive,
            totalNotifications: this.notificationCount,
            activeNotifications: this.activeNotifications.size,
            historySize: this.notifications.length,
            levelCounts,
            categoryCounts,
            config: this.config
        };
    }
    
    /**
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfiguration();
        
        logger.info('User notification configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * Shutdown notification system
     */
    async shutdown() {
        logger.info('Shutting down User Notification System');
        
        // Dismiss all active notifications
        for (const notificationId of this.activeNotifications.keys()) {
            this.dismissNotification(notificationId);
        }
        
        this.isActive = false;
        this.emit('shutdown');
    }
}

module.exports = UserNotificationSystem;
