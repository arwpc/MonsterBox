const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger'); // Assuming logger.js is in the same directory or configured

// OpenAI voices (fixed list)
const AVAILABLE_OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'shimmer', name: 'Shimmer' },
];

class OpenAIService {
  constructor() {
    this.client = null;
    this.isInitializing = false;
    this.initializePromise = null;

    if (!process.env.OPENAI_API_KEY) {
      const errorMsg = 'OPENAI_API_KEY environment variable is not set';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Basic audio settings (OpenAI outputs MP3 directly)
    this.audioSettings = {
      targetFormat: 'mp3',
      // OpenAI default sample rate for tts-1 is 24kHz.
      // Speed can be controlled via the 'speed' parameter (0.25 to 4.0)
    };
  }

  async _initializeClient() {
    if (this.client) return this.client;
    if (this.isInitializing && this.initializePromise) return this.initializePromise;

    this.isInitializing = true;
    this.initializePromise = (async () => {
      try {
        const { default: OpenAI } = await import('openai');
        this.client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        logger.info('OpenAI client initialized successfully.');
        return this.client;
      } catch (error) {
        logger.error('Failed to initialize OpenAI client:', error);
        throw error; // Re-throw to be caught by callers
      } finally {
        this.isInitializing = false;
      }
    })();
    return this.initializePromise;
  }

  async getAvailableVoices() {
    // Return a structure similar to what ReplicaAPI provided, for easier integration
    return AVAILABLE_OPENAI_VOICES.map(voice => ({
      uuid: voice.id, // Use 'id' as 'uuid'
      name: voice.name,
      gender: 'unknown', // OpenAI doesn't specify gender/age/accent for these voices
      age: 'unknown',
      accent: 'unknown',
      speaker_id: voice.id, // Use 'id' as 'speaker_id'
      capabilities: { 'tts.openai_v1': true }, // Custom capability flag
    }));
  }

  /**
   * Generates speech using OpenAI TTS and saves it to a file.
   * @param {object} params
   * @param {string} params.text - The text to synthesize.
   * @param {string} params.voiceId - The OpenAI voice ID (e.g., 'alloy').
   * @param {string} params.outputPath - The full path to save the MP3 file.
   * @param {object} [params.options] - Optional parameters.
   * @param {string} [params.options.model='tts-1'] - TTS model ('tts-1' or 'tts-1-hd').
   * @param {number} [params.options.speed=1.0] - Speech speed (0.25 to 4.0).
   * @returns {Promise<object>} - Resolves with { success: true, outputPath: string }.
   */
  async textToSpeech(params) {
    await this._initializeClient();

    try {
      if (!params.text?.trim()) {
        throw new Error('Text parameter is required and must not be empty');
      }
      if (!params.voiceId) {
        throw new Error('VoiceId parameter is required (e.g., alloy, echo)');
      }
      if (!params.outputPath) {
        throw new Error('Output path parameter is required');
      }

      const voiceExists = AVAILABLE_OPENAI_VOICES.some(v => v.id === params.voiceId);
      if (!voiceExists) {
        throw new Error(`Invalid voiceId: ${params.voiceId}. Available: ${AVAILABLE_OPENAI_VOICES.map(v => v.id).join(', ')}`);
      }

      const model = params.options?.model || 'tts-1';
      const speed = params.options?.speed || 1.0;

      if (speed < 0.25 || speed > 4.0) {
        throw new Error('Speed parameter must be between 0.25 and 4.0.');
      }

      logger.info(`Requesting OpenAI speech: voice='${params.voiceId}', model='${model}', speed='${speed}', output='${params.outputPath}'`);

      const apiResponse = await this.client.audio.speech.create({
        model: model,
        voice: params.voiceId,
        input: params.text.trim(),
        response_format: 'mp3', // Default is 'mp3'. Others: 'opus', 'aac', 'flac', 'wav', 'pcm'
        speed: speed,
      });

      if (!apiResponse.ok) {
        let errorBody = 'Unknown error';
        try {
            errorBody = await apiResponse.text();
        } catch (e) { /* ignore if reading body fails */ }
        logger.error(`OpenAI API Error: ${apiResponse.status} ${apiResponse.statusText} - ${errorBody}`);
        throw new Error(`OpenAI API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
      }

      // Ensure the output directory exists
      const outputDir = path.dirname(params.outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      
      // Stream the response to the file
      const buffer = Buffer.from(await apiResponse.arrayBuffer());
      await fs.writeFile(params.outputPath, buffer);
      
      logger.info(`Successfully saved OpenAI TTS audio to ${params.outputPath}`);

      return {
        success: true,
        outputPath: params.outputPath,
        // Note: OpenAI TTS API doesn't directly return audio duration.
        // Duration would need to be calculated post-generation if required.
      };

    } catch (error) {
      logger.error(`Error in OpenAI textToSpeech: ${error.message}`);
      // Log more details if it's an OpenAI specific error structure
      if (error.response && error.response.data) {
        logger.error(`OpenAI API Error Data: ${JSON.stringify(error.response.data)}`);
      }
      throw error; // Re-throw to be handled by the caller (e.g., voiceService)
    }
  }
}

module.exports = OpenAIService;
