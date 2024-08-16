// test/sceneService.test.js
const { expect } = require('chai');
const {
    getAllScenes,
    getScene,
    saveScene,
    removeScene
} = require('../services/sceneService');

describe('Scene Service', () => {
    it('should return all scenes', async () => {
        const scenes = await getAllScenes();
        expect(scenes).to.be.an('array');
    });

    it('should return a specific scene by id', async () => {
        const scene = await getScene(1);
        expect(scene).to.be.an('object');
        expect(scene).to.have.property('id');
    });

    // Add more tests for create, update, and delete
});
