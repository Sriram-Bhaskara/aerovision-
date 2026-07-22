// =====================================================
// FlightDetail — Detailed flight information page
// =====================================================
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { flightAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function FlightDetail() {
  const { flightId } = useParams();
  const navigate = useNavigate();
  const [flight, setFlight] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await flightAPI.search(flightId);
        setFlight(res.data.flight || res.data);
        try {
          const pred = await flightAPI.predict(flightId);
          setPrediction(pred.data);
        } catch (e) { /* prediction not available */ }
      } catch (err) {
        toast.error('Flight not found');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [flightId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await flightAPI.save({ flight_iata: flight.flight_iata, flight_date: new Date().toISOString().split('T')[0] });
      toast.success('Flight saved to your dashboard!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save flight');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (ts) => {
    if (!ts) return '—';
    const date = new Date(ts);
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    const hour = parseInt(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(date));
    return `${timeStr} ${hour < 12 ? 'AM' : 'PM'}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin w-10 h-10 border-2 border-[#3b9eff] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="p-8 text-center text-[#4a5a7a]">
        <p className="text-xl mb-4">Flight not found</p>
        <button onClick={() => navigate('/flights')} className="text-[#3b9eff] hover:underline">← Back to Live Board</button>
      </div>
    );
  }

  const isDelayed = flight.delay_minutes > 0;
  const statusColor = flight.status === 'cancelled' ? '#ef4444' : isDelayed ? '#f59e0b' : '#22c55e';

  // Normalise prediction field names (backend uses camelCase)
  const predProb     = prediction ? (prediction.probability ?? prediction.delay_probability ?? 0) : 0;
  const predDelay    = prediction ? (prediction.estimatedDelayMinutes ?? prediction.predicted_delay_minutes ?? 0) : 0;
  const predRisk     = prediction ? (prediction.riskLevel ?? prediction.risk_level ?? 'low') : 'low';
  const predRiskColor = predRisk === 'critical' || predRisk === 'high' ? '#ef4444' : predRisk === 'medium' ? '#f59e0b' : '#22c55e';

  const timeline = [
    { time: fmt(flight.scheduled_departure), label: 'Scheduled Departure', sub: `Gate ${flight.departure_gate || 'TBD'} · Terminal ${flight.departure_terminal || 'TBD'}`, done: true },
    ...(isDelayed ? [{ time: fmt(flight.estimated_departure), label: `Delayed by ${flight.delay_minutes} min`, sub: 'Revised departure time', done: true, warning: true }] : []),
    { time: fmt(flight.actual_departure), label: flight.status === 'active' ? 'Departed' : 'Expected Departure', sub: flight.departure_airport || 'BLR', done: flight.status === 'active' || flight.status === 'landed' },
    { time: '—', label: 'In Flight', sub: flight.aircraft_type || 'Aircraft info unavailable', done: flight.status === 'landed', current: flight.status === 'active' },
    { time: fmt(flight.estimated_arrival || flight.scheduled_arrival), label: 'Expected Arrival', sub: `${flight.arrival_airport || '—'} · Terminal ${flight.arrival_terminal || 'TBD'}`, done: flight.status === 'landed' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1525] border border-[rgba(99,179,255,0.12)] text-[#6677aa] hover:text-[#e8f0fe] hover:border-[rgba(99,179,255,0.28)] hover:bg-[rgba(59,158,255,0.06)] transition-all text-xs font-medium group">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#2a3a5a]">
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-mono text-[#8899bb]">{flight?.flight_iata || 'Flight Detail'}</span>
      </div>

      {/* Route Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-8 mb-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${statusColor}, #3b9eff)` }} />

        <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#1a2540] border border-[rgba(99,179,255,0.22)] flex items-center justify-center text-lg font-mono font-bold text-[#63b3ff]">
              {(flight.airline_iata || '??').slice(0, 2)}
            </div>
            <div>
              <div className="font-mono text-xl font-bold text-[#63b3ff]">{flight.flight_iata}</div>
              <div className="text-sm text-[#8899bb]">{flight.airline_name}</div>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-[rgba(59,158,255,0.12)] border border-[rgba(59,158,255,0.3)] rounded-lg text-sm text-[#63b3ff] hover:bg-[rgba(59,158,255,0.2)] transition-all disabled:opacity-50">
            {saving ? 'Saving...' : '⭐ Save Flight'}
          </button>
        </div>

        <div className="flex items-center gap-6 justify-center mb-8">
          <div className="text-center">
            <div className="font-display text-5xl font-extrabold tracking-[-2px]">{flight.departure_airport || 'BLR'}</div>
            <div className="text-sm text-[#8899bb] mt-1">Bengaluru</div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2 max-w-[200px]">
            <div className="text-2xl text-[#63b3ff]">✈</div>
            <div className="w-full h-px bg-gradient-to-r from-[rgba(99,179,255,0.22)] via-[#3b9eff] to-[rgba(99,179,255,0.22)]" />
            <div className="text-xs text-[#4a5a7a] font-mono">{flight.aircraft_type || 'N/A'}</div>
          </div>
          <div className="text-center">
            <div className="font-display text-5xl font-extrabold tracking-[-2px]">{flight.arrival_airport || '—'}</div>
            <div className="text-sm text-[#8899bb] mt-1">Destination</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Status',   value: flight.statusLabel || flight.status,          color: statusColor },
            { label: 'Gate',     value: flight.departure_gate     || 'TBD' },
            { label: 'Terminal', value: flight.departure_terminal || 'TBD' },
            { label: 'Delay',    value: isDelayed ? `${flight.delay_minutes} min` : 'None', color: isDelayed ? '#f59e0b' : '#22c55e' },
          ].map(m => (
            <div key={m.label}>
              <div className="font-mono text-[10px] tracking-wider uppercase text-[#4a5a7a]">{m.label}</div>
              <div className="text-lg font-semibold font-display mt-1" style={{ color: m.color || '#e8f0fe' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="grid md:grid-cols-[2fr_1fr] gap-4">
        {/* Timeline */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-6">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-4">Flight Timeline</h3>
          <div className="flex flex-col">
            {timeline.map((item, i) => (
              <div key={i} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center w-7">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 border-2 ${item.done ? 'bg-[#22c55e] border-[#0d1220]' : item.current ? 'bg-[#3b9eff] border-[#0d1220] animate-pulse' : item.warning ? 'bg-[#f59e0b] border-[#0d1220]' : 'bg-[#1a2540] border-[rgba(99,179,255,0.22)]'}`} />
                  {i < timeline.length - 1 && <div className="flex-1 w-px bg-[rgba(99,179,255,0.12)] mt-0.5" />}
                </div>
                <div className="flex-1">
                  <div className="font-mono text-xs text-[#8899bb]">{item.time}</div>
                  <div className="text-sm font-medium mt-0.5">{item.label}</div>
                  <div className="text-xs text-[#4a5a7a] mt-0.5">{item.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Delay Prediction */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-6">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-4">AI Delay Prediction</h3>
          {prediction ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-display font-extrabold" style={{ color: predRiskColor }}>
                  {predProb}%
                </div>
                <div className="text-xs text-[#8899bb] mt-1">Delay Probability</div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[#8899bb]">Est. Delay</span>
                  <span className="font-mono">{predDelay} min</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#8899bb]">Risk Level</span>
                  <span className="font-mono capitalize" style={{ color: predRiskColor }}>{predRisk}</span>
                </div>
              </div>
              {prediction.factors && (
                <div className="mt-4 pt-4 border-t border-[rgba(99,179,255,0.12)]">
                  <div className="text-xs text-[#4a5a7a] font-mono uppercase mb-2">Contributing Factors</div>
                  {Object.entries(prediction.factors).map(([k, v]) => {
                    const score      = typeof v === 'object' && v !== null ? v.score   : v;
                    const details    = typeof v === 'object' && v !== null ? v.details : null;
                    const impact     = typeof v === 'object' && v !== null ? v.impact  : null;
                    const impactColor = impact === 'high' ? '#ef4444' : impact === 'medium' ? '#f59e0b' : '#22c55e';
                    return (
                      <div key={k} className="mb-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-[#8899bb] capitalize">{k.replace(/_/g, ' ')}</span>
                          <span className="font-mono" style={{ color: impactColor }}>
                            {score != null ? score + '%' : '—'}
                            {impact ? ' · ' + impact : ''}
                          </span>
                        </div>
                        {details ? <div className="text-[10px] text-[#4a5a7a] mt-0.5">{details}</div> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-[#4a5a7a] py-8">
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm">AI prediction analyzing flight patterns, weather, and airport congestion...</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
