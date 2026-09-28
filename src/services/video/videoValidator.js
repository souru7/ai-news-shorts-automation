const fs = require('fs');
const { execSync } = require('child_process');
const logger = require('../../utils/logger');

let ffprobeBin = 'ffprobe';
try {
  const ffprobeStatic = require('ffprobe-static');
  if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
    ffprobeBin = ffprobeStatic.path;
  }
} catch (e) {}

class VideoValidator {
  /**
   * Validate generated video meets all YouTube Shorts requirements
   * @param {string} filePath - Absolute path to MP4 video
   * @returns {{isValid: boolean, error?: string, metadata: object}}
   */
  validateVideo(filePath) {
    if (!fs.existsSync(filePath)) {
      return { isValid: false, error: 'Video file does not exist on disk', metadata: {} };
    }

    const stat = fs.statSync(filePath);
    if (stat.size < 50 * 1024) { // Less than 50KB is suspect
      return { isValid: false, error: `Video file is too small (${Math.round(stat.size / 1024)} KB)`, metadata: {} };
    }

    try {
      const probeOutput = execSync(
        `"${ffprobeBin}" -v quiet -print_format json -show_format -show_streams "${filePath}"`,
        { encoding: 'utf-8' }
      );
      const info = JSON.parse(probeOutput);
      const videoStream = info.streams.find(s => s.codec_type === 'video');
      const audioStream = info.streams.find(s => s.codec_type === 'audio');

      if (!videoStream) {
        return { isValid: false, error: 'File contains no video stream', metadata: {} };
      }

      if (!audioStream) {
        return { isValid: false, error: 'File contains no audio voiceover stream', metadata: {} };
      }

      const duration = parseFloat(info.format.duration || videoStream.duration || 0);
      const width = parseInt(videoStream.width, 10);
      const height = parseInt(videoStream.height, 10);

      // 1. YouTube Shorts Duration check: must be <= 30 seconds
      if (duration > 30.5) {
        return {
          isValid: false,
          error: `Video duration (${duration.toFixed(1)}s) exceeds 30-second Shorts limit`,
          metadata: { duration, width, height }
        };
      }

      if (duration < 3.0) {
        return {
          isValid: false,
          error: `Video duration (${duration.toFixed(1)}s) is too short (< 3 seconds)`,
          metadata: { duration, width, height }
        };
      }

      // 2. Aspect Ratio Check: Must be vertical 9:16 (height > width)
      if (width > height) {
        return {
          isValid: false,
          error: `Video is landscape (${width}x${height}), must be vertical 9:16`,
          metadata: { duration, width, height }
        };
      }

      if (width !== 1080 || height !== 1920) {
        logger.warn(`Video dimensions are ${width}x${height}, standard is 1080x1920.`);
      }

      const metadata = {
        format: info.format.format_name,
        duration: Math.round(duration * 100) / 100,
        sizeBytes: stat.size,
        sizeMb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
        width,
        height,
        videoCodec: videoStream.codec_name,
        audioCodec: audioStream.codec_name
      };

      logger.info(`Video validated successfully: ${duration.toFixed(1)}s, ${width}x${height}, ${metadata.sizeMb}MB`);
      return {
        isValid: true,
        metadata
      };
    } catch (err) {
      return {
        isValid: false,
        error: `FFprobe failed to inspect video: ${err.message}`,
        metadata: {}
      };
    }
  }
}

module.exports = new VideoValidator();
