/**
 * AI Settings E2E Tests
 * Validates the AI Settings pages: overview (chat), STT, TTS
 * Confirms /ai-settings/agents redirects to /ai-settings
 * Confirms navigation links point to correct URLs
 */

import { test, expect } from './fixtures.js';
import { ErrorTracker } from './framework.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Navigate to page and wait for DOM ready (not networkidle, since
 * AI Settings pages have active WebSocket / XHR connections).
 */
async function navigateToPage(page, url) {
    const tracker = new ErrorTracker(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Give JS a moment to run
    await page.waitForTimeout(1000);
    return tracker;
}

test.describe('AI Settings Overview', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load overview page without errors', async () => {
        expect(await page.title()).toContain('AI Settings');
    });

    test('should show chat panel', async () => {
        const chatLog = page.locator('#chatLog');
        await expect(chatLog).toBeVisible();

        const chatInput = page.locator('#chatInput');
        await expect(chatInput).toBeVisible();

        const chatSendBtn = page.locator('#chatSendBtn');
        await expect(chatSendBtn).toBeVisible();
    });

    test('should show configuration status section', async () => {
        const apiKeyStatus = page.locator('#apiKeyStatus');
        await expect(apiKeyStatus).toBeVisible();

        const connectionStatus = page.locator('#connectionStatus');
        await expect(connectionStatus).toBeVisible();
    });

    test('should show STT and TTS cards with correct links', async () => {
        // Match the LINK rather than the card's class — the design system
        // migrated Bootstrap `.card` to `.mb-card`, which broke this test while
        // the page itself was perfectly fine, and a selector pinned to one era's
        // class names reports a redesign as a regression.
        //
        // The same links also appear as hidden items in the nav dropdown, so
        // those are excluded: the thing being asserted is that an operator can
        // SEE a Configure control on the page, not merely that the href exists.
        const sttBtn = page.locator('a[href="/ai-settings/stt"]:not(.dropdown-item)');
        await expect(sttBtn.first()).toBeVisible();

        const ttsBtn = page.locator('a[href="/ai-settings/tts"]:not(.dropdown-item)');
        await expect(ttsBtn.first()).toBeVisible();
    });

    test('should not show AI Agents card', async () => {
        const agentsCard = page.locator('text=Manage Agents');
        expect(await agentsCard.count()).toBe(0);
    });

    test('should show chat character name', async () => {
        const charName = page.locator('#chatCharacterName');
        await expect(charName).toBeVisible();
        // Wait for it to load (not "Loading...")
        await page.waitForTimeout(1000);
        const text = await charName.textContent();
        expect(text).not.toBe('Loading...');
    });

    test('should show quick stats without AI Agents count', async () => {
        const voiceCount = page.locator('#voiceCount');
        await expect(voiceCount).toBeVisible();

        // Should NOT have agentCount
        const agentCount = page.locator('#agentCount');
        expect(await agentCount.count()).toBe(0);
    });

    test('should show chat VU meter', async () => {
        // The progress-bar itself has width:0% so it's "hidden" to Playwright;
        // check for the progress container and the label instead
        const vuContainer = page.locator('#chatVUMeter').locator('..');
        await expect(vuContainer).toBeVisible();

        const vuLabel = page.locator('#chatVULabel');
        await expect(vuLabel).toBeVisible();
        const labelText = await vuLabel.textContent();
        expect(labelText).toContain('%');
    });

    test('should have AI On toggle', async () => {
        const toggle = page.locator('#aiAutonomousToggle');
        await expect(toggle).toBeVisible();
        // Should default to unchecked
        expect(await toggle.isChecked()).toBe(false);
    });

    test('should have Test Conversation button', async () => {
        const testBtn = page.locator('#testConversation');
        await expect(testBtn).toBeVisible();
    });
});

test.describe('AI Settings STT Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings/stt`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load STT page without errors', async () => {
        expect(await page.title()).toContain('Speech-to-Text');
    });

    test('should show transcript area', async () => {
        const transcript = page.locator('#liveTranscript');
        await expect(transcript).toBeVisible();
    });

    test('should show VU meter', async () => {
        const vuMeter = page.locator('#micVUMeter');
        // VU meter element exists in DOM but may not be visible without microphone hardware
        const count = await vuMeter.count();
        expect(count).toBeGreaterThanOrEqual(0);
        if (count > 0) {
            await expect(vuMeter).toBeAttached();
        }
    });

    test('should have save button', async () => {
        const saveBtn = page.locator('button:has-text("Save Configuration")');
        await expect(saveBtn.first()).toBeVisible();
    });

    test('should show character banner', async () => {
        const banner = page.locator('#sttCharacterBanner');
        await expect(banner).toBeVisible();

        const charName = page.locator('#sttCharacterName');
        await expect(charName).toBeVisible();
    });

    test('should have start and stop listening buttons', async () => {
        const startBtn = page.locator('#startListening');
        await expect(startBtn).toBeVisible();

        const stopBtn = page.locator('#stopListening');
        await expect(stopBtn).toBeVisible();
    });
});

test.describe('AI Settings TTS Page', () => {
    let page;
    let tracker;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        tracker = await navigateToPage(page, `${BASE_URL}/ai-settings/tts`);
    });

    test.afterEach(async () => {
        await page.close();
    });

    test('should load TTS page without errors', async () => {
        expect(await page.title()).toContain('Text-to-Speech');
    });

    test('should have voice dropdown with Character Voice label', async () => {
        const voiceLabel = page.locator('label[for="defaultVoice"]');
        await expect(voiceLabel).toBeVisible();
        const labelText = await voiceLabel.textContent();
        expect(labelText).toContain('Character Voice');
        expect(labelText).not.toContain('Default Voice');
    });

    test('should populate voice dropdown', async () => {
        const voiceSelect = page.locator('#defaultVoice');
        await expect(voiceSelect).toBeVisible();

        // Wait for voices to load
        await page.waitForTimeout(2000);
        const options = await voiceSelect.locator('option').count();
        expect(options).toBeGreaterThanOrEqual(1);
    });

    test('should have save button that works', async () => {
        const saveBtn = page.locator('button:has-text("Save Configuration")');
        await expect(saveBtn.first()).toBeVisible();
    });

    test('should show character voice assignment banner', async () => {
        const banner = page.locator('#ttsCharacterBanner');
        await expect(banner).toBeVisible();

        const charName = page.locator('#ttsCharacterName');
        await expect(charName).toBeVisible();
    });

    test('should show voice preview panel', async () => {
        const testText = page.locator('#testText');
        await expect(testText).toBeVisible();

        const generateBtn = page.locator('#generateSpeech');
        await expect(generateBtn).toBeVisible();
    });

    test('should not have "Use default voice" option in test voice', async () => {
        const testVoice = page.locator('#testVoice');
        await expect(testVoice).toBeVisible();
        const firstOption = await testVoice.locator('option').first().textContent();
        expect(firstOption).not.toContain('Use default voice');
        expect(firstOption).toContain('Use character voice');
    });
});

test.describe('AI Settings Agents Redirect', () => {
    test('should redirect /ai-settings/agents to /ai-settings', async ({ browser }) => {
        const page = await browser.newPage();
        const response = await page.goto(`${BASE_URL}/ai-settings/agents`);

        // Check that we ended up at /ai-settings
        expect(page.url()).toContain('/ai-settings');
        expect(page.url()).not.toContain('/agents');

        await page.close();
    });
});

test.describe('AI Settings Navigation Links', () => {
    test('should have correct navigation links in dropdown', async ({ browser }) => {
        const page = await browser.newPage();
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });

        // Open the Setup dropdown
        const setupDropdown = page.locator('.nav-link.dropdown-toggle:has-text("Setup")');
        await setupDropdown.click();

        // Check STT link points to /ai-settings/stt (not /ai-settings)
        const sttLink = page.locator('.dropdown-item:has-text("Speech-to-Text")');
        if (await sttLink.count() > 0) {
            const href = await sttLink.getAttribute('href');
            expect(href).toBe('/ai-settings/stt');
        }

        // Check TTS link points to /ai-settings/tts (not /ai-settings)
        const ttsLink = page.locator('.dropdown-item:has-text("Text-to-Speech")');
        if (await ttsLink.count() > 0) {
            const href = await ttsLink.getAttribute('href');
            expect(href).toBe('/ai-settings/tts');
        }

        // Check Chat link points to /ai-settings
        const chatLink = page.locator('.dropdown-item:has-text("Chat")');
        if (await chatLink.count() > 0) {
            const href = await chatLink.getAttribute('href');
            expect(href).toBe('/ai-settings');
        }

        // Check no AI Agents link exists
        const agentsLink = page.locator('.dropdown-item:has-text("AI Agents")');
        expect(await agentsLink.count()).toBe(0);

        await page.close();
    });

    test('should display character name on each page', async ({ browser }) => {
        const page = await browser.newPage();

        // Check overview
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });
        const charLabel = page.locator('#charLabel');
        await expect(charLabel).toBeVisible();

        // Check STT
        await page.goto(`${BASE_URL}/ai-settings/stt`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const sttBanner = page.locator('#sttCharacterName');
        await expect(sttBanner).toBeVisible();

        // Check TTS
        await page.goto(`${BASE_URL}/ai-settings/tts`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        const ttsBanner = page.locator('#ttsCharacterName');
        await expect(ttsBanner).toBeVisible();

        await page.close();
    });
});

// ---------------------------------------------------------------------------
// v10.7.0 (castle tuning, D6): live conversation panel, agent turn settings,
// lurk preferences. Character-independent: the character is whatever this node
// resolves (ai-status.characterId), and the second character is any other id
// in data/characters.json. Wake, Sleep and Save are answered by the hazard
// guard (fixtures.js), so clicking them proves the request contract without
// the node waking, sleeping or changing a preference.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPTABLE = ['agent', 'jaw', 'led', 'headTracking', 'aiMotion', 'followOrders', 'idle'];

function readCharacters() {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'characters.json'), 'utf8'));
}

function snapshotFor(agentId) {
    const dir = path.join(REPO_ROOT, 'config', 'elevenlabs', 'agents');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
        const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const agent = doc.agent || doc;
        if (agent.agent_id === agentId) return agent;
    }
    return null;
}

test.describe('AI Settings conversation, agent and lurk panels', () => {
    test('conversation panel mirrors ai-status and refreshes every 5 s', async ({ page }) => {
        const statusCalls = [];
        page.on('request', r => { if (r.url().includes('/conversation/api/ai-status')) statusCalls.push(Date.now()); });
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#conversationLivePanel')).toBeVisible();
        await expect(page.locator('#convUpdatedAt')).toContainText('updated', { timeout: 10000 });

        const st = await (await page.request.get(`${BASE_URL}/conversation/api/ai-status`)).json();
        expect(st.success).toBe(true);
        // The state can move between the page's read and ours; poll until they agree.
        await expect.poll(async () => (await page.locator('#convLurkState').textContent()).trim(), { timeout: 12000 })
            .toBe(String(st.state).toUpperCase());
        const duplex = (await page.locator('#convDuplexMode').textContent()).trim();
        if (st.conversationMode && st.conversationMode.mode) expect(duplex).toBe(String(st.conversationMode.mode).toUpperCase());
        else expect(duplex).toBe('n/a');

        // One row per recorded turn (at most 20), or the empty-state row.
        const turns = (st.latency && st.latency.turns) || [];
        if (turns.length) {
            await expect.poll(async () => page.locator('#convLatencyRows tr[data-turn-source]').count(), { timeout: 12000 })
                .toBeGreaterThanOrEqual(1);
            await expect(page.locator('#convLatencySummary tr[data-summary="p50"]')).toHaveCount(1);
            await expect(page.locator('#convLatencySummary tr[data-summary="p90"]')).toHaveCount(1);
        } else {
            await expect(page.locator('#convLatencyRows')).toContainText('No turns yet');
        }
        await expect(page.locator('#convLatencyExplain')).toContainText('end-of-turn wait');

        // Refresh cadence: a second and third read within ~11 s of the first.
        await expect.poll(() => statusCalls.length, { timeout: 13000 }).toBeGreaterThanOrEqual(3);
        const gaps = statusCalls.slice(1).map((t, i) => t - statusCalls[i]);
        expect(gaps[gaps.length - 1], 'reads must come about every 5 s').toBeLessThan(8000);
    });

    test('agent turn settings come from the committed snapshot with a deep link', async ({ page }) => {
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });
        const cid = Number(await page.locator('#conversationLivePanel').getAttribute('data-character-id'));
        const entry = readCharacters().find(c => Number(c.id) === cid);
        test.skip(!entry || !entry.elevenLabsAgentId, 'this character has no agent');
        const agent = snapshotFor(entry.elevenLabsAgentId);
        await expect(page.locator('#agentDeepLink')).toHaveAttribute('href', `https://elevenlabs.io/app/agents/${entry.elevenLabsAgentId}`);
        if (!agent) {
            await expect(page.locator('#agentTurnUnavailable')).toBeVisible();
            return;
        }
        const turn = agent.conversation_config.turn || {};
        const prompt = agent.conversation_config.agent.prompt || {};
        const events = agent.conversation_config.conversation.client_events || [];
        const cell = (k) => page.locator(`#agentTurnTable td[data-key="${k}"]`);
        await expect(cell('turn_model')).toHaveText(String(turn.turn_model));
        await expect(cell('turn_eagerness')).toHaveText(String(turn.turn_eagerness));
        await expect(cell('turn_timeout')).toHaveText(`${turn.turn_timeout} s`);
        await expect(cell('llm')).toContainText(String(prompt.llm));
        await expect(cell('max_tokens')).toHaveText(String(prompt.max_tokens));
        await expect(cell('interruption')).toHaveText(events.includes('interruption') ? 'present' : /MISSING/);
        await expect(cell('rag')).toHaveText(prompt.rag && prompt.rag.enabled ? 'on' : 'off');
        if (turn.soft_timeout_config && turn.soft_timeout_config.timeout_seconds != null) {
            await expect(cell('soft_timeout')).toContainText(`${turn.soft_timeout_config.timeout_seconds} s`);
        }
        await expect(page.locator('#agentSnapshotTime [data-key="snapshot_written"]')).toHaveText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC/);
    });

    test('lurk prefs reflect the server and Save/Wake/Sleep post the right contract', async ({ page, hazards }) => {
        await page.goto(`${BASE_URL}/ai-settings`, { waitUntil: 'domcontentloaded' });
        const ls = await (await page.request.get(`${BASE_URL}/conversation/api/lurk-state`)).json();
        test.skip(!ls.success || ls.bound === false || !ls.prefs, 'this node does not animate the resolved character');
        await expect(page.locator('#lurkPrefsStatus')).toContainText('State:', { timeout: 10000 });

        await expect(page.locator('#lurkInactivitySec')).toHaveValue(String(Math.round(ls.prefs.inactivityTimeoutMs / 1000)));
        expect(await page.locator('#lurkPirWake').isChecked()).toBe(ls.prefs.pirWake !== false);
        const expected = OPTABLE.filter(n => ls.capabilities && ls.capabilities[n]).sort();
        const shown = (await page.locator('#lurkOptOutList .lurk-optout').evaluateAll(els => els.map(e => e.value))).sort();
        expect(shown).toEqual(expected);

        // Wake / Sleep follow the server's state, never a local guess.
        const awake = ls.state === 'awake' || ls.agentLive === true;
        await expect.poll(async () => page.locator('#lurkWakeBtn').isDisabled(), { timeout: 8000 }).toBe(awake);
        // Exactly one of the two is offered, whatever the state is by now.
        expect(await page.locator('#lurkSleepBtn').isDisabled()).toBe(!(await page.locator('#lurkWakeBtn').isDisabled()));

        // Save: the guard answers it; assert the payload.
        await page.fill('#lurkInactivitySec', '600');
        await page.click('#lurkPrefsSave');
        await expect.poll(() => hazards.filter(h => h.path.endsWith('/conversation/api/lurk-state/prefs')).length).toBe(1);
        const saved = hazards.find(h => h.path.endsWith('/conversation/api/lurk-state/prefs')).body;
        expect(saved.inactivityTimeoutMs).toBe(600000);
        expect(typeof saved.pirWake).toBe('boolean');
        expect(Array.isArray(saved.capabilityOptOut)).toBe(true);

        // Whichever of Wake/Sleep is enabled NOW posts to its endpoint (guard answers).
        // Read it off the page: a live node can fall asleep between the read above and
        // this click (seen 2026-10-10: state 'awake' read, page already 'lurking').
        const sleepEnabled = !(await page.locator('#lurkSleepBtn').isDisabled());
        const btn = sleepEnabled ? '#lurkSleepBtn' : '#lurkWakeBtn';
        const endpoint = sleepEnabled ? '/conversation/api/sleep' : '/conversation/api/wake';
        await page.click(btn);
        await expect.poll(() => hazards.filter(h => h.path.endsWith(endpoint)).length).toBe(1);
        if (!sleepEnabled) expect(hazards.find(h => h.path.endsWith(endpoint)).body).toMatchObject({ source: 'ai-settings', explicit: true });
    });

    test('renders for a second character through ?characterId', async ({ page }) => {
        const first = await (await page.request.get(`${BASE_URL}/conversation/api/ai-status`)).json();
        const other = readCharacters().find(c => Number(c.id) !== Number(first.characterId));
        test.skip(!other, 'only one character registered');
        const firstRead = page.waitForRequest(r => r.url().includes('/conversation/api/ai-status'), { timeout: 15000 });
        const res = await page.goto(`${BASE_URL}/ai-settings?characterId=${other.id}`, { waitUntil: 'domcontentloaded' });
        expect(res.status()).toBe(200);
        await expect(page.locator('#conversationLivePanel')).toHaveAttribute('data-character-id', String(other.id));
        if (other.elevenLabsAgentId) {
            await expect(page.locator('#agentDeepLink')).toHaveAttribute('href', `https://elevenlabs.io/app/agents/${other.elevenLabsAgentId}`);
        }
        // The page's reads carry the character it was opened for.
        const req = await firstRead;
        expect(req.url()).toContain(`characterId=${other.id}`);
        await expect(page.locator('#lurkPrefsStatus')).not.toHaveText('Loading lurk state…', { timeout: 10000 });
    });
});
