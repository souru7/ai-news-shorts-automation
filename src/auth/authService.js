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

    const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (res.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = res.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    logger.info(`Admin user "${username}" logged in successfully.`);
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
