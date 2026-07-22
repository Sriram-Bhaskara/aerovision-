// =====================================================
// Chatbot Routes — AI Assistant
// =====================================================
const express    = require('express');
const rateLimit  = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const chatService = require('../services/chatService');

const router = express.Router();

// ── Rate limiter: 30 requests per minute per IP ────────────────
// Protects Gemini/Claude/OpenRouter quotas from being exhausted
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1-minute window
  max: 30,                 // 30 messages/min — generous for normal use
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate-limit by authenticated user ID when available, else by IP
    return req.user?.id ? `user_${req.user.id}` : req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many messages. Please wait a moment before sending another.',
      retryAfter: 60,
    });
  },
});

// POST /api/chatbot/stream — Streaming SSE response (primary endpoint)
router.post('/stream', optionalAuth, chatLimiter, async (req, res) => {
  const { message, history = [], sessionId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if present
  res.flushHeaders();

  // Heartbeat to keep connection alive while context is being built
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch {} }, 5000);

  try {
    await chatService.streamResponse(message, req.user?.id, history, res, sessionId || null);
  } catch (err) {
    console.error('[Chatbot/stream]', err.message);
    try {
      res.write(`data: ${JSON.stringify({ chunk: 'Sorry, I ran into an error. Please try again.' })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true, powered_by: 'error' })}\n\n`);
      res.end();
    } catch {}
  } finally {
    clearInterval(heartbeat);
  }
});

// POST /api/chatbot/message — Non-streaming fallback
router.post('/message', optionalAuth, chatLimiter, async (req, res) => {
  try {
    const { message, history = [], sessionId } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const response = await chatService.getResponse(message, req.user?.id, history, sessionId || null);
    res.json(response);
  } catch (error) {
    console.error('[Chatbot] Error:', error);
    res.status(500).json({ error: 'Chatbot error', reply: 'Sorry, I encountered an error. Please try again.' });
  }
});

// GET /api/chatbot/test — Diagnose AI API connectivity
router.get('/test', async (req, res) => {
  const axios = require('axios');
  const results = {};

  const hfKey        = process.env.HUGGINGFACE_API_KEY;
  const openrouterKey= process.env.OPENROUTER_API_KEY;
  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const frontendUrl  = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (hfKey) {
    const HF_MODELS = [
      process.env.HF_MODEL || '',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-7B-Instruct',
    ].filter(Boolean);
    let hfOk = false;
    for (const model of HF_MODELS) {
      try {
        const r = await axios.post('https://router.huggingface.co/v1/chat/completions', {
          model, max_tokens: 20, stream: false,
          messages: [{ role: 'user', content: 'Say "AeroVision OK"' }],
        }, {
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        });
        results.huggingface = { ok: true, model, reply: r.data.choices?.[0]?.message?.content };
        hfOk = true;
        break;
      } catch (e) {
        results.huggingface = { ok: false, model, status: e.response?.status, error: e.response?.data?.error || e.message };
      }
    }
    if (!hfOk) results.huggingface = results.huggingface || { ok: false, error: 'All HF models failed' };
  } else {
    results.huggingface = { ok: false, error: 'HUGGINGFACE_API_KEY not set' };
  }

  if (openrouterKey) {
    const FREE_MODELS = [
      process.env.OPENROUTER_MODEL || '',
      'deepseek/deepseek-chat-v3-0324:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'qwen/qwen3-8b:free',
    ].filter(Boolean);
    let orOk = false;
    for (const model of FREE_MODELS) {
      try {
        const r = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model, max_tokens: 20,
          messages: [{ role: 'user', content: 'Say "AeroVision OK"' }],
        }, {
          headers: {
            'Authorization': `Bearer ${openrouterKey}`,
            'HTTP-Referer': frontendUrl,
            'X-Title': 'AeroVision',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });
        results.openrouter = { ok: true, model, reply: r.data.choices?.[0]?.message?.content };
        orOk = true;
        break;
      } catch (e) {
        results.openrouter = { ok: false, model, status: e.response?.status, error: e.response?.data?.error?.message || e.message };
      }
    }
    if (!orOk && !results.openrouter) results.openrouter = { ok: false, error: 'All free models failed' };
  } else {
    results.openrouter = { ok: false, error: 'OPENROUTER_API_KEY not set' };
  }

  if (geminiKey) {
    try {
      const r = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { contents: [{ role: 'user', parts: [{ text: 'Say "AeroVision OK"' }] }], generationConfig: { maxOutputTokens: 20 } },
        { timeout: 10000 }
      );
      results.gemini = { ok: true, reply: r.data.candidates?.[0]?.content?.parts?.[0]?.text };
    } catch (e) {
      results.gemini = { ok: false, status: e.response?.status, error: e.response?.data || e.message };
    }
  } else {
    results.gemini = { ok: false, error: 'GEMINI_API_KEY not set' };
  }

  if (anthropicKey) {
    try {
      const r = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-haiku-4-5-20251001', max_tokens: 20,
        messages: [{ role: 'user', content: 'Say "AeroVision OK"' }],
      }, {
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      results.claude = { ok: true, reply: r.data.content?.[0]?.text };
    } catch (e) {
      results.claude = { ok: false, status: e.response?.status, error: e.response?.data || e.message };
    }
  } else {
    results.claude = { ok: false, error: 'ANTHROPIC_API_KEY not set' };
  }

  res.json(results);
});

// GET /api/chatbot/suggestions
router.get('/suggestions', (req, res) => {
  res.json({
    suggestions: [
      'What flights are delayed right now?',
      'What is the status of flight 6E 2341?',
      'Which gate is EK 571 departing from?',
      'How is the weather affecting flights?',
      'How does crowd analytics work?',
      'Show me flights to Dubai',
      'What currencies can I convert?',
      'How does the radar page work?',
    ],
  });
});

module.exports = router;
