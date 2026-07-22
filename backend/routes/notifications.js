// =====================================================
// Notification Routes — Alerts + Flight Tracking
// =====================================================
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { query } = require('../database/db');
const { trimNotifications } = require('../services/notificationService');
const flightService = require('../services/flightService');

const router = express.Router();

// ── GET /api/notifications — User's notifications ──────────
router.get('/', authenticate, async (req, res) => {
  try {
    await trimNotifications(req.user.id);

    const { unread_only } = req.query;
    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    if (unread_only === 'true') sql += ' AND is_read = false';
    sql += ' ORDER BY created_at DESC LIMIT 20';

    const result = await query(sql, [req.user.id]);
    const unreadCount = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      notifications: result.rows,
      unreadCount: parseInt(unreadCount.rows[0]?.count || 0),
    });
  } catch (error) {
    console.error('[Notifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── PUT /api/notifications/:id/read ────────────────────────
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// ── PUT /api/notifications/read-all ────────────────────────
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

// ── DELETE /api/notifications/:id — Dismiss a notification ──
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Notification dismissed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss notification' });
  }
});

// ═════════════════════════════════════════════════════
// FLIGHT TRACKING — Personalized alerts per flight
// ═════════════════════════════════════════════════════

// ── POST /api/notifications/track — Track a flight ─────────
router.post('/track', authenticate, async (req, res) => {
  try {
    const { flight_iata } = req.body;
    if (!flight_iata || typeof flight_iata !== 'string') {
      return res.status(400).json({ error: 'flight_iata is required' });
    }

    const cleanIata = flight_iata.trim().toUpperCase().replace(/\s+/g, '');
    const today = new Date().toISOString().split('T')[0];

    // Look up the flight in current data to get details
    const flight = await flightService.searchFlight(cleanIata).catch(() => null);
    const airline = flight?.airline_name || '';
    const route = flight
      ? `${flight.departure_airport || '?'} → ${flight.arrival_airport || '?'}`
      : '';

    // Insert (ignore duplicates)
    await query(
      'INSERT OR IGNORE INTO tracked_flights (user_id, flight_iata, flight_date, airline_name, route) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, cleanIata, today, airline, route]
    );

    // Create an immediate notification confirming tracking
    await query(
      'INSERT INTO notifications (user_id, type, title, message, flight_iata, icon) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        req.user.id,
        'tracking',
        `Tracking ${cleanIata}`,
        flight
          ? `${airline} ${route} — ${flight.status || 'scheduled'}. You'll get alerts for delays, gate changes, and cancellations.`
          : `Now tracking ${cleanIata}. You'll get alerts when status updates are available.`,
        cleanIata,
        '📌',
      ]
    );

    res.json({
      message: 'Flight tracked',
      flight_iata: cleanIata,
      flight: flight ? {
        airline_name: airline,
        route,
        status: flight.status,
        departure_gate: flight.departure_gate,
        departure_terminal: flight.departure_terminal,
        delay_minutes: flight.delay_minutes || 0,
        scheduled_departure: flight.scheduled_departure,
        scheduled_arrival: flight.scheduled_arrival,
      } : null,
    });
  } catch (error) {
    console.error('[Track] Error:', error);
    res.status(500).json({ error: 'Failed to track flight' });
  }
});

// ── GET /api/notifications/tracked — User's tracked flights ──
router.get('/tracked', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM tracked_flights WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    // Enrich with live flight data
    const tracked = [];
    for (const t of result.rows) {
      const live = await flightService.searchFlight(t.flight_iata).catch(() => null);
      tracked.push({
        id: t.id,
        flight_iata: t.flight_iata,
        flight_date: t.flight_date,
        airline_name: live?.airline_name || t.airline_name || '',
        route: live ? `${live.departure_airport || '?'} → ${live.arrival_airport || '?'}` : (t.route || ''),
        status: live?.status || 'unknown',
        delay_minutes: live?.delay_minutes || 0,
        departure_gate: live?.departure_gate || null,
        departure_terminal: live?.departure_terminal || null,
        arrival_terminal: live?.arrival_terminal || null,
        scheduled_departure: live?.scheduled_departure || null,
        scheduled_arrival: live?.scheduled_arrival || null,
        estimated_departure: live?.estimated_departure || null,
      });
    }

    res.json({ tracked });
  } catch (error) {
    console.error('[Track] Error:', error);
    res.status(500).json({ error: 'Failed to fetch tracked flights' });
  }
});

// ── DELETE /api/notifications/track/:id — Stop tracking ────
router.delete('/track/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT flight_iata FROM tracked_flights WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    await query(
      'DELETE FROM tracked_flights WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    const iata = result.rows[0]?.flight_iata || '';
    res.json({ message: `Stopped tracking ${iata}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove tracked flight' });
  }
});

module.exports = router;
