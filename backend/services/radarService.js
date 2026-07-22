// =====================================================
// Radar Service — OpenSky ADS-B + AviationStack merge
// Shows live aircraft positions enriched with flight details
// =====================================================
const axios = require('axios');
const flightService = require('./flightService');

const DEFAULT_LAT = parseFloat(process.env.DEFAULT_AIRPORT_LAT || 13.1986);
const DEFAULT_LNG = parseFloat(process.env.DEFAULT_AIRPORT_LNG || 77.7066);
const RADIUS_DEG = 2.0;

let radarCache = { aircraft: [], lastUpdated: null };
const CACHE_TTL = 15 * 1000;

// ICAO airline prefix -> IATA prefix map for common carriers at BLR
const ICAO_TO_IATA = {
  'IGO': '6E', // IndiGo
  'AIC': 'AI', // Air India
  'VTI': 'UK', // Vistara
  'SEJ': 'SG', // SpiceJet
  'GOW': 'G8', // GoAir
  'IAD': 'I5', // Air Asia India
  'UAE': 'EK', // Emirates
  'ETD': 'EY', // Etihad
  'QTR': 'QR', // Qatar Airways
  'SIA': 'SQ', // Singapore Airlines
  'BAW': 'BA', // British Airways
  'DLH': 'LH', // Lufthansa
  'THY': 'TK', // Turkish Airlines
  'KLM': 'KL', // KLM
  'AFR': 'AF', // Air France
  'SVA': 'SV', // Saudia
  'FDB': 'FZ', // flydubai
  'ABY': 'G9', // Air Arabia
  'ALK': 'UL', // SriLankan Airlines
};

function deterministicInt(seed, range) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % range;
}

async function generateMockAircraft() {
  console.log('[RadarService] Generating realistic simulated aircraft because OpenSky API is unavailable.');
  try {
    const [depData, arrData] = await Promise.all([
      flightService.getFlights('departure'),
      flightService.getFlights('arrival'),
    ]);
    const allFlights = [
      ...(depData.flights || []),
      ...(arrData.flights || []),
    ];

    const now = Date.now();
    const mockAircraft = [];

    for (const f of allFlights) {
      if (f.status === 'active' || f.status === 'scheduled') {
        const seed = f.flight_iata || 'IGO101';
        const heading = deterministicInt(seed, 360);
        const headingRad = (heading * Math.PI) / 180;

        const isDep = f.departure_airport === 'BLR';
        let distanceDeg = 0.5;
        let alt = 24000;
        let speed = 400;
        let onGround = false;

        if (isDep) {
          const depTime = new Date(f.actual_departure || f.estimated_departure || f.scheduled_departure || now).getTime();
          const elapsedMins = (now - depTime) / 60000;
          if (elapsedMins < 0 || elapsedMins > 90) continue; // Only track departures for the first 90 minutes of flight

          distanceDeg = elapsedMins * 0.02; // ~1.2 degrees per hour
          alt = Math.min(37000, 1000 + elapsedMins * 400);
          speed = Math.min(480, 180 + elapsedMins * 4);
        } else {
          const arrTime = new Date(f.estimated_arrival || f.scheduled_arrival || now).getTime();
          const remainingMins = (arrTime - now) / 60000;
          if (remainingMins < 0 || remainingMins > 90) continue; // Only track arrivals in the final 90 minutes of descent

          distanceDeg = remainingMins * 0.02;
          alt = Math.min(37000, 1000 + remainingMins * 350);
          speed = Math.min(450, 160 + remainingMins * 3);
        }

        if (distanceDeg > RADIUS_DEG) continue; // out of scope

        const lat = DEFAULT_LAT + Math.cos(headingRad) * distanceDeg * (isDep ? 1 : -1);
        const lng = DEFAULT_LNG + Math.sin(headingRad) * distanceDeg * (isDep ? 1 : -1);

        mockAircraft.push({
          icao24: 'sim' + deterministicInt(seed, 900000).toString(16).padStart(6, '0'),
          callsign: f.flight_icao || f.flight_iata || 'MOCK101',
          country: 'Simulated',
          latitude: parseFloat(lat.toFixed(5)),
          longitude: parseFloat(lng.toFixed(5)),
          altitude: Math.round(alt),
          geoAltitude: Math.round(alt),
          onGround,
          speed: Math.round(speed),
          heading: Math.round(isDep ? heading : (heading + 180) % 360),
          verticalRate: isDep ? 800 : -500,
          squawk: '1200',
          lastContact: Math.floor(now / 1000),
          _simulated: true
        });
      }
    }
    return mockAircraft;
  } catch (err) {
    console.error('[RadarService] Error generating mock aircraft:', err.message);
    return [];
  }
}

async function fetchLiveAircraft() {
  try {
    const lamin = DEFAULT_LAT - RADIUS_DEG;
    const lomin = DEFAULT_LNG - RADIUS_DEG;
    const lamax = DEFAULT_LAT + RADIUS_DEG;
    const lomax = DEFAULT_LNG + RADIUS_DEG;

    const opts = {
      params: { lamin, lomin, lamax, lomax },
      timeout: 15000,
    };

    // Authenticated requests get higher rate limits (4000/day vs 400/day)
    if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
      opts.auth = {
        username: process.env.OPENSKY_USERNAME,
        password: process.env.OPENSKY_PASSWORD,
      };
    }

    const response = await axios.get('https://opensky-network.org/api/states/all', opts);

    if (response.data && response.data.states) {
      return response.data.states.map(transformAircraft).filter(Boolean);
    }
    return await generateMockAircraft();
  } catch (error) {
    console.error('[RadarService] OpenSky error:', error.message);
    return await generateMockAircraft();
  }
}

function transformAircraft(state) {
  if (!state || !state[5] || !state[6]) return null;

  const callsign = (state[1] || '').trim();
  const velocity = state[9] ? Math.round(state[9] * 3.6) : 0;
  const altitude = state[7] ? Math.round(state[7] * 3.281) : 0;
  const geoAlt = state[13] ? Math.round(state[13] * 3.281) : altitude;

  return {
    icao24: state[0],
    callsign: callsign || state[0],
    country: state[2] || 'Unknown',
    latitude: state[6],
    longitude: state[5],
    altitude,
    geoAltitude: geoAlt,
    onGround: state[8] || false,
    speed: velocity,
    heading: state[10] ? Math.round(state[10]) : 0,
    verticalRate: state[11] ? Math.round(state[11] * 196.85) : 0,
    squawk: state[14] || '',
    lastContact: state[4],
  };
}

/**
 * Convert OpenSky ICAO callsign (e.g. IGO2341) to IATA (e.g. 6E2341)
 */
function icaoCallsignToIata(callsign) {
  if (!callsign || callsign.length < 4) return null;
  const prefix = callsign.slice(0, 3).toUpperCase();
  const number = callsign.slice(3);
  const iataPrefix = ICAO_TO_IATA[prefix];
  return iataPrefix ? iataPrefix + number : null;
}

async function mergeWithFlightData(aircraft) {
  try {
    const [depData, arrData] = await Promise.all([
      flightService.getFlights('departure'),
      flightService.getFlights('arrival'),
    ]);

    const allFlights = [
      ...(depData.flights || []).map(f => ({ ...f, flightType: 'departure' })),
      ...(arrData.flights || []).map(f => ({ ...f, flightType: 'arrival' })),
    ];

    // Build lookup by both IATA and ICAO flight numbers
    const flightMap = {};
    for (const f of allFlights) {
      if (f.flight_iata) {
        flightMap[f.flight_iata.replace(/\s/g, '').toUpperCase()] = f;
      }
      if (f.flight_icao) {
        flightMap[f.flight_icao.replace(/\s/g, '').toUpperCase()] = f;
      }
    }

    return aircraft.map(ac => {
      const rawKey = (ac.callsign || '').replace(/\s/g, '').toUpperCase();

      // Try direct match first (ICAO callsign like IGO2341)
      let flightDetails = flightMap[rawKey] || null;

      // Try converting ICAO prefix to IATA (IGO2341 -> 6E2341)
      if (!flightDetails) {
        const iataKey = icaoCallsignToIata(rawKey);
        if (iataKey) flightDetails = flightMap[iataKey] || null;
      }

      return {
        ...ac,
        flightDetails: flightDetails ? {
          flight_iata: flightDetails.flight_iata,
          airline_name: flightDetails.airline_name,
          airline_iata: flightDetails.airline_iata,
          departure_airport: flightDetails.departure_airport,
          arrival_airport: flightDetails.arrival_airport,
          departure_terminal: flightDetails.departure_terminal,
          arrival_terminal: flightDetails.arrival_terminal,
          departure_gate: flightDetails.departure_gate,
          arrival_gate: flightDetails.arrival_gate,
          scheduled_departure: flightDetails.scheduled_departure,
          scheduled_arrival: flightDetails.scheduled_arrival,
          estimated_departure: flightDetails.estimated_departure,
          estimated_arrival: flightDetails.estimated_arrival,
          status: flightDetails.status,
          statusLabel: flightDetails.statusLabel,
          delay_minutes: flightDetails.delay_minutes,
          aircraft_type: flightDetails.aircraft_type,
          flightType: flightDetails.flightType,
        } : null,
        isTracked: !!flightDetails,
      };
    });
  } catch (err) {
    console.error('[RadarService] Merge error:', err.message);
    return aircraft;
  }
}

async function getRadarData(filters = {}) {
  if (radarCache.lastUpdated && (Date.now() - new Date(radarCache.lastUpdated).getTime()) < CACHE_TTL) {
    return applyFilters(radarCache.aircraft, filters);
  }

  const rawAircraft = await fetchLiveAircraft();
  const enriched = await mergeWithFlightData(rawAircraft);

  radarCache = { aircraft: enriched, lastUpdated: new Date().toISOString() };
  return applyFilters(enriched, filters);
}

function applyFilters(aircraft, filters) {
  let result = [...aircraft];

  if (filters.altitude === 'ground') {
    result = result.filter(a => a.onGround);
  } else if (filters.altitude === 'low') {
    result = result.filter(a => !a.onGround && a.altitude < 20000);
  } else if (filters.altitude === 'high') {
    result = result.filter(a => !a.onGround && a.altitude >= 20000);
  }

  if (filters.callsign) {
    result = result.filter(a => a.callsign.toLowerCase().includes(filters.callsign.toLowerCase()));
  }

  result.sort((a, b) => (b.isTracked ? 1 : 0) - (a.isTracked ? 1 : 0));

  return {
    aircraft: result,
    total: result.length,
    tracked: result.filter(a => a.isTracked).length,
    center: { lat: DEFAULT_LAT, lng: DEFAULT_LNG },
    lastUpdated: radarCache.lastUpdated,
  };
}

module.exports = { getRadarData, fetchLiveAircraft };