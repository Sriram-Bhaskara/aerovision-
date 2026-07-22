// =====================================================
// FlightComparePage — Side-by-side flight comparison
// Up to 3 flights, selected from the FlightBoard
// =====================================================
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompare } from '../context/CompareContext';

const STATUS_CFG = {
  active:    { label: 'In Flight',  color: '#63b3ff', bg: 'rgba(99,179,255,0.1)',  border: 'rgba(99,179,255,0.3)'  },
  scheduled: { label: 'On Time',   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)'  },
  delayed:   { label: 'Delayed',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)'  },
  landed:    { label: 'Landed',    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)'  },
};

function getStatusKey(f) {
  if (!f) return 'scheduled';
  if (f.status === 'cancelled') return 'cancelled';
  if (f.delay_minutes > 0) return 'delayed';
  return f.status || 'scheduled';
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  });
}

function fmtDuration(dep, arr) {
  if (!dep || !arr) return '—';
  const mins = Math.round((new Date(arr) - new Date(dep)) / 60000);
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// One flight column
function FlightCard({ flight, onRemove, index }) {
  const statusKey = getStatusKey(flight);
  const cfg = STATUS_CFG[statusKey] || STATUS_CFG.scheduled;

  const dep    = flight.scheduled_departure || flight.departure_time;
  const arr    = flight.scheduled_arrival   || flight.arrival_time;
  const estDep = flight.estimated_departure;
  const estArr = flight.estimated_arrival;
  const terminal = flight.departure_terminal || flight.arrival_terminal;
  const gate     = flight.departure_gate     || flight.arrival_gate;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: index * 0.07 }}
      className="flex-1 min-w-[220px] bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl overflow-hidden"
    >
      {/* Card header */}
      <div className="p-4 border-b border-[var(--border5)]"
        style={{ background: `${cfg.color}0d` }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[22px] font-extrabold leading-none" style={{ color: cfg.color }}>
              {flight.flight_iata || '—'}
            </div>
            <div className="text-[11px] text-[var(--text3)] mt-1 truncate max-w-[140px]">
              {flight.airline_name || flight.airline_iata || 'Unknown Airline'}
            </div>
          </div>
          <button onClick={onRemove}
            className="w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text3)] hover:text-[var(--red)] hover:border-[rgba(239,68,68,0.4)] transition-all shrink-0 mt-0.5">
            ✕
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[12px] font-mono font-semibold text-[var(--text2)]">
          <span>{flight.departure_airport || '?'}</span>
          <span className="text-[var(--text3)]">→</span>
          <span>{flight.arrival_airport || '?'}</span>
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[var(--border5)]">

        <Row label="Status">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold border"
            style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
            {cfg.label}
            {statusKey === 'delayed' && flight.delay_minutes > 0 && ` +${flight.delay_minutes}m`}
          </span>
        </Row>

        <Row label="Scheduled Dep">{fmtTime(dep)}</Row>
        <Row label="Estimated Dep">{fmtTime(estDep) || fmtTime(dep)}</Row>
        <Row label="Scheduled Arr">{fmtTime(arr)}</Row>
        <Row label="Estimated Arr">{fmtTime(estArr) || fmtTime(arr)}</Row>

        <Row label="Duration">{fmtDuration(dep, arr)}</Row>

        <Row label="Terminal">
          {terminal ? (
            <span className="font-mono text-[12px] px-2 py-0.5 rounded bg-[var(--surface)] border border-[rgba(99,179,255,0.2)] text-[#63b3ff]">
              {terminal}
            </span>
          ) : '—'}
        </Row>

        <Row label="Gate">
          {gate ? (
            <span className="font-mono text-[12px] font-bold px-2 py-0.5 rounded bg-[rgba(59,158,255,0.08)] border border-[rgba(59,158,255,0.25)] text-white">
              {gate}
            </span>
          ) : '—'}
        </Row>

        <Row label="Delay">
          {flight.delay_minutes > 0 ? (
            <span className="text-[#f59e0b] font-mono font-bold">+{flight.delay_minutes} min</span>
          ) : (
            <span className="text-[#22c55e] font-mono">On time</span>
          )}
        </Row>

        <Row label="Aircraft">{flight.aircraft_type || '—'}</Row>
        <Row label="Flight Date">{flight.flight_date || '—'}</Row>
      </div>
    </motion.div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text3)] shrink-0">{label}</span>
      <span className="text-[12px] font-mono text-[var(--text)] text-right">{children}</span>
    </div>
  );
}

// Empty slot
function EmptySlot({ index }) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.07 }}
      className="flex-1 min-w-[220px] border-2 border-dashed border-[var(--border2)] rounded-2xl flex flex-col items-center justify-center gap-3 py-14 cursor-pointer hover:border-[var(--accent)] hover:bg-[rgba(59,158,255,0.03)] transition-all group"
      onClick={() => navigate('/flights')}
    >
      <div className="w-10 h-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xl group-hover:border-[rgba(59,158,255,0.4)] transition-all">
        ✈
      </div>
      <div className="text-center">
        <div className="text-[13px] font-medium text-[var(--text3)] group-hover:text-[var(--text)] transition-colors">
          Add a flight
        </div>
        <div className="text-[11px] text-[var(--text3)] mt-0.5">
          Go to Live Board →
        </div>
      </div>
    </motion.div>
  );
}

export default function FlightComparePage() {
  const navigate = useNavigate();
  const { compareList, removeFromCompare, clearCompare } = useCompare();

  const slots = [0, 1, 2].map(i => compareList[i] || null);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-20">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text4)] hover:text-[var(--text)] hover:border-[var(--border6)] hover:bg-[rgba(59,158,255,0.06)] transition-all text-xs font-medium group">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--text3)]">
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-mono text-[var(--text2)]">Flight Comparison</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[rgba(99,179,255,0.1)] border border-[rgba(99,179,255,0.2)] flex items-center justify-center text-base">
              ⊞
            </div>
            Flight Comparison
          </h1>
          <p className="text-[12px] text-[var(--text3)] mt-1.5">
            Compare up to 3 flights side-by-side · Select from the Live Board
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/flights')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text2)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-all font-medium">
            + Add from Live Board
          </button>
          {compareList.length > 0 && (
            <button onClick={clearCompare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-xs text-[var(--red)] hover:bg-[rgba(239,68,68,0.14)] transition-all font-medium">
              ✕ Clear all
            </button>
          )}
        </div>
      </div>

      {/* Comparison grid */}
      <div className="flex gap-4 flex-col md:flex-row">
        <AnimatePresence>
          {slots.map((flight, i) =>
            flight ? (
              <FlightCard
                key={flight.flight_iata}
                flight={flight}
                index={i}
                onRemove={() => removeFromCompare(flight.flight_iata)}
              />
            ) : (
              <EmptySlot key={`empty-${i}`} index={i} />
            )
          )}
        </AnimatePresence>
      </div>

      {/* Tips */}
      {compareList.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 text-center"
        >
          <div className="text-4xl mb-3">✈</div>
          <div className="text-[var(--text3)] text-sm">
            No flights selected yet.<br />
            Go to the{' '}
            <button onClick={() => navigate('/flights')} className="text-[var(--accent2)] hover:underline">
              Live Flight Board
            </button>{' '}
            and tap ⊕ on any row to add it here.
          </div>
        </motion.div>
      )}

      {/* Legend */}
      {compareList.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-3 text-[11px] text-[var(--text3)] font-mono">
          {Object.entries(STATUS_CFG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
              {cfg.label}
            </div>
          ))}
          <span className="text-[var(--text3)]">· All times IST</span>
        </div>
      )}
    </div>
  );
}
