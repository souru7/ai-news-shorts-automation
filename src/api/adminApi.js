const express = require('express');
const router = express.Router();
const db = require('../database/db');
const pipelineRunner = require('../services/scheduler/pipelineRunner');
const logger = require('../utils/logger');
const storageService = require('../services/storage/storageService');
const { requireAuth } = require('../auth/authMiddleware');

// Get overview statistics
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const todayStats = await pipelineRunner.getTodayStats();

    const totalsRes = await db.query(`
      SELECT 
        COUNT(*) as total_videos,
        COUNT(CASE WHEN status = 'uploaded' THEN 1 END) as total_uploaded,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_failed
      FROM videos
    `);

    const jobsRes = await db.query(`
      SELECT 
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs
      FROM jobs
    `);

    const lastUploadRes = await db.query(`
      SELECT uploaded_at, title, youtube_url 
      FROM videos 
      WHERE status = 'uploaded' 
      ORDER BY uploaded_at DESC 
      LIMIT 1
    `);

    res.json({
      today: todayStats,
      totals: totalsRes.rows[0],
      jobs: jobsRes.rows[0],
      lastUpload: lastUploadRes.rows[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get videos list
router.get('/videos', requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = (page - 1) * limit;

    const list = await db.query(`
      SELECT * FROM videos 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countRes = await db.query('SELECT COUNT(*) as count FROM videos');

    res.json({
      videos: list.rows,
      total: parseInt(countRes.rows[0].count, 10),
      page,
      limit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger instant Short generation
router.post('/generate-now', requireAuth, async (req, res) => {
  try {
    const isDryRun = req.body.isDryRun === true;
    logger.info(`Manual generation triggered by admin user (DryRun: ${isDryRun})`);

    // Run asynchronously so UI does not block, or synchronously if requested
    pipelineRunner.runPipeline({ force: true, isDryRun })
      .then(result => {
        logger.info('Manual pipeline generation finished successfully', { result });
      })
      .catch(err => {
        logger.error(`Manual pipeline generation failed: ${err.message}`);
      });

    res.json({
      success: true,
      message: 'Video generation started in background. Monitor status in the dashboard.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry a video
router.post('/retry/:videoId', requireAuth, async (req, res) => {
  try {
    pipelineRunner.retryVideo(req.params.videoId)
      .catch(err => logger.error(`Retry error: ${err.message}`));

    res.json({ success: true, message: 'Retry initiated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a video
router.delete('/videos/:videoId', requireAuth, async (req, res) => {
  try {
    const v = await db.query('SELECT * FROM videos WHERE id = $1', [req.params.videoId]);
    if (v.rows.length === 0) return res.status(404).json({ error: 'Video not found' });

    const vid = v.rows[0];
    if (vid.video_file) await storageService.deleteFile(vid.video_file);
    if (vid.voice_file) await storageService.deleteFile(vid.voice_file);

    await db.query('DELETE FROM videos WHERE id = $1', [req.params.videoId]);
    await db.query('DELETE FROM jobs WHERE video_id = $1', [req.params.videoId]);

    res.json({ success: true, message: 'Video deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Instantly publish an existing video to YouTube
router.post('/publish/:videoId', requireAuth, async (req, res) => {
  try {
    const vidRes = await db.query('SELECT * FROM videos WHERE id = $1', [req.params.videoId]);
    if (vidRes.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    const video = vidRes.rows[0];

    if (!video.video_file) {
      return res.status(400).json({ error: 'No video file has been generated for this item yet.' });
    }

    logger.info(`Manual upload to YouTube initiated for video: ${video.id} ("${video.title}")`);

    const youtubeService = require('../services/youtube/youtubeService');
    const parsedTags = Array.isArray(video.tags)
      ? video.tags
      : typeof video.tags === 'string' && video.tags.startsWith('[')
        ? JSON.parse(video.tags)
        : (video.tags || '').split(',');

    const uploadRes = await youtubeService.uploadShort({
      filePath: video.video_file,
      title: video.title || `${video.tool_name} #Shorts`,
      description: video.description || `${video.topic}\n\n#AI #Shorts`,
      tags: parsedTags,
      privacyStatus: 'public'
    });

    await db.query(
      `UPDATE videos 
       SET status = 'uploaded', youtube_video_id = $1, youtube_url = $2, uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $3`,
      [uploadRes.videoId, uploadRes.youtubeUrl, video.id]
    );

    res.json({
      success: true,
      message: 'Short successfully published to YouTube!',
      youtubeVideoId: uploadRes.videoId,
      youtubeUrl: uploadRes.youtubeUrl
    });
  } catch (err) {
    logger.error(`Manual publish error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Get settings
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const rows = await db.query('SELECT key, value FROM settings');
    const settings = {};
    rows.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save settings
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const allowedKeys = [
      'daily_quota', 'dry_run', 'tts_provider', 'tts_voice', 'youtube_privacy', 'default_hashtags',
      'youtube_client_id', 'youtube_client_secret', 'youtube_refresh_token', 'cron_secret'
    ];
    for (const [key, val] of Object.entries(req.body)) {
      if (allowedKeys.includes(key)) {
        await db.query(
          `INSERT INTO settings (id, key, value, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP`,
          [`setting-${key}`, key, String(val)]
        ).catch(async () => {
          // Fallback for SQLite upsert
          await db.query(`UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2`, [String(val), key]);
        });
      }
    }
    res.json({ success: true, message: 'Settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get logs
router.get('/logs', requireAuth, (req, res) => {
  res.json({ logs: logger.getRecentLogs() });
});

// Get research feeds
router.get('/research', requireAuth, async (req, res) => {
  try {
    const list = await db.query(`
      SELECT * FROM research_sources 
      ORDER BY published_at DESC, researched_at DESC 
      LIMIT 40
    `);
    res.json({ sources: list.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
