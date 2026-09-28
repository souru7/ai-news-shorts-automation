const fs = require('fs');
const { google } = require('googleapis');
const env = require('../../config/env');
const db = require('../../database/db');
const logger = require('../../utils/logger');

class YouTubeService {
  constructor() {
    this.clientId = env.YOUTUBE_CLIENT_ID;
    this.clientSecret = env.YOUTUBE_CLIENT_SECRET;
    this.redirectUri = env.YOUTUBE_REDIRECT_URI || `${env.APP_URL}/auth/youtube/callback`;
  }

  /**
   * Get the strictly required target YouTube channel ID
   */
  async getTargetChannelId() {
    try {
      const row = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_target_channel_id']);
      if (row.rows.length > 0 && row.rows[0].value) {
        return row.rows[0].value.trim();
      }
    } catch (e) {}
    return (env.YOUTUBE_TARGET_CHANNEL_ID || 'UCje0Deygks4X5w1oCRB-lew').trim();
  }

  /**
   * Get client credentials from database settings or environment variables
   */
  async getClientCredentials() {
    let clientId = this.clientId || env.YOUTUBE_CLIENT_ID;
    let clientSecret = this.clientSecret || env.YOUTUBE_CLIENT_SECRET;

    // Automatically resolve production Render URL or configured APP_URL
    let baseUrl = process.env.RENDER_EXTERNAL_URL || env.APP_URL;
    if (!baseUrl || baseUrl.includes('localhost')) {
      baseUrl = 'https://ai-news-shorts-automation.onrender.com';
    }
    let redirectUri = `${baseUrl.replace(/\/$/, '')}/auth/youtube/callback`;

    try {
      const idSetting = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_client_id']);
      if (idSetting.rows.length > 0 && idSetting.rows[0].value) clientId = idSetting.rows[0].value.trim();

      const secretSetting = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_client_secret']);
      if (secretSetting.rows.length > 0 && secretSetting.rows[0].value) clientSecret = secretSetting.rows[0].value.trim();

      const uriSetting = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_redirect_uri']);
      if (uriSetting.rows.length > 0 && uriSetting.rows[0].value) redirectUri = uriSetting.rows[0].value.trim();
    } catch (e) {}

    return { clientId, clientSecret, redirectUri };
  }

  /**
   * Initialize OAuth2 client
   */
  async createOAuth2Client() {
    const creds = await this.getClientCredentials();
    if (!creds.clientId || !creds.clientSecret) {
      throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not configured. You can configure them in Dashboard Settings.');
    }
    return new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      creds.redirectUri
    );
  }

  /**
   * Get refresh token from database settings or env
   */
  async getRefreshToken() {
    try {
      const res = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_refresh_token']);
      if (res.rows.length > 0 && res.rows[0].value) {
        return res.rows[0].value.trim();
      }
    } catch (err) {
      logger.warn(`Could not read youtube_refresh_token from database: ${err.message}`);
    }

    if (env.YOUTUBE_REFRESH_TOKEN) {
      return env.YOUTUBE_REFRESH_TOKEN.trim();
    }
    return null;
  }

  /**
   * Save refresh token securely to database settings
   */
  async saveRefreshToken(refreshToken) {
    try {
      await db.query(
        `INSERT INTO settings (id, key, value, updated_at)
         VALUES ('setting-youtube-refresh-token', 'youtube_refresh_token', $1, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [refreshToken]
      ).catch(async () => {
        await db.query("UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'youtube_refresh_token'", [refreshToken]);
      });
      logger.info('Persisted authorized YouTube refresh token to database.');
    } catch (err) {
      logger.error(`Failed to persist refresh token to database: ${err.message}`);
      throw err;
    }
  }

  /**
   * Disconnect YouTube channel and wipe stored tokens
   */
  async disconnectYouTube() {
    try {
      await db.query(
        "DELETE FROM settings WHERE key IN ('youtube_refresh_token', 'youtube_channel_id', 'youtube_channel_title')"
      );
      logger.info('YouTube connection disconnected. Stored tokens cleared.');
      return { success: true, message: 'YouTube channel disconnected successfully.' };
    } catch (err) {
      logger.error(`Failed to disconnect YouTube channel: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate Google OAuth consent URL forcing account selection
   */
  async generateAuthUrl() {
    const oauth2Client = await this.createOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent',
      include_granted_scopes: true,
      scope: scopes
    });
  }

  /**
   * Handle authorization code exchange in OAuth callback with HARD channel verification
   */
  async handleAuthCallback(code) {
    const oauth2Client = await this.createOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Call channels.list(mine=true) IMMEDIATELY before saving tokens!
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const res = await youtube.channels.list({
      part: ['snippet,statistics'],
      mine: true
    });

    const channel = res.data.items?.[0];
    if (!channel) {
      throw new Error('No YouTube channel found for the authenticated Google account.');
    }

    const authenticatedChannelId = channel.id;
    const targetChannelId = await this.getTargetChannelId();

    logger.info(`OAuth account authenticated. Detected channel: "${channel.snippet.title}" (${authenticatedChannelId}). Required target: ${targetChannelId}`);

    // HARD VERIFICATION: Reject if authenticated channel does not match target
    if (authenticatedChannelId !== targetChannelId) {
      const errorMsg = `Wrong YouTube channel!\n\nThe Google account selected is connected to:\nChannel: "${channel.snippet.title}"\nChannel ID: ${authenticatedChannelId}\n\nThis application strictly requires target channel:\nTarget Channel ID: ${targetChannelId}\n\nPlease connect the correct Google/YouTube account (or choose the corresponding Brand Account).`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Save refresh token only after channel ID verification succeeds
    if (tokens.refresh_token) {
      await this.saveRefreshToken(tokens.refresh_token);
    } else {
      logger.warn('Google did not return a new refresh token (consent previously granted). Preserving existing token.');
    }

    // Save channel metadata in database settings
    await db.query(`
      INSERT INTO settings (id, key, value, updated_at)
      VALUES ('setting-youtube-channel-id', 'youtube_channel_id', $1, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
    `, [authenticatedChannelId]).catch(async () => {
      await db.query("UPDATE settings SET value = $1 WHERE key = 'youtube_channel_id'", [authenticatedChannelId]);
    });

    await db.query(`
      INSERT INTO settings (id, key, value, updated_at)
      VALUES ('setting-youtube-channel-title', 'youtube_channel_title', $1, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
    `, [channel.snippet.title]).catch(async () => {
      await db.query("UPDATE settings SET value = $1 WHERE key = 'youtube_channel_title'", [channel.snippet.title]);
    });

    logger.info(`Successfully verified and linked target YouTube channel: "${channel.snippet.title}" (${authenticatedChannelId})`);
    return {
      tokens,
      channel: {
        id: channel.id,
        title: channel.snippet.title,
        thumbnail: channel.snippet.thumbnails?.default?.url
      }
    };
  }

  /**
   * Get an authorized YouTube client instance
   */
  async getAuthorizedYouTubeClient() {
    const oauth2Client = await this.createOAuth2Client();
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('YouTube channel is not connected. Please authorize via the Admin Dashboard.');
    }

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.youtube({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Get authorized YouTube channel info and verify match against target channel
   */
  async getChannelInfo() {
    const targetChannelId = await this.getTargetChannelId();
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        return {
          isConnected: false,
          isTargetChannel: false,
          targetChannelId,
          channelId: null,
          title: 'Not Connected',
          error: 'No active OAuth connection. Please connect your YouTube channel.'
        };
      }

      const youtube = await this.getAuthorizedYouTubeClient();
      const res = await youtube.channels.list({
        part: ['snippet,statistics'],
        mine: true
      });

      const channel = res.data.items?.[0];
      if (!channel) {
        return {
          isConnected: false,
          isTargetChannel: false,
          targetChannelId,
          channelId: null,
          title: 'Unknown',
          error: 'No channel found for authenticated account'
        };
      }

      const isTarget = channel.id === targetChannelId;

      return {
        isConnected: isTarget,
        isWrongChannel: !isTarget,
        channelId: channel.id,
        targetChannelId,
        title: channel.snippet.title,
        customUrl: channel.snippet.customUrl,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount || '0',
        videoCount: channel.statistics?.videoCount || '0',
        error: !isTarget 
          ? `Connected channel (${channel.snippet.title} - ${channel.id}) does not match target (${targetChannelId})` 
          : null
      };
    } catch (err) {
      return {
        isConnected: false,
        isTargetChannel: false,
        targetChannelId,
        channelId: null,
        error: err.message
      };
    }
  }

  /**
   * Explicit connection test for admin button
   */
  async testConnection() {
    const targetChannelId = await this.getTargetChannelId();
    const info = await this.getChannelInfo();

    if (!info.isConnected) {
      if (info.isWrongChannel) {
        return {
          isCorrect: false,
          channelId: info.channelId,
          targetChannelId,
          title: info.title,
          message: `✗ Wrong YouTube channel! Authenticated channel "${info.title}" (${info.channelId}) does not match required target (${targetChannelId}). Uploads are blocked.`
        };
      }
      return {
        isCorrect: false,
        channelId: null,
        targetChannelId,
        message: `✗ YouTube channel is not connected: ${info.error || 'Missing OAuth credentials'}`
      };
    }

    return {
      isCorrect: true,
      channelId: info.channelId,
      targetChannelId,
      title: info.title,
      subscriberCount: info.subscriberCount,
      videoCount: info.videoCount,
      message: `✓ YouTube connection verified! Authenticated channel "${info.title}" matches required target (${targetChannelId}). Ready for uploads.`
    };
  }

  /**
   * Upload video to YouTube Shorts with HARD pre-upload channel verification
   * @param {object} params - { filePath, title, description, tags, privacyStatus }
   * @returns {Promise<{videoId: string, youtubeUrl: string}>}
   */
  async uploadShort({ filePath, title, description, tags, privacyStatus }) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot upload video. File not found: ${filePath}`);
    }

    // 1. HARD PRE-UPLOAD SAFETY CHECK
    const targetChannelId = await this.getTargetChannelId();
    const channelInfo = await this.getChannelInfo();

    if (!channelInfo.isConnected || channelInfo.channelId !== targetChannelId) {
      const errDetail = `Upload blocked! Authenticated channel (${channelInfo.channelId || 'none'}) does not match required target channel (${targetChannelId}). Upload aborted for safety.`;
      logger.error(errDetail);
      throw new Error(errDetail);
    }

    logger.info(`Starting verified YouTube Shorts upload to "${channelInfo.title}" (${targetChannelId}): "${title}"...`);
    const youtube = await this.getAuthorizedYouTubeClient();

    // Ensure #Shorts is present in title for YouTube Shorts indexing
    const shortsTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;
    const privacy = privacyStatus || env.YOUTUBE_PRIVACY_STATUS || 'public';

    try {
      const res = await youtube.videos.insert({
        part: ['snippet,status'],
        requestBody: {
          snippet: {
            title: shortsTitle.slice(0, 100),
            description: description || '',
            tags: tags || ['AI', 'Tech', 'Shorts'],
            categoryId: '28' // Science & Technology
          },
          status: {
            privacyStatus: privacy,
            selfDeclaredMadeForKids: false
          }
        },
        media: {
          body: fs.createReadStream(filePath)
        }
      });

      const videoId = res.data.id;
      const youtubeUrl = `https://youtube.com/shorts/${videoId}`;

      logger.info(`YouTube Shorts upload complete! Video ID: ${videoId}, URL: ${youtubeUrl}`);
      return {
        videoId,
        youtubeUrl
      };
    } catch (err) {
      logger.error(`YouTube upload failed: ${err.message}`, { error: err.stack });
      if (err.message && err.message.includes('quotaExceeded')) {
        throw new Error('YouTube API upload quota exceeded for today. Please wait until quota resets.');
      }
      throw err;
    }
  }
}

module.exports = new YouTubeService();
