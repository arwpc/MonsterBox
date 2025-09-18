/**
 * Audio Configuration Page Test
 * Tests the new PipeWire audio configuration interface
 */

import { expect } from 'chai';
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

describe('PipeWire Audio Configuration Page', () => {
    it('should load the audio configuration page', async () => {
        const res = await axios.get(`${BASE_URL}/setup/audio/`, { validateStatus: () => true });
        expect(res.status).to.equal(200);
        expect(res.data).to.include('PipeWire Audio Configuration');
        expect(res.data).to.include('System Default Sink');
        expect(res.data).to.include('System Default Source');
        console.log('✅ Audio configuration page loads successfully');
    });

    it('should provide system configuration API', async () => {
        const res = await axios.get(`${BASE_URL}/setup/audio/api/system-config`, { validateStatus: () => true });
        expect(res.status).to.equal(200);
        expect(res.data).to.have.property('success', true);
        expect(res.data).to.have.property('config');
        expect(res.data.config).to.have.property('availableSinks');
        expect(res.data.config).to.have.property('availableSources');
        expect(res.data.config).to.have.property('pipewireStatus');
        
        console.log(`✅ System config API: ${res.data.config.availableSinks.length} sinks, ${res.data.config.availableSources.length} sources`);
        console.log(`✅ PipeWire tools: wpctl=${res.data.config.pipewireStatus.wpctl}, pactl=${res.data.config.pipewireStatus.pactl}`);
    });

    it('should handle system configuration save', async () => {
        const res = await axios.post(`${BASE_URL}/setup/audio/api/system-config`, {
            defaultSink: 'auto',
            defaultSource: 'auto'
        }, { validateStatus: () => true });
        
        expect(res.status).to.equal(200);
        expect(res.data).to.have.property('success', true);
        console.log('✅ System configuration save works');
    });

    it('should provide audio testing endpoints', async () => {
        // Test speaker endpoint
        const speakerRes = await axios.post(`${BASE_URL}/setup/audio/api/test-system`, {
            testType: 'speaker',
            deviceId: 'default'
        }, { validateStatus: () => true });
        
        expect(speakerRes.status).to.equal(200);
        expect(speakerRes.data).to.have.property('success');
        expect(speakerRes.data).to.have.property('testType', 'speaker');
        console.log(`✅ Speaker test: ${speakerRes.data.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);

        // Test microphone endpoint
        const micRes = await axios.post(`${BASE_URL}/setup/audio/api/test-system`, {
            testType: 'microphone',
            deviceId: 'default'
        }, { validateStatus: () => true });
        
        expect(micRes.status).to.equal(200);
        expect(micRes.data).to.have.property('success');
        expect(micRes.data).to.have.property('testType', 'microphone');
        console.log(`✅ Microphone test: ${micRes.data.success ? 'SUCCESS' : 'EXPECTED_FAIL'}`);
    });

    it('should handle invalid test types gracefully', async () => {
        const res = await axios.post(`${BASE_URL}/setup/audio/api/test-system`, {
            testType: 'invalid',
            deviceId: 'default'
        }, { validateStatus: () => true });
        
        expect(res.status).to.equal(400);
        expect(res.data).to.have.property('success', false);
        expect(res.data).to.have.property('error');
        console.log('✅ Invalid test type handled gracefully');
    });

    it('should provide PipeWire device enumeration', async () => {
        // Test sinks endpoint
        const sinksRes = await axios.get(`${BASE_URL}/setup/audio/api/sinks`, { validateStatus: () => true });
        expect(sinksRes.status).to.equal(200);
        expect(sinksRes.data).to.have.property('success', true);
        expect(sinksRes.data).to.have.property('sinks');
        expect(sinksRes.data.sinks).to.be.an('array');

        // Test sources endpoint
        const sourcesRes = await axios.get(`${BASE_URL}/setup/audio/api/sources`, { validateStatus: () => true });
        expect(sourcesRes.status).to.equal(200);
        expect(sourcesRes.data).to.have.property('success', true);
        expect(sourcesRes.data).to.have.property('sources');
        expect(sourcesRes.data.sources).to.be.an('array');

        console.log(`✅ Device enumeration: ${sinksRes.data.sinks.length} sinks, ${sourcesRes.data.sources.length} sources`);
    });

    it('should provide PipeWire tools check', async () => {
        const res = await axios.get(`${BASE_URL}/setup/audio/api/check-pipewire`, { validateStatus: () => true });
        expect(res.status).to.equal(200);
        expect(res.data).to.have.property('success', true);
        expect(res.data).to.have.property('tools');
        
        const tools = res.data.tools;
        console.log('✅ PipeWire tools check:');
        Object.keys(tools).forEach(tool => {
            console.log(`  ${tool}: ${tools[tool] ? '✅' : '❌'}`);
        });
    });
});
