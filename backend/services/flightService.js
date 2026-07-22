// =====================================================
// Flight Data Service
// Priority: AeroDataBox (real) → OpenSky (real ADS-B) → Mock
// =====================================================
const { query }                              = require('../database/db');
const { generateDepartures, generateArrivals } = require('./mockFlightData');
const { fetchRealDepartures, fetchRealArrivals } = require('./openskyFlightService');
const { fetchFlights: fetchAeroDataBox }     = require('./aerodataboxService');

const DEFAULT_AIRPORT = process.env.DEFAULT_AIRPORT_IATA || 'BLR';

// ── Caches ────────────────────────────────────────────
let flightCache = { departures: [], arrivals: [], lastUpdated: null, source: 'none' };

let mockCache = { departures: [], arrivals: [], generatedAt: null };
const MOCK_TTL = 5  * 60 * 1000;
const CACHE_TTL = 5  * 60 * 1000;

// AeroDataBox has 500 calls/month free — only refresh every 2 hours
// 12 calls/day × 30 days = 360 calls/month (safely under limit)
const ADB_TTL = 2 * 60 * 60 * 1000; // 2 hours
let adbLastFetched = null;

// ── Mock fallback ─────────────────────────────────────
function getMockFlights(type) {
  const now = Date.now();
  if (!mockCache.generatedAt || now - mockCache.generatedAt > MOCK_TTL) {
    mockCache.departures  = generateDepartures();
    mockCache.arrivals    = generateArrivals();
    mockCache.generatedAt = now;
    console.log(`[FlightService] Mock refreshed: ${mockCache.departures.length} dep, ${mockCache.arrivals.length} arr`);
  }
  return type === 'departure' ? mockCache.departures : mockCache.arrivals;
}

/**
 * Merge real (past/active) flights with future mock slots.
 * Used when OpenSky provides partial real data but no schedule ahead.
 */
function mergeWithMock(realFlights, mockFlights, type) {
  if (!realFlights || realFlights.length === 0) return mockFlights;

  const now      = Date.now();
  const realKeys = new Set(realFlights.map(f => f.flight_iata));

  const futureMock = mockFlights.filter(f => {
    if (realKeys.has(f.flight_iata)) return false;
    const ts = type === 'departure'
      ? (f.scheduled_departure || f.scheduled_arrival)
      : (f.scheduled_arrival   || f.scheduled_departure);
    return ts && new Date(ts).getTime() > now;
  });

  return [...realFlights, ...futureMock];
}

// ── Live-status refresh ───────────────────────────────
// Re-evaluates a cached flight's status based on current wall-clock time.
// This ensures that flights stored in the 2-hour AeroDataBox cache stay
// accurate as time passes (e.g. a flight that was "scheduled" 90 min ago
// may now be "active", or one that was "active" may now be "landed").
function applyLiveStatus(f) {
  if (f.status === 'cancelled') return f; // never auto-recover a cancellation

  const now    = Date.now();
  const depMs  = f.actual_departure    ? new Date(f.actual_departure).getTime()
               : f.estimated_departure ? new Date(f.estimated_departure).getTime()
               : f.scheduled_departure ? new Date(f.scheduled_departure).getTime()
               : null;
  const arrMs  = f.estimated_arrival   ? new Date(f.estimated_arrival).getTime()
               : f.scheduled_arrival   ? new Date(f.scheduled_arrival).getTime()
               : null;

  if (!depMs || !arrMs) return f;

  if (depMs <= now && arrMs > now) {
    // Currently in the air
    if (f.status !== 'active') {
      return { ...f, status: 'active', statusLabel: 'In Flight',
               actual_departure: f.actual_departure || f.estimated_departure };
    }
  } else if (arrMs <= now && depMs <= now) {
    // Should have landed already
    if (f.status !== 'landed') {
      return { ...f, status: 'landed', statusLabel: 'Landed',
               actual_arrival: f.actual_arrival || f.estimated_arrival };
    }
  } else if (depMs > now) {
    // Not yet departed
    if (f.status === 'active') {
      return { ...f, status: 'scheduled',
               statusLabel: f.delay_minutes > 0 ? `Delayed ${f.delay_minutes}m` : 'On Time' };
    }
  }
  return f;
}

// ── Main refresh — called by cron every 5 min ─────────
async function refreshFlights() {
  const now = Date.now();

  // ── Priority 1: AeroDataBox — only if cache is stale (>2 hours) ────
  // This conserves the 500 calls/month free quota.
  const adbStale = !adbLastFetched || (now - adbLastFetched) > ADB_TTL;

  if (adbStale) {
    const adbResult = await fetchAeroDataBox();
    const hasData   = adbResult && (adbResult.departures.length > 0 || adbResult.arrivals.length > 0);
    if (hasData) {
      flightCache.departures  = adbResult.departures;
      flightCache.arrivals    = adbResult.arrivals;
      flightCache.lastUpdated = new Date().toISOString();
      flightCache.source      = 'aerodatabox';
      adbLastFetched          = now;
      console.log(`[FlightService] AeroDataBox refreshed — ${flightCache.departures.length} dep, ${flightCache.arrivals.length} arr (REAL)`);
      return;
    }
    // AeroDataBox failed or returned empty — fall through to mock
    if (!adbResult) adbLastFetched = now; // only throttle retries on hard failures
    console.warn('[FlightService] AeroDataBox returned empty or failed — falling back to mock');
  } else {
    // AeroDataBox cache is still fresh — update live statuses from existing data
    const minutesUntilExpiry = Math.round((ADB_TTL - (now - adbLastFetched)) / 60000);
    console.log(`[FlightService] AeroDataBox cache fresh (${minutesUntilExpiry}min until next refresh) — using cached real data`);
    flightCache.lastUpdated = new Date().toISOString();
    // Only skip mock if the cached real data is actually non-empty
    if (flightCache.source === 'aerodatabox' && (flightCache.departures.length > 0 || flightCache.arrivals.length > 0)) return;
  }

  // ── Priority 2: OpenSky + mock fallback ────────────
  const mockDep = getMockFlights('departure');
  const mockArr = getMockFlights('arrival');

  const [realDep, realArr] = await Promise.all([
    fetchRealDepartures(),
    fetchRealArrivals(),
  ]);

  flightCache.departures  = mergeWithMock(realDep, mockDep, 'departure');
  flightCache.arrivals    = mergeWithMock(realArr, mockArr, 'arrival');
  flightCache.lastUpdated = new Date().toISOString();
  flightCache.source      = realDep || realArr ? 'opensky+mock' : 'mock';
  console.log(`[FlightService] Source: ${flightCache.source} — ${flightCache.departures.length} dep, ${flightCache.arrivals.length} arr`);
}

// ── Get flights (route handler) ───────────────────────
async function getFlights(type, filters) {
  type    = type    || 'departure';
  filters = filters || {};

  // Serve from cache if fresh
  if (flightCache.lastUpdated && Date.now() - new Date(flightCache.lastUpdated).getTime() < CACHE_TTL) {
    let flights = type === 'departure'
      ? flightCache.departures.slice()
      : flightCache.arrivals.slice();
    // Re-evaluate each flight's status against current time so that flights
    // cached up to 2 hours ago still show the correct live status (active / landed / scheduled).
    flights = flights.map(applyLiveStatus);
    return { flights: applyFilters(flights, filters), lastUpdated: flightCache.lastUpdated, source: flightCache.source };
  }

  // Cold start — return mock directly (mock data self-evaluates status at generation time)
  const mock = getMockFlights(type);
  return { flights: applyFilters(mock, filters), lastUpdated: new Date().toISOString(), source: 'mock' };
}

function applyFilters(flights, filters) {
  let result = flights;
  if (filters.airline) {
    const al = filters.airline.toLowerCase();
    result = result.filter(f => (f.airline_name || '').toLowerCase().includes(al));
  }
  if (filters.status) {
    const s = filters.status.toLowerCase();
    result = result.filter(f => {
      if (s === 'delayed')   return f.delay_minutes > 0;
      if (s === 'scheduled') return f.status === 'scheduled' && f.delay_minutes === 0;
      if (s === 'active')    return f.status === 'active';
      if (s === 'landed')    return f.status === 'landed';
      if (s === 'cancelled') return f.status === 'cancelled';
      return false;
    });
  }
  return result;
}

// ── Search a specific flight ──────────────────────────
async function searchFlight(flightNumber) {
  const norm = (flightNumber || '').toLowerCase().replace(/\s/g, '');

  const allCached = [...flightCache.departures, ...flightCache.arrivals];
  const found = allCached.find(f =>
    f.flight_iata && f.flight_iata.toLowerCase().replace(/\s/g, '') === norm
  );
  if (found) return found;

  const allMock = [...getMockFlights('departure'), ...getMockFlights('arrival')];
  return allMock.find(f =>
    f.flight_iata && f.flight_iata.toLowerCase().replace(/\s/g, '') === norm
  ) || null;
}

// ── Stats for home page ───────────────────────────────
async function getFlightStats() {
  let all = [...flightCache.departures, ...flightCache.arrivals];
  if (all.length === 0) all = [...getMockFlights('departure'), ...getMockFlights('arrival')];

  const total     = all.length;
  const delayed   = all.filter(f => f.delay_minutes > 0).length;
  const cancelled = all.filter(f => f.status === 'cancelled').length;
  const onTime    = total - delayed - cancelled;
  const delaySum  = all.filter(f => f.delay_minutes > 0).reduce((s, f) => s + f.delay_minutes, 0);
  const avgDelay  = delayed > 0 ? Math.round(delaySum / delayed) : 0;

  return { total, onTime, delayed, cancelled, avgDelay, source: flightCache.source, lastUpdated: flightCache.lastUpdated || new Date().toISOString() };
}

async function fetchFlightsFromAPI() { return null; } // legacy

module.exports = { refreshFlights, getFlights, searchFlight, getFlightStats, fetchFlightsFromAPI };
