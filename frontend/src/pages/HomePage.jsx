// =====================================================
// HomePage — Judge-Ready UI · AeroVision Dashboard
// Live ticker · Split hero · Mini live board · Stats · Weather
// =====================================================
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { flightAPI, weatherAPI } from '../services/api';

// ─── Ticker ──────────────────────────────────────────
function Ticker({ flights }) {
  if (!flights.length) return null;
  const items = [...flights, ...flights]; // duplicate for seamless loop

  const statusColor = (f) => {
    if (f.status === 'cancelled') return '#ef4444';
    if (f.delay_minutes > 0)     return '#f59e0b';
    if (f.status === 'active')   return '#3b9eff';
    if (f.status === 'landed')   return '#8899bb';
    return '#22c55e';
  };

  return (
    <div className="w-full overflow-hidden bg-[#080c14] border-b border-[rgba(99,179,255,0.08)] h-8 flex items-center relative">
      {/* Fade masks */}
      <div className="absolute left-0 top-0 bottom-0 w-16 z-10"
        style={{ background: 'linear-gradient(to right, #080c14, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-16 z-10"
        style={{ background: 'linear-gradient(to left, #080c14, transparent)' }} />

      <div className="ticker-track flex items-center gap-0">
        {items.map((f, i) => (
          <span key={i} className="flex items-center gap-3 px-6 whitespace-nowrap">
            <span className="font-mono text-[11px] font-bold" style={{ color: statusColor(f) }}>
              {f.flight_iata}
            </span>
            <span className="text-[#4a5a7a] text-[10px]">·</span>
            <span className="text-[#8899bb] text-[11px]">
              {f.departure_airport} → {f.arrival_airport}
            </span>
            <span className="text-[#4a5a7a] text-[10px]">·</span>
            <span className="text-[10px] font-mono"
              style={{ color: statusColor(f) }}>
              {f.status === 'cancelled' ? 'CANC' :
               f.delay_minutes > 0 ? `+${f.delay_minutes}m` :
               f.status === 'active' ? 'IN FLIGHT' :
               f.status === 'landed' ? 'LANDED' : 'ON TIME'}
            </span>
            <span className="text-[#1e2a40] text-[10px]">│</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Feature Tile ─────────────────────────────────────
function FeatureTile({ icon, title, desc, badge, color, to, navigate }) {
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ duration: 0.18 }}
      onClick={() => navigate(to)}
      className="group relative bg-[#0e1525] border border-[rgba(99,179,255,0.1)] rounded-2xl p-5 cursor-pointer overflow-hidden hover:border-[rgba(99,179,255,0.25)] transition-all">
      {/* Glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 30%, ${color}10, transparent 70%)` }} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
            style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
            {icon}
          </div>
          {badge && (
            <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border"
              style={{ color, borderColor: `${color}40`, background: `${color}10` }}>
              {badge}
            </span>
          )}
        </div>
        <div className="text-[14px] font-bold text-white mb-1">{title}</div>
        <div className="text-[12px] text-[#6677aa] leading-relaxed">{desc}</div>
      </div>
    </motion.div>
  );
}

// ─── Animated Counter ─────────────────────────────────
function Counter({ target, duration = 1200 }) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return <>{val}</>;
}

// ─── Main ─────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const [searchVal, setSearchVal]     = useState('');
  const [flights, setFlights]         = useState([]);
  const [stats, setStats]             = useState({ total: 0, onTime: 0, delayed: 0, cancelled: 0 });
  const [weather, setWeather]         = useState(null);
  const [statsReady, setStatsReady]   = useState(false);

  // Fetch flight data for ticker + mini board
  useEffect(() => {
    const load = async () => {
      try {
        const [depRes, arrRes] = await Promise.all([
          flightAPI.getFlights({ type: 'departure' }),
          flightAPI.getFlights({ type: 'arrival' }),
        ]);
        const all = [
          ...(depRes.data.flights || []),
          ...(arrRes.data.flights || []),
        ];
        setFlights(all);
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  // Fetch stats
  useEffect(() => {
    flightAPI.getStats().then(res => {
      setStats(res.data);
      setStatsReady(true);
    }).catch(() => setStatsReady(true));
  }, []);

  // Fetch weather
  useEffect(() => {
    weatherAPI.getCurrent().then(res => setWeather(res.data)).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchVal.trim()) navigate(`/flights/${encodeURIComponent(searchVal.trim())}`);
  };

  // Ticker flights: active + scheduled (mix of dep+arr)
  const tickerFlights = flights
    .filter(f => f.status === 'active' || f.status === 'scheduled' || f.delay_minutes > 0)
    .slice(0, 20);

  const weatherIcon = (cond) => {
    if (!cond) return '🌤';
    const c = cond.toLowerCase();
    if (c.includes('thunder')) return '⛈';
    if (c.includes('rain'))    return '🌧';
    if (c.includes('cloud'))   return '☁️';
    if (c.includes('fog') || c.includes('mist')) return '🌫';
    if (c.includes('clear') || c.includes('sunny')) return '☀️';
    return '🌤';
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* CSS for ticker animation */}
      <style>{`
        @keyframes tickerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .ticker-track {
          animation: tickerScroll 60s linear infinite;
          will-change: transform;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      {/* Live Ticker */}
      {tickerFlights.length > 0 && <Ticker flights={tickerFlights} />}

      {/* Weather Banner — mobile only (right panel is hidden on mobile) */}
      {weather && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:hidden mx-4 mt-4 rounded-xl border border-[rgba(99,179,255,0.12)] bg-[#0d1525] px-5 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <span className="text-2xl">{weatherIcon(weather.current?.condition)}</span>
            <div>
              <div className="text-sm font-semibold text-white">
                {weather.current?.condition || 'Clear'} · {weather.current?.temperature || '—'}°C
              </div>
              <div className="text-[11px] text-[#4a5a7a]">Kempegowda Intl · BLR / VOBL</div>
            </div>
          </div>
          <div className="flex items-center gap-5 text-[11px] font-mono">
            <div className="text-center">
              <div className="text-[#4a5a7a]">WIND</div>
              <div className="text-[#8899bb]">{weather.current?.windSpeed || '—'}kt</div>
            </div>
            <div className="text-center">
              <div className="text-[#4a5a7a]">VIS</div>
              <div className="text-[#8899bb]">{weather.current?.visibility || '—'}km</div>
            </div>
            <div className="flex items-center gap-1.5 text-[#22c55e]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              LIVE
            </div>
          </div>
        </motion.div>
      )}

      {/* HERO — Split Layout */}
      <section className="px-4 md:px-8 py-10 md:py-14">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-10 items-center">

          {/* ── Left: Brand + Search ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}>

            {/* Badge */}
            <div className="inline-flex items-center gap-2 font-mono text-[11px] text-[#3b9eff] tracking-[0.12em] uppercase bg-[rgba(59,158,255,0.07)] border border-[rgba(59,158,255,0.2)] px-4 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              Live airport operations · BLR · Kempegowda
            </div>

            {/* Headline */}
            <h1 className="font-display font-extrabold tracking-[-2px] leading-[1.0] mb-5">
              <span className="block text-[clamp(44px,5.5vw,76px)] text-white">AeroVision</span>
              <span className="block text-[clamp(22px,2.8vw,40px)] font-bold tracking-[-1px] mt-1 text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, #3b9eff 0%, #8b5cf6 100%)' }}>
                BLR Command Center
              </span>
            </h1>

            <p className="text-[#6677aa] text-[15px] leading-relaxed mb-7 max-w-[500px]">
              Search flights, track gates, monitor airspace, and anticipate delays —
              one polished operations dashboard for Kempegowda International Airport.
            </p>

            {/* Search */}
            <form onSubmit={handleSearch} className="relative max-w-[520px] mb-6">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4a5a7a] text-[15px]">✈</div>
              <input
                type="text"
                value={searchVal}
                onChange={e => setSearchVal(e.target.value)}
                placeholder="Search flight, airline, gate or route..."
                className="w-full py-[14px] pl-10 pr-[110px] bg-[#141c2e] border border-[rgba(99,179,255,0.2)] rounded-xl text-[14px] text-white placeholder-[#4a5a7a] outline-none focus:border-[#3b9eff] focus:shadow-[0_0_0_3px_rgba(59,158,255,0.1)] transition-all"
              />
              <button type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 px-5 bg-[#3b9eff] rounded-lg text-[13px] font-semibold text-white hover:bg-[#2d8be8] transition-colors">
                Track
              </button>
            </form>

            {/* Quick actions */}
            <div className="grid grid-cols-4 gap-3 max-w-[520px]">
              {[
                { icon: '✈️', label: 'Departures', sub: 'BLR outbound',   to: '/flights?type=departure' },
                { icon: '🛬', label: 'Arrivals',   sub: 'Incoming',       to: '/flights?type=arrival'   },
                { icon: '◎',  label: 'Live Radar', sub: 'Airspace',       to: '/radar'                  },
                { icon: '◆',  label: 'Assistant',  sub: 'Ask anything',   to: '/chatbot'                },
              ].map(btn => (
                <motion.button
                  key={btn.label}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(btn.to)}
                  className="flex flex-col items-center gap-1 p-3 bg-[#0e1525] border border-[rgba(99,179,255,0.12)] rounded-xl hover:border-[rgba(99,179,255,0.3)] transition-all text-center">
                  <span className="text-xl mb-0.5">{btn.icon}</span>
                  <span className="text-[12px] font-semibold text-white">{btn.label}</span>
                  <span className="text-[10px] text-[#4a5a7a]">{btn.sub}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* ── Right: Live Status Panel ── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.55 }}
            className="hidden lg:flex flex-col gap-4">

            {/* Flight stats */}
            <div className="bg-[#0e1525] border border-[rgba(99,179,255,0.12)] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#3a4a6a]">Today's Operations</span>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#22c55e]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  LIVE
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Total Flights', value: stats.total,     accent: '#3b9eff' },
                  { label: 'On Time',       value: stats.onTime,    accent: '#22c55e' },
                  { label: 'Delayed',       value: stats.delayed,   accent: '#f59e0b' },
                  { label: 'Cancelled',     value: stats.cancelled, accent: '#ef4444' },
                ].map(s => (
                  <div key={s.label} className="bg-[#080c14] rounded-xl p-3 border border-[rgba(99,179,255,0.07)]">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[#3a4a6a] mb-1">{s.label}</div>
                    <div className="font-display text-[30px] font-extrabold leading-none" style={{ color: s.accent }}>
                      {statsReady ? <Counter target={s.value || 0} duration={900} /> : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Weather panel */}
            {weather && (
              <div className="bg-[#0e1525] border border-[rgba(99,179,255,0.12)] rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#3a4a6a]">Airport Weather</span>
                  <span className="text-[10px] font-mono text-[#4a5a7a]">VOBL / BLR</span>
                </div>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-4xl">{weatherIcon(weather.current?.condition)}</span>
                  <div>
                    <div className="text-[28px] font-display font-bold text-white leading-none">{weather.current?.temperature || '—'}°C</div>
                    <div className="text-[12px] text-[#6677aa] mt-0.5">{weather.current?.condition || 'Clear'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'WIND',  value: `${weather.current?.windSpeed  || '—'} kt`  },
                    { label: 'VIS',   value: `${weather.current?.visibility || '—'} km`  },
                    { label: 'HUM',   value: `${weather.current?.humidity   || '—'}%`    },
                  ].map(w => (
                    <div key={w.label} className="bg-[#080c14] rounded-lg p-2.5 border border-[rgba(99,179,255,0.07)] text-center">
                      <div className="text-[9px] font-mono text-[#3a4a6a] mb-1">{w.label}</div>
                      <div className="text-[12px] font-mono text-[#8899bb]">{w.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

        </div>
      </section>

      {/* ── Stats Strip — mobile only (desktop sees stats in hero right panel) ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="lg:hidden grid grid-cols-2 gap-4 px-4 md:px-8 mb-8">
        {[
          {
            label: 'Total Flights Today',
            value: stats.total,
            sub: stats.source === 'aerodatabox' ? '✓ Live AeroDataBox' : 'BLR departures + arrivals',
            accent: '#3b9eff',
            icon: '✈',
          },
          {
            label: 'On Time',
            value: stats.onTime,
            sub: stats.total ? `${Math.round((stats.onTime / stats.total) * 100)}% on-time rate` : 'Loading…',
            accent: '#22c55e',
            icon: '✓',
          },
          {
            label: 'Delayed',
            value: stats.delayed,
            sub: stats.avgDelay ? `Avg delay: ${stats.avgDelay} min` : 'No delays',
            accent: '#f59e0b',
            icon: '⏱',
          },
          {
            label: 'Cancelled',
            value: stats.cancelled,
            sub: stats.cancelled > 0 ? 'View on Live Board' : 'All flights operating',
            accent: '#ef4444',
            icon: '✕',
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.07, duration: 0.4 }}
            className="relative bg-[#0e1525] border border-[rgba(99,179,255,0.1)] rounded-2xl p-5 overflow-hidden">
            {/* Top color bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: `linear-gradient(90deg, ${s.accent}, ${s.accent}00)` }} />
            {/* Icon */}
            <div className="absolute right-4 top-4 text-[28px] opacity-[0.06] font-mono font-bold select-none"
              style={{ color: s.accent }}>
              {s.icon}
            </div>
            <div className="text-[10px] font-mono tracking-wider uppercase text-[#3a4a6a] mb-2">{s.label}</div>
            <div className="font-display text-[42px] font-extrabold leading-none mb-1"
              style={{ color: s.accent }}>
              {statsReady ? <Counter target={s.value} duration={1000 + i * 150} /> : '—'}
            </div>
            <div className="text-[11px] text-[#4a5a7a]">{s.sub}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Feature Grid ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
        className="px-4 md:px-8 mb-12">

        <div className="flex items-center gap-3 mb-5">
          <div className="h-px flex-1 bg-[rgba(99,179,255,0.08)]" />
          <span className="font-mono text-[11px] tracking-widest text-[#2a3a5a] uppercase">Platform Modules</span>
          <div className="h-px flex-1 bg-[rgba(99,179,255,0.08)]" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureTile navigate={navigate} to="/flights"
            icon="✈️" title="Live Flight Board"
            desc="Real-time departures & arrivals with gate info, terminal assignments, and live status updates."
            badge="FIDS" color="#3b9eff" />

          <FeatureTile navigate={navigate} to="/radar"
            icon="◎" title="ADS-B Radar"
            desc="Live aircraft positions over BLR airspace with flight search, tracking, and animated trails."
            badge="LIVE" color="#8b5cf6" />

          <FeatureTile navigate={navigate} to="/weather"
            icon="◈" title="Weather Intelligence"
            desc="Live METAR data, hourly forecast, and flight weather impact assessments for BLR."
            badge="METAR" color="#22c55e" />

          <FeatureTile navigate={navigate} to="/crowd"
            icon="◉" title="Crowd Analytics"
            desc="Real-time terminal congestion maps with wait time predictions for T1 and T2."
            badge="HEAT MAP" color="#f59e0b" />

          <FeatureTile navigate={navigate} to="/travel"
            icon="🗺" title="Travel Planner"
            desc="Live drive time from your location to BLR with traffic, parking, and departure tips."
            badge="LIVE" color="#ef4444" />

          <FeatureTile navigate={navigate} to="/assist"
            icon="♿" title="Mobility Assistance"
            desc="Book wheelchair or buggy service at BLR — free for eligible passengers, ₹1,000 for others."
            badge="ASSIST" color="#a78bfa" />

          <FeatureTile navigate={navigate} to="/chatbot"
            icon="◆" title="AI Flight Assistant"
            desc="Ask anything about flights, delays, weather, or airport info — powered by AeroBot AI."
            badge="AI" color="#06b6d4" />
        </div>
      </motion.div>

      {/* ── Footer Strip ── */}
      <div className="border-t border-[rgba(99,179,255,0.07)] px-4 md:px-8 py-4 flex items-center justify-between text-[11px] font-mono text-[#2a3a5a]">
        <span>AeroVision · Kempegowda International Airport (BLR / VOBL)</span>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          <span>All systems operational</span>
        </div>
      </div>
    </div>
  );
}
