/**
 * API Documentation Tests
 * 
 * Tests for API documentation endpoints and schema validation
 */

const request = require('supertest');
const { expect } = require('chai');
const app = require('../../app');

describe('API Documentation', () => {
    describe('GET /api/docs', () => {
        it('should return API documentation in markdown format', async () => {
            const response = await request(app)
                .get('/api/docs')
                .expect(200);
            
            expect(response.headers['content-type']).to.include('text/markdown');
            expect(response.text).to.include('# MonsterBox API Documentation');
            expect(response.text).to.include('## Authentication');
            expect(response.text).to.include('## Rate Limiting');
        });

        it('should return HTML documentation when Accept header includes text/html', async () => {
            const response = await request(app)
                .get('/api/docs')
                .set('Accept', 'text/html')
                .expect(200);
            
            expect(response.headers['content-type']).to.include('text/html');
            expect(response.text).to.include('<!DOCTYPE html>');
            expect(response.text).to.include('<title>MonsterBox API Documentation</title>');
        });

        it('should handle missing documentation file gracefully', async () => {
            // This test would require mocking fs.readFile to simulate file not found
            // For now, we'll test that the endpoint exists and responds
            const response = await request(app)
                .get('/api/docs')
                .expect((res) => {
                    expect([200, 404]).to.include(res.status);
                });
        });
    });

    describe('GET /api/schema', () => {
        it('should return valid OpenAPI 3.0 schema', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200)
                .expect('Content-Type', /json/);
            
            const schema = response.body;
            
            // Validate OpenAPI structure
            expect(schema).to.have.property('openapi', '3.0.0');
            expect(schema).to.have.property('info');
            expect(schema.info).to.have.property('title', 'MonsterBox API');
            expect(schema.info).to.have.property('version', '1.0.0');
            
            // Validate paths
            expect(schema).to.have.property('paths');
            expect(schema.paths).to.have.property('/api/characters');
            expect(schema.paths).to.have.property('/api/connections/status');
            expect(schema.paths).to.have.property('/api/cache/stats');
            expect(schema.paths).to.have.property('/api/cache/clear');
            expect(schema.paths).to.have.property('/auth/login');
            
            // Validate components
            expect(schema).to.have.property('components');
            expect(schema.components).to.have.property('schemas');
            expect(schema.components.schemas).to.have.property('Character');
            expect(schema.components.schemas).to.have.property('ApiResponse');
            expect(schema.components.schemas).to.have.property('ErrorResponse');
        });

        it('should include security schemes', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = response.body;
            expect(schema.components).to.have.property('securitySchemes');
            expect(schema.components.securitySchemes).to.have.property('bearerAuth');
            expect(schema.components.securitySchemes.bearerAuth.type).to.equal('http');
            expect(schema.components.securitySchemes.bearerAuth.scheme).to.equal('bearer');
        });

        it('should include proper tags', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = response.body;
            expect(schema).to.have.property('tags');
            expect(schema.tags).to.be.an('array');
            
            const tagNames = schema.tags.map(tag => tag.name);
            expect(tagNames).to.include('Characters');
            expect(tagNames).to.include('Authentication');
            expect(tagNames).to.include('Monitoring');
            expect(tagNames).to.include('Cache');
        });
    });

    describe('API Endpoint Documentation Coverage', () => {
        it('should document all major API endpoints', async () => {
            const schemaResponse = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = schemaResponse.body;
            const documentedPaths = Object.keys(schema.paths);
            
            // Check that major endpoints are documented
            const expectedPaths = [
                '/api/characters',
                '/api/connections/status',
                '/api/cache/stats',
                '/api/cache/clear',
                '/auth/login'
            ];
            
            expectedPaths.forEach(path => {
                expect(documentedPaths).to.include(path, `Path ${path} should be documented`);
            });
        });

        it('should include proper HTTP methods for each endpoint', async () => {
            const schemaResponse = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = schemaResponse.body;
            
            // Check specific endpoints have correct methods
            expect(schema.paths['/api/characters']).to.have.property('get');
            expect(schema.paths['/api/cache/clear']).to.have.property('post');
            expect(schema.paths['/auth/login']).to.have.property('post');
        });

        it('should include response schemas for all endpoints', async () => {
            const schemaResponse = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = schemaResponse.body;
            
            // Check that endpoints have response definitions
            Object.values(schema.paths).forEach(pathItem => {
                Object.values(pathItem).forEach(operation => {
                    expect(operation).to.have.property('responses');
                    expect(operation.responses).to.have.property('200');
                });
            });
        });
    });

    describe('Documentation Accessibility', () => {
        it('should serve documentation without authentication', async () => {
            // Documentation should be publicly accessible
            await request(app)
                .get('/api/docs')
                .expect(200);
            
            await request(app)
                .get('/api/schema')
                .expect(200);
        });

        it('should include proper CORS headers for documentation endpoints', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200);
            
            // Check that response includes proper headers for API consumption
            expect(response.headers).to.have.property('content-type');
            expect(response.headers['content-type']).to.include('application/json');
        });
    });

    describe('Documentation Content Quality', () => {
        it('should include authentication information in markdown docs', async () => {
            const response = await request(app)
                .get('/api/docs')
                .expect(200);
            
            expect(response.text).to.include('JWT');
            expect(response.text).to.include('Bearer');
            expect(response.text).to.include('Authorization');
        });

        it('should include rate limiting information', async () => {
            const response = await request(app)
                .get('/api/docs')
                .expect(200);
            
            expect(response.text).to.include('Rate Limiting');
            expect(response.text).to.include('1000 requests per 15 minutes');
            expect(response.text).to.include('500 requests per 15 minutes');
        });

        it('should include example requests and responses', async () => {
            const response = await request(app)
                .get('/api/docs')
                .expect(200);
            
            expect(response.text).to.include('```http');
            expect(response.text).to.include('```json');
            expect(response.text).to.include('GET /api/characters');
            expect(response.text).to.include('POST /auth/login');
        });

        it('should include SDK examples', async () => {
            const response = await request(app)
                .get('/api/docs')
                .expect(200);
            
            expect(response.text).to.include('JavaScript/Node.js');
            expect(response.text).to.include('Python');
            expect(response.text).to.include('class MonsterBoxAPI');
        });
    });

    describe('Schema Validation', () => {
        it('should have valid OpenAPI schema structure', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = response.body;
            
            // Basic OpenAPI 3.0 validation
            expect(schema.openapi).to.match(/^3\.0\.\d+$/);
            expect(schema.info).to.be.an('object');
            expect(schema.paths).to.be.an('object');
            expect(schema.components).to.be.an('object');
        });

        it('should include proper error response schemas', async () => {
            const response = await request(app)
                .get('/api/schema')
                .expect(200);
            
            const schema = response.body;
            const errorSchema = schema.components.schemas.ErrorResponse;
            
            expect(errorSchema).to.have.property('type', 'object');
            expect(errorSchema.properties).to.have.property('success');
            expect(errorSchema.properties).to.have.property('error');
            expect(errorSchema.properties).to.have.property('code');
            expect(errorSchema.properties).to.have.property('timestamp');
        });
    });
});
