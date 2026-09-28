const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const db = require('./src/database/db');
const authService = require('./src/auth/authService');
const { requireAuth } = require('./src/auth/authMiddleware');

const cronRouter = require('./src/api/cron');
const youtubeRouter = require('./src/api/youtubeAuth');
const adminRouter = require('./src/api/adminApi');

const app = express();

// Security headers with relaxed CSP for dashboard video/audio previews and Google fonts
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Login rate limiter: relaxed for admin ease of use
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many login attempts. Please try again in a moment.' }
});

// Health check endpoint verifying application, database connection, and configuration
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      database: 'connected',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      env: env.NODE_ENV,
      storage: env.STORAGE_PROVIDER,
      configured: {
        youtubeOAuth: !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET),
        aiApiKey: !!env.OPENAI_API_KEY,
        cronSecret: !!env.CRON_SECRET
      }
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  }
});

// Serve generated media files
app.use('/media', express.static(path.join(__dirname, 'storage'), { index: false }));

// Serve static frontend assets (css, js, assets) with index: false to prevent bypassing auth
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Login API

// Form POST fallback login
app.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const { token } = await authService.login(username, password);

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.redirect("/");
  } catch (err) {
    res.redirect("/login?error=" + encodeURIComponent(err.message));
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const { token, user } = await authService.login(username, password);

    // Set secure HTTP-only cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({ success: true, token, user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Logout API
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Public Login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

// Strictly Protected Dashboard routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});

// Mount modular sub-routers
app.use('/api/cron', cronRouter);
app.use('/', youtubeRouter);
app.use('/api/admin', adminRouter);

// Start server after DB initialization
async function startServer() {
  try {
    await db.initDatabase();
    app.listen(env.PORT, () => {
      logger.info(`=================================================`);
      logger.info(`⚡ AI YouTube Shorts Automation Server is LIVE!`);
      logger.info(`🚀 Dashboard: http://localhost:${env.PORT}`);
      logger.info(`🔑 Cron Endpoint: POST http://localhost:${env.PORT}/api/cron/run`);
      logger.info(`📺 YouTube Connect: http://localhost:${env.PORT}/auth/youtube`);
      logger.info(`=================================================`);
    });
  } catch (err) {
    logger.error(`Server startup failed: ${err.message}`, { error: err.stack });
    process.exit(1);
  }
}

startServer();

module.exports = app;
