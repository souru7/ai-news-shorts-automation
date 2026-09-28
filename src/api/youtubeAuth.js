const express = require('express');
const router = express.Router();
const youtubeService = require('../services/youtube/youtubeService');
const logger = require('../utils/logger');
const { requireAuth } = require('../auth/authMiddleware');

// Step 1: Redirect to Google OAuth consent screen forcing account selection
router.get('/auth/youtube', async (req, res) => {
  try {
    const authUrl = await youtubeService.generateAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    logger.error(`Failed to initiate YouTube OAuth flow: ${err.message}`);
    res.status(500).send(`
      <html>
        <body style="background:#0f172a;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center;">
          <h2 style="color:#ef4444;">YouTube Authorization Error</h2>
          <p>${err.message}</p>
          <p>Please make sure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are configured.</p>
          <a href="/" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#38bdf8;color:#000;text-decoration:none;border-radius:8px;font-weight:bold;">Return to Dashboard</a>
        </body>
      </html>
    `);
  }
});

// Step 2: Google OAuth redirect callback with HARD channel verification
router.get('/auth/youtube/callback', async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    logger.warn(`User declined or Google OAuth returned error: ${error}`);
    return res.redirect(`/?youtube=error&msg=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/?youtube=error&msg=missing_code');
  }

  try {
    const { channel } = await youtubeService.handleAuthCallback(code);
    logger.info(`YouTube channel successfully verified and linked: ${channel.title} (${channel.id})`);
    return res.redirect(`/?youtube=connected&channel=${encodeURIComponent(channel.title)}&id=${encodeURIComponent(channel.id)}`);
  } catch (err) {
    logger.error(`YouTube OAuth channel verification rejected: ${err.message}`);
    const targetChannelId = await youtubeService.getTargetChannelId();

    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Wrong YouTube Channel Authorization</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            background: #090d16;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            box-sizing: border-box;
          }
          .card {
            background: rgba(30, 41, 59, 0.7);
            border: 1px solid #ef4444;
            border-radius: 16px;
            padding: 36px;
            max-width: 560px;
            width: 100%;
            box-shadow: 0 16px 48px rgba(239, 68, 68, 0.25);
          }
          h2 {
            color: #ef4444;
            margin-top: 0;
            font-size: 22px;
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .box {
            background: rgba(0, 0, 0, 0.45);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            padding: 18px;
            margin: 20px 0;
            font-size: 13px;
            line-height: 1.7;
            font-family: monospace;
            color: #fca5a5;
            white-space: pre-wrap;
          }
          .btn-primary {
            display: inline-block;
            padding: 12px 22px;
            background: #ef4444;
            color: #ffffff;
            font-weight: 700;
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
          }
          .btn-secondary {
            display: inline-block;
            padding: 12px 22px;
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            font-weight: 600;
            text-decoration: none;
            border-radius: 8px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ Wrong YouTube Channel Connected</h2>
          <p style="font-size: 14px; color: #cbd5e1; margin-bottom: 8px;">
            The Google account you selected is not authorized for target channel <b>${targetChannelId}</b>.
          </p>
          <div class="box">${err.message}</div>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
            To connect the target channel, please click <b>Connect Correct Account</b> below and choose the Google account (or Brand Account) that owns <b>${targetChannelId}</b>.
          </p>
          <div style="display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap;">
            <a href="/auth/youtube" class="btn-primary">Connect Correct Account</a>
            <a href="/" class="btn-secondary">Return to Dashboard</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
});

// Step 3: Get channel status
router.get('/api/youtube/status', async (req, res) => {
  try {
    const info = await youtubeService.getChannelInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ isConnected: false, error: err.message });
  }
});

// Step 4: Disconnect YouTube channel and clear tokens
router.post('/api/youtube/disconnect', requireAuth, async (req, res) => {
  try {
    const result = await youtubeService.disconnectYouTube();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Step 5: Test YouTube connection endpoint
router.get('/api/youtube/test-connection', requireAuth, async (req, res) => {
  try {
    const result = await youtubeService.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
