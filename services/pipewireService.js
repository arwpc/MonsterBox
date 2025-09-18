/**
 * PipeWire Service
 * Handles PipeWire/WirePlumber device enumeration and stream routing
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const pexec = promisify(exec);

/**
 * PipeWire Service for audio device management and stream routing
 */
class PipeWireService {
    constructor() {
        this.preferNativeTools = true; // Prefer pw-* tools over pactl when available
    }

    /**
     * Check if PipeWire tools are available
     */
    async checkPipeWireAvailability() {
        const tools = {
            wpctl: false,
            pwPlay: false,
            pwRecord: false,
            pactl: false,
            paplay: false,
            parec: false
        };

        try {
            await pexec('wpctl --version');
            tools.wpctl = true;
        } catch (_) { }

        try {
            await pexec('pw-play --version');
            tools.pwPlay = true;
        } catch (_) { }

        try {
            await pexec('pw-record --version');
            tools.pwRecord = true;
        } catch (_) { }

        try {
            await pexec('pactl --version');
            tools.pactl = true;
        } catch (_) { }

        try {
            await pexec('paplay --version');
            tools.paplay = true;
        } catch (_) { }

        try {
            await pexec('parec --version');
            tools.parec = true;
        } catch (_) { }

        return tools;
    }

    /**
     * Enumerate PipeWire sinks (audio outputs)
     */
    async listSinks() {
        try {
            // Try wpctl first (native PipeWire)
            try {
                const { stdout } = await pexec('wpctl status');
                return this.parseWpctlSinks(stdout);
            } catch (wpErr) {
                console.log('wpctl not available, falling back to pactl');
            }

            // Fallback to pactl (PulseAudio compatibility layer)
            try {
                const { stdout } = await pexec('pactl list short sinks');
                return this.parsePactlSinks(stdout);
            } catch (paErr) {
                console.warn('Neither wpctl nor pactl available for sink enumeration');
                return this.getDefaultSinks();
            }
        } catch (error) {
            console.error('Error enumerating sinks:', error.message);
            return this.getDefaultSinks();
        }
    }

    /**
     * Enumerate PipeWire sources (audio inputs)
     */
    async listSources() {
        try {
            // Try wpctl first (native PipeWire)
            try {
                const { stdout } = await pexec('wpctl status');
                return this.parseWpctlSources(stdout);
            } catch (wpErr) {
                console.log('wpctl not available, falling back to pactl');
            }

            // Fallback to pactl (PulseAudio compatibility layer)
            try {
                const { stdout } = await pexec('pactl list short sources');
                return this.parsePactlSources(stdout);
            } catch (paErr) {
                console.warn('Neither wpctl nor pactl available for source enumeration');
                return this.getDefaultSources();
            }
        } catch (error) {
            console.error('Error enumerating sources:', error.message);
            return this.getDefaultSources();
        }
    }

    /**
     * Parse wpctl status output for sinks
     */
    parseWpctlSinks(output) {
        const sinks = [];
        const lines = output.split('\n');
        let inSinksSection = false;

        for (const line of lines) {
            if (line.includes('Audio') && line.includes('Sinks:')) {
                inSinksSection = true;
                continue;
            }
            if (inSinksSection && line.trim() === '') {
                inSinksSection = false;
                continue;
            }
            if (inSinksSection) {
                const match = line.match(/\s*(\d+)\.\s*(.+?)\s*\[(.+?)\]/);
                if (match) {
                    const [, id, name, state] = match;
                    const isDefault = line.includes('*') || state.includes('default');
                    sinks.push({
                        id: id,
                        name: name.trim(),
                        description: isDefault ? `${name.trim()} [Default]` : name.trim(),
                        isDefault,
                        state: state.trim()
                    });
                }
            }
        }

        // Ensure default appears first
        sinks.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
        });

        // Add generic defaults if no devices found
        if (sinks.length === 0) {
            return this.getDefaultSinks();
        }

        return sinks;
    }

    /**
     * Parse wpctl status output for sources
     */
    parseWpctlSources(output) {
        const sources = [];
        const lines = output.split('\n');
        let inSourcesSection = false;

        for (const line of lines) {
            if (line.includes('Audio') && line.includes('Sources:')) {
                inSourcesSection = true;
                continue;
            }
            if (inSourcesSection && line.trim() === '') {
                inSourcesSection = false;
                continue;
            }
            if (inSourcesSection) {
                const match = line.match(/\s*(\d+)\.\s*(.+?)\s*\[(.+?)\]/);
                if (match) {
                    const [, id, name, state] = match;
                    const isDefault = line.includes('*') || state.includes('default');
                    sources.push({
                        id: id,
                        name: name.trim(),
                        description: isDefault ? `${name.trim()} [Default]` : name.trim(),
                        isDefault,
                        state: state.trim()
                    });
                }
            }
        }

        // Ensure default appears first
        sources.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
        });

        // Add generic defaults if no devices found
        if (sources.length === 0) {
            return this.getDefaultSources();
        }

        return sources;
    }

    /**
     * Parse pactl list short sinks output
     */
    parsePactlSinks(output) {
        const sinks = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const id = parts[1]; // Use sink name, not index
                const name = parts[1];
                const state = parts[3] || 'UNKNOWN';
                const isDefault = name.includes('default') || name === '@DEFAULT_SINK@';

                sinks.push({
                    id: id,
                    name: name,
                    description: isDefault ? `${name} [Default]` : name,
                    isDefault,
                    state: state
                });
            }
        }

        // Add generic defaults if no devices found
        if (sinks.length === 0) {
            return this.getDefaultSinks();
        }

        // Sort with defaults first
        sinks.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
        });

        return sinks;
    }

    /**
     * Parse pactl list short sources output
     */
    parsePactlSources(output) {
        const sources = [];
        const lines = output.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 2) {
                const id = parts[1]; // Use source name, not index
                const name = parts[1];
                const state = parts[3] || 'UNKNOWN';
                const isDefault = name.includes('default') || name === '@DEFAULT_SOURCE@';

                sources.push({
                    id: id,
                    name: name,
                    description: isDefault ? `${name} [Default]` : name,
                    isDefault,
                    state: state
                });
            }
        }

        // Add generic defaults if no devices found
        if (sources.length === 0) {
            return this.getDefaultSources();
        }

        // Sort with defaults first
        sources.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name);
        });

        return sources;
    }

    /**
     * Get default sinks when no devices are detected
     */
    getDefaultSinks() {
        return [
            {
                id: 'default',
                name: 'Default Output',
                description: 'Default Output [Recommended]',
                isDefault: true,
                state: 'RUNNING'
            },
            {
                id: 'pulse',
                name: 'PulseAudio Output',
                description: 'PulseAudio Output',
                isDefault: false,
                state: 'RUNNING'
            }
        ];
    }

    /**
     * Get default sources when no devices are detected
     */
    getDefaultSources() {
        return [
            {
                id: 'default',
                name: 'Default Input',
                description: 'Default Input [Recommended]',
                isDefault: true,
                state: 'RUNNING'
            },
            {
                id: 'pulse',
                name: 'PulseAudio Input',
                description: 'PulseAudio Input',
                isDefault: false,
                state: 'RUNNING'
            }
        ];
    }

    /**
     * Move a sink input to a different sink
     */
    async moveSinkInput(streamId, sinkId) {
        try {
            // Try wpctl first
            try {
                await pexec(`wpctl move ${streamId} ${sinkId}`);
                return { success: true, method: 'wpctl', streamId, sinkId };
            } catch (wpErr) {
                console.log('wpctl move failed, trying pactl');
            }

            // Fallback to pactl
            await pexec(`pactl move-sink-input ${streamId} ${sinkId}`);
            return { success: true, method: 'pactl', streamId, sinkId };
        } catch (error) {
            console.error('Failed to move sink input:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * List active sink inputs (playing streams)
     */
    async listSinkInputs() {
        try {
            const { stdout } = await pexec('pactl list short sink-inputs');
            const inputs = [];
            const lines = stdout.split('\n').filter(line => line.trim());

            for (const line of lines) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                    inputs.push({
                        id: parts[0],
                        sinkId: parts[1],
                        clientId: parts[2] || 'unknown',
                        properties: parts[3] || ''
                    });
                }
            }

            return inputs;
        } catch (error) {
            console.error('Failed to list sink inputs:', error.message);
            return [];
        }
    }

    /**
     * Set default sink
     */
    async setDefaultSink(sinkId) {
        try {
            await pexec(`pactl set-default-sink ${sinkId}`);
            return { success: true, sinkId };
        } catch (error) {
            console.error('Failed to set default sink:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Set default source
     */
    async setDefaultSource(sourceId) {
        try {
            await pexec(`pactl set-default-source ${sourceId}`);
            return { success: true, sourceId };
        } catch (error) {
            console.error('Failed to set default source:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get current default sink
     */
    async getDefaultSink() {
        try {
            const { stdout } = await pexec('pactl get-default-sink');
            return stdout.trim();
        } catch (error) {
            console.warn('Could not get default sink:', error.message);
            return 'auto';
        }
    }

    /**
     * Get current default source
     */
    async getDefaultSource() {
        try {
            const { stdout } = await pexec('pactl get-default-source');
            return stdout.trim();
        } catch (error) {
            console.warn('Could not get default source:', error.message);
            return 'auto';
        }
    }

    /**
     * Get actual hardware devices (not just sinks/sources)
     */
    async listHardwareDevices() {
        const devices = {
            outputs: [],
            inputs: []
        };

        try {
            // Get ALSA hardware devices for more meaningful names
            try {
                const { stdout: playbackDevices } = await pexec('aplay -l');
                devices.outputs = this.parseAlsaPlaybackDevices(playbackDevices);
            } catch (_) { }

            try {
                const { stdout: captureDevices } = await pexec('arecord -l');
                devices.inputs = this.parseAlsaCaptureDevices(captureDevices);
            } catch (_) { }

            // If no ALSA devices found, fall back to PipeWire device parsing
            if (devices.outputs.length === 0) {
                const sinks = await this.listSinks();
                devices.outputs = sinks.map(sink => ({
                    id: sink.id,
                    name: sink.name,
                    description: sink.description,
                    type: 'pipewire',
                    isDefault: sink.isDefault
                }));
            }

            if (devices.inputs.length === 0) {
                const sources = await this.listSources();
                devices.inputs = sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    description: source.description,
                    type: 'pipewire',
                    isDefault: source.isDefault
                }));
            }

        } catch (error) {
            console.error('Error listing hardware devices:', error.message);
        }

        return devices;
    }

    /**
     * Parse ALSA playback devices from aplay -l output
     */
    parseAlsaPlaybackDevices(output) {
        const devices = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(/^card (\d+): (.+?) \[(.+?)\], device (\d+): (.+?) \[(.+?)\]/);
            if (match) {
                const [, cardNum, cardName, cardDesc, deviceNum, deviceName, deviceDesc] = match;
                devices.push({
                    id: `hw:${cardNum},${deviceNum}`,
                    name: `${cardName} - ${deviceName}`,
                    description: `${cardDesc} - ${deviceDesc}`,
                    type: 'alsa',
                    card: parseInt(cardNum),
                    device: parseInt(deviceNum),
                    isDefault: cardNum === '0' && deviceNum === '0'
                });
            }
        }

        // Add PulseAudio/PipeWire compatibility devices
        if (devices.length > 0) {
            devices.unshift({
                id: 'default',
                name: 'System Default',
                description: 'Default Audio Output (Recommended)',
                type: 'system',
                isDefault: true
            });
        }

        return devices;
    }

    /**
     * Parse ALSA capture devices from arecord -l output
     */
    parseAlsaCaptureDevices(output) {
        const devices = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(/^card (\d+): (.+?) \[(.+?)\], device (\d+): (.+?) \[(.+?)\]/);
            if (match) {
                const [, cardNum, cardName, cardDesc, deviceNum, deviceName, deviceDesc] = match;
                devices.push({
                    id: `hw:${cardNum},${deviceNum}`,
                    name: `${cardName} - ${deviceName}`,
                    description: `${cardDesc} - ${deviceDesc}`,
                    type: 'alsa',
                    card: parseInt(cardNum),
                    device: parseInt(deviceNum),
                    isDefault: cardNum === '0' && deviceNum === '0'
                });
            }
        }

        // Add PulseAudio/PipeWire compatibility devices
        if (devices.length > 0) {
            devices.unshift({
                id: 'default',
                name: 'System Default',
                description: 'Default Audio Input (Recommended)',
                type: 'system',
                isDefault: true
            });
        }

        return devices;
    }

    /**
     * Get active audio streams
     */
    async listActiveStreams() {
        try {
            const { stdout } = await pexec('wpctl status');
            return this.parseActiveStreams(stdout);
        } catch (error) {
            console.warn('Could not get active streams:', error.message);
            return [];
        }
    }

    /**
     * Parse active streams from wpctl status output
     */
    parseActiveStreams(output) {
        const streams = [];
        const lines = output.split('\n');
        let inSinkInputsSection = false;

        for (const line of lines) {
            if (line.includes('Sink inputs:')) {
                inSinkInputsSection = true;
                continue;
            }

            if (inSinkInputsSection && line.trim() === '') {
                break;
            }

            if (inSinkInputsSection) {
                const match = line.match(/\s*(\d+)\.\s*(.+?)\s*\[(.+?)\]/);
                if (match) {
                    const [, id, name, state] = match;
                    streams.push({
                        id: parseInt(id),
                        name: name.trim(),
                        state: state.trim(),
                        type: 'sink-input'
                    });
                }
            }
        }

        return streams;
    }

    /**
     * Check availability of PipeWire tools
     */
    async checkTools() {
        const tools = {
            wpctl: false,
            pactl: false,
            'pw-play': false,
            'pw-record': false,
            mpg123: false,
            amixer: false,
            aplay: false,
            arecord: false
        };

        // Check each tool
        for (const tool of Object.keys(tools)) {
            try {
                await pexec(`which ${tool}`);
                tools[tool] = true;
            } catch (_) {
                // Tool not available
            }
        }

        return tools;
    }

    /**
     * Move sink input to different sink
     */
    async moveSinkInput(sinkInputId, sinkId) {
        try {
            await pexec(`wpctl set-default ${sinkInputId} ${sinkId}`);
            return { success: true, sinkInputId, sinkId };
        } catch (wpError) {
            try {
                // Fallback to pactl
                await pexec(`pactl move-sink-input ${sinkInputId} ${sinkId}`);
                return { success: true, sinkInputId, sinkId };
            } catch (paError) {
                console.error('Failed to move sink input:', paError.message);
                return { success: false, error: paError.message };
            }
        }
    }
}

// Export singleton instance
export default new PipeWireService();
