// =====================================================
// OpenSky Network — Flight Data Service
// Fetches REAL departure/arrival data for BLR (VOBL)
// Free account required: opensky-network.org/register
// Falls back to mock data if unavailable
// =====================================================
const axios = require('axios');

const OPENSKY_BASE = 'https://opensky-network.org/api';
const BLR_ICAO = 'VOBL';

// ICAO airport → IATA airport
const AIRPORT_MAP = {
  VOBL: 'BLR', VABB: 'BOM', VIDP: 'DEL', VOMM: 'MAA', VOHY: 'HYD',
  VECC: 'CCU', VAGO: 'GOI', VOCL: 'COK', VAAH: 'AMD', VAPO: 'PNQ',
  VIHR: 'IXC', VAJJ: 'JAI', VOBZ: 'VTZ', VEBS: 'BBI', VOTV: 'TRV',
  VOMD: 'IXM', VANP: 'NAG', VAUD: 'UDR', VIAG: 'AGR', VEPT: 'PAT',
  OMDB: 'DXB', OTHH: 'DOH', WSSS: 'SIN', EGLL: 'LHR', EDDF: 'FRA',
  LFPG: 'CDG', OMAA: 'AUH', WMKK: 'KUL', VTBS: 'BKK', VHHH: 'HKG',
  RJAA: 'NRT', RJBB: 'KIX', KSFO: 'SFO', KJFK: 'JFK', KORD: 'ORD',
  ZBAA: 'PEK', ZSPD: 'PVG', YSSY: 'SYD', YMML: 'MEL', FAOR: 'JNB',
  OERK: 'RUH', OEJN: 'JED', OKBK: 'KWI', OBBI: 'BAH', OMFO: 'MCT',
};

// ICAO airline prefix → { iata, name, terminal }
const AIRLINE_MAP = {
  IGO: { iata: '6E', name: 'IndiGo',             terminal: 'T1' },
  AIC: { iata: 'AI', name: 'Air India',           terminal: 'T1' },
  VTI: { iata: 'UK', name: 'Vistara',             terminal: 'T1' },
  SEJ: { iata: 'SG', name: 'SpiceJet',            terminal: 'T1' },
  GOW: { iata: 'G8', name: 'Go First',            terminal: 'T1' },
  IAD: { iata: 'I5', name: 'Air Asia India',      terminal: 'T1' },
  UAE: { iata: 'EK', name: 'Emirates',            terminal: 'T2' },
  ETD: { iata: 'EY', name: 'Etihad Airways',      terminal: 'T2' },
  QTR: { iata: 'QR', name: 'Qatar Airways',       terminal: 'T2' },
  SIA: { iata: 'SQ', name: 'Singapore Airlines',  terminal: 'T2' },
  BAW: { iata: 'BA', name: 'British Airways',     terminal: 'T2' },
  DLH: { iata: 'LH', name: 'Lufthansa',           terminal: 'T2' },
  THY: { iata: 'TK', name: 'Turkish Airlines',    terminal: 'T2' },
  KLM: { iata: 'KL', name: 'KLM',                terminal: 'T2' },
  AFR: { iata: 'AF', name: 'Air France',          terminal: 'T2' },
  SVA: { iata: 'SV', name: 'Saudia',              terminal: 'T2' },
  FDB: { iata: 'FZ', name: 'flydubai',            terminal: 'T2' },
  ALK: { iata: 'UL', name: 'SriLankan Airlines',  terminal: 'T2' },
  MAS: { iata: 'MH', name: 'Malaysian Airlines',  terminal: 'T2' },
  CPA: { iata: 'CX', name: 'Cathay Pacific',      terminal: 'T2' },
  THA: { iata: 'TG', name: 'Thai Airways',        terminal: 'T2' },
  JAI: { iata: '9W', name: 'Jet Airways',         terminal: 'T1' },
  BSE: { iata: '5C', name: 'Blue Star Jets',      terminal: 'T1' },
};

function icaoToIata(icaoCode) {
  return AIRPORT_MAP[icaoCode] || icaoCode || '???';
}

function parseCallsign(callsign) {
  if (!callsign) return null;
  const cs = callsign.trim().toUpperCase();
  const prefix = cs.slice(0, 3);
  const number = cs.slice(3).trim();
  const airline = AIRLINE_MAP[prefix];
  if (!airline || !number) return null;
  return {
    flight_iata: airline.iata + number,
    flight_icao: cs,
    airline_iata: airline.iata,
    airline_name: airline.name,
    terminal: airline.terminal,
  };
}

function buildAxiosConfig() {
  const user = process.env.OPENSKY_USERNAME;
  const pass = process.env.OPENSKY_PASSWORD;
  const config = { timeout: 12000 };
  if (user && pass) config.auth = { username: user, password: pass };
  return config;
}

/**
 * Fetch real departures from BLR today (OpenSky historical)
 */
async function fetchRealDepartures() {
  // Query from start of today IST (UTC+5:30) until now
  const now = Math.floor(Date.now() / 1000);
  const istOffset = 5.5 * 3600;
  const todayMidnightIST = Math.floor((Date.now() / 1000 - (Date.now() / 1000 % 86400) - istOffset % 86400));
  const begin = now - 14 * 3600; // last 14 hours as safe window

  try {
    const res = await axios.get(`${OPENSKY_BASE}/flights/departure`, {
      params: { airport: BLR_ICAO, begin, end: now },
      ...buildAxiosConfig(),
    });

    const flights = res.data || [];
    console.log(`[OpenSky] ${flights.length} real departures from BLR`);

    return flights
      .map(f => {
        const parsed = parseCallsign(f.callsign);
        if (!parsed) return null;

        const depTime = f.firstSeen ? new Date(f.firstSeen * 1000).toISOString() : null;
        const arrTime = f.lastSeen  ? new Date(f.lastSeen  * 1000).toISOString() : null;
        const destIcao = f.estArrivalAirport || '';
        const destIata = icaoToIata(destIcao);

        return {
          flight_iata: parsed.flight_iata,
          flight_icao: parsed.flight_icao,
          airline_name: parsed.airline_name,
          airline_iata: parsed.airline_iata,
          departure_airport: 'BLR',
          arrival_airport: destIata,
          departure_terminal: parsed.terminal,
          arrival_terminal: destIata !== 'BLR' ? '' : parsed.terminal,
          departure_gate: '',
          arrival_gate: '',
          scheduled_departure: depTime,
          scheduled_arrival: arrTime,
          estimated_departure: depTime,
          estimated_arrival: arrTime,
          actual_departure: depTime,
          actual_arrival: null,
          status: 'active',
          statusLabel: 'In Flight',
          delay_minutes: 0,
          aircraft_type: '',
          aircraft_registration: '',
          flight_date: new Date().toISOString().split('T')[0],
          _source: 'opensky',
        };
      })
      .filter(Boolean);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) {
      console.warn('[OpenSky] 403 Departures — verify your email at opensky-network.org, then check OPENSKY_USERNAME/PASSWORD in .env. Using mock fallback.');
    } else {
      console.warn('[OpenSky] Departure fetch failed:', err.message);
    }
    return null; // signal failure — mock fallback kicks in
  }
}

/**
 * Fetch real arrivals into BLR today (OpenSky historical)
 */
async function fetchRealArrivals() {
  const now = Math.floor(Date.now() / 1000);
  const begin = now - 14 * 3600;

  try {
    const res = await axios.get(`${OPENSKY_BASE}/flights/arrival`, {
      params: { airport: BLR_ICAO, begin, end: now },
      ...buildAxiosConfig(),
    });

    const flights = res.data || [];
    console.log(`[OpenSky] ${flights.length} real arrivals at BLR`);

    return flights
      .map(f => {
        const parsed = parseCallsign(f.callsign);
        if (!parsed) return null;

        const depTime = f.firstSeen ? new Date(f.firstSeen * 1000).toISOString() : null;
        const arrTime = f.lastSeen  ? new Date(f.lastSeen  * 1000).toISOString() : null;
        const origIcao = f.estDepartureAirport || '';
        const origIata = icaoToIata(origIcao);

        // Determine status from arrival time vs now
        const nowMs = Date.now();
        const arrMs = f.lastSeen ? f.lastSeen * 1000 : 0;
        const status = arrMs && arrMs < nowMs ? 'landed' : 'active';
        const statusLabel = status === 'landed' ? 'Landed' : 'In Flight';

        return {
          flight_iata: parsed.flight_iata,
          flight_icao: parsed.flight_icao,
          airline_name: parsed.airline_name,
          airline_iata: parsed.airline_iata,
          departure_airport: origIata,
          arrival_airport: 'BLR',
          departure_terminal: '',
          arrival_terminal: parsed.terminal,
          departure_gate: '',
          arrival_gate: '',
          scheduled_departure: depTime,
          scheduled_arrival: arrTime,
          estimated_departure: depTime,
          estimated_arrival: arrTime,
          actual_departure: depTime,
          actual_arrival: status === 'landed' ? arrTime : null,
          status,
          statusLabel,
          delay_minutes: 0,
          aircraft_type: '',
          aircraft_registration: '',
          flight_date: new Date().toISOString().split('T')[0],
          _source: 'opensky',
        };
      })
      .filter(Boolean);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403) {
      console.warn('[OpenSky] 403 Arrivals — verify your email at opensky-network.org, then check OPENSKY_USERNAME/PASSWORD in .env. Using mock fallback.');
    } else {
      console.warn('[OpenSky] Arrival fetch failed:', err.message);
    }
    return null;
  }
}

module.exports = { fetchRealDepartures, fetchRealArrivals };
