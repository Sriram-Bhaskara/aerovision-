// =====================================================
// Analytics Routes — Crowd, Stats, Admin Dashboard
// =====================================================
const express = require('express');
const crowdService = require('../services/crowdService');
const { query }    = require('../database/db');

const router = express.Router();

// GET /api/analytics/crowd — Get crowd density for all zones
router.get('/crowd', async (req, res) => {
  try {
    const terminal = req.query.terminal || null;
    const data = await crowdService.getCrowdDensity(terminal);
    res.json(data);
  } catch (error) {
    console.error('[Analytics] Crowd error:', error);
    res.status(500).json({ error: 'Failed to get crowd data' });
  }
});

// GET /api/analytics/admin — Aggregate stats for the Admin Analytics Dashboard
router.get('/admin', async (req, res) => {
  try {
    // ── DB counts (synchronous sql.js wrapped in try-catch) ──────────────
    let usersCount             = 0;
    let notificationsTodayCount = 0;
    let trackedCount           = 0;
    let assistCount            = 0;
    let mobilityBookings       = [];
    let notifByType            = [];
    let recentNotifications    = [];

    try {
      const r = query('SELECT COUNT(*) as cnt FROM users');
      usersCount = r.rows[0]?.cnt ?? 0;
    } catch (_) {}

    try {
      const r = query("SELECT COUNT(*) as cnt FROM notifications WHERE created_at >= datetime('now', '-24 hours')");
      notificationsTodayCount = r.rows[0]?.cnt ?? 0;
    } catch (_) {}

    try {
      const r = query('SELECT COUNT(*) as cnt FROM tracked_flights');
      trackedCount = r.rows[0]?.cnt ?? 0;
    } catch (_) {}

    try {
      const r = query('SELECT COUNT(*) as cnt FROM assist_verifications');
      assistCount = r.rows[0]?.cnt ?? 0;
    } catch (_) {}

    try {
      const r = query('SELECT status, COUNT(*) as cnt FROM mobility_bookings GROUP BY status');
      mobilityBookings = r.rows || [];
    } catch (_) {}

    try {
      const r = query("SELECT type, COUNT(*) as cnt FROM notifications GROUP BY type ORDER BY cnt DESC LIMIT 6");
      notifByType = r.rows || [];
    } catch (_) {}

    try {
      const r = query("SELECT type, title, message, icon, created_at FROM notifications ORDER BY created_at DESC LIMIT 10");
      recentNotifications = r.rows || [];
    } catch (_) {}

    // ── Live flight board stats ──────────────────────────────────────────
    const flightService = require('../services/flightService');
    let departures = [];
    let arrivals   = [];

    try {
      const depData = await flightService.getFlights('departure', {});
      departures = depData.flights || [];
    } catch (_) {}

    try {
      const arrData = await flightService.getFlights('arrival', {});
      arrivals = arrData.flights || [];
    } catch (_) {}

    const countByStatus = (flights) =>
      flights.reduce((acc, f) => {
        if (f.status) acc[f.status] = (acc[f.status] || 0) + 1;
        return acc;
      }, {});

    // Top airlines from combined board
    const all = [...departures, ...arrivals];
    const airlineCounts = all.reduce((acc, f) => {
      const name = f.airline_name || f.airline_iata;
      if (name) acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});
    const topAirlines = Object.entries(airlineCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    // ── Crowd data ───────────────────────────────────────────────────────
    let crowd = [];
    try {
      const crowdData = await crowdService.getCrowdDensity(null);
      // getCrowdDensity returns { zones, gate_congestion, meta } — extract zones array
      crowd = Array.isArray(crowdData) ? crowdData : (crowdData?.zones || []);
    } catch (_) {}

    res.json({
      users:               usersCount,
      notificationsToday:  notificationsTodayCount,
      trackedFlights:      trackedCount,
      assistVerifications: assistCount,
      mobilityBookings,
      notifByType,
      recentNotifications,
      flights: {
        departures: { total: departures.length, byStatus: countByStatus(departures) },
        arrivals:   { total: arrivals.length,   byStatus: countByStatus(arrivals)   },
      },
      topAirlines,
      crowd,
    });
  } catch (error) {
    console.error('[Analytics] Admin stats error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

module.exports = router;
