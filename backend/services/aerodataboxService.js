// =====================================================
// AeroDataBox Flight Service (via RapidAPI)
// Real departures & arrivals for BLR / VOBL
// Free tier: 500 calls/month
// Sign up: rapidapi.com → search "AeroDataBox" → subscribe
// =====================================================
const axios = require('axios');

const RAPID_KEY  = process.env.AERODATABOX_API_KEY;
const RAPID_HOST = 'aerodatabox.p.rapidapi.com';
const BASE_URL   = 'https://aerodatabox.p.rapidapi.com';
const BLR_ICAO   = 'VOBL';

// ── Helpers ──────────────────────────────────────────

/**
 * Returns a local-time string in the format AeroDataBox expects: "YYYY-MM-DDTHH:mm"
 * using IST (UTC+5:30).
 */
function toISTLocal(offsetMinutes = 0) {
  const ms  = Date.now() + offsetMinutes * 60000;
  const ist = new Date(ms + 5.5 * 3600 * 1000); // shift to IST
  return ist.toISOString().slice(0, 16);          // "2025-10-01T14:30"
}

/**
 * Map AeroDataBox status string → our internal status
 */
function mapStatus(adbStatus, depTimeUtc, arrTimeUtc) {
  if (!adbStatus) return 'scheduled';
  const s   = adbStatus.toLowerCase();
  const now = Date.now();

  if (s.includes('cancel'))  return 'cancelled';
  if (s.includes('arrived')) return 'landed';
  if (s.includes('departed') || s.includes('en route')) {
    // if estimated arrival is in the past → landed, else active
    if (arrTimeUtc && new Date(arrTimeUtc).getTime() < now) return 'landed';
    return 'active';
  }
  if (s.includes('boarding') || s.includes('gate closed')) return 'scheduled';
  return 'scheduled';
}

/**
 * Parse delay minutes — AeroDataBox provides it directly on the leg object
 */
function parseDelay(depObj) {
  if (!depObj) return 0;
  return Math.max(0, parseInt(depObj.delay || depObj.delayMinutes || 0));
}

/**
 * Safely parse a UTC time string from AeroDataBox
 * They use format: "2025-10-01 04:30:00Z" or ISO
 */
function parseTime(raw) {
  if (!raw) return null;
  // AeroDataBox sometimes returns "2025-10-01 04:30:00Z" (space not T)
  return new Date(raw.replace(' ', 'T')).toISOString();
}

/**
 * Extract IATA flight number from AeroDataBox "number" field
 * e.g. "6E 2454" → "6E2454"
 */
function flightIata(numberStr) {
  return (numberStr || '').replace(/\s+/g, '');
}

/**
 * Extract airline IATA from flight number "6E 2454" → "6E"
 */
function airlineIata(numberStr) {
  return (numberStr || '').split(/\s/)[0] || '';
}

// ── Departure transformer ─────────────────────────────
function transformDeparture(f) {
  const dep      = f.departure || {};
  const arr      = f.arrival   || {};
  const airline  = f.airline   || {};
  const aircraft = f.aircraft  || {};

  const schedDepUtc  = parseTime(dep.scheduledTime?.utc);
  const estDepUtc    = parseTime((dep.revisedTime || dep.runwayTime)?.utc) || schedDepUtc;
  const schedArrUtc  = parseTime(arr.scheduledTime?.utc);
  const estArrUtc    = parseTime((arr.revisedTime || arr.runwayTime)?.utc) || schedArrUtc;
  const delayMins    = parseDelay(dep);
  const status       = mapStatus(f.status, estDepUtc, estArrUtc);

  const terminal = dep.terminal ? `T${dep.terminal}` : '';
  const gate     = dep.gate || '';

  return {
    flight_iata:          flightIata(f.number),
    flight_icao:          f.callSign || '',
    airline_name:         airline.name || f.airline?.name || '',
    airline_iata:         airline.iata || airlineIata(f.number),
    departure_airport:    dep.airport?.iata || 'BLR',
    arrival_airport:      arr.airport?.iata || '???',
    departure_terminal:   terminal,
    arrival_terminal:     arr.terminal ? `T${arr.terminal}` : '',
    departure_gate:       gate,
    arrival_gate:         arr.gate || '',
    scheduled_departure:  schedDepUtc,
    scheduled_arrival:    schedArrUtc,
    estimated_departure:  estDepUtc,
    estimated_arrival:    estArrUtc,
    actual_departure:     status === 'active' || status === 'landed' ? estDepUtc : null,
    actual_arrival:       status === 'landed' ? estArrUtc : null,
    status,
    statusLabel:          statusLabel(status, delayMins),
    delay_minutes:        delayMins,
    aircraft_type:        aircraft.model || '',
    aircraft_registration: aircraft.reg || '',
    flight_date:          new Date().toISOString().split('T')[0],
    _source:              'aerodatabox',
  };
}

// ── Arrival transformer ───────────────────────────────
function transformArrival(f) {
  const dep      = f.departure || {};
  const arr      = f.arrival   || {};
  const airline  = f.airline   || {};
  const aircraft = f.aircraft  || {};

  const schedDepUtc = parseTime(dep.scheduledTime?.utc);
  const estDepUtc   = parseTime((dep.revisedTime || dep.runwayTime)?.utc) || schedDepUtc;
  const schedArrUtc = parseTime(arr.scheduledTime?.utc);
  const estArrUtc   = parseTime((arr.revisedTime || arr.runwayTime)?.utc) || schedArrUtc;
  const delayMins   = parseDelay(arr);
  const status      = mapStatus(f.status, estDepUtc, estArrUtc);

  const terminal = arr.terminal ? `T${arr.terminal}` : '';
  const gate     = arr.gate || '';

  return {
    flight_iata:          flightIata(f.number),
    flight_icao:          f.callSign || '',
    airline_name:         airline.name || '',
    airline_iata:         airline.iata || airlineIata(f.number),
    departure_airport:    dep.airport?.iata || '???',
    arrival_airport:      arr.airport?.iata || 'BLR',
    departure_terminal:   dep.terminal ? `T${dep.terminal}` : '',
    arrival_terminal:     terminal,
    departure_gate:       dep.gate || '',
    arrival_gate:         gate,
    scheduled_departure:  schedDepUtc,
    scheduled_arrival:    schedArrUtc,
    estimated_departure:  estDepUtc,
    estimated_arrival:    estArrUtc,
    actual_departure:     status === 'active' || status === 'landed' ? estDepUtc : null,
    actual_arrival:       status === 'landed' ? estArrUtc : null,
    status,
    statusLabel:          statusLabel(status, delayMins),
    delay_minutes:        delayMins,
    aircraft_type:        aircraft.model || '',
    aircraft_registration: aircraft.reg || '',
    flight_date:          new Date().toISOString().split('T')[0],
    _source:              'aerodatabox',
  };
}

function statusLabel(status, delay) {
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'landed')    return 'Landed';
  if (status === 'active')    return 'In Flight';
  if (delay > 0)              return `Delayed ${delay}m`;
  return 'On Time';
}

// ── API calls ─────────────────────────────────────────

/**
 * Fetch departures + arrivals from AeroDataBox for a time window.
 * Window: 8 hours ago → 16 hours ahead (covers a full day of flights).
 * Returns { departures: [...], arrivals: [...] } or null on failure.
 */
/**
 * Fetch flights for BLR — ONE call, 12-hour window (2h past → 10h ahead).
 * Free tier: 500 calls/month. With 2-hour refresh = 12 calls/day = 360/month. ✓
 */
async function fetchFlights() {
  if (!RAPID_KEY) {
    console.warn('[AeroDataBox] No AERODATABOX_API_KEY set — using mock fallback');
    return null;
  }

  // Single window: 2 hours ago → 10 hours ahead = 12 hours (at the API limit)
  const from = toISTLocal(-2  * 60);
  const to   = toISTLocal(10  * 60);
  const url  = `${BASE_URL}/flights/airports/icao/${BLR_ICAO}/${from}/${to}`;

  try {
    const res = await axios.get(url, {
      headers: {
        'X-RapidAPI-Key':  RAPID_KEY,
        'X-RapidAPI-Host': RAPID_HOST,
      },
      params: {
        withLeg:        true,
        withCancelled:  true,
        withCodeshared: false,
        withCargo:      false,
        withPrivate:    false,
        withLocation:   false,
      },
      timeout: 15000,
    });

    const raw        = res.data || {};
    const departures = (raw.departures || []).map(transformDeparture).filter(f => f.flight_iata);
    const arrivals   = (raw.arrivals   || []).map(transformArrival).filter(f => f.flight_iata);

    console.log(`[AeroDataBox] ✓ ${departures.length} dep, ${arrivals.length} arr — REAL DATA (1 API call used)`);
    return { departures, arrivals };

  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    if (status === 429) {
      console.warn('[AeroDataBox] Rate limit hit — using cached/mock data');
    } else if (status === 403 || status === 401) {
      console.error('[AeroDataBox] Auth failed — check AERODATABOX_API_KEY');
    } else {
      console.error('[AeroDataBox] Error:', status, body || err.message);
    }
    return null;
  }
}

module.exports = { fetchFlights };
