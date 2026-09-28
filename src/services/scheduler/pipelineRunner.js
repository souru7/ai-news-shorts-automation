const crypto = require('crypto');
const db = require('../../database/db');
const logger = require('../../utils/logger');
const env = require('../../config/env');
const researchService = require('../research/researchService');
const scriptGenerator = require('../ai/scriptGenerator');
const ttsService = require('../tts/ttsService');
const captionGenerator = require('../captions/captionGenerator');
const videoComposer = require('../video/videoComposer');
const videoValidator = require('../video/videoValidator');
const youtubeService = require('../youtube/youtubeService');
const storageService = require('../storage/storageService');

class PipelineRunner {
  /**
   * Get today's date string in specific timezone (default Asia/Kolkata)
   */
  getTodayDateString(timezone = 'Asia/Kolkata') {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    } catch (e) {
      return new Date().toISOString().split('T')[0];
    }
  }

  /**
   * Check how many Shorts have been generated/uploaded today using configured timezone
   */
  async getTodayStats() {
    let timezone = 'Asia/Kolkata';
    try {
      const tzRow = await db.query('SELECT value FROM settings WHERE key = $1', ['timezone']);
      if (tzRow.rows.length > 0 && tzRow.rows[0].value) timezone = tzRow.rows[0].value;
    } catch (e) {}

    const todayStr = this.getTodayDateString(timezone);
    const queryStr = db.isPostgres()
      ? `SELECT 
           COUNT(CASE WHEN status IN ('uploaded', 'dry_run_completed', 'ready') THEN 1 END) as generated_today,
           COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as uploaded_today,
           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_today,
           COUNT(CASE WHEN status IN ('pending', 'running', 'video_generating', 'researching', 'script_generated', 'voice_generated', 'uploading') THEN 1 END) as pending_today
         FROM videos 
         WHERE (created_at AT TIME ZONE $1)::date = ($2)::date`
      : `SELECT 
           COUNT(CASE WHEN status IN ('uploaded', 'dry_run_completed', 'ready') THEN 1 END) as generated_today,
           COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as uploaded_today,
           COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_today,
           COUNT(CASE WHEN status IN ('pending', 'running', 'video_generating', 'researching', 'script_generated', 'voice_generated', 'uploading') THEN 1 END) as pending_today
         FROM videos 
         WHERE DATE(created_at) = DATE($1)`;

    const queryParams = db.isPostgres() ? [timezone, todayStr] : [todayStr];
    const res = await db.query(queryStr, queryParams);
    const generated = parseInt(res.rows[0]?.generated_today || '0', 10);
    const uploaded = parseInt(res.rows[0]?.uploaded_today || '0', 10);
    const failed = parseInt(res.rows[0]?.failed_today || '0', 10);
    const pending = parseInt(res.rows[0]?.pending_today || '0', 10);

    // Get quota setting
    let quota = env.DAILY_QUOTA;
    try {
      const quotaSetting = await db.query('SELECT value FROM settings WHERE key = $1', ['daily_quota']);
      if (quotaSetting.rows.length > 0) {
        quota = parseInt(quotaSetting.rows[0].value, 10) || quota;
      }
    } catch (e) {}

    return {
      date: todayStr,
      timezone,
      generatedToday: generated,
      uploadedToday: uploaded,
      failedToday: failed,
      pendingToday: pending,
      quota,
      isQuotaMet: generated >= quota
    };
  }

  /**
   * Check if another job is currently active to prevent race conditions
   */
  async isJobRunning() {
    const timeClause = db.isPostgres()
      ? "started_at > NOW() - INTERVAL '30 minutes'"
      : "started_at > datetime('now', '-30 minutes')";
    const res = await db.query(
      `SELECT id, status, started_at FROM jobs 
       WHERE status = 'running' 
       AND ${timeClause}`
    );
    return res.rows.length > 0;
  }

  /**
   * Main automation trigger function
   * @param {object} options - { force: boolean, isDryRun: boolean }
   */
  async runPipeline(options = {}) {
    const jobId = `job-${crypto.randomUUID()}`;
    logger.info(`Starting Shorts automation pipeline (Job: ${jobId})...`);

    // 1. Quota Check
    const todayStats = await this.getTodayStats();
    if (todayStats.isQuotaMet && !options.force) {
      const msg = `Daily quota reached for today (${todayStats.generatedToday}/${todayStats.quota} Shorts completed). Stopping gracefully.`;
      logger.info(msg);
      return {
        status: 'quota_reached',
        message: msg,
        todayStats
      };
    }

    // 2. Concurrency Lock
    const alreadyRunning = await this.isJobRunning();
    if (alreadyRunning && !options.force) {
      const msg = 'Another video automation job is currently running. Skipping to prevent duplicate work.';
      logger.warn(msg);
      return { status: 'already_running', message: msg };
    }

    // 3. Register Job in Database
    await db.query(
      `INSERT INTO jobs (id, job_type, status, step, progress, stage_message, scheduled_at, started_at, retry_count)
       VALUES ($1, 'generate_short', 'running', 'initializing', 5, 'Initializing Shorts automation...', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)`,
      [jobId]
    );

    let videoId = `vid-${crypto.randomUUID()}`;

    try {
      // 4. State Recovery: Check if there's an existing 'ready' video that wasn't uploaded due to a restart
      const pendingUpload = await db.query(
        `SELECT * FROM videos WHERE status = 'ready' ORDER BY created_at DESC LIMIT 1`
      );

      let videoRecord;
      if (pendingUpload.rows.length > 0 && !options.forceNew) {
        videoRecord = pendingUpload.rows[0];
        videoId = videoRecord.id;
        logger.info(`Resuming previously generated video ready for upload: ${videoRecord.id} (${videoRecord.tool_name})`);
        await db.updateJobProgress(jobId, 90, 'resuming', `Resuming ready video: ${videoRecord.tool_name}`);
      } else {
        // 5. Topic Research & Selection
        logger.info('Selecting fresh AI topic...');
        await db.updateJobProgress(jobId, 15, 'researching', 'Discovering trending AI tools & AI updates...');
        const selectedTopic = await researchService.selectNextTopic();

        // Insert initial video record
        await db.query(
          `INSERT INTO videos 
           (id, topic, tool_name, source_url, source_title, script, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, '', 'researching', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [videoId, selectedTopic.topic, selectedTopic.tool_name, selectedTopic.source_url, selectedTopic.source_title]
        );

        // 6. Script Generation
        await db.updateJobProgress(jobId, 35, 'scripting', `Generating engaging script for ${selectedTopic.tool_name}...`);
        const script = await scriptGenerator.generateScript(selectedTopic);
        await db.query(
          `UPDATE videos SET script = $1, status = 'script_generated', updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [script, videoId]
        );

        // 7. Voiceover Generation (TTS)
        await db.updateJobProgress(jobId, 55, 'voicing', `Generating neural AI voiceover (${selectedTopic.tool_name})...`);
        const voiceResult = await ttsService.generateSpeech(script);
        await db.query(
          `UPDATE videos SET voice_file = $1, duration_seconds = $2, status = 'voice_generated', updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [voiceResult.audioPath, voiceResult.duration, videoId]
        );

        // 8. Timed Captions Generation
        await db.updateJobProgress(jobId, 65, 'captions', 'Calculating animated subtitle timing...');
        const timedChunks = captionGenerator.calculateTiming(
          captionGenerator.chunkScript(script),
          voiceResult.duration
        );

        // 9. Video Composition (1080x1920 9:16)
        await db.updateJobProgress(jobId, 70, 'rendering', 'Starting 1080x1920 vertical video composition in FFmpeg...');
        await db.query(
          `UPDATE videos SET status = 'video_generating', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [videoId]
        );

        const videoResult = await videoComposer.composeVideo({
          tool_name: selectedTopic.tool_name,
          topic: selectedTopic.topic,
          script,
          audioPath: voiceResult.audioPath,
          audioDuration: voiceResult.duration,
          timedChunks,
          onProgress: (pct, sec, dur) => {
            const scaledProgress = 70 + Math.round(pct * 0.2); // scales 70% to 90%
            db.updateJobProgress(
              jobId,
              scaledProgress,
              'rendering',
              `Encoding 9:16 video: ${pct}% (${sec.toFixed(1)}s / ${dur.toFixed(1)}s)`
            );
          }
        });

        // 10. Save to Storage (S3 / Local)
        await db.updateJobProgress(jobId, 90, 'saving', 'Saving media files to storage...');
        const storageAudio = await storageService.saveFile(
          voiceResult.audioPath,
          `audio/${videoId}.mp3`,
          'audio/mpeg'
        );
        const storageVideo = await storageService.saveFile(
          videoResult.videoPath,
          `videos/${videoId}.mp4`,
          'video/mp4'
        );

        // 11. Generate YouTube Metadata & Validation
        await db.updateJobProgress(jobId, 93, 'metadata', 'Generating SEO title, description, and hashtags...');
        const metadata = await scriptGenerator.generateMetadata(selectedTopic, script);

        await db.query(
          `UPDATE videos 
           SET video_file = $1, voice_file = $2, title = $3, description = $4, tags = $5, status = 'ready', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $6`,
          [
            storageVideo.localPath,
            storageAudio.localPath,
            metadata.title,
            metadata.description,
            JSON.stringify(metadata.tags),
            videoId
          ]
        );

        videoRecord = (await db.query('SELECT * FROM videos WHERE id = $1', [videoId])).rows[0];
      }

      // Link Video ID to Job
      await db.query('UPDATE jobs SET video_id = $1 WHERE id = $2', [videoId, jobId]);

      // 12. Check Dry-Run Mode
      const isDryRun = options.isDryRun !== undefined ? options.isDryRun : env.DRY_RUN;
      if (isDryRun) {
        logger.info(`DRY_RUN enabled. Video is validated and saved. Skipping YouTube upload.`);
        await db.query(
          `UPDATE videos SET status = 'dry_run_completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [videoId]
        );
        await db.updateJobProgress(jobId, 100, 'completed', 'Short generated successfully (Dry Run). Ready to preview.');
        await db.query(
          `UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [jobId]
        );

        return {
          status: 'success',
          isDryRun: true,
          videoId,
          videoRecord: (await db.query('SELECT * FROM videos WHERE id = $1', [videoId])).rows[0]
        };
      }

      // 13. YouTube Upload
      logger.info(`Uploading Short to YouTube...`);
      await db.updateJobProgress(jobId, 96, 'uploading', 'Uploading Short directly to YouTube channel...');
      await db.query(
        `UPDATE videos SET status = 'uploading', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [videoId]
      );

      const parsedTags = Array.isArray(videoRecord.tags)
        ? videoRecord.tags
        : typeof videoRecord.tags === 'string' && videoRecord.tags.startsWith('[')
          ? JSON.parse(videoRecord.tags)
          : (videoRecord.tags || '').split(',');

      const ytUpload = await youtubeService.uploadShort({
        filePath: videoRecord.video_file,
        title: videoRecord.title,
        description: videoRecord.description,
        tags: parsedTags,
        privacyStatus: (await db.query("SELECT value FROM settings WHERE key = 'youtube_privacy'")).rows[0]?.value || env.YOUTUBE_PRIVACY_STATUS || "public"
      });

      // 14. Mark as Uploaded
      await db.query(
        `UPDATE videos 
         SET status = 'uploaded', youtube_video_id = $1, youtube_url = $2, uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [ytUpload.videoId, ytUpload.youtubeUrl, videoId]
      );

      await db.updateJobProgress(jobId, 100, 'completed', `Published live to YouTube Shorts: ${ytUpload.youtubeUrl}`);
      await db.query(
        `UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [jobId]
      );

      logger.info(`Short successfully published to YouTube! ${ytUpload.youtubeUrl}`);

      return {
        status: 'success',
        videoId,
        youtubeVideoId: ytUpload.videoId,
        youtubeUrl: ytUpload.youtubeUrl
      };
    } catch (err) {
      logger.error(`Pipeline failure for Job ${jobId}: ${err.message}`, { error: err.stack });

      // Record error on video and job
      const isBlockedWrongChannel = err.message && (err.message.includes('Upload blocked') || err.message.includes('Wrong YouTube channel'));
      const videoStatus = isBlockedWrongChannel ? 'blocked_wrong_channel' : 'failed';
      const stageText = isBlockedWrongChannel ? 'Blocked: Authenticated channel does not match target' : `Failed: ${err.message}`;

      await db.updateJobProgress(jobId, 0, videoStatus, stageText);
      await db.query(
        `UPDATE videos SET status = $1, error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [videoStatus, err.message, videoId]
      );

      await db.query(
        `UPDATE jobs SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [err.message, jobId]
      );

      throw err;
    }
  }

  /**
   * Retry a failed video or job
   */
  async retryVideo(videoId) {
    logger.info(`Retrying video processing for ${videoId}...`);
    const vid = await db.query('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (vid.rows.length === 0) throw new Error('Video not found');

    const v = vid.rows[0];

    // If video file already exists and is valid, attempt upload directly
    if (v.video_file && videoValidator.validateVideo(v.video_file).isValid) {
      await db.query(`UPDATE videos SET status = 'ready', error_message = NULL WHERE id = $1`, [videoId]);
      return this.runPipeline({ force: true });
    }

    // Otherwise reset status to pending and re-run
    await db.query(`UPDATE videos SET status = 'pending', error_message = NULL WHERE id = $1`, [videoId]);
    return this.runPipeline({ force: true, forceNew: true });
  }
}

module.exports = new PipelineRunner();
