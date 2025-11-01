import axios from 'axios';
import { expect } from 'chai';
import { spawn } from 'child_process';
import request from 'supertest';

const BASE_URL = 'http://127.0.0.1:3100';
let child = null;

async function waitForServer(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await axios.get(BASE_URL);
            if (res && res.status >= 200 && res.status < 500) return true;
        } catch (_) { /* not up */ }
        await new Promise(r => setTimeout(r, 200));
    }
    return false;
}

describe('Ask AI Endpoint Tests', function () {
    this.timeout(40000);

    before(async () => {
        const up = await waitForServer(1000);
        if (up) return; // already running externally
        // Start server with test mode to avoid external API calls in CI
        const env = { ...process.env, MB_TEST_MODE: '1' };
        child = spawn('node', ['server.js'], { cwd: process.cwd(), stdio: 'inherit', env });
        const ok = await waitForServer(15000);
        if (!ok) throw new Error('Server did not start in time');
    });

    after(async () => {
        if (process.env.KILL_SERVER_AFTER_TESTS === '1' && child) {
            process.once('exit', () => {
                try { child.kill('SIGTERM'); } catch (_) { }
            });
        }
    });

    describe('POST /conversation/api/ask-ai', () => {
        it('should reject requests without a question', async () => {
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({});

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('success', false);
            expect(res.body).to.have.property('error');
            expect(res.body.error).to.include('question');
        });

        it('should reject requests with empty question', async () => {
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({ question: '   ' });

            expect(res.status).to.equal(400);
            expect(res.body).to.have.property('success', false);
            expect(res.body.error).to.include('question');
        });

        it('should return valid response', async () => {
            this.timeout(35000); // Allow time for real AI if configured

            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({ question: 'Hello, who are you?' });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('response');
            expect(res.body.response).to.be.a('string');
            expect(res.body.response.length).to.be.greaterThan(0);

            console.log('  📝 Response:', res.body.response.substring(0, 100) + '...');
        });

        it('should accept optional speakerPartId parameter', async () => {
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({
                    question: 'Test question',
                    speakerPartId: 123
                });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
        });

        it('should handle questions with special characters', async () => {
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({ question: 'What\'s your name? Tell me more!' });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
        });

        it('should handle long questions', async function() {
            this.timeout(60000); // 60 seconds
            const longQuestion = 'Can you tell me about yourself? '.repeat(20);
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({ question: longQuestion });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
        });

        it('should validate Content-Type header', async () => {
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send('not json')
                .set('Content-Type', 'text/plain');

            // Should either reject or parse as empty object leading to 400
            expect([400, 415]).to.include(res.status);
        });
    });

    describe('Ask AI Integration (with real AI if configured)', () => {
        // These tests run only if ElevenLabs is configured
        // They will be skipped in test mode

        it('should connect to AI agent when ElevenLabs is configured', async function () {
            // Skip if in test mode
            if (process.env.MB_TEST_MODE === '1') {
                this.skip();
                return;
            }

            this.timeout(35000);
            const res = await request(BASE_URL)
                .post('/conversation/api/ask-ai')
                .send({ question: 'Hello!' });

            if (res.body.error && res.body.error.includes('not configured')) {
                this.skip();
                return;
            }

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('success', true);
            expect(res.body).to.have.property('response');
            expect(res.body.response).to.be.a('string');
            expect(res.body.response.length).to.be.greaterThan(0);
        });
    });
});
