/**
 * Shutdown Handler
 * Provides ordered, timeout-bounded shutdown sequence.
 * Steps are registered with a priority (lower runs first) and each
 * step has a 3-second timeout. Total hard timeout is 10 seconds.
 */

class ShutdownHandler {
    constructor() {
        this.steps = [];
        this.isShuttingDown = false;
        this.hardTimeoutMs = 10000;
        this.stepTimeoutMs = 3000;
    }

    /**
     * Register a shutdown step.
     * @param {string} name - Human-readable step name for logging
     * @param {number} priority - Execution order (lower number runs first)
     * @param {Function} fn - Async function to execute during shutdown
     */
    register(name, priority, fn) {
        this.steps.push({ name, priority, fn });
        this.steps.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Execute all registered shutdown steps in priority order.
     * Each step has a 3-second timeout. Failures are logged but do not
     * prevent subsequent steps from running. A 10-second hard timeout
     * forces process.exit(1) if steps hang.
     * @param {string} signal - The signal that triggered shutdown (e.g., 'SIGTERM')
     */
    async execute(signal) {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        console.log(`Shutdown initiated by ${signal}`);

        const hardTimeout = setTimeout(() => {
            console.error('Shutdown timeout exceeded, forcing exit');
            process.exit(1);
        }, this.hardTimeoutMs);
        hardTimeout.unref();

        for (const step of this.steps) {
            try {
                console.log(`Shutdown step: ${step.name}`);
                await Promise.race([
                    step.fn(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('step timeout')), this.stepTimeoutMs)
                    )
                ]);
            } catch (err) {
                console.error(`Shutdown step "${step.name}" failed: ${err.message}`);
                // Continue with remaining steps
            }
        }

        clearTimeout(hardTimeout);
        console.log('Shutdown complete');
        process.exit(0);
    }
}

export { ShutdownHandler };
