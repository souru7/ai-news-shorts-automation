const express = require('express');
const router = express.Router();
const youtubeService = require('../services/youtube/youtubeService');
const logger = require('../utils/logger');

// Step 1: Redirect to Google OAuth consent screen
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
          <p>Please make sure YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are configured in your environment or Render dashboard.</p>
          <a href="/" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#38bdf8;color:#000;text-decoration:none;border-radius:8px;font-weight:bold;">Return to Dashboard</a>
        </body>
      </html>
    `);
  }
});

// Step 2: Google OAuth redirect callback
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
    await youtubeService.handleAuthCallback(code);
    logger.info('YouTube channel successfully linked via OAuth2!');
    return res.redirect('/?youtube=connected');
  } catch (err) {
    logger.error(`YouTube OAuth token exchange failed: ${err.message}`);
    return res.redirect(`/?youtube=error&msg=${encodeURIComponent(err.message)}`);
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

module.exports = router;
