require('./setupTests');
const fs = require('fs').promises;
const path = require('path');
const characterService = require('../services/characterService');

describe('Voice Routes', () => {
    let testCharacterId;
    let createdSoundId;
    let originalVoicesData;
    let originalSoundsData;
    const testSpeakerId = 'b80ebe00-4738-4766-85b7-35c3096acb79';
    
    before(async function() {
        try {
            // Backup current data
            const voicesPath = path.join(__dirname, '..', 'data', 'voices.json');
            const soundsPath = path.join(__dirname, '..', 'data', 'sounds.json');
            originalVoicesData = await fs.readFile(voicesPath, 'utf8');
            originalSoundsData = await fs.readFile(soundsPath, 'utf8');

            // Create a test character directly using the service
            const character = await characterService.createCharacter({
                char_name: 'Voice Test Character',
                char_description: 'Test character for voice CRUD operations',
                parts: [],
                sounds: [],
                image: null
            });
            
            testCharacterId = character.id;

            // Initialize voices.json with test data
            const initialVoices = {
                voices: [{
                    characterId: testCharacterId,
                    speaker_id: testSpeakerId,
                    settings: {
                        pitch: -10,
                        speed: 1,
                        volume: 0,
                        sampleRate: 44100,
                        bitRate: 128,
                        outputFormat: 'wav',
                        languageCode: 'en'
                    },
                    metadata: {
                        lastUsed: null,
                        useCount: 0,
                        favorited: false,
                        tags: [],
                        notes: '',
                        created: new Date().toISOString(),
                        lastModified: new Date().toISOString()
                    },
                    history: [{
                        timestamp: new Date().toISOString(),
                        type: 'created',
                        settings: {
                            pitch: -10,
                            speed: 1,
                            volume: 0,
                            sampleRate: 44100,
                            bitRate: 128,
                            outputFormat: 'wav',
                            languageCode: 'en'
                        }
                    }]
                }]
            };

            await fs.writeFile(voicesPath, JSON.stringify(initialVoices, null, 2));

        } catch (error) {
            console.error('Setup error:', error);
            throw error;
        }
    });

    after(async function() {
        try {
            // Restore original data
            if (originalVoicesData) {
                const voicesPath = path.join(__dirname, '..', 'data', 'voices.json');
                await fs.writeFile(voicesPath, originalVoicesData);
            }
            if (originalSoundsData) {
                const soundsPath = path.join(__dirname, '..', 'data', 'sounds.json');
                await fs.writeFile(soundsPath, originalSoundsData);
            }

            // Delete test character if created
            if (testCharacterId) {
                await characterService.deleteCharacter(testCharacterId);
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    });

    it('should save voice settings for a character', async () => {
        const voiceSettings = {
            characterId: testCharacterId,
            voiceId: testSpeakerId,
            settings: {
                pitch: -10,
                speed: 1,
                volume: 0,
                sampleRate: 44100,
                bitRate: 128,
                outputFormat: 'wav',
                languageCode: 'en'
            }
        };

        const res = await chai.request(app)
            .post('/api/voice/settings')
            .send(voiceSettings);

        res.should.have.status(200);
        res.body.should.have.property('speaker_id').equal(testSpeakerId);
    });

    it('should get voice settings for a character', async () => {
        const res = await chai.request(app)
            .get(`/api/voice/settings/${testCharacterId}`);

        res.should.have.status(200);
        res.body.should.have.property('speaker_id').equal(testSpeakerId);
        res.body.should.have.property('settings');
        res.body.settings.should.have.property('pitch').equal(-10);
        res.body.settings.should.have.property('speed').equal(1);
    });

    it('should generate speech for testing', async function() {
        // Increase timeout for voice generation
        this.timeout(10000);

        const testText = 'This is a test voice generation';
        
        const res = await chai.request(app)
            .post('/api/voice/generate')
            .send({
                text: testText,
                speaker_id: testSpeakerId,
                characterId: testCharacterId
            });

        res.should.have.status(200);
        res.body.should.have.property('success').equal(true);
        res.body.should.have.property('filename');
        res.body.should.have.property('path');
        res.body.should.have.property('url');
    });

    it('should save generated voice to sounds library', async function() {
        // Increase timeout for voice generation and saving
        this.timeout(10000);

        const testText = 'Test voice for sounds library';
        
        // First generate the voice
        const generateRes = await chai.request(app)
            .post('/api/voice/generate')
            .send({
                text: testText,
                speaker_id: testSpeakerId,
                characterId: testCharacterId
            });

        generateRes.should.have.status(200);
        generateRes.body.should.have.property('url');
        
        // Then save it to sounds library
        const saveRes = await chai.request(app)
            .post('/api/voice/save-to-sounds')
            .send({
                audioUrl: `/sounds/${path.basename(generateRes.body.path)}`,
                text: testText,
                characterId: testCharacterId
            });

        saveRes.should.have.status(200);
        saveRes.body.should.have.property('id');
        
        createdSoundId = saveRes.body.id;
    });

    it('should update voice metadata', async () => {
        const metadata = {
            lastUsed: new Date().toISOString(),
            usageCount: 1
        };

        const res = await chai.request(app)
            .patch(`/api/voice/metadata/${testCharacterId}`)
            .send({ metadata });

        res.should.have.status(200);
        res.body.should.have.property('metadata');
        res.body.metadata.should.have.property('usageCount').equal(1);
    });

    it('should get voice history', async () => {
        const res = await chai.request(app)
            .get(`/api/voice/history/${testCharacterId}`);

        res.should.have.status(200);
        res.body.should.be.an('array');
        res.body.length.should.be.above(0);
    });

    it('should delete voice history', async () => {
        const res = await chai.request(app)
            .delete(`/api/voice/history/${testCharacterId}`);

        res.should.have.status(200);
        res.body.should.have.property('success').equal(true);
    });

    it('should delete the generated sound', async () => {
        if (createdSoundId) {
            const res = await chai.request(app)
                .post(`/sounds/${createdSoundId}/delete`);

            res.should.have.status(200);
            res.body.should.have.property('message').equal('Sound deleted successfully');
        }
    });
});
