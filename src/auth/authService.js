const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const env = require('../config/env');
const logger = require('../utils/logger');

class AuthService {
  async login(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    // Check if user exists
    let res = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    
    // Auto-create/repair admin user if missing
    if (res.rows.length === 0 && (cleanUsername.toLowerCase() === 'admin' || cleanUsername === env.ADMIN_USERNAME)) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('Admin@Secure2026!', salt);
      await db.query(
        'INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)',
        ['admin-user-id', cleanUsername, hash]
      );
      res = await db.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [cleanUsername]);
    }

    if (res.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = res.rows[0];
    let isMatch = await bcrypt.compare(cleanPassword, user.password_hash);

    // Fallback master password check: if entered password matches Admin@Secure2026! or env.ADMIN_PASSWORD
    if (!isMatch && (cleanPassword === 'Admin@Secure2026!' || cleanPassword === env.ADMIN_PASSWORD)) {
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(cleanPassword, salt);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
      isMatch = true;
    }

    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      env.JWT_SECRET || 'yt-shorts-super-secret-jwt-key-2026',
      { expiresIn: '7d' }
    );

    logger.info(`Admin user "${user.username}" logged in successfully.`);
    return { token, user: { id: user.id, username: user.username } };
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return null;
    }
  }

  async updatePassword(userId, newPassword) {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    logger.info(`Password updated for user ${userId}`);
  }
}

module.exports = new AuthService();
