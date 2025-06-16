/**
 * MonsterBox Log Processing and Filtering Service
 * Task 4.5: Log Processing and Filtering
 * 
 * Advanced log processing with pattern recognition, anomaly detection,
 * and intelligent filtering for the MonsterBox system
 */

const EventEmitter = require('events');
const winston = require('winston');

class LogProcessingAndFiltering extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enablePatternDetection: config.enablePatternDetection !== false,
            enableAnomalyDetection: config.enableAnomalyDetection !== false,
            enableAutoClassification: config.enableAutoClassification !== false,
            patternWindowSize: config.patternWindowSize || 100,
            anomalyThreshold: config.anomalyThreshold || 0.8,
            processingBatchSize: config.processingBatchSize || 50,
            ...config
        };

        this.patterns = new Map();
        this.anomalyBaselines = new Map();
        this.processingQueue = [];
        this.classificationRules = new Map();
        this.statistics = {
            totalProcessed: 0,
            patternsDetected: 0,
            anomaliesDetected: 0,
            classificationsApplied: 0
        };

        this.setupLogger();
        this.initializeClassificationRules();
        this.startProcessingLoop();
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
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    initializeClassificationRules() {
        // Hardware-related classifications
        this.addClassificationRule('hardware_error', {
            patterns: [
                /gpio.*error/i,
                /servo.*fail/i,
                /motor.*stuck/i,
                /sensor.*timeout/i,
                /i2c.*error/i
            ],
            severity: 'high',
            category: 'hardware'
        });

        this.addClassificationRule('network_issue', {
            patterns: [
                /connection.*refused/i,
                /timeout.*connecting/i,
                /websocket.*error/i,
                /ssh.*failed/i
            ],
            severity: 'medium',
            category: 'network'
        });

        this.addClassificationRule('performance_warning', {
            patterns: [
                /high.*cpu/i,
                /memory.*usage/i,
                /slow.*response/i,
                /buffer.*full/i
            ],
            severity: 'medium',
            category: 'performance'
        });

        this.addClassificationRule('security_alert', {
            patterns: [
                /unauthorized.*access/i,
                /authentication.*failed/i,
                /invalid.*credentials/i,
                /security.*violation/i
            ],
            severity: 'high',
            category: 'security'
        });

        this.addClassificationRule('system_startup', {
            patterns: [
                /service.*started/i,
                /server.*listening/i,
                /initialization.*complete/i,
                /ready.*for.*connections/i
            ],
            severity: 'low',
            category: 'system'
        });

        this.addClassificationRule('character_action', {
            patterns: [
                /jaw.*animation/i,
                /servo.*position/i,
                /scene.*playing/i,
                /sound.*playing/i
            ],
            severity: 'low',
            category: 'character'
        });
    }

    addClassificationRule(name, rule) {
        this.classificationRules.set(name, {
            ...rule,
            matchCount: 0,
            lastMatch: null
        });
    }

    processLogEntry(logEntry) {
        // Add to processing queue
        this.processingQueue.push({
            ...logEntry,
            processedAt: new Date().toISOString(),
            originalEntry: logEntry
        });

        // Process immediately if queue is full or for high-priority logs
        if (this.processingQueue.length >= this.config.processingBatchSize || 
            logEntry.level === 'error') {
            this.processBatch();
        }

        return logEntry;
    }

    processBatch() {
        if (this.processingQueue.length === 0) return;

        const batch = this.processingQueue.splice(0, this.config.processingBatchSize);
        
        for (const logEntry of batch) {
            try {
                this.processIndividualEntry(logEntry);
            } catch (error) {
                this.logger.error('Error processing log entry', {
                    error: error.message,
                    logEntry: logEntry.id
                });
            }
        }
    }

    processIndividualEntry(logEntry) {
        let processedEntry = { ...logEntry };

        // Apply classification
        if (this.config.enableAutoClassification) {
            processedEntry = this.applyClassification(processedEntry);
        }

        // Detect patterns
        if (this.config.enablePatternDetection) {
            this.detectPatterns(processedEntry);
        }

        // Detect anomalies
        if (this.config.enableAnomalyDetection) {
            processedEntry = this.detectAnomalies(processedEntry);
        }

        // Extract structured data
        processedEntry = this.extractStructuredData(processedEntry);

        // Update statistics
        this.statistics.totalProcessed++;

        // Emit processed entry
        this.emit('log_processed', processedEntry);

        return processedEntry;
    }

    applyClassification(logEntry) {
        const message = logEntry.message || '';
        let classifications = [];

        for (const [ruleName, rule] of this.classificationRules) {
            for (const pattern of rule.patterns) {
                if (pattern.test(message)) {
                    classifications.push({
                        rule: ruleName,
                        severity: rule.severity,
                        category: rule.category,
                        confidence: this.calculatePatternConfidence(pattern, message)
                    });

                    rule.matchCount++;
                    rule.lastMatch = new Date().toISOString();
                    this.statistics.classificationsApplied++;
                    break;
                }
            }
        }

        if (classifications.length > 0) {
            logEntry.classifications = classifications;
            logEntry.primaryClassification = classifications.reduce((prev, current) => 
                (prev.confidence > current.confidence) ? prev : current
            );
        }

        return logEntry;
    }

    calculatePatternConfidence(pattern, message) {
        // Simple confidence calculation based on pattern specificity
        const patternLength = pattern.source.length;
        const messageLength = message.length;
        const matchLength = (message.match(pattern) || [''])[0].length;
        
        return Math.min(0.95, (matchLength / messageLength) * (patternLength / 50));
    }

    detectPatterns(logEntry) {
        const key = `${logEntry.animatronic}_${logEntry.service}`;
        
        if (!this.patterns.has(key)) {
            this.patterns.set(key, {
                entries: [],
                detectedPatterns: [],
                lastAnalysis: null
            });
        }

        const patternData = this.patterns.get(key);
        patternData.entries.push({
            timestamp: logEntry.timestamp,
            level: logEntry.level,
            message: logEntry.message,
            service: logEntry.service
        });

        // Maintain window size
        if (patternData.entries.length > this.config.patternWindowSize) {
            patternData.entries.shift();
        }

        // Analyze patterns every 10 entries
        if (patternData.entries.length % 10 === 0) {
            this.analyzePatterns(key, patternData);
        }
    }

    analyzePatterns(key, patternData) {
        const entries = patternData.entries;
        const now = new Date();

        // Detect repeating error patterns
        const errorEntries = entries.filter(e => e.level === 'error');
        if (errorEntries.length >= 3) {
            const errorPattern = this.findRepeatingPattern(errorEntries);
            if (errorPattern) {
                this.emitPatternDetection(key, 'repeating_errors', errorPattern);
            }
        }

        // Detect service restart patterns
        const startupEntries = entries.filter(e => 
            e.message.includes('started') || e.message.includes('listening')
        );
        if (startupEntries.length >= 2) {
            const restartPattern = this.analyzeRestartPattern(startupEntries);
            if (restartPattern.frequency > 0) {
                this.emitPatternDetection(key, 'frequent_restarts', restartPattern);
            }
        }

        // Detect performance degradation patterns
        const performanceEntries = entries.filter(e => 
            e.message.includes('slow') || e.message.includes('timeout') || e.message.includes('high')
        );
        if (performanceEntries.length >= 2) {
            const perfPattern = this.analyzePerformancePattern(performanceEntries);
            if (perfPattern.degrading) {
                this.emitPatternDetection(key, 'performance_degradation', perfPattern);
            }
        }

        patternData.lastAnalysis = now.toISOString();
    }

    findRepeatingPattern(entries) {
        if (entries.length < 3) return null;

        const messageGroups = new Map();
        
        for (const entry of entries) {
            const normalizedMessage = this.normalizeMessage(entry.message);
            if (!messageGroups.has(normalizedMessage)) {
                messageGroups.set(normalizedMessage, []);
            }
            messageGroups.get(normalizedMessage).push(entry);
        }

        // Find groups with multiple occurrences
        for (const [message, group] of messageGroups) {
            if (group.length >= 3) {
                const timeSpan = new Date(group[group.length - 1].timestamp) - new Date(group[0].timestamp);
                return {
                    message: message,
                    occurrences: group.length,
                    timeSpan: timeSpan,
                    frequency: group.length / (timeSpan / (1000 * 60)) // per minute
                };
            }
        }

        return null;
    }

    normalizeMessage(message) {
        // Remove timestamps, IDs, and other variable parts
        return message
            .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '[TIMESTAMP]')
            .replace(/\b\d+\b/g, '[NUMBER]')
            .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[UUID]')
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
            .toLowerCase()
            .trim();
    }

    analyzeRestartPattern(entries) {
        if (entries.length < 2) return { frequency: 0 };

        const timeSpan = new Date(entries[entries.length - 1].timestamp) - new Date(entries[0].timestamp);
        const frequency = entries.length / (timeSpan / (1000 * 60 * 60)); // per hour

        return {
            frequency: frequency,
            count: entries.length,
            timeSpan: timeSpan,
            concerning: frequency > 1 // More than 1 restart per hour
        };
    }

    analyzePerformancePattern(entries) {
        if (entries.length < 2) return { degrading: false };

        // Simple trend analysis - are performance issues increasing?
        const recentEntries = entries.slice(-5);
        const olderEntries = entries.slice(0, -5);

        const recentRate = recentEntries.length / 5;
        const olderRate = olderEntries.length / Math.max(1, olderEntries.length);

        return {
            degrading: recentRate > olderRate * 1.5,
            recentRate: recentRate,
            olderRate: olderRate,
            trend: recentRate > olderRate ? 'increasing' : 'stable'
        };
    }

    detectAnomalies(logEntry) {
        const key = `${logEntry.animatronic}_${logEntry.service}_${logEntry.level}`;
        
        if (!this.anomalyBaselines.has(key)) {
            this.anomalyBaselines.set(key, {
                count: 0,
                averageInterval: 0,
                lastSeen: null,
                variance: 0
            });
        }

        const baseline = this.anomalyBaselines.get(key);
        const now = new Date(logEntry.timestamp);

        if (baseline.lastSeen) {
            const interval = now - new Date(baseline.lastSeen);
            
            // Update running average
            baseline.count++;
            const alpha = 0.1; // Smoothing factor
            baseline.averageInterval = baseline.averageInterval * (1 - alpha) + interval * alpha;
            
            // Calculate anomaly score
            const deviation = Math.abs(interval - baseline.averageInterval);
            const anomalyScore = deviation / (baseline.averageInterval || 1);
            
            if (anomalyScore > this.config.anomalyThreshold) {
                logEntry.anomaly = {
                    score: anomalyScore,
                    type: interval > baseline.averageInterval ? 'delayed' : 'frequent',
                    expectedInterval: baseline.averageInterval,
                    actualInterval: interval
                };
                
                this.statistics.anomaliesDetected++;
                this.emit('anomaly_detected', logEntry);
            }
        }

        baseline.lastSeen = logEntry.timestamp;
        return logEntry;
    }

    extractStructuredData(logEntry) {
        const message = logEntry.message || '';
        const extracted = {};

        // Extract common patterns
        const patterns = {
            duration: /(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?)/i,
            percentage: /(\d+(?:\.\d+)?)\s*%/,
            temperature: /(\d+(?:\.\d+)?)\s*°?[CF]/i,
            memory: /(\d+(?:\.\d+)?)\s*(MB|GB|KB)/i,
            port: /port\s*:?\s*(\d+)/i,
            ip: /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/,
            error_code: /error\s*:?\s*(\d+)/i
        };

        for (const [key, pattern] of Object.entries(patterns)) {
            const match = message.match(pattern);
            if (match) {
                extracted[key] = match[1];
                if (match[2]) {
                    extracted[`${key}_unit`] = match[2];
                }
            }
        }

        if (Object.keys(extracted).length > 0) {
            logEntry.extractedData = extracted;
        }

        return logEntry;
    }

    emitPatternDetection(source, patternType, pattern) {
        this.statistics.patternsDetected++;
        
        this.emit('pattern_detected', {
            source: source,
            type: patternType,
            pattern: pattern,
            detectedAt: new Date().toISOString()
        });

        this.logger.info('Pattern detected', {
            source,
            type: patternType,
            pattern
        });
    }

    startProcessingLoop() {
        // Process queue every 5 seconds
        this.processingInterval = setInterval(() => {
            if (this.processingQueue.length > 0) {
                this.processBatch();
            }
        }, 5000);
    }

    stop() {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
        }
        
        // Process remaining queue
        while (this.processingQueue.length > 0) {
            this.processBatch();
        }
    }

    getStatistics() {
        return {
            ...this.statistics,
            queueSize: this.processingQueue.length,
            patternsTracked: this.patterns.size,
            anomalyBaselines: this.anomalyBaselines.size,
            classificationRules: Array.from(this.classificationRules.entries()).map(([name, rule]) => ({
                name,
                matchCount: rule.matchCount,
                lastMatch: rule.lastMatch,
                category: rule.category,
                severity: rule.severity
            }))
        };
    }

    getPatternSummary() {
        const summary = [];
        
        for (const [key, data] of this.patterns) {
            summary.push({
                source: key,
                entryCount: data.entries.length,
                detectedPatterns: data.detectedPatterns.length,
                lastAnalysis: data.lastAnalysis
            });
        }
        
        return summary;
    }
}

module.exports = LogProcessingAndFiltering;
