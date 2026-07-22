// =====================================================
// ChatbotPage — AeroBot AI Assistant (streaming)
// Fixes applied:
//   • XSS: dangerouslySetInnerHTML replaced with safe React element renderer
//   • Textarea auto-resizes as user types
//   • Copy button on every completed bot message
//   • Retry button on error/stopped messages
//   • localStorage instead of sessionStorage (survives tab close)
//   • Stop button now marks message as 'stopped' (shows badge)
//   • Randomised suggestion chips (different 4 shown each session)
//   • Stable sessionId passed to backend for proper chat history grouping
//   • promptText stored on each bot message so retry knows what to resend
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// ── Suggestion chips ───────────────────────────────────────────
const ALL_SUGGESTIONS = [
  'What flights are delayed right now?',
  'How does the radar page work?',
  'What is the weather at BLR?',
  'Which airlines fly from T2?',
  'What is the delay prediction model?',
  'How is AeroVision built?',
  'Show me flights to Dubai',
  'How does crowd analytics work?',
];

// ── Safe inline markdown renderer (no dangerouslySetInnerHTML) ─
// Handles **bold**, `code`, and ━ dividers without any HTML injection risk
function parseInline(text, lineKey) {
  const regex = /(\*\*(.*?)\*\*|`(.*?)`)/g;
  const parts  = [];
  let last = 0;
  let key  = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[0].startsWith('**')) {
      parts.push(
        <strong key={`${lineKey}-${key++}`} className="text-white font-semibold">
          {match[2]}
        </strong>
      );
    } else {
      parts.push(
        <code key={`${lineKey}-${key++}`} className="bg-[rgba(59,158,255,0.15)] px-1.5 py-0.5 rounded text-[#63b3ff] font-mono text-[11px]">
          {match[3]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MsgContent({ text, streaming }) {
  const lines = text.split('\n');
  return (
    <div className="text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        if (/^━+$/.test(line.trim())) {
          return <hr key={i} className="border-[rgba(99,179,255,0.15)] my-2" />;
        }
        const inline = parseInline(line, i);
        return (
          <p key={i} className={line.trim() === '' ? 'h-2' : 'mb-1'}>
            {inline.length === 0 ? null : inline}
          </p>
        );
      })}
      {streaming && (
        <span className="inline-block w-2 h-3.5 bg-[#3b9eff] rounded-sm ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ── Persistence helpers ────────────────────────────────────────
const STORAGE_KEY  = 'aerovision_chat_v2';
const SESSION_KEY  = 'aerovision_chat_session';
const MAX_STORED   = 60; // keep last 60 messages in localStorage

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getOrCreateSessionId() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const id = generateSessionId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return generateSessionId();
  }
}

const GREETING = {
  id: 0,
  role: 'assistant',
  content: "Hello! I'm **AeroBot**, the AI assistant built into AeroVision.\n\nI have full knowledge of this platform — ask me about any feature, live flights, weather, radar, crowd analytics, currency rates, or anything about BLR airport. I remember our conversation across sessions.\n\nHow can I help you?",
  powered_by: 'system',
};

function loadSavedMessages() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [GREETING];
}

// ── Powered-by badge config ────────────────────────────────────
const BADGE_STYLE = {
  claude:      'text-[#8b5cf6] border-[rgba(139,92,246,0.2)] bg-[rgba(139,92,246,0.05)]',
  openrouter:  'text-[#22c55e] border-[rgba(34,197,94,0.2)]  bg-[rgba(34,197,94,0.05)]',
  gemini:      'text-[#3b9eff] border-[rgba(59,158,255,0.2)]  bg-[rgba(59,158,255,0.05)]',
  huggingface: 'text-[#f59e0b] border-[rgba(245,158,11,0.2)]  bg-[rgba(245,158,11,0.05)]',
  fallback:    'text-[#4a5a7a] border-[rgba(99,179,255,0.1)]  bg-transparent',
  error:       'text-[#ef4444] border-[rgba(239,68,68,0.2)]   bg-transparent',
  stopped:     'text-[#64748b] border-[rgba(100,116,139,0.2)] bg-transparent',
};
const BADGE_LABEL = {
  claude:      '◆ Claude AI',
  openrouter:  '◈ OpenRouter AI',
  gemini:      '✦ Gemini AI',
  huggingface: '◈ HuggingFace AI',
  fallback:    '⚡ Rule-based',
  error:       '✕ Connection error',
  stopped:     '⏹ Stopped',
};

// ── Main component ─────────────────────────────────────────────
export default function ChatbotPage() {
  const navigate = useNavigate();
  const [messages,  setMessages]  = useState(loadSavedMessages);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);

  // Stable session ID (persists in localStorage, resets on Clear)
  const sessionIdRef = useRef(getOrCreateSessionId());

  // Randomise which 4 suggestions are shown — different every session
  const [chips] = useState(() => {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  });

  const chatRef    = useRef(null);
  const textareaRef= useRef(null);
  const abortRef   = useRef(null);

  // Persist messages to localStorage (capped at MAX_STORED)
  useEffect(() => {
    const toSave = messages
      .slice(-MAX_STORED)
      .map(({ id, ...rest }) => rest); // id is ephemeral, don't store
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
  }, [messages]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // Auto-resize textarea helper
  const autoResize = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  // Copy bot message to clipboard
  const copyMsg = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied!', { duration: 1500, icon: '📋' });
    } catch {
      toast.error('Copy failed — try selecting text manually.');
    }
  }, []);

  // ── Core send function ───────────────────────────────────────
  // historyOverride: pass explicitly for retry so we don't depend on stale closure
  const sendMessage = useCallback(async (text, historyOverride = null) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
    }

    const userMsg = { id: Date.now(),     role: 'user',      content: msg };
    const botId   = Date.now() + 1;
    const botPlaceholder = {
      id: botId, role: 'assistant', content: '', streaming: true,
      powered_by: null, promptText: msg, // store for retry
    };

    setMessages(prev => [...prev, userMsg, botPlaceholder]);
    setStreaming(true);

    // Build history from current messages (or use override for retry)
    const history = historyOverride ?? messages
      .filter(m => m.powered_by !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const token = localStorage.getItem('aerovision_token');

    try {
      const res = await fetch('/api/chatbot/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, history, sessionId: sessionIdRef.current }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }

          if (evt.chunk) {
            setMessages(prev => prev.map(m =>
              m.id === botId ? { ...m, content: m.content + evt.chunk } : m
            ));
          }
          if (evt.done) {
            setMessages(prev => prev.map(m =>
              m.id === botId ? { ...m, streaming: false, powered_by: evt.powered_by } : m
            ));
          }
          if (evt.error) {
            setMessages(prev => prev.map(m =>
              m.id === botId ? { ...m, streaming: false, powered_by: 'error' } : m
            ));
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') return; // user stopped or component unmounted

      // Fall back to non-streaming endpoint
      console.warn('[AeroBot] Streaming failed, falling back:', err.message);
      try {
        const fbRes = await fetch('/api/chatbot/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message: msg, history, sessionId: sessionIdRef.current }),
        });
        const data = await fbRes.json();
        setMessages(prev => prev.map(m =>
          m.id === botId ? {
            ...m,
            content:    data.reply || "I couldn't process that. Please try again.",
            streaming:  false,
            powered_by: data.powered_by || 'claude',
          } : m
        ));
      } catch {
        setMessages(prev => prev.map(m =>
          m.id === botId ? {
            ...m,
            content:    "I'm having trouble connecting right now. Please try again in a moment.",
            streaming:  false,
            powered_by: 'error',
          } : m
        ));
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages]);

  // ── Stop streaming ───────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    // Mark any in-flight bot message as 'stopped' (not 'error')
    setMessages(prev => prev.map(m =>
      m.streaming ? { ...m, streaming: false, powered_by: 'stopped' } : m
    ));
  }, []);

  // ── Retry a failed/stopped bot message ──────────────────────
  const retryMessage = useCallback((botMsgId, promptText) => {
    if (!promptText || streaming) return;

    // Build history up to (but not including) the failed pair
    const idx = messages.findIndex(m => m.id === botMsgId);
    const historyBeforePair = messages
      .slice(0, Math.max(0, idx - 1))
      .filter(m => m.powered_by !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    // Remove the failed bot message from state
    setMessages(prev => prev.filter(m => m.id !== botMsgId));

    // Re-send with the correct history (uses historyOverride, not stale closure)
    sendMessage(promptText, historyBeforePair);
  }, [messages, streaming, sendMessage]);

  // ── Clear chat ───────────────────────────────────────────────
  const clearChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setStreaming(false);

    // New session ID so backend doesn't mix histories
    const newId = generateSessionId();
    sessionIdRef.current = newId;
    try { localStorage.setItem(SESSION_KEY, newId); } catch {}

    const fresh = [{
      id: Date.now(), role: 'assistant',
      content: "Chat cleared! Still here — ask me anything about AeroVision or BLR airport.",
      powered_by: 'system',
    }];
    setMessages(fresh);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch {}
  }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">

      {/* Top bar */}
      <div className="flex items-center gap-4 mb-5">
        <button onClick={() => navigate('/')}
          className="text-[var(--text4)] text-[13px] hover:text-[var(--accent2)] transition-colors font-mono">
          ← Back
        </button>
        <div className="h-4 w-px bg-[var(--border)]" />
        <h1 className="font-display text-lg font-bold">AI Assistant</h1>
      </div>

      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)]">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border3)] flex items-center justify-between"
          style={{ background: 'linear-gradient(180deg, rgba(59,158,255,0.05) 0%, transparent 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3b9eff] to-[#8b5cf6] flex items-center justify-center text-base shadow-[0_0_16px_rgba(59,158,255,0.3)]">
              ◆
            </div>
            <div>
              <div className="font-semibold text-[14px] text-[var(--text)]">AeroBot</div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--green)]">
                <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full animate-pulse" />
                {streaming ? 'Generating…' : 'AeroBot AI · Live context'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--text3)] hidden sm:block">
              {messages.filter(m => m.role === 'user').length} messages this session
            </span>
            <button onClick={clearChat}
              className="text-[11px] text-[var(--text3)] hover:text-[var(--red)] transition-colors font-mono px-2 py-1 rounded border border-transparent hover:border-[rgba(239,68,68,0.2)]">
              Clear
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatRef}
          className="h-[460px] overflow-y-auto p-5 flex flex-col gap-4"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,179,255,0.15) transparent' }}>
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div key={msg.id ?? i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                {/* Bot avatar */}
                {msg.role === 'assistant' && (
                  <div className={`w-7 h-7 rounded-lg flex-shrink-0 mt-0.5 flex items-center justify-center text-[11px]
                    bg-gradient-to-br from-[#3b9eff] to-[#8b5cf6] ${msg.streaming ? 'animate-pulse' : ''}`}>
                    ◆
                  </div>
                )}

                <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                  {/* Bubble */}
                  <div className={`px-4 py-3 rounded-2xl ${
                    msg.role === 'user'
                      ? 'bg-[var(--accent)] text-white rounded-tr-sm text-[13px]'
                      : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text5)] rounded-tl-sm'
                  }`}>
                    {msg.role === 'assistant'
                      ? <MsgContent text={msg.content || ''} streaming={!!msg.streaming} />
                      : <span className="text-[13px]">{msg.content}</span>
                    }
                  </div>

                  {/* Bot message footer: badge + copy + retry */}
                  {msg.role === 'assistant' && !msg.streaming && msg.powered_by !== 'system' && (
                    <div className="flex items-center gap-1.5 flex-wrap">

                      {/* Powered-by badge */}
                      {msg.powered_by && (
                        <span className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${BADGE_STYLE[msg.powered_by] || BADGE_STYLE.fallback}`}>
                          {BADGE_LABEL[msg.powered_by] || msg.powered_by}
                        </span>
                      )}

                      {/* Copy button */}
                      {msg.content && (
                        <button
                          onClick={() => copyMsg(msg.content)}
                          title="Copy response"
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-all">
                          📋 Copy
                        </button>
                      )}

                      {/* Retry button — only for errors and stopped messages */}
                      {(msg.powered_by === 'error' || msg.powered_by === 'stopped') && msg.promptText && (
                        <button
                          onClick={() => retryMessage(msg.id, msg.promptText)}
                          disabled={streaming}
                          title="Retry this message"
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-[rgba(59,158,255,0.3)] text-[#63b3ff] hover:bg-[rgba(59,158,255,0.08)] transition-all disabled:opacity-40">
                          ↺ Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* User avatar */}
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-[#141c2e] border border-[rgba(99,179,255,0.2)] flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5 text-[#8899bb]">
                    U
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Suggestion chips */}
        <div className="px-4 py-2.5 flex gap-2 flex-wrap border-t border-[var(--border5)]"
          style={{ background: 'var(--surface)' }}>
          {chips.map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)}
              disabled={streaming}
              className="px-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-full text-[11px] text-[var(--text3)] hover:border-[var(--accent)] hover:text-[var(--accent2)] hover:bg-[rgba(59,158,255,0.06)] transition-all disabled:opacity-40">
              {s}
            </button>
          ))}
        </div>

        {/* Input bar */}
        <div className="px-4 py-3.5 border-t border-[var(--border3)] flex gap-3 items-end bg-[var(--bg2)]">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKey}
            placeholder="Ask about flights, radar, weather, currency, how AeroVision works…"
            rows={1}
            style={{ resize: 'none', minHeight: '40px', maxHeight: '120px', overflow: 'hidden' }}
            className="flex-1 bg-[var(--surface)] border border-[var(--border4)] rounded-xl px-4 py-2.5 text-[13px] text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(59,158,255,0.1)] transition-all"
          />
          <button
            onClick={streaming ? stopStreaming : sendMessage}
            disabled={!streaming && !input.trim()}
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-base transition-all flex-shrink-0 ${
              streaming
                ? 'bg-[#ef4444] hover:bg-[#dc2626] shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'bg-[#3b9eff] hover:bg-[#2d8be8] shadow-[0_0_12px_rgba(59,158,255,0.3)] disabled:opacity-30'
            }`}>
            {streaming ? '■' : '➤'}
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-[var(--border5)] flex justify-between text-[10px] font-mono text-[var(--text3)] bg-[var(--surface)]">
          <span>Enter to send · Shift+Enter for new line · ■ to stop</span>
          <span>AeroBot AI · BLR/VOBL</span>
        </div>
      </div>
    </div>
  );
}
