const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

const analyticsPath = path.join(__dirname, '../data/scene-analytics.json');

// Scene execution analytics
const logSceneExecution = async (sceneId, characterId, executionData) => {
    try {
        const analytics = await getAnalytics();
        const executionLog = {
            id: generateLogId(),
            sceneId: parseInt(sceneId),
            characterId: parseInt(characterId),
            timestamp: new Date().toISOString(),
            startTime: executionData.startTime,
            endTime: executionData.endTime,
            duration: executionData.duration,
            stepsExecuted: executionData.stepsExecuted,
            totalSteps: executionData.totalSteps,
            success: executionData.success,
            errors: executionData.errors || [],
            performance: executionData.performance || {}
        };
        
        analytics.executions.push(executionLog);
        
        // Keep only last 1000 execution logs
        if (analytics.executions.length > 1000) {
            analytics.executions = analytics.executions.slice(-1000);
        }
        
        await saveAnalytics(analytics);
        logger.info(`Scene execution logged: Scene ${sceneId}, Duration: ${executionData.duration}ms`);
        
        return executionLog;
    } catch (error) {
        logger.error('Error logging scene execution:', error);
        throw error;
    }
};

// Scene usage statistics
const updateSceneUsageStats = async (sceneId, characterId) => {
    try {
        const analytics = await getAnalytics();
        const sceneKey = `${characterId}_${sceneId}`;
        
        if (!analytics.usage[sceneKey]) {
            analytics.usage[sceneKey] = {
                sceneId: parseInt(sceneId),
                characterId: parseInt(characterId),
                executionCount: 0,
                lastExecuted: null,
                totalDuration: 0,
                averageDuration: 0
            };
        }
        
        analytics.usage[sceneKey].executionCount++;
        analytics.usage[sceneKey].lastExecuted = new Date().toISOString();
        
        await saveAnalytics(analytics);
        logger.debug(`Updated usage stats for scene ${sceneId}`);
        
        return analytics.usage[sceneKey];
    } catch (error) {
        logger.error('Error updating scene usage stats:', error);
        throw error;
    }
};

// Get scene analytics
const getSceneAnalytics = async (sceneId = null, characterId = null) => {
    try {
        const analytics = await getAnalytics();
        
        let executions = analytics.executions;
        let usage = analytics.usage;
        
        // Filter by scene ID if provided
        if (sceneId) {
            executions = executions.filter(e => e.sceneId === parseInt(sceneId));
            usage = Object.values(usage).filter(u => u.sceneId === parseInt(sceneId));
        }
        
        // Filter by character ID if provided
        if (characterId) {
            executions = executions.filter(e => e.characterId === parseInt(characterId));
            usage = Object.values(usage).filter(u => u.characterId === parseInt(characterId));
        }
        
        // Calculate summary statistics
        const summary = calculateSummaryStats(executions, usage);
        
        return {
            executions,
            usage,
            summary
        };
    } catch (error) {
        logger.error('Error getting scene analytics:', error);
        throw error;
    }
};

// Get popular scenes
const getPopularScenes = async (characterId = null, limit = 10) => {
    try {
        const analytics = await getAnalytics();
        let usage = Object.values(analytics.usage);
        
        if (characterId) {
            usage = usage.filter(u => u.characterId === parseInt(characterId));
        }
        
        // Sort by execution count
        usage.sort((a, b) => b.executionCount - a.executionCount);
        
        return usage.slice(0, limit);
    } catch (error) {
        logger.error('Error getting popular scenes:', error);
        throw error;
    }
};

// Get scene performance metrics
const getScenePerformanceMetrics = async (sceneId, characterId) => {
    try {
        const analytics = await getAnalytics();
        const executions = analytics.executions.filter(e => 
            e.sceneId === parseInt(sceneId) && 
            e.characterId === parseInt(characterId)
        );
        
        if (executions.length === 0) {
            return null;
        }
        
        const durations = executions.map(e => e.duration).filter(d => d > 0);
        const successRate = executions.filter(e => e.success).length / executions.length;
        
        return {
            totalExecutions: executions.length,
            successRate: successRate,
            averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
            minDuration: durations.length > 0 ? Math.min(...durations) : 0,
            maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
            lastExecuted: executions[executions.length - 1]?.timestamp,
            commonErrors: getCommonErrors(executions)
        };
    } catch (error) {
        logger.error('Error getting scene performance metrics:', error);
        throw error;
    }
};

// Helper functions
const getAnalytics = async () => {
    try {
        const data = await fs.readFile(analyticsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Create initial analytics structure
            const initialAnalytics = {
                executions: [],
                usage: {},
                created: new Date().toISOString()
            };
            await saveAnalytics(initialAnalytics);
            return initialAnalytics;
        }
        throw error;
    }
};

const saveAnalytics = async (analytics) => {
    await fs.writeFile(analyticsPath, JSON.stringify(analytics, null, 2));
};

const generateLogId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

const calculateSummaryStats = (executions, usage) => {
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    const successRate = totalExecutions > 0 ? successfulExecutions / totalExecutions : 0;
    
    const durations = executions.map(e => e.duration).filter(d => d > 0);
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    const uniqueScenes = new Set(executions.map(e => e.sceneId)).size;
    const uniqueCharacters = new Set(executions.map(e => e.characterId)).size;
    
    return {
        totalExecutions,
        successfulExecutions,
        failedExecutions,
        successRate,
        averageDuration,
        uniqueScenes,
        uniqueCharacters,
        mostActiveScene: usage.length > 0 ? usage.reduce((a, b) => a.executionCount > b.executionCount ? a : b) : null
    };
};

const getCommonErrors = (executions) => {
    const errorCounts = {};
    
    executions.forEach(execution => {
        if (execution.errors && execution.errors.length > 0) {
            execution.errors.forEach(error => {
                const errorKey = error.message || error.toString();
                errorCounts[errorKey] = (errorCounts[errorKey] || 0) + 1;
            });
        }
    });
    
    return Object.entries(errorCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([error, count]) => ({ error, count }));
};

module.exports = {
    logSceneExecution,
    updateSceneUsageStats,
    getSceneAnalytics,
    getPopularScenes,
    getScenePerformanceMetrics
};
