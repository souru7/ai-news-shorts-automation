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

  /**
   * Render static graphic header card (Tool name, glowing badge, channel watermark)
   */
  renderHeaderCard(toolName, topicSummary) {
    const canvas = createCanvas(1080, 1920);
    const ctx = canvas.getContext('2d');

    // 1. Top Glowing Cyber Badge
    const badgeY = 160;
    const badgeText = '⚡ DAILY AI UPDATE';
    ctx.font = 'bold 32px sans-serif';
    const textWidth = ctx.measureText(badgeText).width;
    const badgeW = textWidth + 60;
    const badgeX = (1080 - badgeW) / 2;

    // Badge background pill
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    this.drawRoundedRect(ctx, badgeX, badgeY, badgeW, 60, 30);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, 1080 / 2, badgeY + 30);

    // 2. Large AI Tool Title Card
    const cardY = 260;
    const cardW = 960;
    const cardH = 220;
    const cardX = (1080 - cardW) / 2;

    // Glassmorphism card background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Decorative gradient accent line at top of card
    const grad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.5, '#818cf8');
    grad.addColorStop(1, '#c084fc');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, cardY + 2);
    ctx.lineTo(cardX + cardW - 40, cardY + 2);
    ctx.stroke();

    // Tool Name Text (Auto-scaling font size)
    const displayTool = (toolName || 'AI REVOLUTION').toUpperCase();
    let fontSize = 68;
    ctx.font = `900 ${fontSize}px sans-serif`;
    while (ctx.measureText(displayTool).width > cardW - 80 && fontSize > 36) {
      fontSize -= 4;
      ctx.font = `900 ${fontSize}px sans-serif`;
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(displayTool, 1080 / 2, cardY + 90);

    // Subtitle category inside card
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = '#94a3b8';
    const subText = 'VERIFIED AI TOOL • NEW CAPABILITIES';
    ctx.fillText(subText, 1080 / 2, cardY + 160);

    // 3. Bottom Safe Area Callout (above YouTube Shorts navigation)
    const footerY = 1720;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText('🔔 SUBSCRIBE FOR 2 DAILY AI SHORTS', 1080 / 2, footerY);

    const outPath = path.join(this.tempDir, `header_${crypto.randomUUID()}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    return outPath;
  }

  /**
   * Render individual high-contrast animated caption card for a timed chunk
   */
  renderCaptionCard(text, isHighlight = false) {
    const canvas = createCanvas(1080, 1920);
    const ctx = canvas.getContext('2d');

    const cleanText = text.toUpperCase().trim();
    const cardY = 1100;
    const cardW = 940;
    const cardX = (1080 - cardW) / 2;

    // Multi-line word wrapping if needed
    let fontSize = isHighlight ? 72 : 66;
    ctx.font = `900 ${fontSize}px sans-serif`;

    const lines = this.wrapText(ctx, cleanText, cardW - 100);
    const lineHeight = fontSize + 20;
    const cardH = (lines.length * lineHeight) + 70;

    // Glassmorphic dark card with neon border
    ctx.fillStyle = 'rgba(10, 15, 29, 0.90)';
    this.drawRoundedRect(ctx, cardX, cardY - 20, cardW, cardH, 28);
    ctx.fill();

    ctx.strokeStyle = isHighlight ? '#38bdf8' : 'rgba(255, 230, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw caption lines
    lines.forEach((line, idx) => {
      const y = cardY + 50 + (idx * lineHeight);

      // Black text stroke for 100% legibility on any background
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.strokeText(line, 1080 / 2, y);

      // Glowing text fill (Yellow or White)
      ctx.fillStyle = isHighlight ? '#38bdf8' : '#FFE600';
      ctx.fillText(line, 1080 / 2, y);
    });

    const outPath = path.join(this.tempDir, `caption_${crypto.randomUUID()}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    return outPath;
  }

  /**
   * Helper to wrap text into lines fitting max width
   */
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
   * Compose the final YouTube Shorts video
   */
  async composeVideo({ tool_name, topic, script, audioPath, audioDuration, timedChunks, onProgress }) {
    // Strictly cap video duration to <= 29.5s
    const finalDuration = Math.min(Math.max(audioDuration, 5.0), 29.5);
    logger.info(`Composing YouTube Shorts video (${finalDuration.toFixed(1)}s, 1080x1920)...`);

    const videoId = crypto.randomUUID();
    const finalVideoPath = path.join(this.outputDir, `short_${videoId}.mp4`);

    // 1. Render Header overlay
    const headerImgPath = this.renderHeaderCard(tool_name, topic);

    // 2. Render each timed caption chunk as an image card
    const captionCards = timedChunks.map((chunk, i) => {
      const isHighlight = i % 2 === 1;
      const imgPath = this.renderCaptionCard(chunk.text, isHighlight);
      return {
        imgPath,
        start: chunk.start,
        end: Math.min(chunk.end, finalDuration)
      };
    });

    // 3. Build FFmpeg command with filter complex
    // Inputs:
    // [0]: Animated gradient/cyber background
    // [1]: Audio voiceover
    // [2]: Header overlay
    // [3..N+2]: Caption chunk images
    const ffmpegArgs = [
      '-y',
      // Base background: 1080x1920 30fps dark navy gradient with subtle tech motion
      '-f', 'lavfi',
      '-i', `gradients=s=1080x1920:r=30:d=${finalDuration}:c0=0x060913:c1=0x0f172a:c2=0x1e1b4b:x0=0:y0=0:x1=1080:y1=1920`,
      // Voiceover audio
      '-i', audioPath,
      // Header overlay image
      '-loop', '1', '-t', `${finalDuration}`, '-i', headerImgPath
    ];

    // Add each caption image as looped input
    for (const card of captionCards) {
      ffmpegArgs.push('-loop', '1', '-t', `${finalDuration}`, '-i', card.imgPath);
    }

    // Build filter_complex
    // Base: overlay header on background, plus dynamic progress bar at bottom
    let filterGraph = `[0:v][2:v]overlay=0:0[v_base];`;
    filterGraph += `[v_base]drawbox=x=0:y=1880:w='1080*t/${finalDuration}':h=14:color=0x38bdf8@0.95:t=fill[v_prog];`;

    let lastStream = 'v_prog';
    captionCards.forEach((card, idx) => {
      const inputIdx = 3 + idx;
      const outStream = `v_cap_${idx}`;
      filterGraph += `[${lastStream}][${inputIdx}:v]overlay=0:0:enable='between(t,${card.start.toFixed(2)},${card.end.toFixed(2)})'[${outStream}];`;
      lastStream = outStream;
    });

    // Strip trailing semicolon from filter graph
    filterGraph = filterGraph.replace(/;$/, '');

    ffmpegArgs.push(
      '-filter_complex', filterGraph,
      '-map', `[${lastStream}]`,
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-t', `${finalDuration}`,
      '-movflags', '+faststart',
      finalVideoPath
    );

    await new Promise((resolve, reject) => {
      logger.info(`Starting FFmpeg video composition process using: ${ffmpegBin}...`);
      const proc = spawn(ffmpegBin, ffmpegArgs);

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
      if (fs.existsSync(headerImgPath)) fs.unlinkSync(headerImgPath);
      for (const card of captionCards) {
        if (fs.existsSync(card.imgPath)) fs.unlinkSync(card.imgPath);
      }
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
