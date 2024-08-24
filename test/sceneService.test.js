// test/sceneService.test.js
const { expect } = require('chai');
const {
    getAllScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene
} = require('../services/sceneService');

describe('Scene Service', () => {
    it('should return all scenes', async () => {
        const scenes = await getAllScenes();
        expect(scenes).to.be.an('array');
    });

    it('should return a specific scene by id', async () => {
        const scenes = await getAllScenes();
        if (scenes.length > 0) {
            const sceneId = scenes[0].id;
            const scene = await getSceneById(sceneId);
            expect(scene).to.be.an('object');
            expect(scene).to.have.property('id');
            expect(scene.id).to.equal(sceneId);
        } else {
            console.log('No scenes available to test getSceneById');
        }
    });

    // Add more tests for create, update, and delete
    it('should create a new scene', async () => {
        const newScene = {
            character_id: 1,
            scene_name: 'Test Scene',
            steps: []
        };
        const createdScene = await createScene(newScene);
        expect(createdScene).to.be.an('object');
        expect(createdScene).to.have.property('id');
        expect(createdScene.scene_name).to.equal(newScene.scene_name);
    });

    it('should update an existing scene', async () => {
        const scenes = await getAllScenes();
        if (scenes.length > 0) {
            const sceneToUpdate = scenes[0];
            const updatedData = {
                scene_name: 'Updated Test Scene'
            };
            const updatedScene = await updateScene(sceneToUpdate.id, updatedData);
            expect(updatedScene).to.be.an('object');
            expect(updatedScene.id).to.equal(sceneToUpdate.id);
            expect(updatedScene.scene_name).to.equal(updatedData.scene_name);
        } else {
            console.log('No scenes available to test updateScene');
        }
    });

    it('should delete a scene', async () => {
        const scenes = await getAllScenes();
        if (scenes.length > 0) {
            const sceneToDelete = scenes[scenes.length - 1];
            await deleteScene(sceneToDelete.id);
            const updatedScenes = await getAllScenes();
            expect(updatedScenes.find(scene => scene.id === sceneToDelete.id)).to.be.undefined;
        } else {
            console.log('No scenes available to test deleteScene');
        }
    });
});
