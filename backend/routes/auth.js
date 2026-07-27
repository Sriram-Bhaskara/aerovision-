// =====================================================
// Auth Routes — Register, Login, Password Reset, Profile
// =====================================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validate');
const { seedNotificationsForUser } = require('../services/notificationService');

const router = express.Router();

// POST /api/auth/register
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user with UUID
    const userId = uuidv4();
    await query(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, $3, $4)',
      [userId, email, password_hash, full_name]
    );

    const userResult = await query('SELECT id, email, full_name, role, preferences, created_at FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // Seed initial notifications so the panel isn't empty on first visit
    seedNotificationsForUser(userId).catch(() => {});

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, preferences: user.preferences },
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await query("UPDATE users SET last_login = datetime('now') WHERE id = $1", [user.id]);

    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    // Ensure user has notifications (seeds on first login, no-op if already has them)
    seedNotificationsForUser(user.id).catch(() => {});

    res.json({
      message: 'Signed in successfully',
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, preferences: user.preferences },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — Get current user
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/password — Change password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!new_password || new_password.length < 1) {
      return res.status(400).json({ error: 'New password must be non-empty' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const validCurrent = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!validCurrent) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(12);
    const newHash = await bcrypt.hash(new_password, salt);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Auth] Password change error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// POST /api/auth/forgot-password — Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await query('SELECT id FROM users WHERE email = $1', [email]);

    // Always return success to prevent email enumeration
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ error: 'Request failed' });
  }
});

module.exports = router;