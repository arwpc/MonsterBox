/**
 * Scene Templates Tests
 */
import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/scenes/api`;

describe('Scene Templates', function() {
  this.timeout(10000);

  describe('GET /scenes/api/templates', () => {
    it('should return list of scene templates', async () => {
      const res = await axios.get(`${API_URL}/templates`);
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('success', true);
      expect(res.data).to.have.property('templates');
      expect(res.data.templates).to.be.an('array');
      expect(res.data.templates.length).to.be.greaterThan(0);
    });

    it('should return templates with required fields', async () => {
      const res = await axios.get(`${API_URL}/templates`);
      const templates = res.data.templates;
      
      templates.forEach(template => {
        expect(template).to.have.property('id');
        expect(template).to.have.property('name');
        expect(template).to.have.property('description');
        expect(template).to.have.property('category');
        expect(template).to.have.property('steps');
        expect(template.steps).to.be.an('array');
      });
    });

    it('should include expected template categories', async () => {
      const res = await axios.get(`${API_URL}/templates`);
      const templates = res.data.templates;
      const categories = [...new Set(templates.map(t => t.category))];
      
      expect(categories).to.include.members(['movement', 'effects', 'sequences', 'interaction', 'interactive']);
    });
  });

  describe('POST /scenes/api/from-template', () => {
    let createdSceneId;

    after(async () => {
      // Cleanup: delete created scene
      if (createdSceneId) {
        try {
          await axios.delete(`${API_URL}/${createdSceneId}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });

    it('should create scene from template', async () => {
      // First get available templates
      const templatesRes = await axios.get(`${API_URL}/templates`);
      const templates = templatesRes.data.templates;
      expect(templates.length).to.be.greaterThan(0);
      
      const template = templates[0];
      
      // Create scene from template
      const res = await axios.post(`${API_URL}/from-template`, {
        templateId: template.id,
        name: 'Test Scene from Template'
      });
      
      expect(res.status).to.equal(200);
      expect(res.data).to.have.property('success', true);
      expect(res.data).to.have.property('scene');
      expect(res.data.scene).to.have.property('id');
      expect(res.data.scene).to.have.property('name', 'Test Scene from Template');
      expect(res.data.scene).to.have.property('steps');
      expect(res.data.scene.steps).to.be.an('array');
      expect(res.data.scene).to.have.property('fromTemplate', template.id);
      
      createdSceneId = res.data.scene.id;
    });

    it('should use template name if no name provided', async () => {
      const templatesRes = await axios.get(`${API_URL}/templates`);
      const template = templatesRes.data.templates[0];
      
      const res = await axios.post(`${API_URL}/from-template`, {
        templateId: template.id
      });
      
      expect(res.status).to.equal(200);
      expect(res.data.scene).to.have.property('name', template.name);
      
      // Cleanup
      await axios.delete(`${API_URL}/${res.data.scene.id}`);
    });

    it('should copy template steps to new scene', async () => {
      const templatesRes = await axios.get(`${API_URL}/templates`);
      const template = templatesRes.data.templates.find(t => t.steps && t.steps.length > 0);
      
      const res = await axios.post(`${API_URL}/from-template`, {
        templateId: template.id,
        name: 'Steps Test Scene'
      });
      
      expect(res.data.scene.steps).to.deep.equal(template.steps);
      
      // Cleanup
      await axios.delete(`${API_URL}/${res.data.scene.id}`);
    });

    it('should return 400 if templateId missing', async () => {
      try {
        await axios.post(`${API_URL}/from-template`, {
          name: 'Test Scene'
        });
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e.response.status).to.equal(400);
        expect(e.response.data).to.have.property('success', false);
        expect(e.response.data.error).to.include('templateId');
      }
    });

    it('should return 404 if template not found', async () => {
      try {
        await axios.post(`${API_URL}/from-template`, {
          templateId: 'nonexistent_template',
          name: 'Test Scene'
        });
        expect.fail('Should have thrown error');
      } catch (e) {
        expect(e.response.status).to.equal(404);
        expect(e.response.data).to.have.property('success', false);
        expect(e.response.data.error).to.include('not found');
      }
    });
  });
});

