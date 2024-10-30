require('./setupTests');
const fs = require('fs').promises;
const path = require('path');

describe('Character Routes', () => {
    let createdCharacterId;
    let originalCharactersData;
    let originalPartsData;
    
    before(async function() {
        try {
            // Backup current data
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            const partsPath = path.join(__dirname, '..', 'data', 'parts.json');
            originalCharactersData = await fs.readFile(charactersPath, 'utf8');
            originalPartsData = await fs.readFile(partsPath, 'utf8');
        } catch (error) {
            this.skip();
        }
    });

    after(async function() {
        // Restore original data
        if (originalCharactersData) {
            const charactersPath = path.join(__dirname, '..', 'data', 'characters.json');
            await fs.writeFile(charactersPath, originalCharactersData);
        }
        if (originalPartsData) {
            const partsPath = path.join(__dirname, '..', 'data', 'parts.json');
            await fs.writeFile(partsPath, originalPartsData);
        }
    });

    it('should create a new character', async () => {
        const res = await chai.request(app)
            .post('/characters')
            .field('char_name', 'Test Character CRUD')
            .field('char_description', 'A test character for CRUD operations');

        res.should.have.status(200);
        
        // Get the created character ID from the characters.json file
        const charactersData = await fs.readFile(path.join(__dirname, '..', 'data', 'characters.json'), 'utf8');
        const characters = JSON.parse(charactersData);
        const createdCharacter = characters.find(c => c.char_name === 'Test Character CRUD');
        expect(createdCharacter).to.exist;
        createdCharacterId = createdCharacter.id;
    });

    it('should get all characters including the created one', async () => {
        const res = await chai.request(app)
            .get('/characters');
        
        res.should.have.status(200);
        res.text.should.include('Test Character CRUD');
    });

    it('should update the character', async () => {
        const res = await chai.request(app)
            .post(`/characters/${createdCharacterId}`)
            .field('char_name', 'Updated Test Character CRUD')
            .field('char_description', 'An updated test character');

        res.should.have.status(200);
        
        // Verify the update
        const charactersData = await fs.readFile(path.join(__dirname, '..', 'data', 'characters.json'), 'utf8');
        const characters = JSON.parse(charactersData);
        const updatedCharacter = characters.find(c => c.id === createdCharacterId);
        expect(updatedCharacter.char_name).to.equal('Updated Test Character CRUD');
    });

    it('should assign a part to the character', async () => {
        // First create a test part using the specific part type endpoint
        const partRes = await chai.request(app)
            .post('/parts/servo')
            .send({
                name: 'Test Part for Character',
                pin: 18,
                servoType: 'Standard',
                minPulse: 500,
                maxPulse: 2500,
                defaultAngle: 90,
                characterId: createdCharacterId
            });

        partRes.should.have.status(200);

        // Get the created part ID
        const partsData = await fs.readFile(path.join(__dirname, '..', 'data', 'parts.json'), 'utf8');
        const parts = JSON.parse(partsData);
        const testPart = parts.find(p => p.name === 'Test Part for Character');
        expect(testPart).to.exist;
        expect(testPart.characterId).to.equal(createdCharacterId);

        // Verify the part is assigned to the character
        const res = await chai.request(app)
            .get(`/characters/${createdCharacterId}/parts`);

        res.should.have.status(200);
        res.body.should.be.an('array');
        const assignedPart = res.body.find(p => p.id === testPart.id);
        expect(assignedPart).to.exist;
    });

    it('should delete the character', async () => {
        const res = await chai.request(app)
            .post(`/characters/${createdCharacterId}/delete`);

        res.should.have.status(200);
        
        // Verify the deletion
        const charactersData = await fs.readFile(path.join(__dirname, '..', 'data', 'characters.json'), 'utf8');
        const characters = JSON.parse(charactersData);
        const deletedCharacter = characters.find(c => c.id === createdCharacterId);
        expect(deletedCharacter).to.be.undefined;

        // Verify that parts are unassigned
        const partsData = await fs.readFile(path.join(__dirname, '..', 'data', 'parts.json'), 'utf8');
        const parts = JSON.parse(partsData);
        const partWithDeletedCharacter = parts.find(p => p.characterId === createdCharacterId);
        expect(partWithDeletedCharacter).to.be.undefined;
    });
});
