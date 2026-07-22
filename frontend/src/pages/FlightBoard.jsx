// =====================================================
// FlightBoard — Live Departures/Arrivals Board (FIDS)
// Judge-ready FIDS-style UI · AeroVision
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { flightAPI } from '../services/api';
import { useSocket } from '../services/socket';
import { useCompare } from '../context/CompareContext';

// ── Status config ────────────────────────────────────
const STATUS_CFG = {
  active:    { label: 'In Flight',  icon: '✈', bg: 'rgba(59,158,255,0.1)',  text: '#63b3ff', border: 'rgba(59,158,255,0.3)',  dot: '#3b9eff'  },
  scheduled: { label: 'On Time',    icon: '✓', bg: 'rgba(34,197,94,0.1)',   text: '#22c55e', border: 'rgba(34,197,94,0.25)',  dot: '#22c55e'  },
  delayed:   { label: 'Delayed',    icon: '⏱', bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)',  dot: '#f59e0b'  },
  landed:    { label: 'Landed',     icon: '⬇', bg: 'rgba(99,179,255,0.06)', text: '#6677aa', border: 'rgba(99,179,255,0.12)', dot: '#4a5a7a'  },
  cancelled: { label: 'Cancelled',  icon: '✕', bg: 'rgba(239,68,68,0.1)',   text: '#ef4444', border: 'rgba(239,68,68,0.25)', dot: '#ef4444'  },
};

function getStatusKey(f) {
  if (f.status === 'cancelled') return 'cancelled';
  if (f.delay_minutes > 0)     return 'delayed';
  return f.status || 'scheduled';
}

// ── Domestic / International helper ──────────────────
const INDIAN_AIRPORTS = new Set([
  'DEL','BOM','MAA','CCU','HYD','BLR','AMD','PNQ','GOI','COK','JAI','LKO',
  'GAU','IXB','VTZ','TRV','BBI','SXR','IXR','NAG','ATQ','JDH','BHO','RPR',
  'IXC','IXJ','IXZ','VNS','AGR','GWL','UDR','IXD','IXI','IXL','IXP','IXY',
  'SHL','DHM','IXA','IMF','DED','DIB','HBX','KTU','JRH','SAG','VGA','IXM',
]);

function isIntl(depAirport, arrAirport) {
  const d = (depAirport || '').toUpperCase();
  const a = (arrAirport || '').toUpperCase();
  return !INDIAN_AIRPORTS.has(d) || !INDIAN_AIRPORTS.has(a);
}

// ── Baggage Belt — deterministic mock from flight_iata hash ──
function getBaggageBelt(flightIata, international) {
  if (!flightIata) return null;
  let h = 0;
  for (const c of flightIata) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  h = Math.abs(h);
  return international ? 9 + (h % 4) : 1 + (h % 8);   // intl: 9–12, dom: 1–8
}

// ── Check-in Status — time-based ─────────────────────
function getCheckinStatus(scheduledDep, international) {
  if (!scheduledDep) return null;
  const now     = Date.now();
  const dep     = new Date(scheduledDep).getTime();
  const openAt  = dep - 3 * 60 * 60 * 1000;            // opens 3 h before
  const closeAt = dep - (international ? 60 : 45) * 60 * 1000;  // closes 45/60 min before
  if (now < openAt) {
    const mins = Math.round((openAt - now) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return { status: 'soon', label: h > 0 ? `Opens in ${h}h ${m}m` : `Opens in ${m}m` };
  }
  if (now < closeAt) return { status: 'open',   label: 'OPEN'   };
  return             { status: 'closed', label: 'CLOSED' };
}

function StatusPill({ f }) {
  const key = getStatusKey(f);
  const cfg = STATUS_CFG[key] || STATUS_CFG.scheduled;
  const label = key === 'delayed' ? `+${f.delay_minutes}m delay` : cfg.label;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold border whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}>
      <span className="text-[10px] leading-none">{cfg.icon}</span>
      {label}
    </span>
  );
}

// ── Board-style flip header ───────────────────────────
function BoardHeader({ type, onToggle }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Kolkata'
  });
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  return (
    <div className="px-4 md:px-6 py-4 border-b border-[rgba(99,179,255,0.12)] flex items-center justify-between flex-wrap gap-3"
      style={{ background: 'linear-gradient(180deg, rgba(59,158,255,0.05) 0%, transparent 100%)' }}>
      <div className="flex items-center gap-4">
        <div>
          <div className="font-display text-[22px] font-extrabold tracking-tight text-white">
            {type === 'departure' ? 'Departures' : 'Arrivals'}
            <span className="ml-2 text-[14px] font-normal text-[#4a5a7a]">BLR / VOBL</span>
          </div>
          <div className="font-mono text-[10px] text-[#2a3a5a] tracking-wider mt-0.5">
            KEMPEGOWDA INTERNATIONAL AIRPORT
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <div className="font-mono text-[22px] font-bold text-[#3b9eff] tracking-widest leading-none">{timeStr}</div>
          <div className="font-mono text-[10px] text-[#2a3a5a] mt-0.5">{dateStr} IST</div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.25)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span className="text-[#22c55e] font-mono text-[10px] font-bold">LIVE</span>
        </div>
      </div>
    </div>
  );
}

// ── Airline Badge ─────────────────────────────────────
function AirlineBadge({ iata, name }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-[#111828] border border-[rgba(99,179,255,0.18)] flex items-center justify-center text-[11px] font-mono font-bold text-[#63b3ff] flex-shrink-0">
        {(iata || '??').slice(0, 2)}
      </div>
      <span className="text-[13px] text-[#c8d8f0] font-medium truncate max-w-[120px]">{name || 'Unknown'}</span>
    </div>
  );
}

// ── Time cell ─────────────────────────────────────────
function TimeCell({ ts, muted }) {
  if (!ts) return <span className="text-[#2a3a5a]">—</span>;
  const date = new Date(ts);
  const t = date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  });
  return (
    <span className={`font-mono text-[13px] ${muted ? 'text-[#4a5a7a]' : 'text-[#e8f0fe]'}`}>{t}</span>
  );
}

// ── Main ─────────────────────────────────────────────
export default function FlightBoard() {
  const navigate      = useNavigate();
  const { addToCompare, isInCompare, compareList } = useCompare();
  const [searchParams]  = useSearchParams();
  const [type, setType] = useState(searchParams.get('type') || 'departure');
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dataSource, setDataSource] = useState('');
  const [airlineFilter, setAirlineFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [searchTerm, setSearchTerm]       = useState('');
  const [clockTick, setClockTick]         = useState(0);
  const [combinedCounts, setCombinedCounts] = useState(null);
  const socket = useSocket();

  // Tick clock every second for live header
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await flightAPI.getFlights({ type, airline: airlineFilter, status: statusFilter });
      setFlights(res.data.flights || []);
      setLastUpdated(res.data.lastUpdated);
      setDataSource(res.data.source || '');
    } catch (err) {
      console.error('Failed to fetch flights:', err);
    } finally {
      setLoading(false);
    }
  }, [type, airlineFilter, statusFilter]);

  useEffect(() => { fetchFlights(); }, [fetchFlights]);
  useEffect(() => {
    const t = setInterval(fetchFlights, 30000);
    return () => clearInterval(t);
  }, [fetchFlights]);
  useEffect(() => {
    if (socket) {
      socket.on('flights:updated', () => fetchFlights());
      return () => socket.off('flights:updated');
    }
  }, [socket, fetchFlights]);

  // Fetch combined dep+arr stats for the summary pills so counts match the homepage
  useEffect(() => {
    const load = () => flightAPI.getStats().then(res => setCombinedCounts(res.data)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const airlines = [...new Set(flights.map(f => f.airline_name).filter(Boolean))].sort();

  const STATUS_ORDER = { active: 0, scheduled: 1, delayed: 1, landed: 2, cancelled: 3 };
  const sortedFlights = [...flights].sort((a, b) => {
    const ap = STATUS_ORDER[getStatusKey(a)] ?? 1;
    const bp = STATUS_ORDER[getStatusKey(b)] ?? 1;
    if (ap !== bp) return ap - bp;
    const at = new Date(type === 'departure' ? a.scheduled_departure : a.scheduled_arrival).getTime();
    const bt = new Date(type === 'departure' ? b.scheduled_departure : b.scheduled_arrival).getTime();
    return at - bt;
  });

  const filteredFlights = sortedFlights.filter(f => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (f.flight_iata || '').toLowerCase().includes(term) ||
      (f.airline_name || '').toLowerCase().includes(term) ||
      (f.departure_airport || '').toLowerCase().includes(term) ||
      (f.arrival_airport || '').toLowerCase().includes(term)
    );
  });

  // Per-tab counts (kept for local filtering reference)
  const counts = flights.reduce((acc, f) => {
    const k = getStatusKey(f);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // Use combined dep+arr cancelled count so it matches the homepage.
  // All other pills stay per-tab (in-flight/on-time/landed are tab-specific and useful that way).
  const pillCounts = {
    ...counts,
    cancelled: combinedCounts?.cancelled ?? counts.cancelled ?? 0,
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-6 gap-4 pb-24">

      {/* Floating compare bar */}
      <AnimatePresence>
        {compareList.length > 0 && (
          <motion.div
            key="compare-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-[var(--bg2)] border border-[rgba(99,179,255,0.3)] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-2">
              {compareList.map(f => (
                <span key={f.flight_iata} className="font-mono text-[12px] font-bold text-[#63b3ff] px-2 py-1 bg-[rgba(99,179,255,0.1)] rounded-lg border border-[rgba(99,179,255,0.2)]">
                  {f.flight_iata}
                </span>
              ))}
              {compareList.length < 3 && (
                <span className="font-mono text-[11px] text-[var(--text3)] px-2 py-1">
                  +{3 - compareList.length} more
                </span>
              )}
            </div>
            <div className="h-4 w-px bg-[var(--border3)]" />
            <button onClick={() => navigate('/compare')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white text-[12px] font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">
              ⊞ Compare →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Breadcrumb nav */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text4)] hover:text-[var(--text)] hover:border-[var(--border6)] hover:bg-[rgba(59,158,255,0.06)] transition-all text-xs font-medium group">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </button>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--text3)]">
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-mono text-[var(--text2)]">Live Flight Board</span>
      </div>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'In Flight', key: 'active',    accent: '#3b9eff' },
          { label: 'On Time',   key: 'scheduled', accent: '#22c55e' },
          { label: 'Delayed',   key: 'delayed',   accent: '#f59e0b' },
          { label: 'Landed',    key: 'landed',    accent: '#6677aa' },
          { label: 'Cancelled', key: 'cancelled', accent: '#ef4444' },
        ].map(s => (
          <div key={s.key}
            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border3)] rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.accent }} />
            <span className="font-mono text-[11px] text-[var(--text3)]">{s.label}</span>
            <span className="font-mono text-[13px] font-bold" style={{ color: s.accent }}>
              {pillCounts[s.key] || 0}
            </span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-[var(--text3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
          Auto-refresh · 30s
          {lastUpdated && (
            <span className="ml-1">
              · Updated {new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })}
            </span>
          )}
        </div>
      </div>

      {/* Main board */}
      <div className="flex-1 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)]">

        {/* FIDS header — live clock */}
        <BoardHeader key={clockTick} type={type} />

        {/* Controls bar */}
        <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-[var(--border5)] bg-[var(--surface)] flex-wrap">
          {/* DEP / ARR tabs */}
          <div className="flex bg-[var(--bg)] rounded-lg p-1 gap-1">
            {[
              { key: 'departure', label: '✈ Dep' },
              { key: 'arrival',   label: '🛬 Arr' },
            ].map(t => (
              <button key={t.key} onClick={() => { setType(t.key); setLoading(true); }}
                className={`px-4 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  type === t.key
                    ? 'bg-[var(--accent)] text-white shadow-[0_0_12px_rgba(59,158,255,0.3)]'
                    : 'text-[var(--text3)] hover:text-[var(--text)]'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-[var(--border3)]" />

          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] text-[12px]">⌕</span>
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search flight, airline…"
              className="bg-[var(--bg)] border border-[var(--border)] rounded-lg pl-7 pr-3 py-1.5 text-[12px] text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] w-44 transition-all" />
          </div>

          <select value={airlineFilter} onChange={e => setAirlineFilter(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text4)] outline-none focus:border-[var(--accent)]">
            <option value="">All Airlines</option>
            {airlines.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-[var(--text4)] outline-none focus:border-[var(--accent)]">
            <option value="">All Statuses</option>
            <option value="active">In Flight</option>
            <option value="scheduled">On Time</option>
            <option value="delayed">Delayed</option>
            <option value="landed">Landed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {(searchTerm || airlineFilter || statusFilter) && (
            <button onClick={() => { setSearchTerm(''); setAirlineFilter(''); setStatusFilter(''); }}
              className="text-[11px] text-[var(--red)] hover:opacity-80 transition-colors font-mono">
              ✕ Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[1000px]">
            <thead>
              <tr className="border-b border-[rgba(99,179,255,0.1)]"
                style={{ background: 'rgba(99,179,255,0.02)' }}>
                {[
                  { label: 'Flight',   w: 'w-[100px]' },
                  { label: 'Airline',  w: 'w-[180px]' },
                  { label: type === 'departure' ? 'Destination' : 'Origin', w: 'w-[140px]' },
                  { label: type === 'departure' ? 'STD' : 'STA', w: 'w-[80px]' },
                  { label: type === 'departure' ? 'ETD' : 'ETA', w: 'w-[80px]' },
                  { label: 'Terminal', w: 'w-[80px]' },
                  { label: 'Gate',     w: 'w-[70px]' },
                  { label: 'Status',   w: 'w-[130px]' },
                  { label: type === 'departure' ? 'Check-in' : 'Belt', w: 'w-[100px]' },
                  { label: '⊞',                                        w: 'w-[44px]'  },
                ].map(h => (
                  <th key={h.label}
                    className={`${h.w} px-4 py-3 text-left font-mono text-[9px] tracking-[0.15em] uppercase text-[#2a3a5a] font-normal`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[rgba(99,179,255,0.04)] animate-pulse">
                    {[100, 160, 120, 70, 70, 70, 60, 110, 90].map((w, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-3 rounded-full bg-[#0e1525]" style={{ width: `${w * 0.6 + Math.random() * w * 0.4}px`, maxWidth: '100%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredFlights.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-24 text-center font-mono text-[11px] text-[#2a3a5a]">
                    NO FLIGHTS MATCH YOUR FILTERS
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {filteredFlights.map((f, i) => {
                    const statusKey = getStatusKey(f);
                    const cfg = STATUS_CFG[statusKey] || STATUS_CFG.scheduled;
                    const dest = type === 'departure' ? f.arrival_airport : f.departure_airport;
                    const schTs = type === 'departure' ? f.scheduled_departure : f.scheduled_arrival;
                    const estTs = type === 'departure' ? f.estimated_departure : f.estimated_arrival;
                    const terminal = type === 'departure' ? f.departure_terminal : f.arrival_terminal;
                    const gate = type === 'departure' ? f.departure_gate : f.arrival_gate;

                    return (
                      <motion.tr
                        key={f.flight_iata + i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        onClick={() => navigate(`/flights/${encodeURIComponent(f.flight_iata)}`)}
                        className="border-b border-[rgba(99,179,255,0.04)] cursor-pointer transition-all duration-150 group hover:bg-[rgba(59,158,255,0.03)]">

                        {/* Left accent line on hover */}
                        <td className="px-4 py-3 relative">
                          <div className="absolute left-0 top-0 bottom-0 w-[2px] opacity-0 group-hover:opacity-100 transition-opacity rounded-r-full"
                            style={{ background: cfg.dot }} />
                          <span className="font-mono text-[14px] font-bold" style={{ color: cfg.dot }}>
                            {f.flight_iata || '—'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <AirlineBadge iata={f.airline_iata} name={f.airline_name} />
                        </td>

                        <td className="px-4 py-3 font-mono text-[13px] text-[#8899bb]">
                          {dest || '—'}
                        </td>

                        <td className="px-4 py-3">
                          <TimeCell ts={schTs} muted />
                        </td>

                        <td className="px-4 py-3">
                          <TimeCell ts={estTs} muted={false} />
                        </td>

                        <td className="px-4 py-3">
                          {terminal ? (
                            <span className="font-mono text-[12px] px-2 py-0.5 rounded bg-[#111828] border border-[rgba(99,179,255,0.15)] text-[#63b3ff]">
                              {terminal}
                            </span>
                          ) : (
                            <span className="text-[#2a3a5a]">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {gate ? (
                            <span className="font-mono text-[12px] font-bold text-white bg-[rgba(59,158,255,0.08)] px-2 py-0.5 rounded border border-[rgba(59,158,255,0.2)]">
                              {gate}
                            </span>
                          ) : (
                            <span className="text-[#2a3a5a]">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <StatusPill f={f} />
                        </td>

                        {/* Check-in (departures) / Baggage Belt (arrivals) */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          {type === 'departure' ? (() => {

                            const international = isIntl(f.departure_airport, f.arrival_airport);
                            const ci = getCheckinStatus(f.scheduled_departure, international);
                            if (!ci || statusKey === 'cancelled') return <span className="text-[#2a3a5a]">—</span>;
                            if (ci.status === 'open') return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-[rgba(34,197,94,0.12)] border border-[rgba(34,197,94,0.3)] text-[#22c55e] whitespace-nowrap">
                                ✓ OPEN
                              </span>
                            );
                            if (ci.status === 'closed') return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-[#ef4444]">
                                CLOSED
                              </span>
                            );
                            return <span className="text-[11px] text-[#4a5a7a] font-mono whitespace-nowrap">{ci.label}</span>;
                          })() : (() => {
                            // Show belt for active (arriving soon) AND landed flights
                            if (statusKey !== 'landed' && statusKey !== 'active') return <span className="text-[#2a3a5a]">—</span>;
                            const international = isIntl(f.departure_airport, f.arrival_airport);
                            const belt = getBaggageBelt(f.flight_iata, international);
                            const isLanded = statusKey === 'landed';
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[12px] font-mono font-bold whitespace-nowrap ${
                                isLanded
                                  ? 'bg-[rgba(167,139,250,0.15)] border border-[rgba(167,139,250,0.35)] text-[#a78bfa]'
                                  : 'bg-[rgba(99,179,255,0.08)] border border-[rgba(99,179,255,0.2)] text-[#63b3ff]'
                              }`}>
                                🧳 {belt}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Compare button */}
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const inList = isInCompare(f.flight_iata);
                            return (
                              <button
                                onClick={() => addToCompare(f)}
                                title={inList ? 'In compare list' : 'Add to compare'}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center text-[14px] transition-all border ${
                                  inList
                                    ? 'bg-[rgba(99,179,255,0.15)] border-[rgba(99,179,255,0.4)] text-[#63b3ff]'
                                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text3)] hover:border-[rgba(99,179,255,0.3)] hover:text-[#63b3ff] hover:bg-[rgba(99,179,255,0.08)]'
                                }`}>
                                {inList ? '✓' : '⊕'}
                              </button>
                            );
                          })()}
                        </td>

                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        {/* Board footer */}
        <div className="px-4 md:px-6 py-3 border-t border-[var(--border5)] flex items-center justify-between text-[11px] font-mono text-[var(--text3)] bg-[var(--surface)]">
          <span>{filteredFlights.length} of {flights.length} flights shown</span>
          <div className="flex items-center gap-2">
            {dataSource === 'aerodatabox' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border border-[rgba(34,197,94,0.3)] text-[#22c55e] bg-[rgba(34,197,94,0.06)]">
                ✓ LIVE · AeroDataBox
              </span>
            )}
            {(dataSource === 'opensky+mock' || dataSource === 'mock') && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-[rgba(245,158,11,0.3)] text-[#f59e0b] bg-[rgba(245,158,11,0.06)]">
                ⚡ Simulated · Mock Data
              </span>
            )}
            <span>BLR / VOBL · All times IST</span>
          </div>
        </div>
      </div>
    </div>
  );
}
