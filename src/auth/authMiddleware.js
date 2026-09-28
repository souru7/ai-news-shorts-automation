const authService = require('./authService');
const env = require('../config/env');
const logger = require('../utils/logger');

function requireAuth(req, res, next) {
  // Check cookie or Authorization header
  let token = req.cookies?.auth_token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  const isApiRequest = req.path.startsWith('/api') || req.originalUrl.startsWith('/api');

  if (!token) {
    if (isApiRequest || !req.accepts('html')) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    return res.redirect('/login');
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    if (isApiRequest || !req.accepts('html')) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }
    return res.redirect('/login');
  }

  req.user = payload;
  next();
}

async function requireCronSecret(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const headerSecret = req.headers['x-cron-secret'];
  const querySecret = req.query.secret || req.query.key;

  const providedSecret = token || headerSecret || querySecret;

  let expectedSecret = env.CRON_SECRET;
  try {
    const db = require('../database/db');
    const row = await db.query('SELECT value FROM settings WHERE key = $1', ['cron_secret']);
    if (row.rows.length > 0 && row.rows[0].value) {
      expectedSecret = row.rows[0].value;
    }
  } catch (e) {}

  if (!providedSecret || (providedSecret !== expectedSecret && providedSecret !== env.CRON_SECRET)) {
    logger.warn('Unauthorized cron request attempt blocked');
    return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' });
  }

  next();
}

module.exports = {
  requireAuth,
  requireCronSecret
};
