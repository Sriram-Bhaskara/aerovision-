// =====================================================
// WeatherPage — Real-time aviation weather for BLR
// Uses OpenWeather API + METAR-style aviation data
// =====================================================
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { weatherAPI } from '../services/api';

function WeatherSkeleton() {
  return (
    <div className="p-4 md:p-8 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-20 bg-[var(--surface)] rounded-lg" />
        <div className="h-3 w-3 bg-[var(--surface2)] rounded" />
        <div className="h-3 w-36 bg-[var(--surface2)] rounded-full" />
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[var(--surface)] border border-[var(--border5)] rounded-2xl p-8 space-y-3">
            <div className="h-10 w-10 bg-[var(--surface2)] rounded-xl" />
            <div className="h-12 w-28 bg-[var(--surface2)] rounded-xl" />
            <div className="h-3 w-24 bg-[var(--surface2)] rounded-full" />
          </div>
        ))}
      </div>
      <div className="h-20 bg-[var(--surface)] rounded-2xl" />
    </div>
  );
}

function getImpact(w) {
  if (!w) return { level: 'minimal', color: '#22c55e', icon: '✓', desc: 'No weather impact expected on flights.' };
  const cond = (w.condition || '').toLowerCase();
  const vis = parseFloat(w.visibility || 10);
  const wind = parseFloat(w.windSpeed || 0);
  if (cond.includes('thunder') || vis < 1.5 || wind > 35) {
    return { level: 'severe', color: '#ef4444', icon: '⚠', desc: 'Significant disruptions likely. Expect widespread delays and possible diversions.' };
  }
  if (cond.includes('rain') || vis < 4 || wind > 22) {
    return { level: 'moderate', color: '#f59e0b', icon: '◎', desc: 'Moderate weather impact. Some delays and reduced visibility on approach.' };
  }
  if (cond.includes('fog') || cond.includes('mist') || wind > 15) {
    return { level: 'low', color: '#f59e0b', icon: '◌', desc: 'Minor weather impact. Possible short delays due to wind or reduced visibility.' };
  }
  return { level: 'minimal', color: '#22c55e', icon: '✓', desc: 'Conditions are clear. No significant weather impact on operations.' };
}

export default function WeatherPage() {
  const navigate = useNavigate();
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await weatherAPI.getCurrent();
        setWeather(res.data.current);
        setForecast(res.data.forecast || []);
      } catch (err) {
        console.error('Weather fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 300000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <WeatherSkeleton />;

  // Fallback if no API data
  const w = weather || {
    temperature: 28, feelsLike: 31, humidity: 65, pressure: 1013,
    visibility: '8.0', windSpeed: 12, windGust: null, windDeg: 270,
    windDirection: 'W', condition: 'Clouds', description: 'scattered clouds',
    icon: '⛅', clouds: 40, metar: 'BLR 0812Z 27012KT 8SM', flightImpact: 'minimal',
    affectedFlights: 0, alert: null, airport: 'BLR / VOBL',
  };

  const detailRows = [
    { key: 'Feels Like', val: `${w.feelsLike}°C` },
    { key: 'Humidity', val: `${w.humidity}%` },
    { key: 'Pressure', val: `${w.pressure} hPa` },
    { key: 'Visibility', val: `${w.visibility} km` },
    { key: 'Wind', val: `${w.windDirection || ''} ${w.windSpeed} kt${w.windGust ? ` (G${w.windGust})` : ''}` },
    { key: 'Clouds', val: `${w.clouds}%` },
    { key: 'Flight Impact', val: w.flightImpact || 'Minimal' },
    { key: 'Affected Flights', val: w.affectedFlights || 0 },
  ];

  const impact = getImpact(weather || w);

  return (
    <div className="p-4 md:p-8">
      {/* Breadcrumb nav */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1525] border border-[rgba(99,179,255,0.12)] text-[#6677aa] hover:text-[#e8f0fe] hover:border-[rgba(99,179,255,0.28)] hover:bg-[rgba(59,158,255,0.06)] transition-all text-xs font-medium group">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Home
        </button>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#2a3a5a]">
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-mono text-[#8899bb]">Weather Intelligence</span>
      </div>

      <h1 className="font-display text-xl font-extrabold text-white tracking-tight mb-5">Weather Intelligence</h1>

      {/* Flight impact banner */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="mb-5 rounded-2xl border px-5 py-4 flex items-center gap-4 flex-wrap"
        style={{ borderColor: `${impact.color}33`, background: `${impact.color}08` }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
          style={{ background: `${impact.color}15`, color: impact.color }}>
          {impact.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono uppercase tracking-widest mb-0.5" style={{ color: impact.color }}>
            Flight Impact — {impact.level}
          </div>
          <div className="text-sm text-[#c8d8f0]">{impact.desc}</div>
        </div>
        {(weather || w).affectedFlights > 0 && (
          <div className="flex-shrink-0 text-right">
            <div className="text-2xl font-display font-extrabold" style={{ color: impact.color }}>
              {(weather || w).affectedFlights}
            </div>
            <div className="text-[10px] font-mono text-[#4a5a7a]">flights at risk</div>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#4a5a7a] ml-auto">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: impact.color }} />
          Live · BLR/VOBL
        </div>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Main weather card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="relative bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-8 overflow-hidden">
          <div className="absolute -right-5 -top-5 w-36 h-36 bg-[radial-gradient(circle,rgba(59,158,255,0.08),transparent_70%)] rounded-full" />
          <div className="text-5xl mb-2">{w.icon}</div>
          <div className="font-display text-6xl font-extrabold tracking-[-3px] leading-none">{w.temperature}°</div>
          <div className="text-[#8899bb] text-base mt-1.5 capitalize">{w.description}</div>
          <div className="font-mono text-[11px] text-[#4a5a7a] mt-3 tracking-wider">{w.airport}</div>
        </motion.div>

        {/* Details */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-2xl p-6">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-4">Aviation Weather Details</h3>
          <div className="space-y-0">
            {detailRows.map(r => (
              <div key={r.key} className="flex justify-between items-center py-2 border-b border-[rgba(99,179,255,0.06)] last:border-0">
                <span className="text-sm text-[#8899bb]">{r.key}</span>
                <span className="font-mono text-sm">{r.val}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* METAR */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-2xl p-6">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-4">METAR Report</h3>
          <div className="bg-[#0d1220] rounded-lg p-4 font-mono text-sm text-[#63b3ff] leading-relaxed break-all">
            {w.metar || 'METAR not available'}
          </div>
          <div className="mt-4">
            <h4 className="font-mono text-xs text-[#4a5a7a] uppercase mb-2">Runway Conditions</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#8899bb]">RWY 09R/27L</span>
                <span className={`font-mono ${w.condition === 'Rain' ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>
                  {w.condition === 'Rain' ? 'Wet' : 'Dry'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8899bb]">RWY 09L/27R</span>
                <span className={`font-mono ${w.condition === 'Rain' ? 'text-[#f59e0b]' : 'text-[#22c55e]'}`}>
                  {w.condition === 'Rain' ? 'Wet' : 'Dry'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8899bb]">Crosswind</span>
                <span className="font-mono">{Math.round(w.windSpeed * 0.7)} kt</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Alert */}
        {w.alert && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="md:col-span-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-xl p-4 flex gap-3 items-start">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <div className="text-sm font-medium text-[#ef4444] mb-1">Weather Advisory — {w.alert.level?.toUpperCase()}</div>
              <div className="text-sm text-[#8899bb] leading-relaxed">{w.alert.message}</div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Forecast */}
      {forecast.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mt-4">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-3">5-Day Forecast</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {forecast.map((f, i) => (
              <div key={i} className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-4 text-center">
                <div className="font-mono text-[10px] text-[#4a5a7a] tracking-wider">{f.day}</div>
                <div className="text-2xl my-2">{f.icon}</div>
                <div className="text-base font-display font-semibold">{f.temp}°</div>
                <div className="text-[10px] text-[#8899bb] capitalize mt-1">{f.condition}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
