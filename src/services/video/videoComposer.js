const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { createCanvas } = require('@napi-rs/canvas');
const logger = require('../../utils/logger');
const videoValidator = require('./videoValidator');

let ffmpegBin = 'ffmpeg';
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    ffmpegBin = ffmpegStatic;
  }
} catch (e) {}

class VideoComposer {
  constructor() {
    this.outputDir = path.join(__dirname, '../../../storage/videos');
    this.tempDir = path.join(__dirname, '../../../storage/temp');

    if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  getCanvas() {
    if (!this.sharedCanvas) {
      this.sharedCanvas = createCanvas(1080, 1920);
    }
    const ctx = this.sharedCanvas.getContext('2d');
    ctx.clearRect(0, 0, 1080, 1920);
    return { canvas: this.sharedCanvas, ctx };
  }

  /**
   * Render complete high-definition 1080x1920 9:16 frame for a specific caption segment
   */
  renderCompleteFrame({ tool_name, topic, captionText, isHighlight, progressRatio, tempJobDir, index }) {
    const { canvas, ctx } = this.getCanvas();

    // 1. Dark Cyber Navy Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGrad.addColorStop(0, '#060913');
    bgGrad.addColorStop(0.4, '#0b1329');
    bgGrad.addColorStop(0.8, '#171638');
    bgGrad.addColorStop(1, '#060913');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1920);

    // Decorative subtle geometric background grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 60; x < 1080; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1920);
      ctx.stroke();
    }
    for (let y = 100; y < 1920; y += 160) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1080, y);
      ctx.stroke();
    }

    // 2. Top Glowing Cyber Badge
    const badgeY = 160;
    const badgeText = '⚡ DAILY AI UPDATE';
    ctx.font = 'bold 32px sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 60;
    const badgeX = (1080 - badgeW) / 2;

    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, 60, 30);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 1080 / 2, badgeY + 30);

    // 3. Large AI Tool Title Card
    const cardY = 260;
    const cardW = 960;
    const cardH = 220;
    const cardX = (1080 - cardW) / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gradient accent line on top of card
    const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.5, '#818cf8');
    grad.addColorStop(1, '#c084fc');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, cardY + 2);
    ctx.lineTo(cardX + cardW - 40, cardY + 2);
    ctx.stroke();

    // Tool Name Text
    const displayTool = (tool_name || 'AI REVOLUTION').toUpperCase();
    let fontSize = 68;
    ctx.font = `900 ${fontSize}px sans-serif`;
    while (ctx.measureText(displayTool).width > cardW - 80 && fontSize > 36) {
      fontSize -= 4;
      ctx.font = `900 ${fontSize}px sans-serif`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(displayTool, 1080 / 2, cardY + 95);

    // Subtitle category inside card
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('VERIFIED AI TOOL • NEW CAPABILITIES', 1080 / 2, cardY + 165);

    // 4. Center / Lower Animated Caption Card
    const capCardY = 1100;
    const capCardW = 960;
    const capCardX = (1080 - capCardW) / 2;
    const cleanCapText = (captionText || '').toUpperCase().trim();

    let capFontSize = isHighlight ? 72 : 66;
    ctx.font = `900 ${capFontSize}px sans-serif`;

    const lines = this.wrapText(ctx, cleanCapText, capCardW - 120);
    const lineHeight = capFontSize + 22;
    const capCardH = Math.max((lines.length * lineHeight) + 70, 160);

    // Glowing subtitle backdrop
    ctx.fillStyle = 'rgba(8, 12, 22, 0.95)';
    this.drawRoundedRect(ctx, capCardX, capCardY - 20, capCardW, capCardH, 28);
    ctx.fill();

    ctx.strokeStyle = isHighlight ? '#38bdf8' : 'rgba(255, 230, 0, 0.4)';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Draw caption lines
    lines.forEach((line, idx) => {
      const y = capCardY + 52 + (idx * lineHeight);

      // Black text stroke for 100% legibility on mobile screens
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.strokeText(line, 1080 / 2, y);

      // Text fill (Highlight Cyan or Bright Yellow)
      ctx.fillStyle = isHighlight ? '#38bdf8' : '#FFE600';
      ctx.fillText(line, 1080 / 2, y);
    });

    // 5. Bottom Safe Area Callout
    const footerY = 1720;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText('🔔 SUBSCRIBE FOR 2 DAILY AI SHORTS', 1080 / 2, footerY);

    // 6. Bottom Video Progress Bar
    const progW = Math.max(Math.min(progressRatio * 1080, 1080), 0);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 1886, progW, 14);

    const fileName = `frame_${String(index).padStart(4, '0')}.png`;
    const outPath = path.join(tempJobDir, fileName);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    return fileName;
  }

  wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Compose the final YouTube Shorts video using low-memory sequential frame demuxer
   */
  async composeVideo({ tool_name, topic, script, audioPath, audioDuration, timedChunks, onProgress }) {
    // Strictly cap video duration to <= 29.5s
    const finalDuration = Math.min(Math.max(audioDuration, 5.0), 29.5);
    logger.info(`Composing YouTube Shorts video (${finalDuration.toFixed(1)}s, 1080x1920)...`);

    const videoId = crypto.randomUUID();
    const finalVideoPath = path.join(this.outputDir, `short_${videoId}.mp4`);
    const tempJobDir = path.join(this.tempDir, `render_${videoId}`);
    if (!fs.existsSync(tempJobDir)) fs.mkdirSync(tempJobDir, { recursive: true });

    // 1. Render sequential frames for each timed chunk
    const frameFiles = [];
    const totalChunks = timedChunks.length;

    timedChunks.forEach((chunk, i) => {
      const dur = Math.max(chunk.end - chunk.start, 0.4);
      const isHighlight = i % 2 === 1;
      const progressRatio = Math.min(chunk.end / finalDuration, 1.0);

      const fileName = this.renderCompleteFrame({
        tool_name,
        topic,
        captionText: chunk.text,
        isHighlight,
        progressRatio,
        tempJobDir,
        index: i
      });

      frameFiles.push({ fileName, dur });
    });

    // 2. Build FFmpeg concat script (sequential demuxer - requires less than 35MB RAM total)
    const concatPath = path.join(tempJobDir, 'concat.txt');
    let concatContent = 'ffconcat version 1.0\n';
    for (const f of frameFiles) {
      concatContent += `file '${f.fileName}'\nduration ${f.dur.toFixed(2)}\n`;
    }
    // Repeat final frame per FFmpeg concat specification
    if (frameFiles.length > 0) {
      concatContent += `file '${frameFiles[frameFiles.length - 1].fileName}'\n`;
    }
    fs.writeFileSync(concatPath, concatContent, 'utf-8');

    // 3. Low-memory FFmpeg execution
    const absAudioPath = path.resolve(audioPath);
    const absOutVideoPath = path.resolve(finalVideoPath);

    const ffmpegArgs = [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', concatPath,
      '-i', absAudioPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'fastdecode',
      '-threads', '1',
      '-x264opts', 'rc-lookahead=10:sync-lookahead=0',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', `${finalDuration}`,
      '-movflags', '+faststart',
      absOutVideoPath
    ];

    await new Promise((resolve, reject) => {
      logger.info(`Starting low-overhead FFmpeg composition: ${ffmpegBin}...`);
      const proc = spawn(ffmpegBin, ffmpegArgs, { cwd: tempJobDir });

      let stderr = '';
      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderr += text;

        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (timeMatch && onProgress) {
          const hours = parseFloat(timeMatch[1]);
          const minutes = parseFloat(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const currentSec = (hours * 3600) + (minutes * 60) + seconds;
          const percent = Math.min(Math.round((currentSec / finalDuration) * 100), 99);
          onProgress(percent, currentSec, finalDuration);
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          if (onProgress) onProgress(100, finalDuration, finalDuration);
          resolve();
        } else {
          logger.error(`FFmpeg composition exited with code ${code}. Stderr: ${stderr.slice(-600)}`);
          reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr.slice(-300)}`));
        }
      });
      proc.on('error', reject);
    });

    // Clean up temporary image files
    try {
      fs.rmSync(tempJobDir, { recursive: true, force: true });
    } catch (e) {}

    // 4. Validate output video strictly
    const validation = videoValidator.validateVideo(finalVideoPath);
    if (!validation.isValid) {
      throw new Error(`Video composition completed but failed validation: ${validation.error}`);
    }

    logger.info(`Shorts video successfully created & validated: ${finalVideoPath} (${validation.metadata.duration}s, ${validation.metadata.sizeMb}MB)`);

    return {
      videoPath: finalVideoPath,
      videoId,
      metadata: validation.metadata
    };
  }
}

module.exports = new VideoComposer();
