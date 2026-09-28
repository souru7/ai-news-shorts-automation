const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

let pool = null;
let sqliteDb = null;
let isPostgres = false;

// Determine DB type
if (env.DATABASE_URL && (env.DATABASE_URL.startsWith('postgres://') || env.DATABASE_URL.startsWith('postgresql://'))) {
  isPostgres = true;
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000
  });
} else {
  isPostgres = false;
  const sqlite3 = require('sqlite3').verbose();
  const dbDir = path.join(__dirname, '../../storage');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbPath = path.join(dbDir, 'database.sqlite');
  sqliteDb = new sqlite3.Database(dbPath);
}

/**
 * Unified query method
 * In SQL queries, write PostgreSQL standard placeholders: $1, $2, $3...
 * If running on SQLite, it will automatically transform $1, $2 to ?
 */
async function query(sql, params = []) {
  if (isPostgres) {
    const client = await pool.connect();
    try {
      const res = await client.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount };
    } finally {
      client.release();
    }
  } else {
    return new Promise((resolve, reject) => {
      // Convert $1, $2 to ? for SQLite
      let sqliteSql = sql.replace(/\$\d+/g, '?');
      
      const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sqliteSql);
      if (isSelect) {
        sqliteDb.all(sqliteSql, params, (err, rows) => {
          if (err) return reject(err);
          resolve({ rows: rows || [], rowCount: rows ? rows.length : 0 });
        });
      } else {
        sqliteDb.run(sqliteSql, params, function (err) {
          if (err) return reject(err);
          resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
        });
      }
    });
  }
}

/**
 * Initialize tables & default admin user and settings
 */
async function initDatabase() {
  logger.info(`Initializing database (Engine: ${isPostgres ? 'PostgreSQL' : 'SQLite'})...`);

  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createVideosTable = `
    CREATE TABLE IF NOT EXISTS videos (
      id VARCHAR(64) PRIMARY KEY,
      topic TEXT NOT NULL,
      tool_name VARCHAR(255) NOT NULL,
      source_url TEXT,
      source_title TEXT,
      script TEXT NOT NULL,
      voice_file TEXT,
      video_file TEXT,
      thumbnail_file TEXT,
      title VARCHAR(255),
      description TEXT,
      tags TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      youtube_video_id VARCHAR(100),
      youtube_url TEXT,
      error_message TEXT,
      duration_seconds REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      uploaded_at TIMESTAMP
    );
  `;

  const createJobsTable = `
    CREATE TABLE IF NOT EXISTS jobs (
      id VARCHAR(64) PRIMARY KEY,
      job_type VARCHAR(50) NOT NULL DEFAULT 'generate_short',
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      video_id VARCHAR(64),
      payload TEXT
    );
  `;

  const createSettingsTable = `
    CREATE TABLE IF NOT EXISTS settings (
      id VARCHAR(64) PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createResearchTable = `
    CREATE TABLE IF NOT EXISTS research_sources (
      id VARCHAR(64) PRIMARY KEY,
      topic TEXT NOT NULL,
      tool_name VARCHAR(255),
      source_url TEXT UNIQUE,
      source_title TEXT,
      published_at TIMESTAMP,
      researched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      summary TEXT,
      status VARCHAR(50) DEFAULT 'unprocessed'
    );
  `;

  const createLogsTable = `
    CREATE TABLE IF NOT EXISTS logs (
      id VARCHAR(64) PRIMARY KEY,
      level VARCHAR(20) NOT NULL,
      message TEXT NOT NULL,
      meta TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await query(createUsersTable);
  await query(createVideosTable);
  await query(createJobsTable);
  await query(createSettingsTable);
  await query(createResearchTable);
  await query(createLogsTable);

  // Ensure admin user exists and synchronize password to env.ADMIN_PASSWORD or Admin@Secure2026!
  const targetAdminUser = env.ADMIN_USERNAME || 'admin';
  const targetPassword = env.ADMIN_PASSWORD || 'Admin@Secure2026!';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(targetPassword, salt);

  const existingUser = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [targetAdminUser]);
  if (existingUser.rows.length === 0) {
    await query(
      'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
      ['admin-user-id', targetAdminUser, hash]
    );
    logger.info(`Default admin account initialized: ${targetAdminUser}`);
  } else {
    // Keep password synchronized so the user can always log in
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, existingUser.rows[0].id]);
    logger.info(`Admin account credentials verified and synchronized: ${targetAdminUser}`);
  }

  // Seed default settings if not present
  const defaultSettings = [
    { key: 'daily_quota', value: String(env.DAILY_QUOTA) },
    { key: 'dry_run', value: String(env.DRY_RUN) },
    { key: 'tts_provider', value: env.TTS_PROVIDER },
    { key: 'tts_voice', value: env.TTS_VOICE },
    { key: 'youtube_privacy', value: env.YOUTUBE_PRIVACY_STATUS },
    { key: 'default_hashtags', value: '#AI #AITools #TechNews #ArtificialIntelligence #Shorts' }
  ];

  for (const s of defaultSettings) {
    const exists = await query('SELECT key FROM settings WHERE key = $1', [s.key]);
    if (exists.rows.length === 0) {
      await query(
        'INSERT INTO settings (id, key, value) VALUES ($1, $2, $3)',
        [`setting-${s.key}`, s.key, s.value]
      );
    }
  }

  logger.info('Database schema and initial settings ready.');
}

module.exports = {
  query,
  initDatabase,
  isPostgres: () => isPostgres
};
