// =====================================================
// Gate Watcher — Dedicated real-time gate change monitor
// Runs every 2 minutes; persists last_known_gate to DB
// so changes survive server restarts.
//
// Why gate changes happen:
//  • Airport operations reassign gates due to aircraft swaps,
//    maintenance holds, conflict with a delayed inbound flight,
//    or terminal congestion.
//  • Gate changes within 90 min of departure are most urgent.
// =====================================================
const { query } = require('../database/db');
const flightService = require('./flightService');

// Dedup set — prevents sending the same alert twice in one run
const _alerted = new Set();

/**
 * Start the gate watcher.
 * @param {import('socket.io').Server} io  — Socket.IO server instance
 * @returns {NodeJS.Timeout} interval handle (call clearInterval to stop)
 */
function startGateWatcher(io) {
  const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  async function tick() {
    try {
      await checkGateChanges(io);
    } catch (err) {
      console.error('[GateWatcher] Error:', err.message);
    }
  }

  // Run once immediately, then on interval
  tick();
  return setInterval(tick, INTERVAL_MS);
}

async function checkGateChanges(io) {
  // Load all tracked flights
  const result = await query(`
    SELECT id, user_id, flight_iata, flight_date,
           last_known_gate, last_known_status, last_known_delay
    FROM tracked_flights
  `).catch(() => ({ rows: [] }));

  const rows = result.rows || [];
  if (rows.length === 0) return;

  console.log(`[GateWatcher] Checking ${rows.length} tracked flight(s)…`);

  for (const row of rows) {
    try {
      // Fetch current flight data
      const flight = await flightService.searchFlight(row.flight_iata).catch(() => null);
      if (!flight) continue;

      const currentGate   = flight.departure_gate || flight.arrival_gate   || null;
      const currentStatus = flight.status || 'scheduled';
      const currentDelay  = flight.delay_minutes || 0;
      const terminal      = flight.departure_terminal || flight.arrival_terminal || 'Terminal';

      const prevGate   = row.last_known_gate   || null;
      const prevStatus = row.last_known_status  || null;
      const prevDelay  = row.last_known_delay   || 0;

      // ── Gate change / new gate assignment ─────────────
      if (currentGate && currentGate !== prevGate) {
        const alertKey = `gate:${row.user_id}:${row.flight_iata}:${currentGate}`;
        if (!_alerted.has(alertKey)) {
          _alerted.add(alertKey);

          const isChange = !!prevGate;
          await _sendAlert(io, row.user_id, {
            type:  isChange ? 'gate_change' : 'gate_assigned',
            title: isChange
              ? `⚠️ Gate Change — ${row.flight_iata}`
              : `🚪 Gate Assigned — ${row.flight_iata}`,
            message: isChange
              ? `Gate changed from ${prevGate} → ${currentGate} at ${terminal}. Update your boarding pass.`
              : `Gate ${currentGate} assigned at ${terminal}. Check your boarding pass.`,
            icon:       '🚪',
            flight_iata: row.flight_iata,
          });
        }
      }

      // ── Status change ──────────────────────────────────
      if (prevStatus && prevStatus !== currentStatus) {
        const alertKey = `status:${row.user_id}:${row.flight_iata}:${currentStatus}`;
        if (!_alerted.has(alertKey)) {
          _alerted.add(alertKey);

          const STATUS_LABELS = {
            scheduled: 'Scheduled', active: 'In Flight',
            landed: 'Landed', cancelled: 'Cancelled', delayed: 'Delayed',
          };
          const STATUS_ICONS  = {
            active: '✈', landed: '✅', cancelled: '❌', delayed: '⏱',
          };

          await _sendAlert(io, row.user_id, {
            type: 'status_change',
            title: `${row.flight_iata} — ${STATUS_LABELS[currentStatus] || currentStatus}`,
            message: `Flight status: ${STATUS_LABELS[prevStatus] || prevStatus} → ${STATUS_LABELS[currentStatus] || currentStatus}`,
            icon: STATUS_ICONS[currentStatus] || '📌',
            flight_iata: row.flight_iata,
          });
        }
      }

      // ── Significant delay increase (every 10-min bucket) ─
      const prevBucket = Math.floor(prevDelay  / 10) * 10;
      const currBucket = Math.floor(currentDelay / 10) * 10;
      if (currentDelay >= 10 && currBucket > prevBucket) {
        const alertKey = `delay:${row.user_id}:${row.flight_iata}:${currBucket}`;
        if (!_alerted.has(alertKey)) {
          _alerted.add(alertKey);

          const newETA = flight.estimated_departure
            ? new Date(flight.estimated_departure).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
              })
            : '—';

          await _sendAlert(io, row.user_id, {
            type: 'delay_update',
            title: `⏱ ${row.flight_iata} — Delayed +${currentDelay} min`,
            message: `Your tracked flight is now delayed by ${currentDelay} min. Est: ${newETA} IST`,
            icon: '⏱',
            flight_iata: row.flight_iata,
          });
        }
      }

      // ── Persist latest state to DB ─────────────────────
      await query(
        `UPDATE tracked_flights
         SET last_known_gate = $1, last_known_status = $2, last_known_delay = $3
         WHERE id = $4`,
        [currentGate, currentStatus, currentDelay, row.id]
      ).catch(() => {});  // Non-fatal — state will be refreshed next tick

    } catch (err) {
      console.error(`[GateWatcher] Error for ${row.flight_iata}:`, err.message);
    }
  }

  // Prune dedup cache if it grows too large
  if (_alerted.size > 500) _alerted.clear();
}

/**
 * Save a notification to the DB and push it to the user's socket room.
 */
async function _sendAlert(io, userId, { type, title, message, icon, flight_iata }) {
  try {
    await query(
      'INSERT INTO notifications (user_id, type, title, message, flight_iata, icon) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, type, title, message, flight_iata || null, icon || '🔔']
    );
  } catch (e) {
    console.error('[GateWatcher] DB insert error:', e.message);
  }

  if (io) {
    const payload = { type, title, message, icon, flight_iata, tracked: true, created_at: new Date().toISOString() };
    io.to(`user:${userId}`).emit('notification', payload);
    io.emit(`notification:user:${userId}`, payload);
  }

  console.log(`[GateWatcher] 🔔 ${title} → user:${userId.substring(0, 8)}…`);
}

module.exports = { startGateWatcher };
