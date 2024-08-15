const express = require('express');
const dataManager = require('./dataManager');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const app = express();
const port = 3000;

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === "sound_file") {
            cb(null, 'public/sounds/');
        } else if (file.fieldname === "character_image") {
            cb(null, 'public/images/characters/');
        }
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Main menu route
app.get('/', (req, res) => {
    res.render('index', { title: 'MonsterBox Control Panel' });
});

// Characters routes
app.get('/characters', async (req, res) => {
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    res.render('characters', { title: 'Characters', characters, parts, sounds });
});

app.get('/characters/new', async (req, res) => {
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    res.render('character-form', { title: 'Add New Character', action: '/characters', character: {}, parts, sounds });
});

app.get('/characters/:id/edit', async (req, res) => {
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    const character = characters.find(c => c.id === parseInt(req.params.id));
    if (character) {
        res.render('character-form', { title: 'Edit Character', action: '/characters/' + character.id, character, parts, sounds });
    } else {
        res.status(404).send('Character not found');
    }
});

app.post('/characters', upload.single('character_image'), async (req, res) => {
    const characters = await dataManager.getCharacters();
    const newCharacter = {
        id: dataManager.getNextId(characters),
        char_name: req.body.char_name,
        char_description: req.body.char_description,
        parts: Array.isArray(req.body.parts) ? req.body.parts.map(Number) : [],
        sounds: Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : [],
        image: req.file ? req.file.filename : null
    };
    characters.push(newCharacter);
    await dataManager.saveCharacters(characters);
    res.redirect('/characters');
});

app.post('/characters/:id', upload.single('character_image'), async (req, res) => {
    const id = parseInt(req.params.id);
    const characters = await dataManager.getCharacters();
    const index = characters.findIndex(c => c.id === id);
    if (index !== -1) {
        const oldImage = characters[index].image;
        characters[index] = {
            id: id,
            char_name: req.body.char_name,
            char_description: req.body.char_description,
            parts: Array.isArray(req.body.parts) ? req.body.parts.map(Number) : [],
            sounds: Array.isArray(req.body.sounds) ? req.body.sounds.map(Number) : [],
            image: req.file ? req.file.filename : oldImage
        };
        if (req.file && oldImage) {
            try {
                await fs.unlink(path.join('public', 'images', 'characters', oldImage));
            } catch (error) {
                console.error('Error deleting old image:', error);
            }
        }
        await dataManager.saveCharacters(characters);
        res.redirect('/characters');
    } else {
        res.status(404).send('Character not found');
    }
});

// Scenes routes
app.get('/scenes', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const characters = await dataManager.getCharacters();
    res.render('scenes', { title: 'Scenes', scenes, characters });
});

app.get('/scenes/new', async (req, res) => {
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    res.render('scene-form', { title: 'Add New Scene', action: '/scenes', scene: {}, characters, parts, sounds });
});

app.get('/scenes/:id/edit', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const characters = await dataManager.getCharacters();
    const parts = await dataManager.getParts();
    const sounds = await dataManager.getSounds();
    const scene = scenes.find(s => s.id === parseInt(req.params.id));
    if (scene) {
        res.render('scene-form', { title: 'Edit Scene', action: '/scenes/' + scene.id, scene, characters, parts, sounds });
    } else {
        res.status(404).send('Scene not found');
    }
});

app.post('/scenes', async (req, res) => {
    const scenes = await dataManager.getScenes();
    const newScene = {
        id: dataManager.getNextId(scenes),
        scene_name: req.body.scene_name,
        character_id: parseInt(req.body.character_id),
        steps: JSON.parse(req.body.steps)
    };
    scenes.push(newScene);
    await dataManager.saveScenes(scenes);
    res.redirect('/scenes');
});

app.post('/scenes/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const scenes = await dataManager.getScenes();
    const index = scenes.findIndex(s => s.id === id);
    if (index !== -1) {
        scenes[index] = {
            id: id,
            scene_name: req.body.scene_name,
            character_id: parseInt(req.body.character_id),
            steps: JSON.parse(req.body.steps)
        };
        await dataManager.saveScenes(scenes);
        res.redirect('/scenes');
    } else {
        res.status(404).send('Scene not found');
    }
});

// Parts routes
app.get('/parts', async (req, res) => {
    const parts = await dataManager.getParts();
    res.render('parts', { title: 'Parts', parts });
});

app.get('/parts/new', (req, res) => {
    res.render('part-form', { title: 'Add New Part', action: '/parts', part: {} });
});

app.get('/parts/:id/edit', async (req, res) => {
    const parts = await dataManager.getParts();
    const part = parts.find(p => p.id === parseInt(req.params.id));
    if (part) {
        res.render('part-form', { title: 'Edit Part', action: '/parts/' + part.id, part });
    } else {
        res.status(404).send('Part not found');
    }
});

app.post('/parts', async (req, res) => {
    const parts = await dataManager.getParts();
    const newPart = {
        id: dataManager.getNextId(parts),
        name: req.body.name,
        type: req.body.type,
        pin: parseInt(req.body.pin)
    };
    parts.push(newPart);
    await dataManager.saveParts(parts);
    res.redirect('/parts');
});

app.post('/parts/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const parts = await dataManager.getParts();
    const index = parts.findIndex(p => p.id === id);
    if (index !== -1) {
        parts[index] = {
            id: id,
            name: req.body.name,
            type: req.body.type,
            pin: parseInt(req.body.pin)
        };
        await dataManager.saveParts(parts);
        res.redirect('/parts');
    } else {
        res.status(404).send('Part not found');
    }
});

// Sounds routes
app.get('/sounds', async (req, res) => {
    const sounds = await dataManager.getSounds();
    res.render('sounds', { title: 'Sounds', sounds });
});

app.get('/sounds/new', (req, res) => {
    res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: {} });
});

app.get('/sounds/:id/edit', async (req, res) => {
    const sounds = await dataManager.getSounds();
    const sound = sounds.find(s => s.id === parseInt(req.params.id));
    if (sound) {
        res.render('sound-form', { title: 'Edit Sound', action: '/sounds/' + sound.id, sound });
    } else {
        res.status(404).send('Sound not found');
    }
});

app.post('/sounds', upload.single('sound_file'), async (req, res) => {
    const sounds = await dataManager.getSounds();
    const newSound = {
        id: dataManager.getNextId(sounds),
        name: req.body.name,
        filename: req.file.filename
    };
    sounds.push(newSound);
    await dataManager.saveSounds(sounds);
    res.redirect('/sounds');
});

app.post('/sounds/:id', upload.single('sound_file'), async (req, res) => {
    const id = parseInt(req.params.id);
    const sounds = await dataManager.getSounds();
    const index = sounds.findIndex(s => s.id === id);
    if (index !== -1) {
        const oldFilename = sounds[index].filename;
        sounds[index] = {
            id: id,
            name: req.body.name,
            filename: req.file ? req.file.filename : oldFilename
        };
        if (req.file) {
            try {
                await fs.unlink(path.join('public', 'sounds', oldFilename));
            } catch (error) {
                console.error('Error deleting old sound file:', error);
            }
        }
        await dataManager.saveSounds(sounds);
        res.redirect('/sounds');
    } else {
        res.status(404).send('Sound not found');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`MonsterBox server running at http://localhost:${port}`);
});
