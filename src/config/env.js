require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  APP_URL: (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, ''),
  
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
  YOUTUBE_REDIRECT_URI: process.env.YOUTUBE_REDIRECT_URI || `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/auth/youtube/callback`,
  YOUTUBE_REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN || '',
  YOUTUBE_PRIVACY_STATUS: process.env.YOUTUBE_PRIVACY_STATUS || 'public',
  
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

module.exports = env;
