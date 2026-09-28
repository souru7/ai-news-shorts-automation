const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');
const env = require('../../config/env');
const logger = require('../../utils/logger');

class TtsService {
  constructor() {
    this.provider = (env.TTS_PROVIDER || 'edge').toLowerCase();
    this.voice = env.TTS_VOICE || 'en-US-ChristopherNeural';
    this.audioDir = path.join(__dirname, '../../../storage/audio');
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
  }

  /**
   * Measure precise audio duration using ffprobe
   */
  getAudioDuration(filePath) {
    try {
      const output = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        { encoding: 'utf-8' }
      ).trim();
      const dur = parseFloat(output);
      return isNaN(dur) ? 0 : Math.round(dur * 100) / 100;
    } catch (err) {
      logger.warn(`ffprobe duration extraction failed: ${err.message}`);
      return 0;
    }
  }

  /**
   * Main speech synthesis entry point
   * @param {string} text - Voiceover script
   * @returns {Promise<{audioPath: string, duration: number}>}
   */
  async generateSpeech(text) {
    logger.info(`Generating voiceover using provider [${this.provider}], voice [${this.voice}]...`);
    const fileId = crypto.randomUUID();
    const outputPath = path.join(this.audioDir, `voice_${fileId}.mp3`);

    let generated = false;

    // 1. Try configured provider
    if (this.provider === 'openai' && env.TTS_API_KEY) {
      try {
        await this.generateWithOpenAI(text, outputPath);
        generated = true;
      } catch (err) {
        logger.error(`OpenAI TTS error: ${err.message}. Attempting fallback to Edge TTS...`);
      }
    } else if (this.provider === 'elevenlabs' && env.ELEVENLABS_API_KEY) {
      try {
        await this.generateWithElevenLabs(text, outputPath);
        generated = true;
      } catch (err) {
        logger.error(`ElevenLabs TTS error: ${err.message}. Attempting fallback to Edge TTS...`);
      }
    }

    // 2. If primary failed or if provider is 'edge', use Microsoft Edge Neural TTS
    if (!generated) {
      try {
        await this.generateWithEdgeTTS(text, outputPath);
        generated = true;
      } catch (err) {
        logger.error(`Edge TTS failed: ${err.message}. Attempting macOS 'say' command fallback if local...`);
        // Fallback for offline local dev environment
        await this.generateWithSystemSay(text, outputPath);
        generated = true;
      }
    }

    const duration = this.getAudioDuration(outputPath);
    logger.info(`Voiceover generated successfully: ${outputPath} (${duration}s)`);

    return {
      audioPath: outputPath,
      duration
    };
  }

  /**
   * OpenAI TTS synthesis
   */
  async generateWithOpenAI(text, outputPath) {
    const { OpenAI } = require('openai');
    const openai = new OpenAI({
      apiKey: env.TTS_API_KEY || env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL
    });

    const voice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(this.voice)
      ? this.voice
      : 'alloy';

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: text,
      speed: 1.05
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * ElevenLabs TTS synthesis
   */
  async generateWithElevenLabs(text, outputPath) {
    const axios = require('axios');
    const voiceId = env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    const response = await axios({
      method: 'POST',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      responseType: 'arraybuffer'
    });

    fs.writeFileSync(outputPath, response.data);
  }

  /**
   * High-quality free neural TTS via Microsoft Edge TTS
   */
  async generateWithEdgeTTS(text, outputPath) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      this.voice.includes('Neural') ? this.voice : 'en-US-ChristopherNeural',
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
    );

    await new Promise((resolve, reject) => {
      const { audioStream } = tts.toStream(text);
      const writable = fs.createWriteStream(outputPath);
      audioStream.pipe(writable);
      writable.on('close', resolve);
      audioStream.once('error', (err) => {
        writable.destroy();
        reject(err);
      });
      writable.once('error', reject);
    });
  }

  /**
   * Offline dev fallback using system speech synthesizer
   */
  async generateWithSystemSay(text, outputPath) {
    const aiffPath = outputPath.replace(/\.mp3$/, '.aiff');
    try {
      execSync(`say -o "${aiffPath}" "${text.replace(/"/g, '\\"')}"`);
      execSync(`ffmpeg -y -i "${aiffPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}"`);
      if (fs.existsSync(aiffPath)) fs.unlinkSync(aiffPath);
    } catch (e) {
      // Last-ditch silent audio placeholder if no TTS engine available
      execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 20 -q:a 9 -acodec libmp3lame "${outputPath}"`);
    }
  }
}

module.exports = new TtsService();
