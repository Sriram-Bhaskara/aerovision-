// =====================================================
// Notification Service — Smart alerts + Flight Tracking
// Generates curated + personalized alerts from live data
// =====================================================
const { query } = require('../database/db');
const flightService = require('./flightService');
const weatherService = require('./weatherService');
const crowdService   = require('./crowdService');

// Track events we've already notified — prevents duplicates
const _notified = new Set();

// Per-cycle caps so we never flood the panel
const CYCLE_CAPS = {
  delay:        3,
  gate:         3,
  cancellation: 2,
  landed:       2,
  weather:      1,
  crowd:        1,
};

// ── Snapshot of last-known status per tracked flight (for change detection) ──
const _trackedSnapshot = new Map();  // key: `${userId}:${flightIata}` → { status, gate, delay, terminal }

/**
 * Generate notifications for all users based on current airport conditions.
 * Called periodically (every 5 min) from the cron cycle.
 */
async function generateNotifications(io) {
  try {
    await generateFlightAlerts(io);
    await generateTrackedFlightAlerts(io);
    await generateWeatherAlerts(io);
    await generateCrowdAlerts(io);
  } catch (err) {
    console.error('[NotifService] Error:', err.message);
  }
}

// ── Flight-based alerts (selective, for all users) ─────────

async function generateFlightAlerts(io) {
  const [depData, arrData] = await Promise.all([
    flightService.getFlights('departure'),
    flightService.getFlights('arrival'),
  ]);

  const deps = depData.flights || [];
  const arrs = arrData.flights || [];
  const now  = Date.now();

  const counts = { delay: 0, gate: 0, cancellation: 0, landed: 0 };

  // 1. Delays (worst first)
  const delayed = [...deps, ...arrs]
    .filter(f => f.delay_minutes >= 15)
    .sort((a, b) => b.delay_minutes - a.delay_minutes);

  for (const f of delayed) {
    if (counts.delay >= CYCLE_CAPS.delay) break;
    const key = `delay:${f.flight_iata}:${Math.floor(f.delay_minutes / 10) * 10}`;
    if (_notified.has(key)) continue;
    _notified.add(key);
    counts.delay++;

    const newTime = f.estimated_departure
      ? new Date(f.estimated_departure).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
      : '—';
    await broadcastNotification(io, {
      type: 'delay',
      title: `Delay — ${f.flight_iata}`,
      message: `${f.airline_name || 'Flight'} delayed ${f.delay_minutes} min. New: ${newTime} IST`,
      icon: '⏱',
      flight_iata: f.flight_iata,
    });
  }

  // 2. Cancellations
  const cancelled = [...deps, ...arrs].filter(f => f.status === 'cancelled');
  for (const f of cancelled) {
    if (counts.cancellation >= CYCLE_CAPS.cancellation) break;
    const key = `cancel:${f.flight_iata}`;
    if (_notified.has(key)) continue;
    _notified.add(key);
    counts.cancellation++;

    await broadcastNotification(io, {
      type: 'cancellation',
      title: `Cancelled — ${f.flight_iata}`,
      message: `${f.airline_name || 'Flight'} ${f.flight_iata} has been cancelled`,
      icon: '❌',
      flight_iata: f.flight_iata,
    });
  }

  // 3. Gate alerts (departing in next 90 min)
  const soonDeps = deps
    .filter(f => {
      if (!f.departure_gate || f.status !== 'scheduled') return false;
      const depMs = new Date(f.scheduled_departure || 0).getTime();
      return depMs > now && depMs - now < 90 * 60 * 1000;
    })
    .sort((a, b) => new Date(a.scheduled_departure || 0).getTime() - new Date(b.scheduled_departure || 0).getTime());

  for (const f of soonDeps) {
    if (counts.gate >= CYCLE_CAPS.gate) break;
    const key = `gate:${f.flight_iata}:${f.departure_gate}`;
    if (_notified.has(key)) continue;
    _notified.add(key);
    counts.gate++;

    await broadcastNotification(io, {
      type: 'gate',
      title: `Gate Assigned — ${f.flight_iata}`,
      message: `Gate ${f.departure_gate} at ${f.departure_terminal || 'Terminal'}. Boarding soon.`,
      icon: '🚪',
      flight_iata: f.flight_iata,
    });
  }

  // 4. Landings (last 15 min)
  const recentLandings = arrs
    .filter(f => {
      if (f.status !== 'landed') return false;
      const arr = new Date(f.estimated_arrival || f.scheduled_arrival || 0).getTime();
      return now - arr < 15 * 60 * 1000;
    })
    .sort((a, b) => {
      const ta = new Date(a.estimated_arrival || a.scheduled_arrival || 0).getTime();
      const tb = new Date(b.estimated_arrival || b.scheduled_arrival || 0).getTime();
      return tb - ta;
    });

  for (const f of recentLandings) {
    if (counts.landed >= CYCLE_CAPS.landed) break;
    const key = `landed:${f.flight_iata}`;
    if (_notified.has(key)) continue;
    _notified.add(key);
    counts.landed++;

    await broadcastNotification(io, {
      type: 'landed',
      title: `Landed — ${f.flight_iata}`,
      message: `${f.airline_name || 'Flight'} arrived at ${f.arrival_terminal || 'BLR'}`,
      icon: '✅',
      flight_iata: f.flight_iata,
    });
  }
}

// ═════════════════════════════════════════════════════
// TRACKED FLIGHT ALERTS — Personalized per-user
// Detects changes in status, gate, delay, and crowd
// ═════════════════════════════════════════════════════

async function generateTrackedFlightAlerts(io) {
  try {
    const tracked = await query('SELECT * FROM tracked_flights');
    if (!tracked.rows || tracked.rows.length === 0) return;

    // Pre-fetch crowd data for gate-area crowd alerts
    const crowdData = await crowdService.getCrowdDensity().catch(() => null);

    for (const t of tracked.rows) {
      const flight = await flightService.searchFlight(t.flight_iata).catch(() => null);
      if (!flight) continue;

      const snapKey = `${t.user_id}:${t.flight_iata}`;
      const prev = _trackedSnapshot.get(snapKey) || {};
      const curr = {
        status: flight.status,
        gate: flight.departure_gate || flight.arrival_gate || null,
        delay: flight.delay_minutes || 0,
        terminal: flight.departure_terminal || flight.arrival_terminal || null,
      };

      // ── Status change ──
      if (prev.status && prev.status !== curr.status) {
        const statusLabels = {
          scheduled: 'Scheduled',
          active: 'In Flight',
          landed: 'Landed',
          cancelled: 'Cancelled',
          delayed: 'Delayed',
          boarding: 'Boarding',
        };
        const label = statusLabels[curr.status] || curr.status;
        const icons = { cancelled: '❌', landed: '✅', active: '✈', delayed: '⏱', boarding: '🚶' };

        await sendUserNotification(io, t.user_id, {
          type: 'tracked_status',
          title: `${t.flight_iata} — ${label}`,
          message: `Your tracked flight status changed: ${statusLabels[prev.status] || prev.status} → ${label}`,
          icon: icons[curr.status] || '📌',
          flight_iata: t.flight_iata,
        });
      }

      // ── New gate assignment or gate change ──
      if (curr.gate && prev.gate !== curr.gate) {
        await sendUserNotification(io, t.user_id, {
          type: 'tracked_gate',
          title: `${t.flight_iata} — Gate ${curr.gate}`,
          message: prev.gate
            ? `Gate changed from ${prev.gate} to ${curr.gate} at ${curr.terminal || 'Terminal'}`
            : `Gate ${curr.gate} assigned at ${curr.terminal || 'Terminal'}`,
          icon: '🚪',
          flight_iata: t.flight_iata,
        });
      }

      // ── Delay increase (every 10 min step) ──
      const prevBucket = Math.floor((prev.delay || 0) / 10) * 10;
      const currBucket = Math.floor(curr.delay / 10) * 10;
      if (curr.delay >= 10 && currBucket > prevBucket) {
        const newTime = flight.estimated_departure
          ? new Date(flight.estimated_departure).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
          : '—';
        await sendUserNotification(io, t.user_id, {
          type: 'tracked_delay',
          title: `${t.flight_iata} — Delayed +${curr.delay}min`,
          message: `Now delayed by ${curr.delay} minutes. Est: ${newTime} IST`,
          icon: '⏱',
          flight_iata: t.flight_iata,
        });
      }

      // ── Crowd near gate/terminal ──
      if (crowdData?.zones && curr.terminal) {
        const termZones = crowdData.zones.filter(z =>
          z.terminal === curr.terminal && z.level === 'high'
        );
        if (termZones.length > 0) {
          const crowdKey = `tcrowd:${t.user_id}:${t.flight_iata}:${new Date().getHours()}`;
          if (!_notified.has(crowdKey)) {
            _notified.add(crowdKey);
            const busiest = termZones.sort((a, b) => b.density_percent - a.density_percent)[0];
            await sendUserNotification(io, t.user_id, {
              type: 'tracked_crowd',
              title: `${t.flight_iata} — Crowded at ${curr.terminal}`,
              message: `${busiest.zone_name}: ${busiest.density_percent}% density, ~${busiest.estimated_wait_minutes}min wait. Plan extra time.`,
              icon: '🚶',
              flight_iata: t.flight_iata,
            });
          }
        }
      }

      // Update snapshot
      _trackedSnapshot.set(snapKey, curr);
    }
  } catch (err) {
    console.error('[NotifService] Tracked alert error:', err.message);
  }
}

/**
 * Send notification to a specific user only (for tracked flights).
 */
async function sendUserNotification(io, userId, { type, title, message, icon, flight_iata }) {
  try {
    await query(
      'INSERT INTO notifications (user_id, type, title, message, flight_iata, icon) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, type, title, message, flight_iata || null, icon || '📌']
    );
  } catch (e) {
    console.error('[NotifService] DB save error:', e.message);
  }

  // Emit to specific user's socket room
  if (io) {
    io.to(`user:${userId}`).emit('notification', {
      type, title, message, icon, flight_iata,
      tracked: true,
      created_at: new Date().toISOString(),
    });
    // Also emit globally (the socket listener in Navbar filters by user)
    io.emit('notification:user:' + userId, {
      type, title, message, icon, flight_iata,
      tracked: true,
      created_at: new Date().toISOString(),
    });
  }

  console.log(`[NotifService] 📌 ${title} (user: ${userId.substring(0, 8)}...)`);
}

// ── Weather-based alerts ────────────────────────────────

async function generateWeatherAlerts(io) {
  try {
    const weather = await weatherService.getWeather();
    if (!weather || !weather.main) return;

    const desc = (weather.weather?.[0]?.main || '').toLowerCase();
    const wind = weather.wind?.speed || 0;
    const vis  = weather.visibility ?? 10000;

    if (desc.includes('thunder') || desc.includes('storm')) {
      const key = 'weather:storm:' + new Date().getHours();
      if (!_notified.has(key)) {
        _notified.add(key);
        await broadcastNotification(io, {
          type: 'weather',
          title: 'Thunderstorm Advisory',
          message: 'Storm activity near BLR. Possible delays for departures.',
          icon: '⛈',
        });
      }
    } else if (wind > 12) {
      const key = 'weather:wind:' + new Date().getHours();
      if (!_notified.has(key)) {
        _notified.add(key);
        await broadcastNotification(io, {
          type: 'weather',
          title: 'Wind Advisory',
          message: `Strong winds at ${Math.round(wind * 3.6)} km/h near BLR`,
          icon: '🌬',
        });
      }
    } else if (vis < 3000) {
      const key = 'weather:vis:' + new Date().getHours();
      if (!_notified.has(key)) {
        _notified.add(key);
        await broadcastNotification(io, {
          type: 'weather',
          title: 'Low Visibility Alert',
          message: `Visibility at ${(vis / 1000).toFixed(1)} km — expect delays`,
          icon: '🌫',
        });
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

// ── Crowd-based alerts ──────────────────────────────────

async function generateCrowdAlerts(io) {
  try {
    const data = await crowdService.getCrowdDensity();
    if (!data || !data.zones) return;

    const highZones = data.zones.filter(z => z.level === 'high');
    if (highZones.length >= 3) {
      const key = 'crowd:high:' + new Date().getHours();
      if (!_notified.has(key)) {
        _notified.add(key);
        const busiest = highZones.sort((a, b) => b.density_percent - a.density_percent)[0];
        await broadcastNotification(io, {
          type: 'crowd',
          title: 'High Congestion Alert',
          message: `${highZones.length} zones crowded. ${busiest.zone_name}: ${busiest.density_percent}%`,
          icon: '🚶',
        });
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

// ── Persist + push helper (broadcast to all) ───────────

async function broadcastNotification(io, { type, title, message, icon, flight_iata }) {
  try {
    const users = await query('SELECT id FROM users');
    for (const user of (users.rows || [])) {
      await query(
        'INSERT INTO notifications (user_id, type, title, message, flight_iata, icon) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, type, title, message, flight_iata || null, icon || '🔔']
      );
    }
  } catch (e) {
    console.error('[NotifService] DB save error:', e.message);
  }

  if (io) {
    io.emit('notification', { type, title, message, icon, flight_iata, created_at: new Date().toISOString() });
  }

  console.log(`[NotifService] ${icon} ${title}`);
}

/**
 * Seed curated notifications so the panel isn't empty on first visit.
 */
async function seedNotificationsForUser(userId) {
  try {
    const count = await query('SELECT COUNT(*) as count FROM notifications WHERE user_id = $1', [userId]);
    if (parseInt(count.rows[0]?.count || 0) > 0) return;

    const [depData, arrData] = await Promise.all([
      flightService.getFlights('departure'),
      flightService.getFlights('arrival'),
    ]);

    const deps = depData.flights || [];
    const arrs = arrData.flights || [];
    const seeds = [];

    // 1. Delay alert
    const delayed = [...deps, ...arrs].find(f => f.delay_minutes > 0);
    if (delayed) {
      seeds.push({
        type: 'delay', icon: '⏱',
        title: `Delay — ${delayed.flight_iata}`,
        message: `${delayed.airline_name || 'Flight'} delayed ${delayed.delay_minutes} min`,
        flight_iata: delayed.flight_iata,
      });
    }

    // 2. Gate assignment
    const nextGated = deps.find(f => f.departure_gate && f.status === 'scheduled');
    if (nextGated) {
      seeds.push({
        type: 'gate', icon: '🚪',
        title: `Gate Assigned — ${nextGated.flight_iata}`,
        message: `Gate ${nextGated.departure_gate} at ${nextGated.departure_terminal || 'Terminal'}`,
        flight_iata: nextGated.flight_iata,
      });
    }

    // 3. Landing
    const landed = arrs.find(f => f.status === 'landed');
    if (landed) {
      seeds.push({
        type: 'landed', icon: '✅',
        title: `Landed — ${landed.flight_iata}`,
        message: `${landed.airline_name || 'Flight'} arrived at ${landed.arrival_terminal || 'BLR'}`,
        flight_iata: landed.flight_iata,
      });
    }

    // 4. Airport status
    const totalFlights = deps.length + arrs.length;
    const delayedCount = [...deps, ...arrs].filter(f => f.delay_minutes > 0).length;
    seeds.push({
      type: 'info', icon: '📊',
      title: 'Airport Status — BLR',
      message: `Tracking ${totalFlights} flights. ${delayedCount} delayed, ${deps.filter(f => f.status === 'active').length} in flight.`,
    });

    // 5. Welcome
    seeds.push({
      type: 'system', icon: '✈',
      title: 'Welcome to AeroVision',
      message: 'Real-time flight tracking, crowd analytics, and AI assistant for BLR airport.',
    });

    for (const s of seeds.reverse()) {
      await query(
        'INSERT INTO notifications (user_id, type, title, message, flight_iata, icon) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, s.type, s.title, s.message, s.flight_iata || null, s.icon]
      );
    }

    console.log(`[NotifService] Seeded ${seeds.length} notifications for user ${userId}`);
  } catch (e) {
    console.error('[NotifService] Seed error:', e.message);
  }
}

// Prune dedup cache every 6 hours
setInterval(() => {
  if (_notified.size > 200) {
    _notified.clear();
    console.log('[NotifService] Cleared dedup cache');
  }
}, 6 * 60 * 60 * 1000);

/**
 * Keep only the most recent 20 notifications per user.
 */
async function trimNotifications(userId) {
  try {
    const cutoff = await query(
      'SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 OFFSET 20',
      [userId]
    );
    if (cutoff.rows.length > 0) {
      await query(
        'DELETE FROM notifications WHERE user_id = $1 AND id <= $2',
        [userId, cutoff.rows[0].id]
      );
    }
  } catch (e) {
    // Non-fatal
  }
}

module.exports = { generateNotifications, seedNotificationsForUser, trimNotifications };
