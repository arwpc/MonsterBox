/**
 * Bulletproof Scene Execution Wrapper
 * 
 * CRITICAL FIX: Scenes must complete or report clear errors. No silent failures.
 * This wrapper adds:
 * - Automatic retries on hardware failures
 * - Comprehensive timeout handling
 * - Detailed error reporting
 * - Recovery strategies
 */

import sceneExecutor from './sceneExecutor.js';

// Error classification
const ERROR_TYPES = {
    HARDWARE_TIMEOUT: 'hardware_timeout',
    HARDWARE_FAILURE: 'hardware_failure',
    AUDIO_FAILURE: 'audio_failure',
    NETWORK_FAILURE: 'network_failure',
    INVALID_CONFIG: 'invalid_config',
    UNKNOWN: 'unknown'
};

// Retry configuration by error type
const RETRY_CONFIG = {
    [ERROR_TYPES.HARDWARE_TIMEOUT]: { maxRetries: 2, delayMs: 500 },
    [ERROR_TYPES.HARDWARE_FAILURE]: { maxRetries: 3, delayMs: 1000 },
    [ERROR_TYPES.AUDIO_FAILURE]: { maxRetries: 2, delayMs: 500 },
    [ERROR_TYPES.NETWORK_FAILURE]: { maxRetries: 3, delayMs: 2000 },
    [ERROR_TYPES.INVALID_CONFIG]: { maxRetries: 0, delayMs: 0 }, // Don't retry config errors
    [ERROR_TYPES.UNKNOWN]: { maxRetries: 1, delayMs: 1000 }
};

/**
 * Classify error to determine retry strategy
 */
function classifyError(error) {
    const msg = String(error?.message || error || '').toLowerCase();
    
    if (msg.includes('timeout') || msg.includes('timed out')) {
        return ERROR_TYPES.HARDWARE_TIMEOUT;
    }
    if (msg.includes('hardware') || msg.includes('gpio') || msg.includes('servo') || msg.includes('actuator')) {
        return ERROR_TYPES.HARDWARE_FAILURE;
    }
    if (msg.includes('audio') || msg.includes('speaker') || msg.includes('playback')) {
        return ERROR_TYPES.AUDIO_FAILURE;
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
        return ERROR_TYPES.NETWORK_FAILURE;
    }
    if (msg.includes('invalid') || msg.includes('missing') || msg.includes('required')) {
        return ERROR_TYPES.INVALID_CONFIG;
    }
    
    return ERROR_TYPES.UNKNOWN;
}

/**
 * Wait with delay
 */
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute with timeout
 */
async function executeWithTimeout(fn, timeoutMs, timeoutError = 'Operation timed out') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
        )
    ]);
}

/**
 * Execute a single step with retries
 */
async function executeStepWithRetries(stepFn, stepInfo, emit) {
    let lastError = null;
    let attempt = 0;
    
    while (true) {
        attempt++;
        
        try {
            // Add timeout wrapper (30 seconds per step max)
            const result = await executeWithTimeout(
                () => stepFn(),
                30000,
                `Step timed out after 30 seconds: ${stepInfo}`
            );
            
            // Success!
            if (attempt > 1) {
                console.log(`✅ Step succeeded on attempt ${attempt}: ${stepInfo}`);
                emit && emit({
                    type: 'step_retry_success',
                    stepInfo,
                    attempt,
                    retriesNeeded: attempt - 1
                });
            }
            
            return result;
            
        } catch (error) {
            lastError = error;
            const errorType = classifyError(error);
            const retryConfig = RETRY_CONFIG[errorType];
            
            console.error(`❌ Step failed (attempt ${attempt}): ${stepInfo}`, error.message);
            console.error(`   Error type: ${errorType}`);
            
            // Check if we should retry
            if (attempt > retryConfig.maxRetries) {
                console.error(`💀 Step exhausted retries (${attempt-1} retries): ${stepInfo}`);
                emit && emit({
                    type: 'step_failed',
                    stepInfo,
                    error: error.message,
                    errorType,
                    attempts: attempt,
                    retriesAttempted: attempt - 1
                });
                throw error;
            }
            
            // Emit retry notification
            emit && emit({
                type: 'step_retry',
                stepInfo,
                error: error.message,
                errorType,
                attempt,
                nextRetryDelayMs: retryConfig.delayMs
            });
            
            // Wait before retry
            if (retryConfig.delayMs > 0) {
                console.log(`⏳ Waiting ${retryConfig.delayMs}ms before retry...`);
                await delay(retryConfig.delayMs);
            }
        }
    }
}

/**
 * Bulletproof scene execution with comprehensive error handling
 */
export async function executeSceneBulletproof(scene, characterId, options = {}) {
    const startTime = Date.now();
    const sceneId = scene.id || scene.name || 'unknown';
    const emit = options.emit || (() => {});
    
    console.log(`🎬 [BULLETPROOF] Starting scene: ${sceneId} for character ${characterId}`);
    
    // Validate scene structure
    if (!scene || !Array.isArray(scene.steps) || scene.steps.length === 0) {
        const error = new Error('Invalid scene: missing or empty steps array');
        emit({ type: 'scene_error', sceneId, error: error.message, errorType: ERROR_TYPES.INVALID_CONFIG });
        throw error;
    }
    
    emit({ type: 'scene_start', sceneId, characterId, stepCount: scene.steps.length });
    
    const results = [];
    let completedSteps = 0;
    let failedSteps = 0;
    
    try {
        // Execute each step with retries
        for (let i = 0; i < scene.steps.length; i++) {
            const step = scene.steps[i];
            const stepInfo = `Step ${i+1}/${scene.steps.length}: ${step.type || 'unknown'}`;
            
            console.log(`⚙️ [BULLETPROOF] ${stepInfo}`);
            emit({ type: 'step_start', stepIndex: i, step, stepInfo });
            
            try {
                // Wrap step execution in retry handler
                const result = await executeStepWithRetries(
                    async () => {
                        // Use original scene executor for actual execution
                        return await sceneExecutor.executeStep(step, characterId, emit, options);
                    },
                    stepInfo,
                    emit
                );
                
                results.push({ success: true, step, result });
                completedSteps++;
                
                emit({ 
                    type: 'step_complete', 
                    stepIndex: i, 
                    step, 
                    result,
                    progress: Math.round((completedSteps / scene.steps.length) * 100)
                });
                
            } catch (error) {
                failedSteps++;
                results.push({ success: false, step, error: error.message });
                
                // Determine if we should continue or abort
                const shouldContinue = options.continueOnError !== false; // Default to true
                
                if (shouldContinue) {
                    console.warn(`⚠️ [BULLETPROOF] ${stepInfo} failed, continuing: ${error.message}`);
                    emit({ 
                        type: 'step_failed_continuing', 
                        stepIndex: i, 
                        step, 
                        error: error.message,
                        remainingSteps: scene.steps.length - i - 1
                    });
                } else {
                    console.error(`💀 [BULLETPROOF] ${stepInfo} failed, aborting scene: ${error.message}`);
                    emit({ 
                        type: 'scene_aborted', 
                        sceneId,
                        stepIndex: i, 
                        step, 
                        error: error.message,
                        completedSteps,
                        failedSteps,
                        totalSteps: scene.steps.length
                    });
                    throw error;
                }
            }
        }
        
        // Scene completed
        const duration = Date.now() - startTime;
        const success = failedSteps === 0;
        
        console.log(`✅ [BULLETPROOF] Scene ${success ? 'completed' : 'completed with errors'}: ${sceneId}`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Completed steps: ${completedSteps}/${scene.steps.length}`);
        console.log(`   Failed steps: ${failedSteps}/${scene.steps.length}`);
        
        emit({ 
            type: 'scene_complete', 
            sceneId,
            success,
            duration,
            completedSteps,
            failedSteps,
            totalSteps: scene.steps.length,
            results
        });
        
        return {
            success,
            sceneId,
            characterId,
            duration,
            completedSteps,
            failedSteps,
            totalSteps: scene.steps.length,
            results
        };
        
    } catch (error) {
        // Fatal scene error
        const duration = Date.now() - startTime;
        
        console.error(`💀 [BULLETPROOF] Scene fatal error: ${sceneId}`, error.message);
        
        emit({ 
            type: 'scene_error', 
            sceneId,
            error: error.message,
            errorType: classifyError(error),
            duration,
            completedSteps,
            failedSteps,
            totalSteps: scene.steps.length
        });
        
        return {
            success: false,
            sceneId,
            characterId,
            error: error.message,
            errorType: classifyError(error),
            duration,
            completedSteps,
            failedSteps,
            totalSteps: scene.steps.length,
            results
        };
    }
}

export default {
    executeSceneBulletproof,
    ERROR_TYPES,
    classifyError
};
