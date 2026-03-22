/**
 * Environment Isolation
 * Derives runtime environment from MONSTERBOX_ENV or MB_TEST_MODE fallback.
 * Provides canonical environment detection for the entire application.
 */

const MONSTERBOX_ENV = process.env.MONSTERBOX_ENV ||
    (process.env.MB_TEST_MODE === '1' ? 'test' : 'production');

/**
 * Get the current environment mode.
 * @returns {'production' | 'development' | 'test'}
 */
function getEnvironment() {
    return MONSTERBOX_ENV;
}

/**
 * Check if running in test mode (MONSTERBOX_ENV=test or MB_TEST_MODE=1).
 * @returns {boolean}
 */
function isTestMode() {
    return MONSTERBOX_ENV === 'test' || process.env.MB_TEST_MODE === '1';
}

/**
 * Check if running in production mode.
 * @returns {boolean}
 */
function isProduction() {
    return MONSTERBOX_ENV === 'production' && !process.env.MB_TEST_MODE;
}

/**
 * Check if running in development mode.
 * @returns {boolean}
 */
function isDevelopment() {
    return MONSTERBOX_ENV === 'development';
}

export { getEnvironment, isTestMode, isProduction, isDevelopment };
