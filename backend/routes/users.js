// =====================================================
// User Routes — Profile, preferences, dashboard
// =====================================================
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../database/db');

const router = express.Router();

// GET /api/users/profile — Get profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const result = query(
      'SELECT id, email, full_name, role, preferences, avatar_url, date_of_birth, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/users/profile — Update profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { full_name, avatar_url, date_of_birth } = req.body;
    query(
      'UPDATE users SET full_name = COALESCE(?, full_name), avatar_url = COALESCE(?, avatar_url), date_of_birth = COALESCE(?, date_of_birth) WHERE id = ?',
      [full_name || null, avatar_url || null, date_of_birth || null, req.user.id]
    );
    const result = query(
      'SELECT id, email, full_name, role, preferences, avatar_url, date_of_birth FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ user: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/users/preferences — Update preferences
router.put('/preferences', authenticate, async (req, res) => {
  try {
    const { preferences } = req.body;
    const current = await query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
    const existing = JSON.parse(current.rows[0]?.preferences || '{}');
    const merged = JSON.stringify({ ...existing, ...preferences });
    const result = await query(
      'UPDATE users SET preferences = $1 WHERE id = $2 RETURNING preferences',
      [merged, req.user.id]
    );
    res.json({ preferences: JSON.parse(result.rows[0]?.preferences || '{}') });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// GET /api/users/dashboard — User dashboard data
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const [savedFlights, notifications, chatHistory] = await Promise.all([
      query('SELECT * FROM saved_flights WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [req.user.id]),
      query('SELECT COUNT(*) as unread FROM notifications WHERE user_id = $1 AND is_read = false', [req.user.id]),
      query('SELECT COUNT(*) as total FROM chat_history WHERE user_id = $1', [req.user.id]),
    ]);

    res.json({
      savedFlights: savedFlights.rows,
      unreadNotifications: parseInt(notifications.rows[0].unread),
      totalChats: parseInt(chatHistory.rows[0].total),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

module.exports = router;
