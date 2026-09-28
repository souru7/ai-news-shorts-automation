const fs = require('fs');
const { google } = require('googleapis');
const env = require('../../config/env');
const db = require('../../database/db');
const logger = require('../../utils/logger');

class YouTubeService {
  constructor() {
    this.clientId = env.YOUTUBE_CLIENT_ID;
    this.clientSecret = env.YOUTUBE_CLIENT_SECRET;
    this.redirectUri = env.YOUTUBE_REDIRECT_URI;
  }

  /**
   * Initialize OAuth2 client
   */
  createOAuth2Client() {
    if (!this.clientId || !this.clientSecret) {
      return null;
    }
    return new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );
  }

  /**
   * Get refresh token from env or database settings
   */
  async getRefreshToken() {
    if (env.YOUTUBE_REFRESH_TOKEN) {
      return env.YOUTUBE_REFRESH_TOKEN;
    }
    try {
      const res = await db.query('SELECT value FROM settings WHERE key = $1', ['youtube_refresh_token']);
      if (res.rows.length > 0 && res.rows[0].value) {
        return res.rows[0].value;
      }
    } catch (err) {
      logger.warn(`Could not read youtube_refresh_token from database: ${err.message}`);
    }
    return null;
  }

  /**
   * Save refresh token securely to database settings
   */
  async saveRefreshToken(refreshToken) {
    try {
      const exists = await db.query('SELECT id FROM settings WHERE key = $1', ['youtube_refresh_token']);
      if (exists.rows.length > 0) {
        await db.query(
          'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
          [refreshToken, 'youtube_refresh_token']
        );
      } else {
        await db.query(
          'INSERT INTO settings (id, key, value) VALUES ($1, $2, $3)',
          ['setting-youtube-refresh-token', 'youtube_refresh_token', refreshToken]
        );
      }
      logger.info('Saved YouTube OAuth refresh token to settings.');
    } catch (err) {
      logger.error(`Failed to persist refresh token to database: ${err.message}`);
    }
  }

  /**
   * Generate OAuth URL for channel authorization
   */
  generateAuthUrl() {
    const oauth2Client = this.createOAuth2Client();
    if (!oauth2Client) {
      throw new Error('YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are not configured.');
    }

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes
    });
  }

  /**
   * Handle authorization code exchange in OAuth callback
   */
  async handleAuthCallback(code) {
    const oauth2Client = this.createOAuth2Client();
    if (!oauth2Client) {
      throw new Error('OAuth client credentials not configured.');
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (tokens.refresh_token) {
      await this.saveRefreshToken(tokens.refresh_token);
    } else {
      logger.warn('Google did not return a new refresh token (consent may have been previously granted).');
    }

    return tokens;
  }

  /**
   * Get an authorized YouTube client instance
   */
  async getAuthorizedYouTubeClient() {
    const oauth2Client = this.createOAuth2Client();
    if (!oauth2Client) {
      throw new Error('YouTube OAuth credentials not configured in environment.');
    }

    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('YouTube channel is not yet connected. Please authorize via the Admin Dashboard.');
    }

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return google.youtube({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Get authorized YouTube channel info for dashboard
   */
  async getChannelInfo() {
    try {
      const youtube = await this.getAuthorizedYouTubeClient();
      const res = await youtube.channels.list({
        part: ['snippet,statistics'],
        mine: true
      });

      const channel = res.data.items?.[0];
      if (!channel) {
        return { isConnected: false, error: 'No channel found for authenticated account' };
      }

      return {
        isConnected: true,
        channelId: channel.id,
        title: channel.snippet.title,
        customUrl: channel.snippet.customUrl,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount || '0',
        videoCount: channel.statistics?.videoCount || '0'
      };
    } catch (err) {
      return {
        isConnected: false,
        error: err.message
      };
    }
  }

  /**
   * Upload video to YouTube Shorts
   * @param {object} params - { filePath, title, description, tags, privacyStatus }
   * @returns {Promise<{videoId: string, youtubeUrl: string}>}
   */
  async uploadShort({ filePath, title, description, tags, privacyStatus }) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot upload video. File not found: ${filePath}`);
    }

    logger.info(`Starting YouTube Shorts upload: "${title}"...`);
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
