// =====================================================
// CrowdPage — Real-time crowd density analytics
// Visual heatmap + zone cards for BLR airport
// =====================================================
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { analyticsAPI, flightAPI } from '../services/api';
import { useSocket } from '../services/socket';

// ── Zone layout for heatmap (relative positions within terminal SVG) ──
const ZONE_LAYOUT = {
  'Check-in Counters - T1': { x: 12, y: 15, w: 22, h: 14 },
  'Security Check - T1':    { x: 12, y: 33, w: 22, h: 12 },
  'Domestic Departures - T1': { x: 12, y: 49, w: 14, h: 18 },
  'Gate Area B - T1':       { x: 30, y: 49, w: 12, h: 18 },
  'Gate Area A - T1':       { x: 6,  y: 49, w: 12, h: 18 },
  'Gate Area - T1':         { x: 18, y: 49, w: 16, h: 18 },
  'Food Court - T1':        { x: 46, y: 49, w: 14, h: 18 },
  'Immigration - T1':       { x: 12, y: 71, w: 22, h: 12 },
  'Arrivals Hall - T1':     { x: 38, y: 15, w: 22, h: 14 },
  'Baggage Claim - T1':     { x: 38, y: 33, w: 22, h: 12 },

  'Check-in Counters - T2': { x: 12, y: 15, w: 22, h: 14 },
  'Security Check - T2':    { x: 12, y: 33, w: 22, h: 12 },
  'International Departures - T2': { x: 12, y: 49, w: 14, h: 18 },
  'Gate Area D - T2':       { x: 30, y: 49, w: 12, h: 18 },
  'Gate Area C - T2':       { x: 6,  y: 49, w: 12, h: 18 },
  'Gate Area - T2':         { x: 18, y: 49, w: 16, h: 18 },
  'Food Court - T2':        { x: 46, y: 49, w: 14, h: 18 },
  'Immigration - T2':       { x: 12, y: 71, w: 22, h: 12 },
  'Arrivals Hall - T2':     { x: 38, y: 15, w: 22, h: 14 },
  'Baggage Claim - T2':     { x: 38, y: 33, w: 22, h: 12 },
};

const ZONE_ICONS = {
  'Security Check': '\u{1F6E1}',
  'Immigration': '\u{1F6C2}',
  'Domestic Departures': '\u{1F6EB}',
  'International Departures': '\u{1F6EB}',
  'Arrivals Hall': '\u{1F6EC}',
  'Baggage Claim': '\u{1F9F3}',
  'Food Court': '\u{1F37D}',
  'Check-in Counters': '\u{1F4CB}',
  'Gate Area B': '\u{1F6AA}',
  'Gate Area D': '\u{1F6AA}',
};

function getZoneIcon(name) {
  for (const [key, icon] of Object.entries(ZONE_ICONS)) {
    if (name.startsWith(key)) return icon;
  }
  return '\u{1F4CD}';
}

const LEVEL_CONFIG = {
  low:    { color: '#22c55e', glow: 'rgba(34,197,94,0.4)', bg: 'rgba(34,197,94,0.12)', label: 'Low', gradient: 'from-green-500/20 to-green-500/5' },
  medium: { color: '#f59e0b', glow: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.12)', label: 'Moderate', gradient: 'from-amber-500/20 to-amber-500/5' },
  high:   { color: '#ef4444', glow: 'rgba(239,68,68,0.4)', bg: 'rgba(239,68,68,0.12)', label: 'High', gradient: 'from-red-500/20 to-red-500/5' },
};

// ── Heatmap Zone Block ──
function HeatZone({ zone, onClick, selected }) {
  const config = LEVEL_CONFIG[zone.level] || LEVEL_CONFIG.low;
  const layout = ZONE_LAYOUT[zone.zone_name];
  if (!layout) return null;

  const isSelected = selected === zone.zone_name;

  return (
    <motion.div
      onClick={() => onClick(zone)}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.03, zIndex: 10 }}
      transition={{ duration: 0.3 }}
      className="absolute cursor-pointer rounded-lg border transition-all duration-300 flex flex-col items-center justify-center gap-0.5 overflow-hidden"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${layout.w}%`,
        height: `${layout.h}%`,
        backgroundColor: config.bg,
        borderColor: isSelected ? config.color : `${config.color}44`,
        boxShadow: isSelected
          ? `0 0 20px ${config.glow}, inset 0 0 20px ${config.glow}`
          : `inset 0 0 12px ${config.glow}`,
      }}
    >
      {/* Animated heat pulse */}
      <div className="absolute inset-0 rounded-lg animate-pulse opacity-30"
        style={{ background: `radial-gradient(ellipse at center, ${config.color}33 0%, transparent 70%)` }} />

      <span className="text-[10px] sm:text-xs font-semibold relative z-10" style={{ color: config.color }}>
        {zone.density_percent}%
      </span>
      <span className="text-[8px] sm:text-[10px] text-[#8899bb] relative z-10 text-center leading-tight px-1 truncate w-full">
        {zone.zone_name.replace(/ - T[12]/, '')}
      </span>
    </motion.div>
  );
}

// ── Terminal Floor Plan (visual heatmap) ──
function TerminalHeatmap({ zones, terminal, selectedZone, onSelectZone, gateCongestion = [], showZones = true }) {
  const termZones = zones.filter(z => z.terminal === terminal);

  // Group gates by area for positioning
  const gatesByArea = gateCongestion.reduce((acc, g) => {
    const areaKey = `${g.area} - ${g.terminal}`;
    if (!acc[areaKey]) acc[areaKey] = [];
    acc[areaKey].push(g);
    return acc;
  }, {});

  const GATE_FALLBACK = {
    T1: { x: 18, y: 56, w: 40, h: 18 },
    T2: { x: 38, y: 56, w: 40, h: 18 },
  };

  return (
    <div className="relative w-full min-h-[680px] bg-[#080e1a] border border-[rgba(99,179,255,0.12)] rounded-2xl overflow-hidden">
      {/* Grid lines for floor plan effect */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`grid-${terminal}`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#63b3ff" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#grid-${terminal})`} />
      </svg>

      {/* Terminal label */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-2">
        <div className="w-2 h-2 bg-[#3b9eff] rounded-full animate-pulse" />
        <span className="font-mono text-[11px] text-[#4a5a7a]">Terminal {terminal.slice(1)} — Floor Plan</span>
      </div>

      {/* Flow arrows (decorative) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id={`arrow-${terminal}`} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <path d="M0,0 L6,2 L0,4" fill="#3b9eff" />
          </marker>
        </defs>
        {/* Departure flow */}
        <line x1="23%" y1="22%" x2="23%" y2="30%" stroke="#3b9eff" strokeWidth="1" strokeDasharray="3,3" markerEnd={`url(#arrow-${terminal})`} />
        <line x1="23%" y1="44%" x2="23%" y2="48%" stroke="#3b9eff" strokeWidth="1" strokeDasharray="3,3" markerEnd={`url(#arrow-${terminal})`} />
        {/* Arrival flow */}
        <line x1="49%" y1="28%" x2="49%" y2="32%" stroke="#22c55e" strokeWidth="1" strokeDasharray="3,3" markerEnd={`url(#arrow-${terminal})`} />
      </svg>

      {/* Zone blocks (optional) */}
      {showZones && termZones.map(zone => (
        <HeatZone
          key={zone.zone_name}
          zone={zone}
          selected={selectedZone}
          onClick={onSelectZone}
        />
      ))}

      {/* Gate markers overlay */}
      {Object.entries(gatesByArea).map(([areaKey, gates]) => {
        // allow fallback if layout missing
        const sample = gates[0] || {};
        const term = sample.terminal || terminal;
        const layout = ZONE_LAYOUT[areaKey] || GATE_FALLBACK[term];
        // arrange gates in a tighter grid but leave inner margins to avoid crossing area boundaries
        const count = gates.length || 1;
        const shrinkFactor = 0.82; // use only 82% of the area's width for markers (leave margins)
        const markerSize = 2.8; // percent width/height per marker
        const gap = 0.8; // percent gap between markers

        const usableW = (layout.w || 20) * shrinkFactor;
        const usableH = (layout.h || 18) * 0.9; // slightly reduce height usage
        const cols = Math.max(1, Math.floor(usableW / (markerSize + gap)));
        const rows = Math.ceil(count / cols);
        const cellW = usableW / cols;
        const cellH = usableH / Math.max(1, rows);
        const leftPad = ((layout.w || 20) - usableW) / 2;
        const topPad = ((layout.h || 18) - usableH) / 2;

        return gates.map((g, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cx = (layout.x || 10) + leftPad + cellW * (col + 0.5);
          const cy = (layout.y || 50) + topPad + cellH * (row + 0.5);
          const cfg = LEVEL_CONFIG[g.level] || LEVEL_CONFIG.low;
          return (
            <div key={`${g.terminal}-${g.gate}`} style={{ left: `${Math.max(layout.x + 1, Math.min(98, cx))}%`, top: `${Math.max(layout.y + 1, Math.min(98, cy))}%` }}
              className="absolute z-30 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto group">
              <div className="relative">
                <div className="w-[2.8%] h-[2.8%] rounded-full flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, minWidth: 20, minHeight: 20 }}>
                  <span className="text-[11px] leading-none">{g.gate}</span>
                </div>
                <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#071022] border border-[rgba(99,179,255,0.06)] rounded-md px-2 py-1 text-[11px] text-white whitespace-nowrap">
                  {g.gate} · {g.flights} flight{g.flights !== 1 ? 's' : ''} · {g.density_percent}%
                </div>
              </div>
            </div>
          );
        });
      })}

      {/* Legend */}
      <div className="absolute bottom-3 right-4 flex items-center gap-3 z-20">
        {Object.entries(LEVEL_CONFIG).map(([level, cfg]) => (
          <div key={level} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: cfg.color, opacity: 0.8 }} />
            <span className="text-[10px] font-mono text-[#4a5a7a]">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Zone Detail Card (shown when zone is selected) ──
function ZoneDetail({ zone, onClose }) {
  if (!zone) return null;
  const config = LEVEL_CONFIG[zone.level] || LEVEL_CONFIG.low;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className="bg-[#0d1525] border rounded-xl p-4 shadow-lg"
      style={{ borderColor: `${config.color}44` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getZoneIcon(zone.zone_name)}</span>
          <div>
            <div className="text-sm font-semibold text-white">{zone.zone_name}</div>
            <div className="text-[10px] font-mono text-[#4a5a7a]">{zone.terminal} · Real-time</div>
          </div>
        </div>
        <button onClick={onClose} className="text-[#4a5a7a] hover:text-white text-lg leading-none">&times;</button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-xl font-bold font-display" style={{ color: config.color }}>{zone.density_percent}%</div>
          <div className="text-[10px] text-[#4a5a7a]">Density</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold font-display text-white">
            {zone.estimated_wait_minutes > 0 ? `${zone.estimated_wait_minutes}m` : '—'}
          </div>
          <div className="text-[10px] text-[#4a5a7a]">Est. Wait</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-sm font-semibold" style={{ color: config.color }}>{config.label}</span>
          </div>
          <div className="text-[10px] text-[#4a5a7a]">Level</div>
        </div>
      </div>

      {/* Density bar */}
      <div className="h-2 bg-[#111827] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${zone.density_percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: config.color, boxShadow: `0 0 8px ${config.glow}` }}
        />
      </div>
    </motion.div>
  );
}

// ── Gate Detail Modal ──
const GATE_ADVICE = {
  low:    'Clear — good time to head to your gate.',
  medium: 'Moderate crowd — arrive a few minutes early.',
  high:   'Heavy crowd — plan extra time at this gate.',
};

function GateDetailModal({ gate, onClose, flightsAtGate = [] }) {
  if (!gate) return null;
  const cfg = LEVEL_CONFIG[gate.level] || LEVEL_CONFIG.low;

  return (
    <motion.div
      key="gate-modal-root"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 24 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="relative w-full max-w-sm"
        >
          <div className="bg-[#090f1d] rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
            style={{ border: `1px solid ${cfg.color}33` }}>
            {/* Color accent bar */}
            <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${cfg.color}, transparent)` }} />

            <div className="p-5">
              {/* Gate ID + close */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <div className="text-[36px] font-display font-extrabold text-white tracking-tight leading-none">{gate.gate}</div>
                  <div className="text-[11px] font-mono text-[#4a5a7a] mt-1">{gate.terminal} · {gate.area}</div>
                </div>
                <div className="flex flex-col items-end gap-2 pt-0.5">
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}44` }}>
                    {cfg.label}
                  </span>
                  <button onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a5a7a] hover:text-white hover:bg-[rgba(99,179,255,0.08)] transition-all text-lg leading-none">
                    ×
                  </button>
                </div>
              </div>

              {/* Big density */}
              <div className="text-center py-3 mb-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 }}
                  className="text-[64px] font-display font-extrabold leading-none"
                  style={{ color: cfg.color, textShadow: `0 0 40px ${cfg.glow}` }}>
                  {gate.density_percent}%
                </motion.div>
                <div className="text-[11px] font-mono text-[#4a5a7a] mt-1">crowd density</div>
              </div>

              {/* Density bar */}
              <div className="h-2 bg-[#111827] rounded-full overflow-hidden mb-5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${gate.density_percent}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: cfg.color, boxShadow: `0 0 10px ${cfg.glow}` }}
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2.5 mb-4">
                <div className="bg-[#071022] rounded-xl p-3 border border-[rgba(99,179,255,0.06)]">
                  <div className="text-[9px] font-mono text-[#4a5a7a] uppercase tracking-wider mb-1">Active Flights</div>
                  <div className="text-2xl font-display font-bold text-white">{gate.flights}</div>
                </div>
                <div className="bg-[#071022] rounded-xl p-3 border border-[rgba(99,179,255,0.06)]">
                  <div className="text-[9px] font-mono text-[#4a5a7a] uppercase tracking-wider mb-1">Gate Area</div>
                  <div className="text-sm font-semibold text-white mt-1">{gate.area}</div>
                </div>
              </div>

              {/* Live flights at this gate */}
              {flightsAtGate.length > 0 && (
                <div className="mb-3">
                  <div className="text-[9px] font-mono text-[#4a5a7a] uppercase tracking-wider mb-2">Flights at this gate</div>
                  <div className="space-y-1.5">
                    {flightsAtGate.slice(0, 3).map(f => {
                      const isDelayed = f.delay_minutes > 0;
                      const isCancelled = f.status === 'cancelled';
                      const statusColor = isCancelled ? '#ef4444' : isDelayed ? '#f59e0b' : '#22c55e';
                      return (
                        <div key={f.flight_iata} className="flex items-center justify-between bg-[#071022] rounded-lg px-3 py-2 border border-[rgba(99,179,255,0.06)]">
                          <div>
                            <span className="text-xs font-bold font-mono" style={{ color: statusColor }}>{f.flight_iata}</span>
                            <span className="text-[10px] text-[#4a5a7a] ml-2">{f.arrival_airport || f.departure_airport}</span>
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: statusColor }}>
                            {isCancelled ? 'CANC' : isDelayed ? `+${f.delay_minutes}m` : 'On time'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Advice */}
              <div className="rounded-xl p-3 flex items-start gap-2.5"
                style={{ background: cfg.bg, border: `1px solid ${cfg.color}22` }}>
                <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 animate-pulse" style={{ background: cfg.color }} />
                <div className="text-[12px] text-[#c8d8f0] leading-relaxed">
                  {GATE_ADVICE[gate.level] || GATE_ADVICE.low}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
    </motion.div>
  );
}

export default function CrowdPage() {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [terminal, setTerminal] = useState('T1');
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedGate, setSelectedGate] = useState(null);
  const [gateSearch, setGateSearch] = useState('');
  const [meta, setMeta] = useState(null);
  const [gateCongestion, setGateCongestion] = useState([]);
  const [gateFlightMap, setGateFlightMap] = useState({});
  const socket = useSocket();

  useEffect(() => {
    async function load() {
      try {
        const [crowdRes, depRes, arrRes] = await Promise.all([
          analyticsAPI.getCrowd(terminal),
          flightAPI.getFlights({ type: 'departure' }).catch(() => null),
          flightAPI.getFlights({ type: 'arrival' }).catch(() => null),
        ]);
        const data = crowdRes.data;
        setZones(data.zones || data || []);
        setGateCongestion(data.gate_congestion || []);
        if (data.meta) setMeta(data.meta);

        // Build gate → flights map
        const allFlights = [
          ...(depRes?.data?.flights || []),
          ...(arrRes?.data?.flights || []),
        ];
        const map = {};
        allFlights.forEach(f => {
          const g = (f.departure_gate || f.arrival_gate || '').toUpperCase();
          if (!g) return;
          if (!map[g]) map[g] = [];
          map[g].push(f);
        });
        setGateFlightMap(map);
      } catch {
        // Silent fail — component shows loading or cached state
      } finally {
        setLoading(false);
      }
    }
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [terminal]);

  // WebSocket live updates
  useEffect(() => {
    if (socket) {
      const handler = (data) => {
        if (data.zones) setZones(data.zones);
        if (data.gate_congestion) setGateCongestion(data.gate_congestion);
        if (data.meta) setMeta(data.meta);
      };
      socket.on('crowd:updated', handler);
      return () => socket.off('crowd:updated', handler);
    }
  }, [socket]);

  const filtered = useMemo(() =>
    terminal === 'all' ? zones : zones.filter(z => z.terminal === terminal),
    [zones, terminal]
  );

  const stats = useMemo(() => {
    const low = filtered.filter(z => z.level === 'low').length;
    const med = filtered.filter(z => z.level === 'medium').length;
    const high = filtered.filter(z => z.level === 'high').length;
    const avg = filtered.length > 0
      ? Math.round(filtered.reduce((s, z) => s + z.density_percent, 0) / filtered.length)
      : 0;
    const maxWait = filtered.reduce((m, z) => Math.max(m, z.estimated_wait_minutes || 0), 0);
    return { low, med, high, avg, maxWait };
  }, [filtered]);

  const handleSelectZone = (zone) => {
    setSelectedZone(prev => prev === zone.zone_name ? null : zone.zone_name);
  };

  const selectedData = zones.find(z => z.zone_name === selectedZone);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
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
          <span className="text-xs font-mono text-[#8899bb]">Crowd Density</span>
        </div>

        {/* Title row */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-xl font-extrabold text-white flex items-center gap-2.5 tracking-tight">
              Crowd &amp; Gate Density
              <span className="text-[9px] font-mono bg-[rgba(239,68,68,0.1)] text-[#ef4444] border border-[rgba(239,68,68,0.2)] px-1.5 py-0.5 rounded-full animate-pulse tracking-[0.15em]">
                LIVE
              </span>
            </h1>
            <p className="text-[11px] text-[#4a5a7a] font-mono mt-1">
              Real-time passenger density · Flight-data driven · BLR/VOBL
            </p>
          </div>

          {/* Terminal switcher */}
          <div className="flex bg-[#0d1525] border border-[rgba(99,179,255,0.12)] rounded-xl p-1 gap-1">
            {['T1', 'T2'].map(t => (
              <button key={t} onClick={() => { setTerminal(t); setSelectedZone(null); setSelectedGate(null); setGateSearch(''); }}
                className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  terminal === t
                    ? 'bg-[#3b9eff] text-white shadow-[0_0_16px_rgba(59,158,255,0.35)]'
                    : 'text-[#6677aa] hover:text-[#c8d8f0] hover:bg-[rgba(99,179,255,0.06)]'
                }`}>
                Terminal {t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <div className="bg-[#0d1525] border border-[rgba(99,179,255,0.1)] rounded-xl px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-white">{stats.avg}<span className="text-sm text-[#4a5a7a]">%</span></div>
          <div className="text-[10px] text-[#4a5a7a] font-mono">Avg Density</div>
        </div>
        <div className="bg-[#0d1525] border border-[rgba(34,197,94,0.15)] rounded-xl px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-[#22c55e]">{stats.low}</div>
          <div className="text-[10px] text-[#4a5a7a] font-mono">Low Zones</div>
        </div>
        <div className="bg-[#0d1525] border border-[rgba(245,158,11,0.15)] rounded-xl px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-[#f59e0b]">{stats.med}</div>
          <div className="text-[10px] text-[#4a5a7a] font-mono">Moderate</div>
        </div>
        <div className="bg-[#0d1525] border border-[rgba(239,68,68,0.15)] rounded-xl px-4 py-3 text-center">
          <div className="text-2xl font-display font-extrabold text-[#ef4444]">{stats.high}</div>
          <div className="text-[10px] text-[#4a5a7a] font-mono">High Zones</div>
        </div>
        <div className="bg-[#0d1525] border border-[rgba(99,179,255,0.1)] rounded-xl px-4 py-3 text-center col-span-2 md:col-span-1">
          <div className="text-2xl font-display font-extrabold text-[#8b5cf6]">{stats.maxWait}<span className="text-sm text-[#4a5a7a]">m</span></div>
          <div className="text-[10px] text-[#4a5a7a] font-mono">Peak Wait</div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-5 animate-pulse">
          {/* Gate panel skeleton */}
          <div className="bg-[#0d1525] border border-[rgba(99,179,255,0.06)] rounded-3xl p-5">
            <div className="flex justify-between mb-4">
              <div className="space-y-2">
                <div className="h-2.5 w-28 bg-[#111828] rounded-full" />
                <div className="h-4 w-48 bg-[#111828] rounded-full" />
              </div>
              <div className="h-7 w-28 bg-[#111828] rounded-lg" />
            </div>
            <div className="h-10 bg-[#071022] rounded-xl mb-5" />
            <div className="space-y-4">
              {[1, 2].map(g => (
                <div key={g}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-2.5 w-24 bg-[#111828] rounded-full" />
                    <div className="flex-1 h-px bg-[#111828]" />
                    <div className="h-5 w-20 bg-[#111828] rounded-md" />
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-[#071022] rounded-xl p-3 space-y-2">
                        <div className="flex justify-between">
                          <div className="h-3 w-8 bg-[#111828] rounded" />
                          <div className="h-3 w-8 bg-[#111828] rounded" />
                        </div>
                        <div className="h-1 bg-[#111828] rounded-full" />
                        <div className="h-2.5 w-12 bg-[#111828] rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Zone list skeleton */}
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-[#0d1525] border border-[rgba(99,179,255,0.06)] rounded-xl px-4 py-3">
                <div className="flex justify-between mb-2">
                  <div className="h-3.5 w-40 bg-[#111828] rounded-full" />
                  <div className="h-3.5 w-10 bg-[#111828] rounded-full" />
                </div>
                <div className="h-1 bg-[#111828] rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Gate congestion panel */}
          <div className="mb-5 bg-[#0d1525] border border-[rgba(99,179,255,0.06)] rounded-3xl p-5">
            {/* Panel header */}
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#4a5a7a] font-mono mb-1">Gate Congestion</div>
                <div className="text-sm text-white font-semibold">Live gate-level density</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] text-[#63b3ff] font-mono bg-[rgba(59,158,255,0.08)] border border-[rgba(59,158,255,0.15)] px-2.5 py-1 rounded-lg">
                  {gateCongestion.filter(g => g.terminal === terminal).length} gates · {terminal}
                </div>
                <div className="text-[9px] text-[#2a3a5a] font-mono mt-1">
                  {terminal === 'T1' ? 'Gates A1–A9, B1–B8' : 'Gates C1–C6, D1–D8'}
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative mt-4 mb-5">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#4a5a7a] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={gateSearch}
                onChange={e => setGateSearch(e.target.value)}
                placeholder={`Search gate — e.g. ${terminal === 'T1' ? 'A3, B1' : 'C2, D5'}`}
                className="w-full bg-[#071022] border border-[rgba(99,179,255,0.1)] rounded-xl pl-9 pr-8 py-2.5 text-[13px] text-white placeholder-[#2a3a5a] font-mono focus:outline-none focus:border-[rgba(59,158,255,0.35)] focus:bg-[#080f1e] transition-all"
              />
              {gateSearch && (
                <button onClick={() => setGateSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4a5a7a] hover:text-white text-lg leading-none transition-colors">
                  ×
                </button>
              )}
            </div>

            {gateCongestion.length > 0 ? (() => {
              const termGates = gateCongestion.filter(g => g.terminal === terminal);
              const searchTerm = gateSearch.trim().toUpperCase();
              const matchedGates = searchTerm
                ? termGates.filter(g => g.gate.includes(searchTerm) || g.area.toUpperCase().includes(searchTerm))
                : termGates;

              if (matchedGates.length === 0) {
                return (
                  <div className="text-center py-8">
                    <div className="text-2xl mb-2">🔍</div>
                    <div className="text-sm text-[#4a5a7a] font-mono">No gates match &ldquo;{gateSearch}&rdquo;</div>
                    <button onClick={() => setGateSearch('')} className="mt-2 text-[11px] text-[#3b9eff] hover:underline">Clear search</button>
                  </div>
                );
              }

              // When searching, show flat sorted list; otherwise group by area
              if (searchTerm) {
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                    {[...matchedGates].sort((a, b) => b.density_percent - a.density_percent).map(gate => {
                      const cfg = LEVEL_CONFIG[gate.level] || LEVEL_CONFIG.low;
                      return (
                        <motion.button
                          key={`${gate.terminal}-${gate.gate}`}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => setSelectedGate(gate)}
                          className="bg-[#071022] rounded-xl p-3 flex flex-col gap-2 border text-left cursor-pointer hover:border-opacity-60 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150"
                          style={{ borderColor: `${cfg.color}33` }}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-white font-mono">{gate.gate}</span>
                            <span className="text-[11px] font-bold font-mono" style={{ color: cfg.color }}>{gate.density_percent}%</span>
                          </div>
                          <div className="h-1 bg-[#111827] rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${gate.density_percent}%` }}
                              transition={{ duration: 0.6 }} className="h-full rounded-full"
                              style={{ backgroundColor: cfg.color, boxShadow: `0 0 4px ${cfg.glow}` }} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] text-[#4a5a7a]">{gate.flights} flight{gate.flights !== 1 ? 's' : ''}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                );
              }

              // Grouped by area
              const byArea = {};
              matchedGates.forEach(g => {
                if (!byArea[g.area]) byArea[g.area] = [];
                byArea[g.area].push(g);
              });
              const sortedAreas = Object.entries(byArea).sort(([, a], [, b]) => {
                const avgA = a.reduce((s, g) => s + g.density_percent, 0) / a.length;
                const avgB = b.reduce((s, g) => s + g.density_percent, 0) / b.length;
                return avgB - avgA;
              });

              return (
                <div className="space-y-6">
                  {sortedAreas.map(([area, gates]) => {
                    const avgDensity = Math.round(gates.reduce((s, g) => s + g.density_percent, 0) / gates.length);
                    const areaLevel = avgDensity >= 60 ? 'high' : avgDensity >= 25 ? 'medium' : 'low';
                    const areaCfg = LEVEL_CONFIG[areaLevel];
                    return (
                      <div key={area}>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[11px] font-mono font-semibold text-[#8899bb] uppercase tracking-widest">{area}</span>
                          <div className="flex-1 h-px bg-[rgba(99,179,255,0.06)]" />
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md"
                            style={{ color: areaCfg.color, background: areaCfg.bg }}>
                            avg {avgDensity}% · {areaCfg.label}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                          {[...gates].sort((a, b) => b.density_percent - a.density_percent).map(gate => {
                            const cfg = LEVEL_CONFIG[gate.level] || LEVEL_CONFIG.low;
                            return (
                              <motion.button
                                key={`${gate.terminal}-${gate.gate}`}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => setSelectedGate(gate)}
                                className="bg-[#071022] rounded-xl p-3 flex flex-col gap-2 border text-left cursor-pointer transition-colors"
                                style={{ borderColor: `${cfg.color}28` }}>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-bold text-white font-mono">{gate.gate}</span>
                                  <span className="text-[11px] font-bold font-mono" style={{ color: cfg.color }}>{gate.density_percent}%</span>
                                </div>
                                <div className="h-1 bg-[#111827] rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${gate.density_percent}%` }}
                                    transition={{ duration: 0.6 }} className="h-full rounded-full"
                                    style={{ backgroundColor: cfg.color, boxShadow: `0 0 4px ${cfg.glow}` }} />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-[#4a5a7a]">{gate.flights} flight{gate.flights !== 1 ? 's' : ''}</span>
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                </div>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <div className="text-[12px] text-[#4a5a7a] font-mono py-4 text-center">No gate-level data available yet.</div>
            )}
          </div>

          {/* Gate detail modal */}
          <AnimatePresence>
            {selectedGate && (
              <GateDetailModal
                gate={selectedGate}
                onClose={() => setSelectedGate(null)}
                flightsAtGate={gateFlightMap[selectedGate.gate?.toUpperCase()] || []}
              />
            )}
          </AnimatePresence>

          <div className="grid lg:grid-cols-1 gap-5">
          {/* Zone list (full width) */}
          <div className="flex flex-col gap-2 lg:col-span-3">
            {/* Zone detail (above list when selected) */}
            <AnimatePresence>
              {selectedData && (
                <div className="mb-4">
                  <ZoneDetail zone={selectedData} onClose={() => setSelectedZone(null)} />
                </div>
              )}
            </AnimatePresence>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-[#4a5a7a]">All Zones — {terminal}</span>
              <span className="text-[10px] font-mono text-[#2a3a5a]">{filtered.length} zones</span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,179,255,0.15) transparent' }}>
              {filtered
                .sort((a, b) => b.density_percent - a.density_percent)
                .map((zone, i) => {
                  const config = LEVEL_CONFIG[zone.level] || LEVEL_CONFIG.low;
                  const isActive = selectedZone === zone.zone_name;
                  return (
                    <motion.div
                      key={zone.zone_name}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => handleSelectZone(zone)}
                      className={`bg-[#0d1525] border rounded-xl px-4 py-3 cursor-pointer transition-all hover:border-[rgba(59,158,255,0.3)] ${
                        isActive ? 'border-[rgba(59,158,255,0.4)] bg-[rgba(59,158,255,0.03)]' : 'border-[rgba(99,179,255,0.1)]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm flex-shrink-0">{getZoneIcon(zone.zone_name)}</span>
                          <span className="text-[12px] font-medium text-[#c8d8f0] truncate">
                            {zone.zone_name.replace(/ - T[12]/, '')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="font-mono text-xs font-bold" style={{ color: config.color }}>
                            {zone.density_percent}%
                          </span>
                        </div>
                      </div>

                      {/* Mini bar */}
                      <div className="h-1 bg-[#111827] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${zone.density_percent}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                      </div>

                      {zone.estimated_wait_minutes > 0 && (
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-[#4a5a7a]">Wait time</span>
                          <span className="text-[10px] font-mono text-[#8899bb]">{zone.estimated_wait_minutes} min</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
            </div>

            

            {/* Data source footer */}
            {meta && (
              <div className="mt-2 p-3 bg-[#080e1a] border border-[rgba(99,179,255,0.08)] rounded-lg">
                <div className="text-[10px] font-mono text-[#2a3a5a] space-y-1">
                  <div className="flex justify-between">
                    <span>Source</span>
                    <span className="text-[#4a5a7a]">{meta.data_source === 'flight-driven' ? 'Live Flights' : 'Fallback'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active deps</span>
                    <span className="text-[#4a5a7a]">{meta.active_departures || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active arrs</span>
                    <span className="text-[#4a5a7a]">{meta.active_arrivals || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delayed</span>
                    <span className="text-[#f59e0b]">{meta.delayed_flights || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Updated</span>
                    <span className="text-[#4a5a7a]">{meta.last_updated ? new Date(meta.last_updated).toLocaleTimeString() : '—'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
