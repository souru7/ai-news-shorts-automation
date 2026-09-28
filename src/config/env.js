require('dotenv').config();

const defaultAppUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://ai-news-shorts-automation.onrender.com';

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  APP_URL: defaultAppUrl.replace(/\/$/, ''),
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  // Admin credentials & auth
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@Secure2026!',
  JWT_SECRET: process.env.JWT_SECRET || 'yt-shorts-super-secret-jwt-key-2026',
  
  // Cron execution secret
  CRON_SECRET: process.env.CRON_SECRET || 'cron-secret-token-change-me',
  
  // Operation mode
  DRY_RUN: process.env.DRY_RUN === 'true',
  DAILY_QUOTA: parseInt(process.env.DAILY_QUOTA || '2', 10),
  
  // AI Provider (OpenAI / Compatible)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  
  // Text-To-Speech
  TTS_PROVIDER: process.env.TTS_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'edge'),
  TTS_VOICE: process.env.TTS_VOICE || 'en-US-ChristopherNeural',
  TTS_API_KEY: process.env.TTS_API_KEY || process.env.OPENAI_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
  
  // YouTube API
  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || '',
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || '',
  YOUTUBE_REDIRECT_URI: process.env.YOUTUBE_REDIRECT_URI || `${defaultAppUrl.replace(/\/$/, '')}/auth/youtube/callback`,
  YOUTUBE_REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN || '',
  YOUTUBE_PRIVACY_STATUS: process.env.YOUTUBE_PRIVACY_STATUS || 'public',
  YOUTUBE_TARGET_CHANNEL_ID: process.env.YOUTUBE_TARGET_CHANNEL_ID || 'UCje0Deygks4X5w1oCRB-lew',
  
  // Storage
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER || 'local',
  STORAGE_BUCKET: process.env.STORAGE_BUCKET || '',
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY || '',
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY || '',
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT || '',
  STORAGE_REGION: process.env.STORAGE_REGION || 'auto',
  
  // Research
  RESEARCH_API_KEY: process.env.RESEARCH_API_KEY || ''
};

// Validate environment variables without leaking secrets
function validateEnv() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.CRON_SECRET) missing.push('CRON_SECRET');
  if (!process.env.YOUTUBE_CLIENT_ID) missing.push('YOUTUBE_CLIENT_ID');
  if (!process.env.YOUTUBE_CLIENT_SECRET) missing.push('YOUTUBE_CLIENT_SECRET');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY (Using built-in AI script template generator)');

  if (missing.length > 0) {
    console.log('[CONFIG] Environment inspection:');
    missing.forEach(m => console.log(`  ⚠ Missing environment variable: ${m}`));
  }
}

validateEnv();

module.exports = env;
