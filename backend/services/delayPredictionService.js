// =====================================================
// AI Delay Prediction Service
// Predicts flight delays based on weather, historical data,
// airport congestion, and time patterns
// =====================================================
const { query } = require('../database/db');
const weatherService = require('./weatherService');
const flightService  = require('./flightService');

// ── Airline on-time performance scores (lower = more reliable) ──────────────
// Source: DGCA / OAG published delay rates, approximate
const AIRLINE_DELAY_SCORES = {
  '6E': { score: 22, name: 'IndiGo',            details: 'Best on-time in India (~78% OTP)' },
  'AI': { score: 38, name: 'Air India',          details: 'Moderate delays (~62% OTP)' },
  'UK': { score: 28, name: 'Vistara',            details: 'Good on-time record (~72% OTP)' },
  'SG': { score: 45, name: 'SpiceJet',           details: 'Higher delay rate (~55% OTP)' },
  'G8': { score: 42, name: 'Go First',           details: 'Moderate-high delays (~58% OTP)' },
  'I5': { score: 35, name: 'Air Asia India',     details: 'Moderate delays (~65% OTP)' },
  'EK': { score: 18, name: 'Emirates',           details: 'Excellent on-time (~82% OTP)' },
  'EY': { score: 20, name: 'Etihad Airways',     details: 'Excellent on-time (~80% OTP)' },
  'QR': { score: 15, name: 'Qatar Airways',      details: 'World-class on-time (~85% OTP)' },
  'SQ': { score: 12, name: 'Singapore Airlines', details: 'Top-tier on-time (~88% OTP)' },
  'BA': { score: 25, name: 'British Airways',    details: 'Good on-time record (~75% OTP)' },
  'LH': { score: 22, name: 'Lufthansa',          details: 'Good on-time record (~78% OTP)' },
  'TK': { score: 30, name: 'Turkish Airlines',   details: 'Moderate delays (~70% OTP)' },
  'KL': { score: 24, name: 'KLM',                details: 'Good on-time record (~76% OTP)' },
  'AF': { score: 28, name: 'Air France',         details: 'Moderate delays (~72% OTP)' },
};

/**
 * Deterministic hash of a string → integer 0..range-1
 * Used to replace Math.random() so the same flight always
 * gets the same predicted delay.
 */
function deterministicInt(seed, range) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return Math.abs(hash) % range;
}

/**
 * Predict delay for a flight based on multiple factors.
 * Uses a weighted scoring model (production would use ML).
 */
async function predictDelay(flightData) {
  const factors = {};
  let totalScore = 0;
  let maxScore   = 0;

  // ── Factor 1: Current Weather Impact (weight: 35%) ────────────────────────
  const weather = await weatherService.getWeather().catch(() => null);
  if (weather?.current) {
    const w = weather.current;
    let weatherScore = 0;

    if (w.windSpeed > 40)      weatherScore += 30;
    else if (w.windSpeed > 25) weatherScore += 15;
    else if (w.windSpeed > 15) weatherScore += 5;

    const vis = parseFloat(w.visibility);
    if (vis < 1)      weatherScore += 35;
    else if (vis < 3) weatherScore += 20;
    else if (vis < 5) weatherScore += 8;

    if      (w.condition === 'Thunderstorm')                  weatherScore += 35;
    else if (w.condition === 'Rain')                          weatherScore += 15;
    else if (w.condition === 'Fog' || w.condition === 'Mist') weatherScore += 25;
    else if (w.condition === 'Snow')                          weatherScore += 30;

    factors.weather = {
      score:   Math.min(weatherScore, 100),
      details: `${w.condition}, Wind ${w.windSpeed}kt, Vis ${w.visibility}km`,
      impact:  weatherScore > 50 ? 'high' : weatherScore > 20 ? 'medium' : 'low',
    };
    totalScore += weatherScore * 0.35;
    maxScore   += 100 * 0.35;
  }

  // ── Factor 2: Time of Day Pattern (weight: 15%) ───────────────────────────
  const istHour = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  ).getHours();

  let timeScore = 0;
  if      (istHour >= 6  && istHour <= 9)  timeScore = 25; // morning rush
  else if (istHour >= 17 && istHour <= 21) timeScore = 35; // evening peak
  else if (istHour >= 22 || istHour <= 5)  timeScore = 40; // late night
  else                                      timeScore = 10; // off-peak

  factors.timeOfDay = {
    score:   timeScore,
    details: `${istHour}:00 IST (${timeScore > 30 ? 'peak' : 'off-peak'} period)`,
    impact:  timeScore > 30 ? 'medium' : 'low',
  };
  totalScore += timeScore * 0.15;
  maxScore   += 100 * 0.15;

  // ── Factor 3: Historical Delay Rate (weight: 25%) ─────────────────────────
  // Try DB first; fall back to a deterministic per-airline score so the
  // factor is never "unknown" when the DB is empty.
  let historicalScore = 0;
  let historicalFromDB = false;

  try {
    const result = await query(`
      SELECT AVG(delay_minutes) as avg_delay,
             COUNT(*) as total,
             SUM(CASE WHEN delay_minutes > 15 THEN 1 ELSE 0 END) as delayed_count
      FROM flights
      WHERE flight_iata = $1
        AND flight_date >= date('now', '-30 days')
    `, [flightData?.flight_iata || '']);

    if (result.rows[0] && parseInt(result.rows[0].total) > 0) {
      const avgDelay  = parseFloat(result.rows[0].avg_delay) || 0;
      const total     = parseInt(result.rows[0].total);
      const delayed   = parseInt(result.rows[0].delayed_count);
      const delayRate = (delayed / total) * 100;
      historicalScore = Math.min(delayRate + avgDelay * 0.5, 100);
      historicalFromDB = true;

      factors.historical = {
        score:   Math.round(historicalScore),
        details: `${total} recorded flights · Avg delay: ${Math.round(avgDelay)}min · Rate: ${Math.round(delayRate)}%`,
        impact:  historicalScore > 50 ? 'high' : historicalScore > 25 ? 'medium' : 'low',
      };
    }
  } catch (e) {
    // DB unavailable — fall through to airline-based score
  }

  if (!historicalFromDB) {
    // Use published airline OTP data as proxy for historical reliability
    const airlineIata  = flightData?.airline_iata || (flightData?.flight_iata || '').slice(0, 2);
    const airlineInfo  = AIRLINE_DELAY_SCORES[airlineIata];
    historicalScore    = airlineInfo ? airlineInfo.score : 30;

    factors.historical = {
      score:   historicalScore,
      details: airlineInfo
        ? airlineInfo.details
        : 'Based on industry average on-time performance',
      impact: historicalScore > 40 ? 'high' : historicalScore > 25 ? 'medium' : 'low',
    };
  }

  totalScore += historicalScore * 0.25;
  maxScore   += 100 * 0.25;

  // ── Factor 4: Airport Congestion (weight: 15%) ────────────────────────────
  // Use the live flight cache instead of the empty DB.
  let congestionScore = 0;
  try {
    const [depData, arrData] = await Promise.all([
      flightService.getFlights('departure'),
      flightService.getFlights('arrival'),
    ]);
    const now = Date.now();
    const window = 60 * 60 * 1000; // ±1 hour

    const activeCount = [
      ...(depData.flights || []),
      ...(arrData.flights || []),
    ].filter(f => {
      const ts = f.scheduled_departure || f.scheduled_arrival;
      if (!ts) return false;
      const diff = Math.abs(new Date(ts).getTime() - now);
      return diff < window;
    }).length;

    if      (activeCount > 30) congestionScore = 60;
    else if (activeCount > 20) congestionScore = 40;
    else if (activeCount > 10) congestionScore = 20;
    else                       congestionScore = 8;

    factors.congestion = {
      score:   congestionScore,
      details: `${activeCount} flights active in ±1h window`,
      impact:  congestionScore > 40 ? 'high' : congestionScore > 20 ? 'medium' : 'low',
    };
  } catch (e) {
    congestionScore = 20;
    factors.congestion = { score: 20, details: 'Congestion data unavailable', impact: 'low' };
  }
  totalScore += congestionScore * 0.15;
  maxScore   += 100 * 0.15;

  // ── Factor 5: Airline Reliability (weight: 10%) ───────────────────────────
  const airlineIata2 = flightData?.airline_iata || (flightData?.flight_iata || '').slice(0, 2);
  const airlineInfo2 = AIRLINE_DELAY_SCORES[airlineIata2];
  const airlineScore = airlineInfo2 ? airlineInfo2.score : 30;

  factors.airline = {
    score:   airlineScore,
    details: airlineInfo2
      ? airlineInfo2.details
      : `${flightData?.airline_name || 'Airline'} — industry average`,
    impact: airlineScore > 40 ? 'high' : airlineScore > 25 ? 'medium' : 'low',
  };
  totalScore += airlineScore * 0.10;
  maxScore   += 100 * 0.10;

  // ── Final prediction ──────────────────────────────────────────────────────
  const probability = Math.min(Math.round((totalScore / maxScore) * 100), 95);

  let estimatedDelay = 0;
  let riskLevel      = 'low';

  // Use a deterministic seed so the same flight always returns the same value.
  // Seed = flightIata + today's date (refreshes each day but stable within a day)
  const seed = `${flightData?.flight_iata || 'UNK'}-${new Date().toISOString().slice(0, 10)}`;

  if (probability >= 70) {
    estimatedDelay = 30 + deterministicInt(seed, 61); // 30–90 min
    riskLevel      = 'critical';
  } else if (probability >= 50) {
    estimatedDelay = 15 + deterministicInt(seed, 31); // 15–45 min
    riskLevel      = 'high';
  } else if (probability >= 30) {
    estimatedDelay = 5  + deterministicInt(seed, 16); // 5–20 min
    riskLevel      = 'medium';
  } else {
    estimatedDelay = 0;
    riskLevel      = 'low';
  }

  const prediction = {
    flightIata:            flightData?.flight_iata,
    probability,
    estimatedDelayMinutes: estimatedDelay,
    riskLevel,
    factors,
    generatedAt:   new Date().toISOString(),
    modelVersion:  'v1.1-deterministic',
  };

  // Persist prediction (non-critical)
  try {
    await query(`
      INSERT INTO delay_predictions
        (flight_iata, flight_date, predicted_delay_minutes, delay_probability, risk_level, factors)
      VALUES ($1, CURRENT_DATE, $2, $3, $4, $5)
    `, [flightData?.flight_iata, estimatedDelay, probability, riskLevel, JSON.stringify(factors)]);
  } catch (e) { /* non-critical */ }

  return prediction;
}

module.exports = { predictDelay };
