/**
 * Environment Configuration for MonsterBox
 * Type-safe environment variable handling with validation
 */
export interface EnvironmentConfig {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: number;
    SESSION_SECRET: string;
    ANTHROPIC_API_KEY?: string;
    OPENAI_API_KEY?: string;
    GOOGLE_API_KEY?: string;
    PERPLEXITY_API_KEY?: string;
    GITHUB_TOKEN?: string;
    RPI_SSH_USER: string;
    RPI_SSH_PASSWORD: string;
    ORLOK_SSH_USER?: string;
    ORLOK_SSH_PASSWORD?: string;
    COFFIN_SSH_USER?: string;
    COFFIN_SSH_PASSWORD?: string;
    PUMPKINHEAD_SSH_USER?: string;
    PUMPKINHEAD_SSH_PASSWORD?: string;
    DATA_DIR: string;
    LOG_DIR: string;
    CONFIG_DIR: string;
}
export declare const env: EnvironmentConfig;
export declare const isDevelopment: boolean;
export declare const isProduction: boolean;
export declare const isTest: boolean;
export declare const hasAnthropicKey: boolean;
export declare const hasOpenAIKey: boolean;
export declare const hasGoogleKey: boolean;
export declare const hasPerplexityKey: boolean;
export declare const hasGitHubToken: boolean;
/**
 * Get SSH credentials for a specific animatronic system
 */
export declare function getSSHCredentials(animatronicId: string): {
    username: string;
    password: string;
};
/**
 * Ensure required directories exist
 */
export declare function ensureDirectories(): void;
export default env;
//# sourceMappingURL=environment.d.ts.map