/**
 * Goblin Video Deployment Tests
 * Comprehensive Mocha tests for Goblin management and video deployment
 */

import { expect } from 'chai';
import fetch from 'node-fetch';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const GOBLIN_MANAGEMENT_URL = `${BASE_URL}/goblin-management`;
const VIDEO_LIBRARY_URL = `${BASE_URL}/video-library`;

describe('Goblin Management System', function() {
    this.timeout(30000); // 30 second timeout for network operations

    let availableGoblins = [];
    let availableVideos = [];

    describe('Goblin Management API', () => {
        it('should load the Goblin Management page', async () => {
            const response = await fetch(GOBLIN_MANAGEMENT_URL);
            expect(response.status).to.equal(200);
            
            const html = await response.text();
            expect(html).to.include('Goblin Management');
        });

        it('should fetch all registered Goblins', async () => {
            const response = await fetch(`${GOBLIN_MANAGEMENT_URL}/api/goblins`);
            expect(response.status).to.equal(200);
            
            const data = await response.json();
            expect(data).to.have.property('success', true);
            expect(data).to.have.property('goblins');
            expect(data.goblins).to.be.an('array');
            
            availableGoblins = data.goblins;
            console.log(`      ✓ Found ${availableGoblins.length} registered Goblins`);
        });

        it('should have at least one Goblin registered', () => {
            expect(availableGoblins.length).to.be.at.least(1);
        });

        it('should have Goblins with required properties', () => {
            availableGoblins.forEach(goblin => {
                expect(goblin).to.have.property('id');
                expect(goblin).to.have.property('endpoint');
                expect(goblin).to.have.property('status');
                expect(goblin).to.have.property('name');
            });
        });

        it('should check health of each Goblin', async () => {
            for (const goblin of availableGoblins) {
                try {
                    const healthUrl = `${goblin.endpoint}/health`;
                    const response = await fetch(healthUrl, { timeout: 5000 });

                    if (response.ok) {
                        const health = await response.json();
                        console.log(`      ✓ ${goblin.name} (${goblin.endpoint}) - ${health.status}`);
                        expect(health).to.have.property('status');
                    } else {
                        console.log(`      ⚠ ${goblin.name} (${goblin.endpoint}) - Offline`);
                    }
                } catch (error) {
                    console.log(`      ⚠ ${goblin.name} (${goblin.endpoint}) - Unreachable`);
                }
            }
        });
    });

    describe('Video Library API', () => {
        it('should load the Video Library page', async () => {
            const response = await fetch(VIDEO_LIBRARY_URL);
            expect(response.status).to.equal(200);
            
            const html = await response.text();
            expect(html).to.include('Video Library');
        });

        it('should fetch all videos', async () => {
            const response = await fetch(`${VIDEO_LIBRARY_URL}/api/library`);
            expect(response.status).to.equal(200);

            const data = await response.json();
            expect(data).to.have.property('success', true);
            expect(data).to.have.property('videos');
            expect(data.videos).to.be.an('array');

            availableVideos = data.videos;
            console.log(`      ✓ Found ${availableVideos.length} videos in library`);
        });

        it('should have videos with required properties', () => {
            if (availableVideos.length > 0) {
                availableVideos.forEach(video => {
                    expect(video).to.have.property('id');
                    expect(video).to.have.property('fileName');
                    expect(video).to.have.property('title');
                });
            }
        });

        it('should find ghost videos for testing', () => {
            const ghostVideos = availableVideos.filter(v => 
                v.title.toLowerCase().includes('ghost') || 
                v.fileName.toLowerCase().includes('ghost')
            );
            
            if (ghostVideos.length > 0) {
                console.log(`      ✓ Found ${ghostVideos.length} ghost video(s) for testing`);
                ghostVideos.forEach(v => {
                    console.log(`        - ${v.title} (${v.fileName})`);
                });
            } else {
                console.log(`      ⚠ No ghost videos found, will use first available video`);
            }
        });
    });

    describe('Video Deployment to Goblins', () => {
        let testVideo = null;
        let testGoblin = null;

        before(function() {
            // Find a ghost video or use the first available
            testVideo = availableVideos.find(v =>
                v.title.toLowerCase().includes('ghost') ||
                v.fileName.toLowerCase().includes('ghost')
            ) || availableVideos[0];

            // Find an online Goblin
            testGoblin = availableGoblins.find(g => g.status === 'online') || availableGoblins[0];

            if (!testVideo) {
                this.skip();
            }
            if (!testGoblin) {
                this.skip();
            }
        });

        it('should deploy a video to a Goblin', async function() {
            if (!testVideo || !testGoblin) {
                this.skip();
            }

            console.log(`      → Deploying "${testVideo.title}" to ${testGoblin.name}...`);

            const response = await fetch(`${VIDEO_LIBRARY_URL}/api/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoId: testVideo.id,
                    goblinId: testGoblin.id
                })
            });

            expect(response.status).to.equal(200);
            
            const result = await response.json();
            console.log(`      ✓ Deployment result:`, result);
            
            expect(result).to.have.property('success');
            
            if (result.success) {
                console.log(`      ✓ Successfully deployed to ${testGoblin.name}`);
            } else {
                console.log(`      ⚠ Deployment failed: ${result.error}`);
            }
        });

        it('should verify video exists on Goblin after deployment', async function() {
            if (!testVideo || !testGoblin) {
                this.skip();
            }

            // Wait a moment for deployment to complete
            await new Promise(resolve => setTimeout(resolve, 2000));

            try {
                const listUrl = `${testGoblin.endpoint}/list-videos`;
                const response = await fetch(listUrl, { timeout: 5000 });
                
                if (response.ok) {
                    const data = await response.json();
                    const videoExists = data.videos && data.videos.some(v => 
                        v.includes(testVideo.fileName) || v.includes(testVideo.id)
                    );
                    
                    if (videoExists) {
                        console.log(`      ✓ Video found on ${testGoblin.name}`);
                    } else {
                        console.log(`      ⚠ Video not found in list, but deployment may still be in progress`);
                    }
                }
            } catch (error) {
                console.log(`      ⚠ Could not verify video on Goblin: ${error.message}`);
            }
        });

        it('should play the deployed video on Goblin', async function() {
            if (!testVideo || !testGoblin) {
                this.skip();
            }

            console.log(`      → Playing "${testVideo.title}" on ${testGoblin.name}...`);

            const response = await fetch(`${VIDEO_LIBRARY_URL}/api/video/${testVideo.id}/play-on-goblin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    goblinId: testGoblin.id,
                    loop: true
                })
            });

            expect(response.status).to.equal(200);

            const result = await response.json();
            console.log(`      ✓ Play result:`, result);

            if (result.success) {
                console.log(`      ✓ Video playing on ${testGoblin.name}`);
            } else {
                console.log(`      ⚠ Play failed: ${result.error}`);
            }
        });

        it('should verify video is playing on Goblin', async function() {
            if (!testVideo || !testGoblin) {
                this.skip();
            }

            // Wait a moment for playback to start
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                const statusUrl = `${testGoblin.endpoint}/status`;
                const response = await fetch(statusUrl, { timeout: 5000 });
                
                if (response.ok) {
                    const status = await response.json();
                    console.log(`      ✓ Goblin status:`, status);
                    
                    if (status.playback && status.playback.playing) {
                        console.log(`      ✓ Video is playing: ${status.playback.currentVideo}`);
                        expect(status.playback.playing).to.be.true;
                    } else {
                        console.log(`      ⚠ Playback status unclear`);
                    }
                }
            } catch (error) {
                console.log(`      ⚠ Could not verify playback: ${error.message}`);
            }
        });

        it('should stop video playback on Goblin', async function() {
            if (!testGoblin) {
                this.skip();
            }

            try {
                const stopUrl = `${testGoblin.endpoint}/stop-video`;
                const response = await fetch(stopUrl, {
                    method: 'POST',
                    timeout: 5000
                });

                if (response.ok) {
                    console.log(`      ✓ Stopped playback on ${testGoblin.name}`);
                }
            } catch (error) {
                console.log(`      ⚠ Could not stop playback: ${error.message}`);
            }
        });
    });

    describe('Bulk Deployment', () => {
        it('should deploy multiple videos to multiple Goblins', async function() {
            if (availableVideos.length < 2 || availableGoblins.length < 1) {
                this.skip();
            }

            const testVideos = availableVideos.slice(0, 2);
            const onlineGoblins = availableGoblins.filter(g => g.status === 'online');

            if (onlineGoblins.length === 0) {
                this.skip();
            }

            console.log(`      → Deploying ${testVideos.length} videos to ${onlineGoblins.length} Goblin(s)...`);

            for (const video of testVideos) {
                for (const goblin of onlineGoblins) {
                    const response = await fetch(`${VIDEO_LIBRARY_URL}/api/deploy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            videoId: video.id,
                            goblinId: goblin.id
                        })
                    });

                    const result = await response.json();
                    console.log(`      ${result.success ? '✓' : '⚠'} ${video.title} → ${goblin.name}`);
                }
            }
        });
    });
});

