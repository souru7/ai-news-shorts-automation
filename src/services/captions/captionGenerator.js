const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class CaptionGenerator {
  constructor() {
    this.tempDir = path.join(__dirname, '../../../storage/temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Format seconds to ASS timestamp (H:MM:SS.cs)
   */
  formatAssTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.floor((seconds % 1) * 100);
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }

  /**
   * Format seconds to SRT timestamp (HH:MM:SS,mmm)
   */
  formatSrtTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * Break script into rhythmic 2-4 word bite-sized chunks
   */
  chunkScript(text) {
    const cleanText = text.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    const words = cleanText.split(' ');
    const chunks = [];
    let current = [];

    for (let i = 0; i < words.length; i++) {
      current.push(words[i]);
      // Chunk at punctuation or every 3-4 words
      const endsWithPunct = /[.!?,\-;:]$/.test(words[i]);
      if (current.length >= 3 || endsWithPunct || i === words.length - 1) {
        chunks.push(current.join(' '));
        current = [];
      }
    }
    return chunks;
  }

  /**
   * Calculate proportional timing for each chunk based on character weights
   * @param {string[]} chunks
   * @param {number} totalDuration - Total audio length in seconds
   */
  calculateTiming(chunks, totalDuration) {
    // Total weight based on characters (longer words take slightly longer to speak)
    const weights = chunks.map(c => {
      let weight = c.length;
      if (/[.!?]$/.test(c)) weight += 6; // Sentence end pause
      else if (/[,;:]$/.test(c)) weight += 3; // Comma pause
      return weight;
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let currentTime = 0.2; // Slight 200ms lead-in
    const effectiveDuration = Math.max(totalDuration - 0.4, 1.0);

    return chunks.map((chunk, idx) => {
      const sliceDuration = (weights[idx] / totalWeight) * effectiveDuration;
      const startTime = currentTime;
      const endTime = Math.min(currentTime + sliceDuration, totalDuration);
      currentTime = endTime;
      return {
        text: chunk.toUpperCase(),
        start: startTime,
        end: endTime
      };
    });
  }

  /**
   * Generates an ASS subtitle file with viral Shorts styling
   * (High contrast bold font, yellow primary color, thick black border, placed in mobile safe zone)
   */
  async generateAssSubtitles(scriptText, totalDuration) {
    const fileId = crypto.randomUUID();
    const assPath = path.join(this.tempDir, `captions_${fileId}.ass`);

    const chunks = this.chunkScript(scriptText);
    const timedChunks = this.calculateTiming(chunks, totalDuration);

    const assHeader = `[Script Info]
Title: AI News Shorts Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortsDefault,Arial,72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,1,0,1,6,3,2,60,60,620,1
Style: ShortsHighlight,Arial,78,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,105,105,1,0,1,8,4,2,60,60,620,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = timedChunks.map((c, i) => {
      const startStr = this.formatAssTime(c.start);
      const endStr = this.formatAssTime(c.end);
      // Alternate subtle highlight for visual rhythm
      const styleName = (i % 2 === 0) ? 'ShortsDefault' : 'ShortsHighlight';
      return `Dialogue: 0,${startStr},${endStr},${styleName},,0,0,0,,${c.text}`;
    }).join('\n');

    fs.writeFileSync(assPath, assHeader + events + '\n', 'utf-8');
    logger.info(`Generated ASS subtitles with ${timedChunks.length} cue points: ${assPath}`);

    return {
      assPath,
      timedChunks
    };
  }

  /**
   * Generates a standard SRT subtitle file
   */
  async generateSrtSubtitles(scriptText, totalDuration) {
    const fileId = crypto.randomUUID();
    const srtPath = path.join(this.tempDir, `captions_${fileId}.srt`);

    const chunks = this.chunkScript(scriptText);
    const timedChunks = this.calculateTiming(chunks, totalDuration);

    const srtLines = timedChunks.map((c, idx) => {
      return `${idx + 1}\n${this.formatSrtTime(c.start)} --> ${this.formatSrtTime(c.end)}\n${c.text}\n`;
    }).join('\n');

    fs.writeFileSync(srtPath, srtLines, 'utf-8');
    return srtPath;
  }
}

module.exports = new CaptionGenerator();
