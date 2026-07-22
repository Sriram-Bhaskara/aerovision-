// =====================================================
// AI Chatbot Service — Streaming + Parallel Race
// Providers: Gemini ∥ Claude (race) → OpenRouter → HuggingFace → Rule-based
// Fixes applied:
//   • Flight regex requires 3-4 digits (won't match airline codes like G8/I5)
//   • Per-flight lookup cache (5-min TTL) — stops redundant AeroDataBox calls
//   • chunksSent guard — partial fallthrough no longer corrupts messages
//   • max_tokens 400 → 700 — responses won't get cut short
//   • HTTP-Referer uses FRONTEND_URL env var
//   • Stable sessionId accepted from caller for consistent chat history
//   • HuggingFace now streams (same SSE format as OpenRouter)
//   • History window extended to 12 recent turns
// =====================================================
const axios = require('axios');
const fetch = require('node-fetch');
const { query } = require('../database/db');
const flightService   = require('./flightService');
const weatherService  = require('./weatherService');
const crowdService    = require('./crowdService');
const radarService    = require('./radarService');
const delayPrediction = require('./delayPredictionService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── System prompt ──────────────────────────────────────────────
const SYSTEM_PROMPT = `You are AeroBot, the AI assistant for AeroVision — a real-time airport intelligence platform for Bengaluru Kempegowda International Airport (BLR/VOBL), built by Sriram.

Stack: React 18 + Vite + Tailwind + Framer Motion; Node.js/Express; SQLite via sql.js; JWT auth; Socket.io; OpenWeather, OpenSky ADS-B, AeroDataBox, TomTom APIs.

REAL DATA:
- Weather: live from OpenWeather API
- ADS-B radar: live aircraft positions from OpenSky /states/all within BLR bounding box
- Flight board: real BLR FIDS from AeroDataBox (cached 2h — free tier 500 calls/month)
- Crowd density: computed from real flight counts × time-of-day × zone sensitivity
- AI delay predictions: Claude Haiku weighted model (weather 35%, OTP 25%, time-of-day 15%, congestion 15%, airline 10%)

PAGES:
/ Home — live ticker, weather, hero search, flight stats, feature grid
/flights — Live Flight Board: departures+arrivals, filters (airline/status), click row → details, auto-refresh 30s
/radar — Leaflet map: live ADS-B orange ▲ (real positions), board flights amber ▲ (interpolated), airport purple ✈. Search highlights aircraft with cyan ring + route line, side panel on click
/weather — OpenWeather data, METAR-style, hourly+7-day forecast, flight impact assessment
/crowd — Zone-level crowd heat map for T1/T2, wait-time predictions
/chatbot — This assistant. Live flight/weather/crowd context injected per message
/assist — Wheelchair and buggy booking with eligibility verification
/currency — Real-time INR currency converter for 12 travel currencies
/compare — Side-by-side flight comparison (up to 3 flights)

BLR AIRPORT: Kempegowda International Airport, Devanahalli, 40 km north. T1 (domestic): gates A1-A6, B1-B6. T2 (international): gates D1-D8. Two parallel runways: 09/27 and 09R/27L (both 4000 m).

AIRLINES: Domestic T1 — IndiGo (6E, ~78% OT), Air India (AI, 62%), SpiceJet (SG, 55%), Vistara (UK, 72%), Air Asia (I5, 65%), Go First (G8, 58%). International T2 — Emirates (EK, 82%), Qatar (QR, 85%), Singapore Airlines (SQ, 88%), British Airways (BA, 75%), Lufthansa (LH, 78%), Etihad (EY, 80%), Air France (AF, 72%), Malaysian (MH, 70%).

LIMITS: AeroDataBox 500 calls/month → 2 h cache; OpenSky /flights/* 403 on free (only /states/all works); SQLite not PostgreSQL; indoor map is static.

RULES: You are a general-purpose AI assistant — answer any topic the user asks about (science, history, coding, advice, general knowledge, etc.) helpfully and accurately. When the topic relates to BLR airport, flights, weather, crowd, or AeroVision features, use the live data injected below. Never fabricate specific flight data not in context. Be concise (under 200 words unless more depth is explicitly requested). Use ✈ 🛬 ⏱ 🌤 📍 sparingly.`;

// ── Global context cache (60-second TTL) ──────────────────────
const _ctxCache = { data: null, ts: 0 };
const CTX_TTL = 60_000;

async function getCachedContext() {
  if (_ctxCache.data && (Date.now() - _ctxCache.ts) < CTX_TTL) return _ctxCache.data;

  const [weatherData, flightStats, crowdData, radarData, depData, arrData] = await Promise.all([
    weatherService.getWeather().catch(() => null),
    flightService.getFlightStats().catch(() => null),
    crowdService.getCrowdDensity().catch(() => null),
    radarService.getRadarData().catch(() => null),
    flightService.getFlights('departure').catch(() => ({ flights: [] })),
    flightService.getFlights('arrival').catch(() => ({ flights: [] })),
  ]);

  const deps = depData.flights || [];
  const arrs = arrData.flights || [];
  const all  = [...deps, ...arrs];
  const now  = Date.now();

  _ctxCache.data = {
    weatherData, flightStats, crowdData, radarData,
    cancelledFlights: all.filter(f => f.status === 'cancelled'),
    delayedFlights:   all.filter(f => f.delay_minutes > 0).sort((a, b) => b.delay_minutes - a.delay_minutes),
    activeFlights:    all.filter(f => f.status === 'active'),
    upcomingDeps: deps
      .filter(f => f.status === 'scheduled' && new Date(f.scheduled_departure || 0) > now)
      .sort((a, b) => new Date(a.scheduled_departure) - new Date(b.scheduled_departure))
      .slice(0, 5),
    upcomingArrs: arrs
      .filter(f => ['active', 'scheduled'].includes(f.status) && new Date(f.scheduled_arrival || 0) > now)
      .sort((a, b) => new Date(a.scheduled_arrival) - new Date(b.scheduled_arrival))
      .slice(0, 5),
    totalDeps: deps.length, totalArrs: arrs.length,
  };
  _ctxCache.ts = Date.now();
  return _ctxCache.data;
}

// Pre-warm cache every 55 seconds — no cold start on first message
setInterval(() => getCachedContext().catch(() => {}), 55_000);

// ── Per-flight lookup cache (5-minute TTL) ─────────────────────
// Prevents repeated AeroDataBox API calls for the same flight number
const _flightCache = new Map(); // iata → { flightContext, delayContext, ts }
const FLIGHT_CACHE_TTL = 5 * 60_000;

// ── Flight number regex (FIXED) ────────────────────────────────
// Requires 3-4 digit suffix so we don't match bare airline codes like G8, I5
// Valid: 6E2341, AI 101, EK 571  |  Invalid: G8, I5, SG alone
const FLIGHT_NUM_RE = /\b([A-Z0-9]{1,2})\s?(\d{3,4})\b/;

// ── Build live context string ──────────────────────────────────
async function buildContext(userMessage, userId) {
  const ctx = await getCachedContext();
  const {
    weatherData, flightStats, crowdData, radarData,
    cancelledFlights, delayedFlights, activeFlights,
    upcomingDeps, upcomingArrs, totalDeps, totalArrs,
  } = ctx;

  // Per-flight lookup — only when user mentions a valid flight number
  let flightContext = '';
  let delayContext  = '';
  const flightMatch = userMessage.match(FLIGHT_NUM_RE);
  if (flightMatch) {
    const iata = (flightMatch[1] + flightMatch[2]).toUpperCase();
    const now   = Date.now();
    const cached = _flightCache.get(iata);

    if (cached && (now - cached.ts) < FLIGHT_CACHE_TTL) {
      flightContext = cached.flightContext;
      delayContext  = cached.delayContext;
    } else {
      const flight = await flightService.searchFlight(iata).catch(() => null);
      const pred   = await delayPrediction.predictDelay(flight || { flight_iata: iata }).catch(() => null);

      if (flight) {
        flightContext = `\n✈ ${flight.flight_iata}: ${flight.airline_name} ${flight.departure_airport}→${flight.arrival_airport} | ${flight.statusLabel || flight.status} | Gate ${flight.departure_gate || 'TBD'} T${flight.departure_terminal || '?'} | Delay: ${flight.delay_minutes || 0}min`;
      }
      if (pred) {
        delayContext = `\n⏱ Delay prediction: ${pred.riskLevel} (${pred.probability}%), ~${pred.estimatedDelayMinutes}min estimated`;
      }
      _flightCache.set(iata, { flightContext, delayContext, ts: now });
    }
  }

  // Saved flights for logged-in users
  let savedCtx = '';
  if (userId) {
    try {
      const saved = query('SELECT flight_iata FROM saved_flights WHERE user_id = ? ORDER BY created_at DESC LIMIT 5', [userId]);
      if ((saved.rows || []).length) savedCtx = `\nSaved: ${saved.rows.map(f => f.flight_iata).join(', ')}`;
    } catch {}
  }

  const fmt = (iso, tz = 'Asia/Kolkata') =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }) : '?';

  let live = '\n\n━ LIVE DATA ━';
  if (weatherData?.current) {
    const w = weatherData.current;
    live += `\nWeather: ${w.temperature}°C ${w.condition || w.description}, Wind ${w.windSpeed}kt, Vis ${w.visibility}km, Humidity ${w.humidity}%`;
  }
  if (flightStats) {
    live += `\nFlights today: ${flightStats.total} total | ${flightStats.onTime} on-time | ${flightStats.delayed} delayed (avg ${Math.round(flightStats.avgDelay || 0)}min) | ${flightStats.cancelled} cancelled`;
    live += `\nBoard: ${totalDeps} dep / ${totalArrs} arr | In-flight now: ${activeFlights?.length || 0}`;
  }
  if (cancelledFlights?.length) {
    live += `\nCANCELLED (${cancelledFlights.length}): ` +
      cancelledFlights.slice(0, 6).map(f => `${f.flight_iata}(${f.airline_iata || '?'}) ${f.departure_airport}→${f.arrival_airport}`).join(', ');
  }
  if (delayedFlights?.length) {
    live += `\nDELAYED (${delayedFlights.length}): ` +
      delayedFlights.slice(0, 4).map(f => `${f.flight_iata} +${f.delay_minutes}min`).join(', ');
  }
  if (upcomingDeps?.length) {
    live += `\nNEXT DEP: ` +
      upcomingDeps.map(f => `${f.flight_iata} ${fmt(f.scheduled_departure)} Gate${f.departure_gate || 'TBD'} T${f.departure_terminal || '?'}`).join(' | ');
  }
  if (upcomingArrs?.length) {
    live += `\nNEXT ARR: ` +
      upcomingArrs.map(f => `${f.flight_iata} ${fmt(f.scheduled_arrival)} Gate${f.arrival_gate || 'TBD'}`).join(' | ');
  }
  if (crowdData?.zones) {
    const high = crowdData.zones.filter(z => z.level === 'high');
    if (high.length) live += `\nCrowd high zones: ${high.slice(0, 3).map(z => `${z.zone_name} ${z.density_percent}% (~${z.estimated_wait_minutes}min)`).join(', ')}`;
  }
  if (radarData) {
    const aircraft = Array.isArray(radarData) ? radarData : (radarData.aircraft || []);
    const adsb = aircraft.filter(a => a.source === 'adsb' || a.latitude);
    live += `\nRadar: ${aircraft.length} tracked | ${adsb.length} live ADS-B`;
  }

  return live + flightContext + delayContext + savedCtx;
}

// ── History compression — keep last 12 turns verbatim ──────────
function compressHistory(history) {
  const clean = history
    .slice(-16) // look at up to 16 messages
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) }));

  if (clean.length <= 12) return { recentHistory: clean, summaryPrefix: '' };

  const older  = clean.slice(0, clean.length - 12);
  const topics = older.filter(m => m.role === 'user').map(m => m.content.slice(0, 100)).join('; ');
  return {
    recentHistory: clean.slice(-12),
    summaryPrefix: topics ? `[Earlier this session the user asked about: ${topics}]\n` : '',
  };
}

// ── SSE body pipers ────────────────────────────────────────────
function pipeGeminiBody(response, onChunk) {
  let buffer = '';
  return new Promise((resolve, reject) => {
    response.body.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) onChunk(text);
        } catch {}
      }
    });
    response.body.on('end', resolve);
    response.body.on('error', reject);
  });
}

function pipeClaudeBody(response, onChunk) {
  let buffer = '';
  return new Promise((resolve, reject) => {
    response.body.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const text = parsed.delta.text || '';
            if (text) onChunk(text);
          }
        } catch {}
      }
    });
    response.body.on('end', resolve);
    response.body.on('error', reject);
  });
}

// Used for both OpenRouter AND HuggingFace (same OpenAI-compat SSE format)
function pipeOpenAIBody(response, onChunk) {
  let buffer = '';
  return new Promise((resolve, reject) => {
    response.body.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const parsed = JSON.parse(raw);
          const text = parsed.choices?.[0]?.delta?.content || '';
          if (text) onChunk(text);
        } catch {}
      }
    });
    response.body.on('end', resolve);
    response.body.on('error', reject);
  });
}

// ── Main streaming response (SSE) ─────────────────────────────
async function streamResponse(userMessage, userId, history, res, sessionId) {
  const sendChunk = (text) => { try { res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`); } catch {} };
  const sendDone  = (powered_by) => { try { res.write(`data: ${JSON.stringify({ done: true, powered_by })}\n\n`); res.end(); } catch {} };

  const [liveContext, compressed] = await Promise.all([
    buildContext(userMessage, userId).catch(() => ''),
    Promise.resolve(compressHistory(history)),
  ]);
  const { recentHistory, summaryPrefix } = compressed;
  const fullSystem  = SYSTEM_PROMPT + liveContext;
  const userContent = summaryPrefix + userMessage;

  const messages = [...recentHistory, { role: 'user', content: userContent }];
  const geminiContents = [
    { role: 'user',  parts: [{ text: fullSystem }] },
    { role: 'model', parts: [{ text: 'Ready.' }] },
    ...recentHistory.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: userContent }] },
  ];

  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const orKey        = process.env.OPENROUTER_API_KEY;
  const hfKey        = process.env.HUGGINGFACE_API_KEY;

  // ── Race Gemini and Claude simultaneously ──────────────────────
  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();
  const racers = [];

  if (geminiKey) racers.push(
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${geminiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiContents, generationConfig: { maxOutputTokens: 700, temperature: 0.7 } }),
        signal: ctrl1.signal,
      }
    ).then(r => {
      if (!r.ok) throw new Error(`Gemini ${r.status}`);
      return { provider: 'gemini', response: r, kill: () => { try { ctrl2.abort(); } catch {} } };
    })
  );

  if (anthropicKey) racers.push(
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, stream: true, system: fullSystem, messages }),
      signal: ctrl2.signal,
    }).then(r => {
      if (!r.ok) throw new Error(`Claude ${r.status}`);
      return { provider: 'claude', response: r, kill: () => { try { ctrl1.abort(); } catch {} } };
    })
  );

  if (racers.length > 0) {
    let winner = null;
    try { winner = await Promise.any(racers.map(p => p.catch(e => Promise.reject(e)))); } catch {}

    if (winner) {
      winner.kill();
      let fullText  = '';
      let chunksSent = 0; // GUARD: track how many chunks we've sent
      const onChunk = (text) => { chunksSent++; fullText += text; sendChunk(text); };
      try {
        if (winner.provider === 'gemini') await pipeGeminiBody(winner.response, onChunk);
        else                              await pipeClaudeBody(winner.response, onChunk);

        if (fullText) {
          saveChatHistory(userId, sessionId, userMessage, fullText).catch(() => {});
          sendDone(winner.provider);
          return;
        }
      } catch (err) {
        console.warn(`[Chat] Stream pipe error (${winner.provider}):`, err.message);
        // If we already sent partial content, DON'T fall through to another provider
        // — that would concatenate two responses. Close cleanly.
        if (chunksSent > 0) {
          saveChatHistory(userId, sessionId, userMessage, fullText).catch(() => {});
          sendDone(winner.provider);
          return;
        }
      }
    }
  }

  // ── OpenRouter fallback — race all free models ─────────────────
  if (orKey) {
    const OR_MODELS = [
      process.env.OPENROUTER_MODEL || '',
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'qwen/qwen3-8b:free',
    ].filter(Boolean);

    const orCtrls  = OR_MODELS.map(() => new AbortController());
    const orRacers = OR_MODELS.map((model, i) =>
      fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
          'HTTP-Referer': FRONTEND_URL,
          'X-Title': 'AeroVision',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model, max_tokens: 700, temperature: 0.7, stream: true,
          messages: [{ role: 'system', content: fullSystem }, ...messages],
        }),
        signal: orCtrls[i].signal,
      }).then(r => {
        if (!r.ok) throw new Error(`OR ${r.status} (${model})`);
        orCtrls.forEach((c, j) => { if (j !== i) try { c.abort(); } catch {} });
        return { model, response: r };
      })
    );

    let orWinner = null;
    try { orWinner = await Promise.any(orRacers); } catch {}

    if (orWinner) {
      let fullText   = '';
      let chunksSent = 0;
      const onChunk  = (text) => { chunksSent++; fullText += text; sendChunk(text); };
      try {
        await pipeOpenAIBody(orWinner.response, onChunk);
        if (fullText) {
          saveChatHistory(userId, sessionId, userMessage, fullText).catch(() => {});
          sendDone('openrouter');
          return;
        }
      } catch (err) {
        console.warn('[Chat] OpenRouter stream error:', err.message);
        if (chunksSent > 0) {
          saveChatHistory(userId, sessionId, userMessage, fullText).catch(() => {});
          sendDone('openrouter');
          return;
        }
      }
    }
  }

  // ── HuggingFace last resort — now streaming ────────────────────
  if (hfKey) {
    const HF_MODELS = [process.env.HF_MODEL || '', 'Qwen/Qwen2.5-7B-Instruct'].filter(Boolean);
    for (const model of HF_MODELS) {
      try {
        const hfRes = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: fullSystem }, ...recentHistory, { role: 'user', content: userMessage }],
            max_tokens: 700, temperature: 0.7,
            stream: true, // ← now streaming!
          }),
        });
        if (!hfRes.ok) continue;

        let fullText   = '';
        let chunksSent = 0;
        const onChunk  = (text) => { chunksSent++; fullText += text; sendChunk(text); };
        await pipeOpenAIBody(hfRes, onChunk);

        if (fullText) {
          saveChatHistory(userId, sessionId, userMessage, fullText).catch(() => {});
          sendDone('huggingface');
          return;
        }
      } catch {}
    }
  }

  // ── Rule-based fallback ─────────────────────────────────────────
  const fallback = getFallbackResponse(userMessage);
  sendChunk(fallback.reply);
  sendDone('fallback');
}

// ── Non-streaming response (kept for /message fallback) ─────────
async function getResponse(userMessage, userId = null, history = [], sessionId = null) {
  const [liveContext, compressed] = await Promise.all([
    buildContext(userMessage, userId).catch(() => ''),
    Promise.resolve(compressHistory(history)),
  ]);
  const { recentHistory, summaryPrefix } = compressed;
  const fullSystem  = SYSTEM_PROMPT + liveContext;
  const userContent = summaryPrefix + userMessage;
  const messages    = [...recentHistory, { role: 'user', content: userContent }];
  const geminiContents = [
    { role: 'user',  parts: [{ text: fullSystem }] },
    { role: 'model', parts: [{ text: 'Ready.' }] },
    ...recentHistory.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: userContent }] },
  ];

  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const orKey        = process.env.OPENROUTER_API_KEY;
  const hfKey        = process.env.HUGGINGFACE_API_KEY;

  const racePool = [];
  if (geminiKey) racePool.push(
    axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { contents: geminiContents, generationConfig: { maxOutputTokens: 700, temperature: 0.7 } },
      { timeout: 12000 }
    ).then(r => {
      const reply = r.data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error('Gemini empty');
      return { reply, powered_by: 'gemini' };
    })
  );
  if (anthropicKey) racePool.push(
    axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001', max_tokens: 700, system: fullSystem, messages,
    }, {
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      timeout: 15000,
    }).then(r => {
      const reply = r.data.content?.[0]?.text;
      if (!reply) throw new Error('Claude empty');
      return { reply, powered_by: 'claude' };
    })
  );

  if (racePool.length > 0) {
    try {
      const winner = await Promise.any(racePool);
      saveChatHistory(userId, sessionId, userMessage, winner.reply).catch(() => {});
      return { reply: winner.reply, powered_by: winner.powered_by, context: {} };
    } catch {}
  }

  if (orKey) {
    const OR_MODELS = [
      process.env.OPENROUTER_MODEL || '',
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-3.1-8b-instruct:free',
    ].filter(Boolean);
    for (const model of OR_MODELS) {
      try {
        const r = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model, max_tokens: 700, temperature: 0.7,
          messages: [{ role: 'system', content: fullSystem }, ...messages],
        }, {
          headers: {
            'Authorization': `Bearer ${orKey}`,
            'HTTP-Referer': FRONTEND_URL,
            'X-Title': 'AeroVision',
            'Content-Type': 'application/json',
          },
          timeout: 12000,
        });
        const reply = r.data?.choices?.[0]?.message?.content;
        if (reply) {
          saveChatHistory(userId, sessionId, userMessage, reply).catch(() => {});
          return { reply, powered_by: 'openrouter', context: {} };
        }
      } catch {}
    }
  }

  if (hfKey) {
    const HF_MODELS = [process.env.HF_MODEL || '', 'Qwen/Qwen2.5-7B-Instruct'].filter(Boolean);
    for (const model of HF_MODELS) {
      try {
        const r = await axios.post('https://router.huggingface.co/v1/chat/completions', {
          model,
          messages: [{ role: 'system', content: fullSystem }, ...recentHistory, { role: 'user', content: userMessage }],
          max_tokens: 700, temperature: 0.7, stream: false,
        }, {
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          timeout: 25000,
        });
        const reply = r.data.choices?.[0]?.message?.content;
        if (reply) {
          saveChatHistory(userId, sessionId, userMessage, reply).catch(() => {});
          return { reply, powered_by: 'huggingface', context: {} };
        }
      } catch {}
    }
  }

  const fallback = getFallbackResponse(userMessage);
  return { ...fallback, powered_by: 'fallback' };
}

// ── Rule-based fallback ─────────────────────────────────────────
function getFallbackResponse(message) {
  const msg = message.toLowerCase();
  if (FLIGHT_NUM_RE.test(message)) return { reply: "Check the Live Board for full flight details — tap any row for gate, delay, and status. Or ask me directly, e.g. '6E 2341 status'." };
  if (msg.includes('weather') || msg.includes('wind') || msg.includes('fog')) return { reply: '🌤 Check the Weather tab for live BLR conditions — temperature, wind, visibility, and flight impact assessment.' };
  if (msg.includes('delay') || msg.includes('cancel') || msg.includes('on time')) return { reply: '⏱ Check the Live Board for current delay and cancellation info. Give me a specific flight number for AI delay prediction.' };
  if (msg.includes('gate') || msg.includes('terminal')) return { reply: '🚪 Search your flight on the Live Board for gate and terminal info, or ask me directly with the flight number.' };
  if (msg.includes('radar') || msg.includes('track')) return { reply: '◎ The Radar page shows live ADS-B aircraft positions. Search by flight number to highlight and track it on the map.' };
  if (msg.includes('crowd') || msg.includes('queue') || msg.includes('wait')) return { reply: 'Visit Crowd Analytics for real-time congestion levels and wait-time estimates for all T1/T2 zones.' };
  if (msg.includes('currency') || msg.includes('exchange') || msg.includes('usd') || msg.includes('eur')) return { reply: '💱 Use the Currency page for live INR exchange rates across 12 travel currencies, updated hourly.' };
  if (msg.includes('compare') || msg.includes('comparison')) return { reply: '⊞ Use the Compare page to view up to 3 flights side-by-side — add flights from the Live Board using the ⊕ button.' };
  if (msg.includes('cab') || msg.includes('taxi') || msg.includes('uber') || msg.includes('ola') || msg.includes('rapido')) return { reply: '🚕 Use the Cab button in the navbar to book an Ola, Uber, or Rapido ride with BLR Airport pre-set as pickup.' };
  return { reply: "I'm AeroBot — ask me about live flights, delays, weather, radar, gates, crowd, currency, or how AeroVision works. Try asking about a specific flight like '6E 2341'!" };
}

// ── Save chat history ──────────────────────────────────────────
// sessionId is now stable per conversation (passed from frontend)
// so messages can be grouped back into actual conversations in the DB
function saveChatHistory(userId, sessionId, userMsg, botReply) {
  if (!userId) return Promise.resolve();
  const sid = sessionId || `sess_${Date.now()}`;
  try {
    query('INSERT INTO chat_history (user_id, session_id, role, content) VALUES (?,?,?,?)', [userId, sid, 'user', userMsg]);
    query('INSERT INTO chat_history (user_id, session_id, role, content) VALUES (?,?,?,?)', [userId, sid, 'assistant', botReply]);
  } catch {}
  return Promise.resolve();
}

module.exports = { getResponse, streamResponse };
