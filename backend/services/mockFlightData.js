// =====================================================
// Mock Flight Data — Realistic BLR flight schedule
// Rolling 24-hour window so there are always upcoming
// flights regardless of time of day.
// =====================================================

const AIRLINES = [
  { name: 'IndiGo',             iata: '6E', terminal: 'T1' },
  { name: 'Air India',          iata: 'AI', terminal: 'T1' },
  { name: 'SpiceJet',           iata: 'SG', terminal: 'T1' },
  { name: 'Vistara',            iata: 'UK', terminal: 'T1' },
  { name: 'Air Asia India',     iata: 'I5', terminal: 'T1' },
  { name: 'Go First',           iata: 'G8', terminal: 'T1' },
  { name: 'Emirates',           iata: 'EK', terminal: 'T2' },
  { name: 'Qatar Airways',      iata: 'QR', terminal: 'T2' },
  { name: 'Singapore Airlines', iata: 'SQ', terminal: 'T2' },
  { name: 'British Airways',    iata: 'BA', terminal: 'T2' },
  { name: 'Lufthansa',          iata: 'LH', terminal: 'T2' },
  { name: 'Etihad Airways',     iata: 'EY', terminal: 'T2' },
  { name: 'Air France',         iata: 'AF', terminal: 'T2' },
  { name: 'Malaysian Airlines', iata: 'MH', terminal: 'T2' },
];

const DOMESTIC_ROUTES = [
  { dest: 'DEL', city: 'Delhi',       duration: 160 },
  { dest: 'BOM', city: 'Mumbai',      duration: 110 },
  { dest: 'MAA', city: 'Chennai',     duration:  60 },
  { dest: 'HYD', city: 'Hyderabad',   duration:  70 },
  { dest: 'CCU', city: 'Kolkata',     duration: 170 },
  { dest: 'GOI', city: 'Goa',         duration:  70 },
  { dest: 'COK', city: 'Kochi',       duration:  60 },
  { dest: 'AMD', city: 'Ahmedabad',   duration: 130 },
  { dest: 'PNQ', city: 'Pune',        duration:  90 },
  { dest: 'JAI', city: 'Jaipur',      duration: 155 },
  { dest: 'IXC', city: 'Chandigarh',  duration: 185 },
  { dest: 'VTZ', city: 'Vizag',       duration:  85 },
  { dest: 'BBI', city: 'Bhubaneswar', duration: 140 },
  { dest: 'TRV', city: 'Trivandrum',  duration:  70 },
  { dest: 'IXM', city: 'Madurai',     duration:  60 },
];

const INTL_ROUTES = [
  { dest: 'DXB', city: 'Dubai',         duration: 240 },
  { dest: 'DOH', city: 'Doha',          duration: 250 },
  { dest: 'SIN', city: 'Singapore',     duration: 330 },
  { dest: 'LHR', city: 'London',        duration: 570 },
  { dest: 'FRA', city: 'Frankfurt',     duration: 540 },
  { dest: 'CDG', city: 'Paris',         duration: 560 },
  { dest: 'AUH', city: 'Abu Dhabi',     duration: 240 },
  { dest: 'KUL', city: 'Kuala Lumpur',  duration: 330 },
  { dest: 'BKK', city: 'Bangkok',       duration: 310 },
  { dest: 'HKG', city: 'Hong Kong',     duration: 360 },
  { dest: 'NRT', city: 'Tokyo',         duration: 480 },
  { dest: 'SFO', city: 'San Francisco', duration: 960 },
];

const GATES_T1 = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4','B5','B6'];
const GATES_T2 = ['D1','D2','D3','D4','D5','D6','D7','D8'];

/** Deterministic pseudo-random from a string seed → 0..1 */
function seededRand(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return (Math.abs(h) >>> 0) / 4294967296;
}

/** Deterministic int in [min, max] from a seed */
function seededInt(seed, min, max) {
  return min + Math.floor(seededRand(seed) * (max - min + 1));
}

/** Deterministic pick from array */
function seededPick(arr, seed) {
  return arr[Math.floor(seededRand(seed) * arr.length)];
}

/**
 * Build a departure slot at `baseMs + offsetMinutes`.
 * `slotKey` is a stable string used for seeding so the same
 * slot always produces the same flight number and delay.
 */
function buildDeparture(slotKey, depMs, isIntl) {
  const domesticAirlines = AIRLINES.filter(a => a.terminal === 'T1');
  const intlAirlines     = AIRLINES.filter(a => a.terminal === 'T2');

  const airline     = seededPick(isIntl ? intlAirlines : domesticAirlines, slotKey + '-airline');
  const route       = seededPick(isIntl ? INTL_ROUTES  : DOMESTIC_ROUTES,  slotKey + '-route');
  const flightNum   = String(seededInt(slotKey + '-num', 100, 9999));
  const flight_iata = `${airline.iata}${flightNum}`;
  const terminal    = airline.terminal;
  const gate        = seededPick(terminal === 'T1' ? GATES_T1 : GATES_T2, slotKey + '-gate');

  const depDate = new Date(depMs);
  const arrDate = new Date(depMs + route.duration * 60000);

  const rand = seededRand(slotKey + '-rand');
  let delay_minutes = 0;
  let status        = 'scheduled';
  let statusLabel   = 'Scheduled';

  if (rand < 0.02) {
    status      = 'cancelled';
    statusLabel = 'Cancelled';
  } else if (rand < 0.14) {
    delay_minutes = seededInt(slotKey + '-delay', 15, 90);
    statusLabel   = `Delayed ${delay_minutes}m`;
  }

  const nowMs = Date.now();

  if (status !== 'cancelled') {
    const effectiveDepMs = depMs + delay_minutes * 60000;
    if (effectiveDepMs < nowMs - 10 * 60000) {
      // Departed >10 min ago
      const effectiveArrMs = effectiveDepMs + route.duration * 60000;
      status      = effectiveArrMs < nowMs ? 'landed' : 'active';
      statusLabel = status === 'landed' ? 'Landed' : 'In Flight';
    } else if (delay_minutes > 0) {
      statusLabel = `Delayed ${delay_minutes}m`;
    }
  }

  return {
    flight_iata,
    airline_name: airline.name,
    airline_iata: airline.iata,
    departure_airport: 'BLR',
    arrival_airport:   route.dest,
    departure_terminal: terminal,
    arrival_terminal:   isIntl ? 'T2' : 'T1',
    departure_gate: gate,
    arrival_gate:   '',
    scheduled_departure: depDate.toISOString(),
    scheduled_arrival:   arrDate.toISOString(),
    estimated_departure: new Date(depMs + delay_minutes * 60000).toISOString(),
    estimated_arrival:   new Date(arrDate.getTime() + delay_minutes * 60000).toISOString(),
    actual_departure: (status === 'active' || status === 'landed')
      ? new Date(depMs + delay_minutes * 60000).toISOString() : null,
    actual_arrival: status === 'landed'
      ? new Date(arrDate.getTime() + delay_minutes * 60000).toISOString() : null,
    status,
    statusLabel,
    delay_minutes,
    aircraft_type: seededPick(['B737','A320','A321','B777','A350','B787','ATR72'], slotKey + '-ac'),
    aircraft_registration: '',
    flight_date: depDate.toISOString().split('T')[0],
  };
}

function buildArrival(slotKey, arrMs, isIntl) {
  const domesticAirlines = AIRLINES.filter(a => a.terminal === 'T1');
  const intlAirlines     = AIRLINES.filter(a => a.terminal === 'T2');

  const airline     = seededPick(isIntl ? intlAirlines : domesticAirlines, slotKey + '-airline');
  const route       = seededPick(isIntl ? INTL_ROUTES  : DOMESTIC_ROUTES,  slotKey + '-route');
  const flightNum   = String(seededInt(slotKey + '-num', 100, 9999));
  const flight_iata = `${airline.iata}${flightNum}`;
  const terminal    = airline.terminal;
  const gate        = seededPick(terminal === 'T1' ? GATES_T1 : GATES_T2, slotKey + '-gate');

  const arrDate = new Date(arrMs);
  const depDate = new Date(arrMs - route.duration * 60000);

  const rand = seededRand(slotKey + '-rand');
  let delay_minutes = 0;
  let status        = 'scheduled';
  let statusLabel   = 'Scheduled';

  if (rand < 0.02) {
    status      = 'cancelled';
    statusLabel = 'Cancelled';
  } else if (rand < 0.14) {
    delay_minutes = seededInt(slotKey + '-delay', 10, 60);
    statusLabel   = `Delayed ${delay_minutes}m`;
  }

  const nowMs = Date.now();

  if (status !== 'cancelled') {
    const effectiveArrMs = arrMs + delay_minutes * 60000;
    if (effectiveArrMs < nowMs) {
      status      = 'landed';
      statusLabel = 'Landed';
    } else if (effectiveArrMs - nowMs < 90 * 60000) {
      // Arriving within 90 minutes → in flight
      status      = 'active';
      statusLabel = 'In Flight';
    } else if (delay_minutes > 0) {
      statusLabel = `Delayed ${delay_minutes}m`;
    }
  }

  return {
    flight_iata,
    airline_name: airline.name,
    airline_iata: airline.iata,
    departure_airport: route.dest,
    arrival_airport:   'BLR',
    departure_terminal: isIntl ? 'T2' : 'T1',
    arrival_terminal:   terminal,
    departure_gate: '',
    arrival_gate:   gate,
    scheduled_departure: depDate.toISOString(),
    scheduled_arrival:   arrDate.toISOString(),
    estimated_departure: depDate.toISOString(),
    estimated_arrival:   new Date(arrMs + delay_minutes * 60000).toISOString(),
    actual_departure: (status === 'active' || status === 'landed')
      ? depDate.toISOString() : null,
    actual_arrival: status === 'landed'
      ? new Date(arrMs + delay_minutes * 60000).toISOString() : null,
    status,
    statusLabel,
    delay_minutes,
    aircraft_type: seededPick(['B737','A320','A321','B777','A350','B787','ATR72'], slotKey + '-ac'),
    aircraft_registration: '',
    flight_date: arrDate.toISOString().split('T')[0],
  };
}

/**
 * Rolling window: generate 32 departure slots starting 12 hours
 * before now, spaced every 45 minutes, covering ~24 hours ahead.
 * Slot keys include hour-of-day so each 45-min window gets a
 * stable key that doesn't change as the clock ticks.
 */
function generateDepartures() {
  const now         = Date.now();
  const windowStart = now - 12 * 60 * 60 * 1000; // 12 hours ago
  const slotGap     = 45 * 60 * 1000;             // 45 min per slot
  const totalSlots  = 32;

  const flights = [];

  for (let i = 0; i < totalSlots; i++) {
    const slotMs  = windowStart + i * slotGap;
    // Round to nearest 45-min epoch for a stable key
    const stableT = Math.floor(slotMs / slotGap);
    const isIntl  = i % 5 === 4; // every 5th slot is international
    const key     = `dep-${stableT}`;
    flights.push(buildDeparture(key, slotMs, isIntl));
  }

  return flights;
}

function generateArrivals() {
  const now         = Date.now();
  const windowStart = now - 10 * 60 * 60 * 1000; // 10 hours ago
  const slotGap     = 50 * 60 * 1000;             // 50 min per slot
  const totalSlots  = 27;

  const flights = [];

  for (let i = 0; i < totalSlots; i++) {
    const slotMs  = windowStart + i * slotGap;
    const stableT = Math.floor(slotMs / slotGap);
    const isIntl  = i % 6 === 5; // every 6th slot is international
    const key     = `arr-${stableT}`;
    flights.push(buildArrival(key, slotMs, isIntl));
  }

  return flights;
}

module.exports = { generateDepartures, generateArrivals };
