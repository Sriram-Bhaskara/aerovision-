// =====================================================
// IndoorNav — Interactive BLR Airport Indoor Navigation
// Live crowd density · Active flights at gates · Search
// Terminal 1 (Domestic) & Terminal 2 (International)
// =====================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { analyticsAPI, flightAPI } from '../services/api';

// ===== BLR Airport Floor Plan Data =====
const TERMINALS = {
  T1: {
    name: 'Terminal 1 — Domestic',
    floors: ['Ground Floor (Arrivals)', 'First Floor (Departures)'],
    zones: [
      { id: 'a1', type: 'gate', label: 'Gate A1', x: 105, y: 80, floor: 1 },
      { id: 'a2', type: 'gate', label: 'Gate A2', x: 165, y: 80, floor: 1 },
      { id: 'a3', type: 'gate', label: 'Gate A3', x: 225, y: 80, floor: 1 },
      { id: 'a4', type: 'gate', label: 'Gate A4', x: 285, y: 80, floor: 1 },
      { id: 'a5', type: 'gate', label: 'Gate A5', x: 345, y: 80, floor: 1 },
      { id: 'a6', type: 'gate', label: 'Gate A6', x: 405, y: 80, floor: 1 },
      { id: 'a7', type: 'gate', label: 'Gate A7', x: 465, y: 80, floor: 1 },
      { id: 'a8', type: 'gate', label: 'Gate A8', x: 525, y: 80, floor: 1 },
      { id: 'a9', type: 'gate', label: 'Gate A9', x: 585, y: 80, floor: 1 },
      { id: 'b1', type: 'gate', label: 'Gate B1', x: 105, y: 320, floor: 1 },
      { id: 'b2', type: 'gate', label: 'Gate B2', x: 165, y: 320, floor: 1 },
      { id: 'b3', type: 'gate', label: 'Gate B3', x: 225, y: 320, floor: 1 },
      { id: 'b4', type: 'gate', label: 'Gate B4', x: 285, y: 320, floor: 1 },
      { id: 'b5', type: 'gate', label: 'Gate B5', x: 345, y: 320, floor: 1 },
      { id: 'b6', type: 'gate', label: 'Gate B6', x: 405, y: 320, floor: 1 },
      { id: 'b7', type: 'gate', label: 'Gate B7', x: 465, y: 320, floor: 1 },
      { id: 'b8', type: 'gate', label: 'Gate B8', x: 525, y: 320, floor: 1 },
      { id: 'sec1', type: 'security', label: 'Security Check', x: 350, y: 140, floor: 1, w: 200, h: 30 },
      { id: 'checkin1', type: 'checkin', label: 'Check-in Counters (1-40)', x: 350, y: 370, floor: 1, w: 300, h: 25 },
      { id: 'fc1', type: 'food', label: 'Food Court', x: 660, y: 120, floor: 1, w: 80, h: 50 },
      { id: 'fc2', type: 'food', label: 'Café Coffee Day', x: 660, y: 190, floor: 1 },
      { id: 'fc3', type: 'food', label: 'Mainland China', x: 730, y: 120, floor: 1 },
      { id: 'fc4', type: 'food', label: 'KFC', x: 730, y: 160, floor: 1 },
      { id: 'rest1', type: 'restroom', label: 'Restroom', x: 150, y: 200, floor: 1 },
      { id: 'rest2', type: 'restroom', label: 'Restroom', x: 450, y: 200, floor: 1 },
      { id: 'rest3', type: 'restroom', label: 'Restroom', x: 150, y: 260, floor: 1 },
      { id: 'lounge1', type: 'lounge', label: 'Above Ground Lounge', x: 660, y: 260, floor: 1 },
      { id: 'shop1', type: 'shop', label: 'Duty Free', x: 300, y: 200, floor: 1, w: 80, h: 30 },
      { id: 'shop2', type: 'shop', label: 'WHSmith', x: 500, y: 200, floor: 1 },
      { id: 'bag1', type: 'baggage', label: 'Baggage Claim 1-6', x: 300, y: 370, floor: 0, w: 250, h: 30 },
      { id: 'arr_exit', type: 'exit', label: 'Arrivals Exit', x: 350, y: 395, floor: 0 },
      { id: 'taxi1', type: 'transport', label: 'Taxi / Ola / Uber', x: 250, y: 395, floor: 0 },
      { id: 'bus1', type: 'transport', label: 'BMTC Bus Stand', x: 450, y: 395, floor: 0 },
    ],
  },
  T2: {
    name: 'Terminal 2 — International',
    floors: ['Ground Floor (Arrivals)', 'First Floor (Departures)', 'Second Floor (Lounges)'],
    zones: [
      { id: 'c1', type: 'gate', label: 'Gate C1', x: 105, y: 80, floor: 1 },
      { id: 'c2', type: 'gate', label: 'Gate C2', x: 165, y: 80, floor: 1 },
      { id: 'c3', type: 'gate', label: 'Gate C3', x: 225, y: 80, floor: 1 },
      { id: 'c4', type: 'gate', label: 'Gate C4', x: 285, y: 80, floor: 1 },
      { id: 'c5', type: 'gate', label: 'Gate C5', x: 345, y: 80, floor: 1 },
      { id: 'c6', type: 'gate', label: 'Gate C6', x: 405, y: 80, floor: 1 },
      { id: 'd1', type: 'gate', label: 'Gate D1', x: 105, y: 320, floor: 1 },
      { id: 'd2', type: 'gate', label: 'Gate D2', x: 165, y: 320, floor: 1 },
      { id: 'd3', type: 'gate', label: 'Gate D3', x: 225, y: 320, floor: 1 },
      { id: 'd4', type: 'gate', label: 'Gate D4', x: 285, y: 320, floor: 1 },
      { id: 'd5', type: 'gate', label: 'Gate D5', x: 345, y: 320, floor: 1 },
      { id: 'd6', type: 'gate', label: 'Gate D6', x: 405, y: 320, floor: 1 },
      { id: 'd7', type: 'gate', label: 'Gate D7', x: 465, y: 320, floor: 1 },
      { id: 'd8', type: 'gate', label: 'Gate D8', x: 525, y: 320, floor: 1 },
      { id: 'sec_t2', type: 'security', label: 'Security + Immigration', x: 350, y: 140, floor: 1, w: 220, h: 30 },
      { id: 'checkin_t2', type: 'checkin', label: 'Check-in Counters (1-50)', x: 350, y: 370, floor: 1, w: 320, h: 25 },
      { id: 'fc_t2_1', type: 'food', label: 'Punjab Grill', x: 630, y: 120, floor: 1 },
      { id: 'fc_t2_2', type: 'food', label: 'Starbucks', x: 630, y: 160, floor: 1 },
      { id: 'fc_t2_3', type: 'food', label: 'Burger King', x: 700, y: 120, floor: 1 },
      { id: 'fc_t2_4', type: 'food', label: 'Bento Box', x: 700, y: 160, floor: 1 },
      { id: 'fc_t2_5', type: 'food', label: 'Food Street', x: 665, y: 200, floor: 1, w: 80, h: 40 },
      { id: 'rest_t2_1', type: 'restroom', label: 'Restroom', x: 130, y: 200, floor: 1 },
      { id: 'rest_t2_2', type: 'restroom', label: 'Restroom', x: 430, y: 200, floor: 1 },
      { id: 'lounge_t2_1', type: 'lounge', label: 'Encalm Privé Lounge', x: 300, y: 200, floor: 2 },
      { id: 'lounge_t2_2', type: 'lounge', label: 'Plaza Premium Lounge', x: 500, y: 200, floor: 2 },
      { id: 'shop_t2_1', type: 'shop', label: 'Duty Free Zone', x: 300, y: 200, floor: 1, w: 100, h: 30 },
      { id: 'shop_t2_2', type: 'shop', label: "Victoria's Secret", x: 500, y: 200, floor: 1 },
      { id: 'bag_t2', type: 'baggage', label: 'Baggage Claim 7-14', x: 300, y: 370, floor: 0, w: 280, h: 30 },
      { id: 'imm_arr', type: 'security', label: 'Immigration (Arrivals)', x: 350, y: 310, floor: 0, w: 180, h: 25 },
      { id: 'arr_exit_t2', type: 'exit', label: 'Arrivals Exit', x: 350, y: 395, floor: 0 },
      { id: 'metro', type: 'transport', label: 'Airport Metro', x: 500, y: 395, floor: 0 },
    ],
  },
};

const TYPE_COLORS = {
  gate:      { fill: '#3b9eff', stroke: '#63b3ff', icon: '🚪', bg: 'rgba(59,158,255,0.08)' },
  security:  { fill: '#f59e0b', stroke: '#fbbf24', icon: '🛡', bg: 'rgba(245,158,11,0.08)' },
  checkin:   { fill: '#8b5cf6', stroke: '#a78bfa', icon: '📋', bg: 'rgba(139,92,246,0.08)' },
  food:      { fill: '#22c55e', stroke: '#4ade80', icon: '🍽', bg: 'rgba(34,197,94,0.08)' },
  restroom:  { fill: '#06b6d4', stroke: '#22d3ee', icon: '🚻', bg: 'rgba(6,182,212,0.08)' },
  lounge:    { fill: '#ec4899', stroke: '#f472b6', icon: '🛋', bg: 'rgba(236,72,153,0.08)' },
  shop:      { fill: '#a855f7', stroke: '#c084fc', icon: '🛍', bg: 'rgba(168,85,247,0.08)' },
  baggage:   { fill: '#f97316', stroke: '#fb923c', icon: '🧳', bg: 'rgba(249,115,22,0.08)' },
  exit:      { fill: '#22c55e', stroke: '#4ade80', icon: '🚶', bg: 'rgba(34,197,94,0.08)' },
  transport: { fill: '#0ea5e9', stroke: '#38bdf8', icon: '🚌', bg: 'rgba(14,165,233,0.08)' },
};

const CROWD_COLORS = {
  low:    { fill: '#22c55e', glow: 'rgba(34,197,94,0.25)', label: 'Low', text: '#4ade80' },
  medium: { fill: '#f59e0b', glow: 'rgba(245,158,11,0.25)', label: 'Moderate', text: '#fbbf24' },
  high:   { fill: '#ef4444', glow: 'rgba(239,68,68,0.30)', label: 'Busy', text: '#f87171' },
};

// Match crowd zones to map zone types
const CROWD_ZONE_MAP = {
  'Check-in Counters': 'checkin',
  'Security Check': 'security',
  'Immigration': 'security',
  'Departures': 'gate',
  'Gate Area': 'gate',
  'Arrivals Hall': 'exit',
  'Baggage Claim': 'baggage',
  'Food Court': 'food',
};

function matchCrowdToZone(crowdZoneName) {
  for (const [key, type] of Object.entries(CROWD_ZONE_MAP)) {
    if (crowdZoneName.includes(key)) return type;
  }
  return null;
}

export default function IndoorNav() {
  const navigate = useNavigate();
  const [activeTerminal, setActiveTerminal] = useState('T1');
  const [activeFloor, setActiveFloor] = useState(1);
  const [selectedZone, setSelectedZone] = useState(null);
  const [fromZone, setFromZone] = useState(null);
  const [toZone, setToZone] = useState(null);
  const [showPath, setShowPath] = useState(false);
  const [filterType, setFilterType] = useState(null);
  const [search, setSearch] = useState('');
  const [crowdData, setCrowdData] = useState(null);
  const [gateFlights, setGateFlights] = useState({});
  const svgRef = useRef(null);

  // Fetch live crowd density + active flights
  useEffect(() => {
    async function fetchLiveData() {
      try {
        const [crowdRes, depRes, arrRes] = await Promise.all([
          analyticsAPI.getCrowd(activeTerminal).catch(() => null),
          flightAPI.getFlights({ type: 'departure' }).catch(() => null),
          flightAPI.getFlights({ type: 'arrival' }).catch(() => null),
        ]);
        if (crowdRes?.data) setCrowdData(crowdRes.data);

        // Map flights to gates
        const flights = [...(depRes?.data?.flights || []), ...(arrRes?.data?.flights || [])];
        const gateMap = {};
        flights.forEach(f => {
          const gate = f.departure_gate || f.arrival_gate;
          if (gate && !gateMap[gate.toUpperCase()]) {
            gateMap[gate.toUpperCase()] = {
              flight: f.flight_iata,
              airline: f.airline_name,
              dest: f.arrival_airport || f.departure_airport,
              status: f.status,
              delay: f.delay_minutes || 0,
            };
          }
        });
        setGateFlights(gateMap);
      } catch {}
    }
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 60000);
    return () => clearInterval(interval);
  }, [activeTerminal]);

  const terminal = TERMINALS[activeTerminal];
  const zones = terminal.zones.filter(z => z.floor === activeFloor);

  // Search filter
  const searchLower = search.toLowerCase();
  const filteredZones = zones.filter(z => {
    if (filterType && z.type !== filterType) return false;
    if (search && !z.label.toLowerCase().includes(searchLower) && !z.id.includes(searchLower)) return false;
    return true;
  });
  const highlightedId = search ? filteredZones[0]?.id : null;

  // Get crowd level for a zone type in current terminal
  const getCrowdLevel = (zoneType) => {
    if (!crowdData?.zones) return null;
    const matching = crowdData.zones.find(cz =>
      cz.terminal === activeTerminal && matchCrowdToZone(cz.zone_name) === zoneType
    );
    return matching || null;
  };

  // Get flight at a specific gate
  const getGateFlight = (gateLabel) => {
    const gateId = gateLabel.replace('Gate ', '').toUpperCase();
    return gateFlights[gateId] || null;
  };

  const findNearestZone = (type, preferFloor = activeFloor) => {
    const sameFloor = terminal.zones.filter(z => z.type === type && z.floor === preferFloor);
    if (sameFloor.length) return sameFloor[0];
    return terminal.zones.find(z => z.type === type) || null;
  };

  const quickActions = [
    { label: 'Nearest Security', type: 'security' },
    { label: 'Nearest Restroom', type: 'restroom' },
    { label: 'Nearest Food', type: 'food' },
    { label: 'Find Lounge', type: 'lounge' },
  ];

  const getDefaultStartZone = () => {
    return terminal.zones.find(z => z.type === 'checkin')?.id || terminal.zones[0]?.id || null;
  };

  const handleQuickAction = (type) => {
    const target = findNearestZone(type);
    if (!target) return;
    if (!fromZone) setFromZone(getDefaultStartZone());
    setToZone(target.id);
    setSelectedZone(target.id);
    setShowPath(true);
  };

  const getDirections = (path) => {
    if (!path) return [];
    const { from, to } = path;
    const sameFloor = from.floor === to.floor;
    const steps = [
      `Start at ${from.label}.`,
    ];
    if (!sameFloor) {
      steps.push(`Proceed to ${terminal.floors[to.floor]} via the escalators/elevator.`);
    }
    steps.push(`Follow the main concourse to ${to.label}.`);
    steps.push(`Estimated walk time: ~${path.walkTime} minutes.`);
    return steps;
  };

  // Crowd stats for banner
  const terminalCrowd = useMemo(() => {
    if (!crowdData?.zones) return null;
    const tZones = crowdData.zones.filter(z => z.terminal === activeTerminal);
    const avg = tZones.length > 0 ? Math.round(tZones.reduce((s, z) => s + z.density_percent, 0) / tZones.length) : 0;
    const busiest = [...tZones].sort((a, b) => b.density_percent - a.density_percent)[0];
    return { avg, busiest, high: tZones.filter(z => z.level === 'high').length, total: tZones.length };
  }, [crowdData, activeTerminal]);

  // Simple pathfinding
  const getPath = () => {
    if (!fromZone || !toZone) return null;
    const from = terminal.zones.find(z => z.id === fromZone);
    const to = terminal.zones.find(z => z.id === toZone);
    if (!from || !to) return null;
    const corridorY = 230;
    const steps = [];
    let points = `${from.x},${from.y}`;
    if (from.floor === to.floor) {
      if (from.y !== corridorY) points += ` ${from.x},${corridorY}`;
      if (from.x !== to.x) points += ` ${to.x},${corridorY}`;
      points += ` ${to.x},${to.y}`;
    } else {
      const connectorX = Math.max(120, Math.min(700, (from.x + to.x) / 2));
      points += ` ${from.x},${corridorY} ${connectorX},${corridorY}`;
      points += ` ${connectorX},${from.y}`;
      points += ` ${connectorX},${to.y}`;
      points += ` ${to.x},${to.y}`;
    }
    const dist = Math.abs(from.x - to.x) + Math.abs(from.y - to.y) + Math.abs(from.y - corridorY) + Math.abs(to.y - corridorY);
    const walkTime = Math.max(1, Math.round(dist / 40));
    return {
      points,
      from,
      to,
      walkTime,
    };
  };
  const path = showPath ? getPath() : null;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
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
          <span className="text-xs font-mono text-[#8899bb]">Airport Navigation</span>
          <span className="text-[10px] text-[#2a3a5a] font-mono ml-auto hidden sm:block">KEMPEGOWDA INTL · BLR/VOBL</span>
        </div>
        <h1 className="font-display text-xl font-extrabold text-white tracking-tight">Airport Navigation</h1>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[rgba(99,179,255,0.12)] bg-[#0b1322] p-5">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#3a4a6a] mb-2 font-mono">Wayfinding</div>
          <div className="text-base text-white font-semibold mb-2">Tap any terminal zone to inspect, then choose a start and destination to plot your route.</div>
          <div className="text-sm text-[#8899bb] leading-relaxed">
            Use quick route shortcuts for security, restrooms, dining, and lounges. The map updates with live crowd context to guide you through BLR faster.
          </div>
        </div>
        <div className="rounded-3xl border border-[rgba(99,179,255,0.12)] bg-[#0b1322] p-5 flex flex-col justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#3a4a6a] mb-2 font-mono">Quick tips</div>
            <ul className="text-sm text-[#cbd5e1] space-y-2 leading-6">
              <li>• Start from check-in if you are arriving at the terminal.</li>
              <li>• Tap gate labels for flight status and board info.</li>
              <li>• Clear the route to switch floors or terminal views.</li>
            </ul>
          </div>
          <div className="mt-4 bg-[#08101f] border border-[rgba(99,179,255,0.06)] rounded-2xl py-3 px-4 text-[11px] text-[#63b3ff] font-mono">
            Pro tip: the live crowd dots show busiest zones so you can avoid delays.
          </div>
        </div>
      </div>

      {/* Live stats banner */}
      {terminalCrowd && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Overall Congestion',
              value: `${terminalCrowd.avg}%`,
              color: terminalCrowd.avg >= 60 ? '#ef4444' : terminalCrowd.avg >= 25 ? '#f59e0b' : '#22c55e',
              sub: terminalCrowd.avg >= 60 ? 'High traffic' : terminalCrowd.avg >= 25 ? 'Moderate' : 'Light traffic',
            },
            {
              label: 'Busiest Zone',
              value: terminalCrowd.busiest?.zone_name?.replace(` - ${activeTerminal}`, '') || '—',
              color: '#f59e0b',
              sub: terminalCrowd.busiest ? `${terminalCrowd.busiest.density_percent}% · ~${terminalCrowd.busiest.estimated_wait_minutes}min wait` : '',
            },
            {
              label: 'High Congestion Zones',
              value: `${terminalCrowd.high} / ${terminalCrowd.total}`,
              color: terminalCrowd.high > 0 ? '#ef4444' : '#22c55e',
              sub: terminalCrowd.high > 0 ? 'Expect delays' : 'All clear',
            },
            {
              label: 'Active Flights at Gates',
              value: Object.keys(gateFlights).length,
              color: '#3b9eff',
              sub: 'Currently boarding/arrived',
            },
          ].map((stat, i) => (
            <div key={i} className="bg-[#0d1525] border border-[rgba(99,179,255,0.12)] rounded-xl px-4 py-3">
              <div className="text-[10px] text-[#4a5a7a] font-mono uppercase mb-1">{stat.label}</div>
              <div className="text-lg font-bold font-mono" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-[10px] text-[#3a4a6a] mt-0.5">{stat.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[#080e1a] border border-[rgba(99,179,255,0.14)] rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.5)]">
        {/* Controls bar */}
        <div className="px-4 py-3 border-b border-[rgba(99,179,255,0.1)] flex items-center gap-3 flex-wrap"
          style={{ background: 'linear-gradient(180deg, rgba(59,158,255,0.04) 0%, transparent 100%)' }}>
          {/* Terminal tabs */}
          <div className="flex gap-1">
            {Object.keys(TERMINALS).map(t => (
              <button key={t} onClick={() => { setActiveTerminal(t); setActiveFloor(1); setSelectedZone(null); setSearch(''); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTerminal === t
                  ? 'bg-[#3b9eff] text-white shadow-[0_0_12px_rgba(59,158,255,0.3)]'
                  : 'text-[#6677aa] border border-[rgba(99,179,255,0.12)] hover:border-[#3b9eff]'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Floor tabs */}
          <div className="flex gap-1">
            {terminal.floors.map((f, i) => (
              <button key={i} onClick={() => { setActiveFloor(i); setSelectedZone(null); }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${activeFloor === i
                  ? 'bg-[#141c2e] text-[#63b3ff] border border-[rgba(59,158,255,0.3)]'
                  : 'text-[#3a4a6a] hover:text-[#6677aa]'}`}>
                {f}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="ml-auto relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search gate, restaurant, shop..."
              className="bg-[#0d1525] border border-[rgba(99,179,255,0.18)] rounded-lg px-3 py-1.5 pl-8 text-xs text-white placeholder-[#2a3a5a] outline-none focus:border-[#3b9eff] w-[220px] transition-all"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#2a3a5a] text-xs">🔍</span>
          </div>
        </div>

        {/* Legend + filter chips */}
        <div className="px-4 py-2 flex gap-2 flex-wrap border-b border-[rgba(99,179,255,0.06)]" style={{ background: 'rgba(8,14,26,0.5)' }}>
          {[
            { type: 'gate', label: 'Gates' },
            { type: 'security', label: 'Security' },
            { type: 'food', label: 'Food' },
            { type: 'restroom', label: 'Restrooms' },
            { type: 'lounge', label: 'Lounges' },
            { type: 'shop', label: 'Shopping' },
            { type: 'baggage', label: 'Baggage' },
            { type: 'transport', label: 'Transport' },
          ].map(l => {
            const crowd = getCrowdLevel(l.type);
            return (
              <button key={l.type} onClick={() => setFilterType(filterType === l.type ? null : l.type)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-all border ${
                  filterType === l.type
                    ? 'border-[rgba(59,158,255,0.3)] bg-[rgba(59,158,255,0.1)] text-white'
                    : 'border-transparent text-[#4a5a7a] hover:text-[#8899bb]'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[l.type].fill }} />
                {l.label}
                {crowd && (
                  <span className="w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: CROWD_COLORS[crowd.level].fill }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick route actions */}
        <div className="px-4 py-3 border-b border-[rgba(99,179,255,0.06)] flex flex-wrap gap-2" style={{ background: 'rgba(8,14,26,0.55)' }}>
          <span className="text-[11px] text-[#4a5a7a] uppercase tracking-[0.18em] font-mono">Quick routes</span>
          {quickActions.map(action => (
            <button key={action.type} onClick={() => handleQuickAction(action.type)}
              className="px-3 py-1.5 bg-[#111827] border border-[rgba(99,179,255,0.15)] rounded-full text-[11px] text-[#d0d7eb] hover:border-[#3b9eff] hover:text-white transition-all">
              {action.label}
            </button>
          ))}
        </div>

        {/* SVG Map */}
        <div className="p-4 overflow-x-auto">
          <svg ref={svgRef} viewBox="0 0 820 440" className="w-full min-w-[800px] h-[440px]" style={{ background: '#060c18' }}>
            <defs>
              <filter id="glow-green"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22c55e" floodOpacity="0.4"/></filter>
              <filter id="glow-yellow"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f59e0b" floodOpacity="0.4"/></filter>
              <filter id="glow-red"><feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ef4444" floodOpacity="0.5"/></filter>
              <filter id="glow-blue"><feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#3b9eff" floodOpacity="0.5"/></filter>
              <filter id="glow-highlight"><feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#3b9eff" floodOpacity="0.8"/></filter>
            </defs>

            {/* Building structure */}
            <rect x="60" y="50" width="700" height="370" rx="16" fill="none" stroke="rgba(99,179,255,0.12)" strokeWidth="1.5" />
            <rect x="65" y="55" width="690" height="360" rx="13" fill="rgba(13,21,37,0.4)" stroke="rgba(99,179,255,0.06)" strokeWidth="0.5" />

            {/* Pier A/C zone */}
            <rect x="80" y="60" width="540" height="70" rx="8" fill="rgba(59,158,255,0.03)" stroke="rgba(59,158,255,0.08)" strokeWidth="0.5" />
            <text x="350" y="72" textAnchor="middle" fill="rgba(99,179,255,0.3)" fontSize="9" fontFamily="monospace" fontWeight="bold">
              {activeTerminal === 'T1' ? '── PIER A · DOMESTIC GATES ──' : '── PIER C · INTERNATIONAL GATES ──'}
            </text>

            {/* Pier B/D zone */}
            <rect x="80" y="290" width="540" height="60" rx="8" fill="rgba(59,158,255,0.03)" stroke="rgba(59,158,255,0.08)" strokeWidth="0.5" />
            <text x="350" y="302" textAnchor="middle" fill="rgba(99,179,255,0.3)" fontSize="9" fontFamily="monospace" fontWeight="bold">
              {activeTerminal === 'T1' ? '── PIER B · DOMESTIC GATES ──' : '── PIER D · INTERNATIONAL GATES ──'}
            </text>

            {/* Main corridor */}
            <rect x="70" y="170" width="680" height="80" fill="rgba(99,179,255,0.02)" stroke="rgba(99,179,255,0.06)" strokeWidth="0.5" strokeDasharray="6 3" />
            <text x="410" y="215" textAnchor="middle" fill="rgba(99,179,255,0.15)" fontSize="10" fontFamily="monospace">─── MAIN CONCOURSE ───</text>

            {/* Amenities zone (right side) */}
            <rect x="620" y="90" width="130" height="230" rx="8" fill="rgba(34,197,94,0.02)" stroke="rgba(34,197,94,0.06)" strokeWidth="0.5" />
            <text x="685" y="105" textAnchor="middle" fill="rgba(34,197,94,0.2)" fontSize="8" fontFamily="monospace">AMENITIES</text>

            {/* Navigation path */}
            {path && (
              <>
                <polyline points={path.points} fill="none" stroke="#3b9eff" strokeWidth="3" strokeDasharray="8 4" opacity="0.9" filter="url(#glow-blue)">
                  <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.8s" repeatCount="indefinite" />
                </polyline>
                <rect x={(path.from.x + path.to.x) / 2 - 40} y="218" width="80" height="18" rx="9" fill="#0d1525" stroke="rgba(59,158,255,0.3)" strokeWidth="1" />
                <text x={(path.from.x + path.to.x) / 2} y="230" textAnchor="middle" fill="#63b3ff" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  ~{path.walkTime} min
                </text>
              </>
            )}

            {/* Zone markers */}
            {filteredZones.map(zone => {
              const tc = TYPE_COLORS[zone.type];
              const isSelected = selectedZone === zone.id;
              const isFrom = fromZone === zone.id;
              const isTo = toZone === zone.id;
              const isHighlighted = highlightedId === zone.id;
              const crowd = getCrowdLevel(zone.type);
              const crowdColor = crowd ? CROWD_COLORS[crowd.level] : null;
              const gateFlight = zone.type === 'gate' ? getGateFlight(zone.label) : null;

              if (zone.w && zone.h) {
                const glowFilter = crowdColor ? (crowd.level === 'high' ? 'url(#glow-red)' : crowd.level === 'medium' ? 'url(#glow-yellow)' : 'url(#glow-green)') : undefined;
                return (
                  <g key={zone.id} onClick={() => setSelectedZone(isSelected ? null : zone.id)} style={{ cursor: 'pointer' }}>
                    <rect x={zone.x - zone.w / 2} y={zone.y - zone.h / 2} width={zone.w} height={zone.h}
                      rx="5" fill={crowdColor ? `${crowdColor.fill}12` : `${tc.fill}10`}
                      stroke={isSelected ? tc.stroke : crowdColor ? `${crowdColor.fill}50` : `${tc.fill}30`}
                      strokeWidth={isSelected ? 2 : 1} filter={glowFilter} />
                    <text x={zone.x} y={zone.y + 4} textAnchor="middle" fill={crowdColor ? crowdColor.text : tc.fill} fontSize="9" fontFamily="monospace">
                      {zone.label}
                    </text>
                    {crowd && (
                      <text x={zone.x + zone.w / 2 - 5} y={zone.y - zone.h / 2 + 10} textAnchor="end" fill={crowdColor.text} fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {crowd.density_percent}%
                      </text>
                    )}
                  </g>
                );
              }

              // Point markers
              const r = isSelected || isHighlighted ? 15 : 11;
              const filter = isHighlighted ? 'url(#glow-highlight)' : crowdColor && zone.type === 'gate' ? (crowd.level === 'high' ? 'url(#glow-red)' : crowd.level === 'medium' ? 'url(#glow-yellow)' : '') : '';
              return (
                <g key={zone.id} onClick={() => setSelectedZone(isSelected ? null : zone.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={zone.x} cy={zone.y} r={r}
                    fill={`${tc.fill}20`}
                    stroke={isHighlighted ? '#fff' : isSelected || isFrom || isTo ? tc.stroke : `${tc.fill}50`}
                    strokeWidth={isHighlighted || isSelected || isFrom || isTo ? 2 : 1}
                    filter={filter} />
                  {(isFrom || isTo || isHighlighted) && (
                    <circle cx={zone.x} cy={zone.y} r="16" fill="none" stroke={isHighlighted ? '#3b9eff' : tc.stroke} strokeWidth="1" opacity="0.5">
                      <animate attributeName="r" from="14" to="24" dur="1.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <text x={zone.x} y={zone.y + 3.5} textAnchor="middle" fontSize="10">{tc.icon}</text>
                  <text x={zone.x} y={zone.y + 24} textAnchor="middle" fill={tc.fill} fontSize="7.5" fontFamily="monospace" opacity="0.9">
                    {zone.label.replace('Gate ', '')}
                  </text>
                  {/* Show flight at gate */}
                  {gateFlight && (
                    <>
                      <rect x={zone.x - 22} y={zone.y - 24} width="44" height="14" rx="3"
                        fill={gateFlight.delay > 15 ? 'rgba(239,68,68,0.2)' : 'rgba(59,158,255,0.15)'}
                        stroke={gateFlight.delay > 15 ? 'rgba(239,68,68,0.4)' : 'rgba(59,158,255,0.3)'} strokeWidth="0.5" />
                      <text x={zone.x} y={zone.y - 15} textAnchor="middle"
                        fill={gateFlight.delay > 15 ? '#f87171' : '#63b3ff'} fontSize="8" fontFamily="monospace" fontWeight="bold">
                        {gateFlight.flight}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* Terminal label */}
            <text x="410" y="430" textAnchor="middle" fill="rgba(99,179,255,0.2)" fontSize="10" fontFamily="monospace">
              KEMPEGOWDA INTERNATIONAL AIRPORT — {terminal.name.toUpperCase()}
            </text>
          </svg>
        </div>

        {/* Navigation controls */}
        <div className="px-4 py-3 border-t border-[rgba(99,179,255,0.1)]" style={{ background: 'rgba(6,12,24,0.6)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-[#3a4a6a] font-mono uppercase tracking-wider">Navigate</span>

            <select value={fromZone || ''} onChange={e => setFromZone(e.target.value || null)}
              className="bg-[#0d1525] border border-[rgba(99,179,255,0.18)] rounded-lg px-3 py-1.5 text-xs text-[#8899bb] outline-none focus:border-[#3b9eff] transition-all">
              <option value="">From...</option>
              {terminal.zones.filter(z => z.floor === activeFloor).map(z => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>

            <span className="text-[#3a4a6a] text-xs">→</span>

            <select value={toZone || ''} onChange={e => setToZone(e.target.value || null)}
              className="bg-[#0d1525] border border-[rgba(99,179,255,0.18)] rounded-lg px-3 py-1.5 text-xs text-[#8899bb] outline-none focus:border-[#3b9eff] transition-all">
              <option value="">To...</option>
              {terminal.zones.filter(z => z.floor === activeFloor).map(z => (
                <option key={z.id} value={z.id}>{z.label}</option>
              ))}
            </select>

            <button onClick={() => setShowPath(fromZone && toZone)}
              disabled={!fromZone || !toZone}
              className="px-4 py-1.5 bg-[#3b9eff] rounded-lg text-xs text-white font-medium hover:bg-[#2d8be8] disabled:opacity-30 transition-all shadow-[0_0_8px_rgba(59,158,255,0.2)]">
              Show Route
            </button>

            <button onClick={() => { setFromZone(null); setToZone(null); setShowPath(false); }}
              className="px-3 py-1.5 border border-[rgba(99,179,255,0.15)] rounded-lg text-xs text-[#4a5a7a] hover:border-[#3b9eff] hover:text-[#8899bb] transition-all">
              Clear
            </button>

            {path && (
              <span className="text-xs font-mono ml-2" style={{ color: '#63b3ff' }}>
                📍 ~{path.walkTime} min walk
              </span>
            )}
          </div>
        </div>

        {/* Selected zone detail panel */}
        <AnimatePresence>
          {selectedZone && (() => {
            const zone = terminal.zones.find(z => z.id === selectedZone);
            if (!zone) return null;
            const tc = TYPE_COLORS[zone.type];
            const crowd = getCrowdLevel(zone.type);
            const crowdC = crowd ? CROWD_COLORS[crowd.level] : null;
            const gateFlight = zone.type === 'gate' ? getGateFlight(zone.label) : null;

            return (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="border-t border-[rgba(99,179,255,0.1)] overflow-hidden" style={{ background: 'rgba(8,14,26,0.8)' }}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{ background: `${tc.fill}15`, border: `1px solid ${tc.fill}30` }}>
                        {tc.icon}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-white">{zone.label}</div>
                        <div className="text-[11px] text-[#4a5a7a]">{terminal.floors[zone.floor]} · {activeTerminal}</div>
                      </div>
                    </div>

                    {/* Info pills */}
                    <div className="flex gap-2 flex-wrap items-center">
                      {crowd && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono border"
                          style={{ color: crowdC.text, borderColor: `${crowdC.fill}30`, background: `${crowdC.fill}08` }}>
                          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: crowdC.fill }} />
                          {crowdC.label} · {crowd.density_percent}%
                          {crowd.estimated_wait_minutes > 0 && ` · ~${crowd.estimated_wait_minutes}min wait`}
                        </div>
                      )}
                      {gateFlight && (
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono border ${
                          gateFlight.delay > 15
                            ? 'text-[#f87171] border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.05)]'
                            : 'text-[#63b3ff] border-[rgba(59,158,255,0.3)] bg-[rgba(59,158,255,0.05)]'}`}>
                          ✈ {gateFlight.flight} → {gateFlight.dest}
                          {gateFlight.delay > 0 && ` · +${gateFlight.delay}min`}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setFromZone(zone.id); setSelectedZone(null); }}
                      className="px-3 py-1.5 bg-[#111827] border border-[rgba(99,179,255,0.15)] rounded-lg text-xs text-[#8899bb] hover:border-[#3b9eff] transition-all">
                      Set as Start
                    </button>
                    <button onClick={() => { setToZone(zone.id); setSelectedZone(null); }}
                      className="px-3 py-1.5 bg-[#3b9eff] rounded-lg text-xs text-white hover:bg-[#2d8be8] transition-all">
                      Navigate Here
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {path && (
          <div className="px-4 py-4 border-t border-[rgba(99,179,255,0.06)] bg-[rgba(8,14,26,0.75)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-[#3a4a6a] font-mono">Route Summary</div>
                <div className="text-sm font-semibold text-white mt-1">{path.from.label} → {path.to.label}</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#111827] px-3 py-1 text-[11px] text-[#63b3ff] border border-[rgba(99,179,255,0.18)]">
                <span>🧭</span>
                <span>{path.walkTime} min walk</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-[#0d1525] rounded-2xl p-4 border border-[rgba(99,179,255,0.08)]">
                <div className="text-[11px] text-[#4a5a7a] uppercase tracking-[0.2em] mb-2">Directions</div>
                <ol className="list-decimal list-inside space-y-2 text-[13px] leading-5 text-[#cbd5e1]">
                  {getDirections(path).map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
              <div className="bg-[#0d1525] rounded-2xl p-4 border border-[rgba(99,179,255,0.08)]">
                <div className="text-[11px] text-[#4a5a7a] uppercase tracking-[0.2em] mb-2">Route details</div>
                <div className="text-sm text-white font-medium">From</div>
                <div className="text-[13px] text-[#cbd5e1] mb-3">{path.from.label}</div>
                <div className="text-sm text-white font-medium">To</div>
                <div className="text-[13px] text-[#cbd5e1] mb-3">{path.to.label}</div>
                <div className="text-sm text-white font-medium">Floor(s)</div>
                <div className="text-[13px] text-[#cbd5e1]">{terminal.floors[path.from.floor]} → {terminal.floors[path.to.floor]}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[rgba(99,179,255,0.06)] flex justify-between text-[10px] font-mono text-[#1e2a40]">
          <span>Click any zone for details · Use dropdowns to navigate</span>
          <span>Live crowd data · Updated every 60s</span>
        </div>
      </div>
    </div>
  );
}
