// =====================================================
// Currency Routes — Live forex rates (travel-focused)
// Uses Fawaz Ahmed's free currency API (no key needed)
// Caches rates for 1 hour to avoid hammering the API
// =====================================================
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

// Currencies relevant to BLR travelers
const TRAVEL_CURRENCIES = ['usd','eur','gbp','aed','sgd','jpy','aud','cad','thb','myr','hkd','chf'];

let _cache = null;     // { date, rates: { usd: 0.012, ... }, fetchedAt }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchRates() {
  // Fawaz Ahmed currency API — completely free, no key, good coverage
  const url = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/inr.json';
  const res  = await fetch(url, { timeout: 8000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // data.inr = { usd: 0.012, eur: 0.011, aed: 0.044, ... }
  const all   = data.inr || {};
  const rates = {};
  for (const key of TRAVEL_CURRENCIES) {
    if (all[key] !== undefined) rates[key] = all[key];
  }
  return { date: data.date, rates };
}

// GET /api/currency/rates
router.get('/rates', async (req, res) => {
  const now = Date.now();
  // Return cache if still fresh
  if (_cache && (now - _cache.fetchedAt) < CACHE_TTL) {
    return res.json({ ..._cache, cached: true });
  }
  try {
    const { date, rates } = await fetchRates();
    _cache = { date, rates, fetchedAt: now, base: 'INR' };
    return res.json({ ..._cache, cached: false });
  } catch (err) {
    console.error('[Currency] Fetch error:', err.message);
    // Serve stale cache rather than fail
    if (_cache) return res.json({ ..._cache, cached: true, stale: true });
    return res.status(503).json({ error: 'Currency data unavailable. Try again shortly.' });
  }
});

module.exports = router;
