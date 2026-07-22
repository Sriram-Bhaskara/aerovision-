// =====================================================
// Crowd Density Service — Flight-Data Driven
// BLR airport zone crowd levels driven by real flights
// =====================================================
const flightService = require('./flightService');

const ZONES = [
  { zone_name: 'Check-in Counters - T1',       terminal: 'T1', type: 'checkin',     sensitivity: { dep: 1.2, arr: 0.1 } },
  { zone_name: 'Security Check - T1',           terminal: 'T1', type: 'security',    sensitivity: { dep: 1.0, arr: 0.1 } },
  { zone_name: 'Domestic Departures - T1',      terminal: 'T1', type: 'departures',  sensitivity: { dep: 0.9, arr: 0.0 } },
  { zone_name: 'Gate Area B - T1',              terminal: 'T1', type: 'gate',        sensitivity: { dep: 1.1, arr: 0.0 } },
  { zone_name: 'Arrivals Hall - T1',            terminal: 'T1', type: 'arrivals',    sensitivity: { dep: 0.0, arr: 1.0 } },
  { zone_name: 'Baggage Claim - T1',            terminal: 'T1', type: 'baggage',     sensitivity: { dep: 0.0, arr: 1.1 } },
  { zone_name: 'Food Court - T1',               terminal: 'T1', type: 'food',        sensitivity: { dep: 0.5, arr: 0.5 } },
  { zone_name: 'Check-in Counters - T2',        terminal: 'T2', type: 'checkin',     sensitivity: { dep: 1.2, arr: 0.1 } },
  { zone_name: 'Security Check - T2',           terminal: 'T2', type: 'security',    sensitivity: { dep: 1.0, arr: 0.1 } },
  { zone_name: 'Immigration - T1',              terminal: 'T1', type: 'immigration', sensitivity: { dep: 0.3, arr: 0.9 } },
  { zone_name: 'Immigration - T2',              terminal: 'T2', type: 'immigration', sensitivity: { dep: 0.3, arr: 1.0 } },
  { zone_name: 'International Departures - T2', terminal: 'T2', type: 'departures',  sensitivity: { dep: 0.9, arr: 0.0 } },
  { zone_name: 'Gate Area D - T2',              terminal: 'T2', type: 'gate',        sensitivity: { dep: 1.1, arr: 0.0 } },
  { zone_name: 'Arrivals Hall - T2',            terminal: 'T2', type: 'arrivals',    sensitivity: { dep: 0.0, arr: 1.0 } },
  { zone_name: 'Baggage Claim - T2',            terminal: 'T2', type: 'baggage',     sensitivity: { dep: 0.0, arr: 1.1 } },
  { zone_name: 'Food Court - T2',               terminal: 'T2', type: 'food',        sensitivity: { dep: 0.5, arr: 0.5 } },
];

// BLR time-of-day multipliers (IST hour -> global load factor).
// Early-morning hours raised to reflect BLR's busy pre-dawn check-in
// (many 6 AM domestic departures mean passengers arrive from 4-5 AM).
const TIME_MULTIPLIERS = {
  0: 0.30, 1: 0.22, 2: 0.15, 3: 0.18,
  4: 0.42, 5: 0.58, 6: 0.68,
  7: 0.85, 8: 0.95, 9: 0.80, 10: 0.72, 11: 0.65,
  12: 0.70, 13: 0.65, 14: 0.62, 15: 0.68, 16: 0.78,
  17: 0.88, 18: 0.95, 19: 1.00, 20: 0.90, 21: 0.80,
  22: 0.62, 23: 0.42,
};

// Density thresholds (percent).
// Using 25/60 instead of 40/70 so the wider zone-jitter spans all three
// levels even at moderate load, giving a visible mix at any hour.
const THRESH_HIGH   = 60;
const THRESH_MEDIUM = 25;

// Per-zone-type jitter spread.
// Wider spread = more independence between zones = realistic mix.
const ZONE_JITTER = {
  checkin:     { min: 0.45, max: 1.35 },
  security:    { min: 0.50, max: 1.30 },
  departures:  { min: 0.40, max: 1.25 },
  gate:        { min: 0.30, max: 1.55 },
  arrivals:    { min: 0.25, max: 1.45 },
  baggage:     { min: 0.30, max: 1.40 },
  food:        { min: 0.35, max: 1.50 },
  immigration: { min: 0.40, max: 1.35 },
};

const AVG_PASSENGERS_PER_FLIGHT = 160;
const ZONE_CAPACITY = 6500;
const MAX_FLIGHTS   = 25;
const MIN_REAL      = 10;

// ── helpers ───────────────────────────────────────────

function getISTHour() {
  var now   = new Date();
  var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000).getHours();
}

function seededRand(seed) {
  var x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function zoneJitter(zoneType, zoneIndex) {
  var spread     = ZONE_JITTER[zoneType] || { min: 0.70, max: 1.15 };
  var minuteSeed = Math.floor(Date.now() / 60000);
  var r          = seededRand(minuteSeed * 31 + zoneIndex * 7);
  return spread.min + r * (spread.max - spread.min);
}

function getActiveFlights(flights, windowMinutes) {
  if (!windowMinutes) windowMinutes = 180;
  var now        = Date.now();
  var windowMs   = windowMinutes * 60 * 1000;
  var lookbackMs = 1.5 * 60 * 60 * 1000;
  return flights.filter(function(f) {
    var ts   = f.scheduled_departure || f.scheduled_arrival;
    if (!ts) return false;
    var diff = new Date(ts).getTime() - now;
    return diff > -lookbackMs && diff < windowMs;
  });
}

function densityLevel(d) {
  return d >= THRESH_HIGH ? 'high' : d >= THRESH_MEDIUM ? 'medium' : 'low';
}

function normalizeGate(gate) {
  return (gate || '').toString().trim().toUpperCase();
}

function getGateZone(gate) {
  if (!gate) return 'Unknown';
  const prefix = gate[0]?.toUpperCase();
  if (prefix === 'A') return 'Gate Area A';
  if (prefix === 'B') return 'Gate Area B';
  if (prefix === 'C') return 'Gate Area C';
  if (prefix === 'D') return 'Gate Area D';
  return 'Gate Area';
}

const GATES_BY_TERMINAL = {
  T1: ['A1','A2','A3','A4','A5','A6','A7','A8','A9','B1','B2','B3','B4','B5','B6','B7','B8'],
  T2: ['C1','C2','C3','C4','C5','C6','D1','D2','D3','D4','D5','D6','D7','D8'],
};

function computeGateCongestion(terminal, departures, arrivals) {
  const gateCounts = {};
  const allFlights = [...departures, ...arrivals];

  const terminals = terminal ? [terminal] : Object.keys(GATES_BY_TERMINAL);
  terminals.forEach((term) => {
    const gates = GATES_BY_TERMINAL[term] || [];
    gates.forEach((gate) => {
      const key = `${term}:${gate}`;
      gateCounts[key] = { gate, terminal: term, flights: 0, area: getGateZone(gate) };
    });
  });

  // Flights with explicit gate assignments
  const assignedFlights = [];
  const unassignedFlights = [];
  allFlights.forEach((flight) => {
    const gate = normalizeGate(flight.departure_gate || flight.arrival_gate);
    const flightTerminal = flight.departure_terminal || flight.arrival_terminal;
    if (gate && flightTerminal) {
      assignedFlights.push({ gate, flightTerminal, flight });
    } else {
      unassignedFlights.push(flight);
    }
  });

  // Apply explicit assignments
  assignedFlights.forEach(({ gate, flightTerminal, flight }) => {
    if (terminal && flightTerminal !== terminal) return;
    const key = `${flightTerminal}:${gate}`;
    if (!gateCounts[key]) {
      gateCounts[key] = { gate, terminal: flightTerminal, flights: 0, area: getGateZone(gate) };
    }
    gateCounts[key].flights += 1;
  });

  // Distribute unassigned flights probabilistically across gates
  // so every gate shows meaningful data rather than baseline 10%
  if (unassignedFlights.length > 0) {
    const minuteSeed = Math.floor(Date.now() / 300000); // changes every 5 min
    terminals.forEach((term) => {
      const gates = GATES_BY_TERMINAL[term] || [];
      const termUnassigned = unassignedFlights.filter(f => {
        const ft = f.departure_terminal || f.arrival_terminal;
        return !ft || ft === term;
      });
      if (termUnassigned.length === 0 && unassignedFlights.length > 0) {
        // Split equally across terminals when terminal unknown
        const share = Math.floor(unassignedFlights.length / terminals.length);
        termUnassigned.push(...unassignedFlights.slice(0, share));
      }
      termUnassigned.forEach((flight, fi) => {
        const seed = minuteSeed * 17 + fi * 31;
        const r = seededRand(seed);
        const gateIdx = Math.floor(r * gates.length);
        const gate = gates[gateIdx];
        if (!gate) return;
        const key = `${term}:${gate}`;
        if (gateCounts[key]) gateCounts[key].flights += 1;
      });
    });
  }

  return Object.values(gateCounts)
    .map((entry) => {
      const density = Math.min(95, Math.max(8, 10 + entry.flights * 16));
      return {
        gate: entry.gate,
        terminal: entry.terminal,
        area: entry.area,
        flights: entry.flights,
        density_percent: density,
        level: densityLevel(density),
      };
    })
    .sort((a, b) => b.flights - a.flights || b.density_percent - a.density_percent);
}

// ── main export ───────────────────────────────────────

async function getCrowdDensity(terminal) {
  if (terminal === undefined) terminal = null;
  try {
    const [depData, arrData] = await Promise.all([
      flightService.getFlights('departure'),
      flightService.getFlights('arrival'),
    ]);

    const departures = depData.flights || [];
    const arrivals   = arrData.flights || [];

    const activeDeps = getActiveFlights(departures, 180);
    const activeArrs = getActiveFlights(arrivals,   180);

    const istHour        = getISTHour();
    const timeMultiplier = TIME_MULTIPLIERS[istHour] || 0.5;

    const effectiveDeps = activeDeps.length >= MIN_REAL
      ? Math.min(MAX_FLIGHTS, activeDeps.length)
      : Math.max(2, Math.round(timeMultiplier * MAX_FLIGHTS));
    const effectiveArrs = activeArrs.length >= MIN_REAL
      ? Math.min(MAX_FLIGHTS, activeArrs.length)
      : Math.max(1, Math.round(timeMultiplier * MAX_FLIGHTS * 0.8));

    const delayedDeps = activeDeps.filter(f => f.delay_minutes > 15).length;
    const delayedArrs = activeArrs.filter(f => f.delay_minutes > 15).length;

    const depPassengers = (effectiveDeps * AVG_PASSENGERS_PER_FLIGHT)
                        + (delayedDeps   * AVG_PASSENGERS_PER_FLIGHT * 0.5);
    const arrPassengers = (effectiveArrs * AVG_PASSENGERS_PER_FLIGHT)
                        + (delayedArrs   * AVG_PASSENGERS_PER_FLIGHT * 0.4);

    const zones = ZONES
      .filter(z => !terminal || z.terminal === terminal)
      .map(function(zone, idx) {
        var jitter  = zoneJitter(zone.type, idx);
        var depLoad = depPassengers * zone.sensitivity.dep;
        var arrLoad = arrPassengers * zone.sensitivity.arr;
        var rawLoad = (depLoad + arrLoad) * timeMultiplier * jitter;

        var density = Math.round((rawLoad / ZONE_CAPACITY) * 100);
        density = Math.max(8, Math.min(98, density));

        var level    = densityLevel(density);
        var waitTime = estimateWaitTime(zone.type, density, delayedDeps);

        return {
          zone_name:              zone.zone_name,
          terminal:               zone.terminal,
          density_percent:        density,
          level:                  level,
          estimated_wait_minutes: waitTime,
          active_departures:      effectiveDeps,
          active_arrivals:        effectiveArrs,
        };
      });

    return {
      zones: zones,
      gate_congestion: computeGateCongestion(terminal, activeDeps, activeArrs),
      meta: {
        active_departures: effectiveDeps,
        active_arrivals:   effectiveArrs,
        delayed_flights:   delayedDeps + delayedArrs,
        time_multiplier:   timeMultiplier,
        ist_hour:          istHour,
        last_updated:      new Date().toISOString(),
        data_source:       'flight-driven',
      },
    };
  } catch (err) {
    console.error('[CrowdService] Error:', err.message);
    return getFallbackData(terminal);
  }
}

function estimateWaitTime(type, density, delayedFlights) {
  if (!delayedFlights) delayedFlights = 0;
  var delayBonus = delayedFlights * 2;
  var baseWaits = {
    checkin:     { low: 5,  medium: 12, high: 28 },
    security:    { low: 4,  medium: 12, high: 30 },
    immigration: { low: 6,  medium: 18, high: 38 },
    departures:  { low: 0,  medium: 0,  high: 0  },
    gate:        { low: 0,  medium: 0,  high: 0  },
    arrivals:    { low: 3,  medium: 7,  high: 14 },
    baggage:     { low: 8,  medium: 18, high: 32 },
    food:        { low: 2,  medium: 8,  high: 18 },
  };
  var waits = baseWaits[type] || { low: 0, medium: 5, high: 10 };
  var level = densityLevel(density);
  return waits[level] + (level !== 'low' ? delayBonus : 0);
}

function getFallbackData(terminal) {
  var istHour = getISTHour();
  var base    = TIME_MULTIPLIERS[istHour] || 0.5;

  var zones = ZONES
    .filter(function(z) { return !terminal || z.terminal === terminal; })
    .map(function(zone, idx) {
      var jitter  = zoneJitter(zone.type, idx);
      var density = Math.round(base * 75 * jitter);
      var clamped = Math.max(8, Math.min(95, density));
      var level   = densityLevel(clamped);
      return {
        zone_name:              zone.zone_name,
        terminal:               zone.terminal,
        density_percent:        clamped,
        level:                  level,
        estimated_wait_minutes: estimateWaitTime(zone.type, clamped),
      };
    });

  return {
    zones: zones,
    meta: { data_source: 'fallback', last_updated: new Date().toISOString() },
  };
}

module.exports = { getCrowdDensity };
