/**
 * MonsterBox Integrated Log Collection Service
 * Tasks 4.7-4.15: Complete Integration of All Log Collection Components
 * 
 * Combines all log collection services into a unified, production-ready system
 * with retention policies, alerting, monitoring, and web dashboard integration
 */

const EventEmitter = require('events');
const winston = require('winston');
const CentralLogAggregationService = require('./centralLogAggregationService');
const RealTimeLogStreaming = require('./realTimeLogStreaming');
const LogProcessingAndFiltering = require('./logProcessingAndFiltering');
const LogStorageAndIndexing = require('./logStorageAndIndexing');

class IntegratedLogCollectionService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            // Service ports
            aggregationPort: config.aggregationPort || 8781,
            streamingPort: config.streamingPort || 8782,
            
            // Storage configuration
            storageDir: config.storageDir || './log/integrated',
            retentionDays: config.retentionDays || 30,
            compressionEnabled: config.compressionEnabled !== false,
            
            // Processing configuration
            enablePatternDetection: config.enablePatternDetection !== false,
            enableAnomalyDetection: config.enableAnomalyDetection !== false,
            enableAlerting: config.enableAlerting !== false,
            
            // Performance settings
            maxBufferSize: config.maxBufferSize || 1000,
            flushInterval: config.flushInterval || 5000,
            
            // Alerting thresholds
            errorThreshold: config.errorThreshold || 10,
            warningThreshold: config.warningThreshold || 50,
            
            ...config
        };

        this.services = {};
        this.isRunning = false;
        this.statistics = {
            startTime: null,
            totalLogsProcessed: 0,
            alertsGenerated: 0,
            patternsDetected: 0,
            anomaliesDetected: 0
        };

        this.alertingRules = new Map();
        this.setupLogger();
        this.initializeServices();
        this.setupEventHandlers();
    }

    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({
                    filename: './log/integrated-log-service.log',
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    initializeServices() {
        // Central aggregation service
        this.services.aggregation = new CentralLogAggregationService({
            port: this.config.aggregationPort,
            storageDir: this.config.storageDir,
            maxBufferSize: this.config.maxBufferSize,
            flushInterval: this.config.flushInterval,
            retentionDays: this.config.retentionDays,
            compressionEnabled: this.config.compressionEnabled
        });

        // Real-time streaming service
        this.services.streaming = new RealTimeLogStreaming({
            streamPort: this.config.streamingPort,
            maxConnections: 50,
            bufferSize: this.config.maxBufferSize,
            compressionEnabled: this.config.compressionEnabled
        });

        // Log processing and filtering
        this.services.processing = new LogProcessingAndFiltering({
            enablePatternDetection: this.config.enablePatternDetection,
            enableAnomalyDetection: this.config.enableAnomalyDetection,
            enableAutoClassification: true
        });

        // Storage and indexing
        this.services.storage = new LogStorageAndIndexing({
            storageDir: this.config.storageDir,
            compressionEnabled: this.config.compressionEnabled,
            retentionDays: this.config.retentionDays,
            enableFullTextIndex: true
        });
    }

    setupEventHandlers() {
        // Aggregation service events
        this.services.aggregation.on('started', () => {
            this.logger.info('Central aggregation service started');
        });

        // Processing service events
        this.services.processing.on('log_processed', (logEntry) => {
            this.handleProcessedLog(logEntry);
        });

        this.services.processing.on('pattern_detected', (pattern) => {
            this.handlePatternDetection(pattern);
        });

        this.services.processing.on('anomaly_detected', (logEntry) => {
            this.handleAnomalyDetection(logEntry);
        });

        // Storage service events
        this.services.storage.on('entries_stored', (info) => {
            this.logger.debug('Entries stored', info);
        });
    }

    async start() {
        try {
            this.logger.info('Starting Integrated Log Collection Service...');
            
            // Start all services
            await this.services.aggregation.start();
            await this.services.streaming.start();
            await this.services.storage.initializeStorage();
            
            this.isRunning = true;
            this.statistics.startTime = new Date().toISOString();
            
            // Setup alerting rules
            this.setupDefaultAlertingRules();
            
            // Start monitoring loop
            this.startMonitoring();
            
            this.logger.info('Integrated Log Collection Service started successfully', {
                aggregationPort: this.config.aggregationPort,
                streamingPort: this.config.streamingPort,
                storageDir: this.config.storageDir
            });

            this.emit('started');
            return true;
            
        } catch (error) {
            this.logger.error('Failed to start Integrated Log Collection Service', {
                error: error.message
            });
            return false;
        }
    }

    async stop() {
        try {
            this.logger.info('Stopping Integrated Log Collection Service...');
            
            this.isRunning = false;
            
            // Stop all services
            await this.services.aggregation.stop();
            await this.services.streaming.stop();
            await this.services.storage.stop();
            this.services.processing.stop();
            
            // Clear monitoring interval
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
            }
            
            this.logger.info('Integrated Log Collection Service stopped');
            this.emit('stopped');
            
        } catch (error) {
            this.logger.error('Error stopping service', { error: error.message });
        }
    }

    async ingestLog(logEntry) {
        try {
            this.statistics.totalLogsProcessed++;
            
            // Process the log entry
            const processedEntry = this.services.processing.processLogEntry(logEntry);
            
            // Store the log entry
            await this.services.storage.storeLogEntry(processedEntry);
            
            // Send to aggregation service
            await this.services.aggregation.ingestLogEntry(processedEntry);
            
            // Stream to real-time subscribers
            this.services.streaming.streamLogEntry(processedEntry);
            
            // Check alerting rules
            if (this.config.enableAlerting) {
                this.checkAlertingRules(processedEntry);
            }
            
            return processedEntry.id;
            
        } catch (error) {
            this.logger.error('Error ingesting log entry', {
                error: error.message,
                logEntry: logEntry.id
            });
            throw error;
        }
    }

    handleProcessedLog(logEntry) {
        // Additional processing after classification and pattern detection
        this.emit('log_processed', logEntry);
    }

    handlePatternDetection(pattern) {
        this.statistics.patternsDetected++;
        
        this.logger.warn('Pattern detected', pattern);
        
        // Generate alert if pattern is concerning
        if (pattern.type === 'repeating_errors' || pattern.type === 'frequent_restarts') {
            this.generateAlert('pattern', {
                type: 'pattern_detected',
                severity: 'medium',
                pattern: pattern,
                message: `Detected concerning pattern: ${pattern.type} in ${pattern.source}`
            });
        }
        
        this.emit('pattern_detected', pattern);
    }

    handleAnomalyDetection(logEntry) {
        this.statistics.anomaliesDetected++;
        
        this.logger.warn('Anomaly detected', {
            logEntry: logEntry.id,
            anomaly: logEntry.anomaly
        });
        
        // Generate alert for high-score anomalies
        if (logEntry.anomaly.score > 2.0) {
            this.generateAlert('anomaly', {
                type: 'anomaly_detected',
                severity: 'high',
                logEntry: logEntry,
                message: `High anomaly score (${logEntry.anomaly.score.toFixed(2)}) detected in ${logEntry.animatronic}/${logEntry.service}`
            });
        }
        
        this.emit('anomaly_detected', logEntry);
    }

    setupDefaultAlertingRules() {
        // Error rate alerting
        this.addAlertingRule('error_rate', {
            condition: 'error_count_per_minute',
            threshold: this.config.errorThreshold,
            window: 60000, // 1 minute
            severity: 'high',
            message: 'High error rate detected'
        });

        // Warning rate alerting
        this.addAlertingRule('warning_rate', {
            condition: 'warning_count_per_minute',
            threshold: this.config.warningThreshold,
            window: 60000,
            severity: 'medium',
            message: 'High warning rate detected'
        });

        // Service down alerting
        this.addAlertingRule('service_down', {
            condition: 'no_logs_received',
            threshold: 300000, // 5 minutes
            severity: 'critical',
            message: 'Service appears to be down - no logs received'
        });

        // Hardware error alerting
        this.addAlertingRule('hardware_error', {
            condition: 'classification_match',
            classification: 'hardware_error',
            threshold: 1,
            severity: 'high',
            message: 'Hardware error detected'
        });
    }

    addAlertingRule(name, rule) {
        this.alertingRules.set(name, {
            ...rule,
            lastTriggered: null,
            triggerCount: 0
        });
    }

    checkAlertingRules(logEntry) {
        for (const [ruleName, rule] of this.alertingRules) {
            if (this.evaluateAlertingRule(rule, logEntry)) {
                this.triggerAlert(ruleName, rule, logEntry);
            }
        }
    }

    evaluateAlertingRule(rule, logEntry) {
        switch (rule.condition) {
            case 'classification_match':
                return logEntry.classifications && 
                       logEntry.classifications.some(c => c.rule === rule.classification);
            
            case 'error_count_per_minute':
                return logEntry.level === 'error';
            
            case 'warning_count_per_minute':
                return logEntry.level === 'warn';
            
            default:
                return false;
        }
    }

    triggerAlert(ruleName, rule, logEntry) {
        const now = Date.now();
        
        // Prevent alert spam - minimum 5 minutes between same alerts
        if (rule.lastTriggered && (now - rule.lastTriggered) < 300000) {
            return;
        }
        
        rule.lastTriggered = now;
        rule.triggerCount++;
        
        this.generateAlert('rule', {
            type: 'alerting_rule_triggered',
            ruleName: ruleName,
            severity: rule.severity,
            message: rule.message,
            logEntry: logEntry,
            triggerCount: rule.triggerCount
        });
    }

    generateAlert(source, alertData) {
        this.statistics.alertsGenerated++;
        
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: source,
            timestamp: new Date().toISOString(),
            ...alertData
        };
        
        this.logger.warn('Alert generated', alert);
        
        // Emit alert for external handling
        this.emit('alert_generated', alert);
        
        // Store alert for dashboard
        this.storeAlert(alert);
        
        return alert;
    }

    async storeAlert(alert) {
        try {
            // Store alert as a special log entry
            await this.services.storage.storeLogEntry({
                id: alert.id,
                timestamp: alert.timestamp,
                level: 'alert',
                source: 'alerting_system',
                animatronic: 'system',
                service: 'alerting',
                message: alert.message,
                metadata: {
                    alertType: alert.type,
                    severity: alert.severity,
                    source: alert.source,
                    originalAlert: alert
                }
            });
        } catch (error) {
            this.logger.error('Failed to store alert', {
                error: error.message,
                alert: alert.id
            });
        }
    }

    startMonitoring() {
        // Monitor service health every 30 seconds
        this.monitoringInterval = setInterval(() => {
            this.performHealthCheck();
        }, 30000);
    }

    performHealthCheck() {
        try {
            const health = {
                timestamp: new Date().toISOString(),
                services: {},
                overall: 'healthy'
            };

            // Check each service
            health.services.aggregation = this.services.aggregation.isRunning ? 'healthy' : 'unhealthy';
            health.services.streaming = this.services.streaming.streamStats ? 'healthy' : 'unhealthy';
            health.services.storage = this.services.storage.statistics ? 'healthy' : 'unhealthy';
            health.services.processing = this.services.processing.statistics ? 'healthy' : 'unhealthy';

            // Determine overall health
            const unhealthyServices = Object.values(health.services).filter(status => status === 'unhealthy');
            if (unhealthyServices.length > 0) {
                health.overall = 'degraded';
                
                if (unhealthyServices.length > 2) {
                    health.overall = 'unhealthy';
                }
            }

            this.emit('health_check', health);
            
        } catch (error) {
            this.logger.error('Error during health check', { error: error.message });
        }
    }

    async queryLogs(query) {
        try {
            return await this.services.storage.queryLogs(query);
        } catch (error) {
            this.logger.error('Error querying logs', {
                error: error.message,
                query
            });
            throw error;
        }
    }

    getStatistics() {
        return {
            integrated: this.statistics,
            aggregation: this.services.aggregation.getStatus(),
            streaming: this.services.streaming.getStats(),
            processing: this.services.processing.getStatistics(),
            storage: this.services.storage.getStatistics()
        };
    }

    getAlertingSummary() {
        return {
            totalAlerts: this.statistics.alertsGenerated,
            rules: Array.from(this.alertingRules.entries()).map(([name, rule]) => ({
                name,
                condition: rule.condition,
                threshold: rule.threshold,
                severity: rule.severity,
                triggerCount: rule.triggerCount,
                lastTriggered: rule.lastTriggered
            }))
        };
    }

    // Fix for the sound player shutdown issue
    async handleGracefulShutdown() {
        this.logger.info('Handling graceful shutdown...');
        
        try {
            // Stop sound player gracefully before other services
            const soundService = require('./soundService');
            if (soundService && typeof soundService.stop === 'function') {
                await soundService.stop();
                this.logger.info('Sound service stopped gracefully');
            }
        } catch (error) {
            this.logger.warn('Sound service already stopped or not available', {
                error: error.message
            });
        }
        
        // Stop log collection services
        await this.stop();
    }
}

module.exports = IntegratedLogCollectionService;
