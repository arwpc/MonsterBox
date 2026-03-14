import { readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

// Set dummy API key for tests to avoid configuration errors
process.env.ELEVENLABS_API_KEY = 'test-dummy-key';

// This loader mirrors the previous glob-based Mocha command so we keep full coverage.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_PATTERN = /\.test\.(js|ts)$/i;

const requireFromEsm = createRequire(import.meta.url);

async function importTests(dir) {
    for (const entry of readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
            // Skip the unit directory itself (this file's dir) and
            // system/browser dirs which have their own test runners
            const dirName = path.basename(fullPath);
            if (fullPath === __dirname || dirName === 'system' || dirName === 'browser') {
                continue;
            }
            await importTests(fullPath);
        } else if (TEST_PATTERN.test(entry)) {
            try {
                requireFromEsm(fullPath);
            } catch (error) {
                if (error && error.code === 'ERR_REQUIRE_ESM') {
                    await import(pathToFileURL(fullPath).href);
                } else {
                    throw error;
                }
            }
        }
    }
}

await importTests(rootDir);
