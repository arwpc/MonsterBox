const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

describe('Sound Routes', () => {
    let createdSoundId;
    const testSoundPath = path.join(__dirname, '..', 'public', 'sounds', 'test-sound.mp3');
    let originalSoundsData;
    
    before(async function() {
        // Ensure test sound file exists
        try {
            await fs.access(testSoundPath);
            // Backup current sounds data
            const soundsPath = path.join(__dirname, '..', 'data', 'sounds.json');
            originalSoundsData = await fs.readFile(soundsPath, 'utf8');
        } catch (error) {
            this.skip();
        }
    });

    after(async function() {
        // Restore original sounds data
        if (originalSoundsData) {
            const soundsPath = path.join(__dirname, '..', 'data', 'sounds.json');
            await fs.writeFile(soundsPath, originalSoundsData);
        }
    });

    it('should create a new sound', async () => {
        const res = await chai.request(app)
            .post('/sounds')
            .attach('sound_files', testSoundPath)
            .field('name', 'Test Sound CRUD');

        res.should.have.status(200);
        
        // Get the created sound ID from the sounds.json file
        const soundsData = await fs.readFile(path.join(__dirname, '..', 'data', 'sounds.json'), 'utf8');
        const sounds = JSON.parse(soundsData);
        const createdSound = sounds.find(s => s.name === 'Test Sound CRUD');
        expect(createdSound).to.exist;
        createdSoundId = createdSound.id;
    });

    it('should get all sounds including the created one', async () => {
        const res = await chai.request(app)
            .get('/sounds');
        
        res.should.have.status(200);
        res.text.should.include('Test Sound CRUD');
    });

    it('should update the sound', async () => {
        const res = await chai.request(app)
            .post(`/sounds/${createdSoundId}`)
            .field('name', 'Updated Test Sound CRUD')
            .field('file_option', 'keep');

        res.should.have.status(200);
        
        // Verify the update
        const soundsData = await fs.readFile(path.join(__dirname, '..', 'data', 'sounds.json'), 'utf8');
        const sounds = JSON.parse(soundsData);
        const updatedSound = sounds.find(s => s.id === createdSoundId);
        expect(updatedSound.name).to.equal('Updated Test Sound CRUD');
    });

    it('should delete the sound', async () => {
        const res = await chai.request(app)
            .post(`/sounds/${createdSoundId}/delete`);

        res.should.have.status(200);
        res.body.should.have.property('message').equal('Sound deleted successfully');
        
        // Verify the deletion
        const soundsData = await fs.readFile(path.join(__dirname, '..', 'data', 'sounds.json'), 'utf8');
        const sounds = JSON.parse(soundsData);
        const deletedSound = sounds.find(s => s.id === createdSoundId);
        expect(deletedSound).to.be.undefined;
    });
});
