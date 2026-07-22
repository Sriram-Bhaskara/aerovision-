// =====================================================
// Admin Analytics Dashboard — BLR Airport Operations
// Real-time aggregate view of all system metrics
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { analyticsAPI } from '../services/api';

// ── Helpers ────────────────────────────────────────
const STATUS_META = {
  scheduled: { label: 'Scheduled', color: '#63b3ff' },
  active:    { label: 'In Flight', color: '#22c55e' },
  landed:    { label: 'Landed',    color: '#a78bfa' },
  cancelled: { label: 'Cancelled', color: '#ef4444' },
  delayed:   { label: 'Delayed',   color: '#f97316' },
};

const BOOKING_META = {
  confirmed:      { label: 'Pending',    color: '#63b3ff' },
  staff_assigned: { label: 'Assigned',   color: '#fbbf24' },
  en_route:       { label: 'En Route',   color: '#f97316' },
  completed:      { label: 'Completed',  color: '#22c55e' },
  cancelled:      { label: 'Cancelled',  color: '#ef4444' },
};

const AIRLINE_COLORS = ['#63b3ff','#22c55e','#a78bfa','#f97316','#fbbf24','#ec4899'];

// ── Sub-components ─────────────────────────────────
function StatCard({ icon, label, value, color, sub, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className="bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ background: `${color}14`, border: `1px solid ${color}28` }}>
          {icon}
        </div>
        <span className="text-[10px] font-mono text-[var(--text3)] uppercase tracking-widest pt-1 text-right leading-tight">
          {label}
        </span>
      </div>
      <div className="text-[32px] font-display font-bold leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[var(--text3)] mt-1.5">{sub}</div>}
    </motion.div>
  );
}

function MiniBar({ label, value, max, color, animate: shouldAnimate = true }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] text-[var(--text2)] truncate pr-2">{label}</span>
        <span className="text-[12px] font-mono font-bold shrink-0" style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
        {shouldAnimate ? (
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        ) : (
          <div className="h-full rounded-full" style={{ background: color, width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

function DensityBar({ zone, density, level }) {
  const color = level === 'high' ? '#ef4444' : level === 'medium' ? '#f97316' : '#22c55e';
  const label = level === 'high' ? 'High' : level === 'medium' ? 'Med' : 'Low';
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-[11px] text-[var(--text2)] truncate pr-2">{zone}</span>
          <span className="text-[10px] font-mono shrink-0" style={{ color }}>{label}</span>
        </div>
        <div className="h-1.5 bg-[var(--surface)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${density}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
      <div className="text-[11px] font-mono w-8 text-right shrink-0" style={{ color }}>
        {density}%
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text3)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-[122px] bg-[var(--surface)] rounded-2xl animate-pulse" />;
}

function SkeletonBlock({ h = 'h-48' }) {
  return <div className={`${h} bg-[var(--surface)] rounded-2xl animate-pulse`} />;
}

// ── Main page ──────────────────────────────────────
export default function AdminAnalyticsDashboard() {
  const navigate = useNavigate();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error,       setError]       = useState(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await analyticsAPI.getAdminStats();
      setData(res.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('[AdminAnalytics] Load error:', err);
      setError('Failed to load analytics. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => load(false), 30000);
    return () => clearInterval(id);
  }, [load]);

  // Computed values
  const totalBookings  = data?.mobilityBookings?.reduce((s, b) => s + Number(b.cnt || 0), 0) || 0;
  const depStatuses    = data?.flights?.departures?.byStatus || {};
  const arrStatuses    = data?.flights?.arrivals?.byStatus   || {};
  const totalDep       = data?.flights?.departures?.total    || 0;
  const totalArr       = data?.flights?.arrivals?.total      || 0;
  const maxDepStatus   = Math.max(...Object.values(depStatuses).map(Number), 1);
  const maxArrStatus   = Math.max(...Object.values(arrStatuses).map(Number), 1);
  const maxAirline     = Math.max(...(data?.topAirlines?.map(a => a.count) || [1]), 1);

  const t1Zones = (data?.crowd || []).filter(z => z.terminal === 'T1').slice(0, 6);
  const t2Zones = (data?.crowd || []).filter(z => z.terminal === 'T2').slice(0, 6);

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
    : null;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto pb-16">

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
        <span className="text-xs font-mono text-[var(--text2)]">Admin Analytics</span>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[rgba(99,179,255,0.1)] border border-[rgba(99,179,255,0.2)] flex items-center justify-center text-base">
              📊
            </div>
            Analytics Dashboard
          </h1>
          <p className="text-[12px] text-[var(--text3)] mt-1.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full animate-pulse inline-block" />
            BLR · Kempegowda International · Live operational data
            {lastUpdatedStr && <span>· Updated {lastUpdatedStr} IST</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-mono text-[var(--text3)] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1.5 rounded-lg">
            Auto-refresh 30s
          </div>
          <button onClick={() => load(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--accent2)] hover:bg-[rgba(59,158,255,0.08)] hover:border-[rgba(59,158,255,0.3)] transition-all font-medium">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-xl mb-6 text-sm text-[#ef4444]">
          <span className="text-base">⚠️</span>
          {error}
        </div>
      )}

      {/* ── Top stat cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          [0,1,2,3].map(i => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              icon="👥" label="Registered Users"
              value={data?.users ?? 0}
              color="#63b3ff"
              sub="All-time sign-ups"
              delay={0}
            />
            <StatCard
              icon="✈️" label="Tracked Flights"
              value={data?.trackedFlights ?? 0}
              color="#22c55e"
              sub="Active user watchlists"
              delay={0.05}
            />
            <StatCard
              icon="🔔" label="Alerts (24 h)"
              value={data?.notificationsToday ?? 0}
              color="#f59e0b"
              sub="Notifications dispatched"
              delay={0.10}
            />
            <StatCard
              icon="♿" label="Mobility Bookings"
              value={totalBookings}
              color="#a78bfa"
              sub="Wheelchair & buggy total"
              delay={0.15}
            />
          </>
        )}
      </div>

      {/* ── Flight status + top airlines ────────────────── */}
      <div className="grid md:grid-cols-3 gap-5 mb-5">
        {loading ? (
          [0,1,2].map(i => <SkeletonBlock key={i} />)
        ) : (
          <>
            {/* Departures */}
            <SectionCard title="Departures" icon="🛫">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] text-[var(--text3)]">Total on board</span>
                <span className="text-2xl font-display font-bold text-[#63b3ff]">{totalDep}</span>
              </div>
              <div className="space-y-3">
                {Object.entries(depStatuses)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([status, count]) => (
                    <MiniBar
                      key={status}
                      label={STATUS_META[status]?.label || status}
                      value={Number(count)}
                      max={maxDepStatus}
                      color={STATUS_META[status]?.color || '#8899bb'}
                    />
                  ))
                }
                {Object.keys(depStatuses).length === 0 && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">
                    No departure data
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Arrivals */}
            <SectionCard title="Arrivals" icon="🛬">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] text-[var(--text3)]">Total on board</span>
                <span className="text-2xl font-display font-bold text-[#a78bfa]">{totalArr}</span>
              </div>
              <div className="space-y-3">
                {Object.entries(arrStatuses)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([status, count]) => (
                    <MiniBar
                      key={status}
                      label={STATUS_META[status]?.label || status}
                      value={Number(count)}
                      max={maxArrStatus}
                      color={STATUS_META[status]?.color || '#8899bb'}
                    />
                  ))
                }
                {Object.keys(arrStatuses).length === 0 && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">
                    No arrival data
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Top airlines */}
            <SectionCard title="Top Airlines" icon="🏢">
              <div className="space-y-3">
                {(data?.topAirlines || []).map((a, i) => (
                  <MiniBar
                    key={a.name}
                    label={a.name}
                    value={a.count}
                    max={maxAirline}
                    color={AIRLINE_COLORS[i % AIRLINE_COLORS.length]}
                  />
                ))}
                {(!data?.topAirlines?.length) && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">
                    No flight data yet
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}
      </div>

      {/* ── Crowd density + Mobility breakdown ──────────── */}
      <div className="grid md:grid-cols-3 gap-5 mb-5">
        {loading ? (
          [0,1,2].map(i => <SkeletonBlock key={i} />)
        ) : (
          <>
            {/* T1 crowd */}
            <SectionCard title="Crowd Density — T1" icon="◉">
              <div className="space-y-3">
                {t1Zones.map(z => (
                  <DensityBar
                    key={z.zone_name}
                    zone={z.zone_name.replace(/ - T1$/i, '')}
                    density={z.density_percent}
                    level={z.level}
                  />
                ))}
                {t1Zones.length === 0 && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">No crowd data</div>
                )}
              </div>
            </SectionCard>

            {/* T2 crowd */}
            <SectionCard title="Crowd Density — T2" icon="◉">
              <div className="space-y-3">
                {t2Zones.map(z => (
                  <DensityBar
                    key={z.zone_name}
                    zone={z.zone_name.replace(/ - T2$/i, '')}
                    density={z.density_percent}
                    level={z.level}
                  />
                ))}
                {t2Zones.length === 0 && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">No crowd data</div>
                )}
              </div>
            </SectionCard>

            {/* Mobility breakdown */}
            <SectionCard title="Mobility Bookings" icon="♿">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] text-[var(--text3)]">Total bookings</span>
                <span className="text-2xl font-display font-bold text-[#a78bfa]">{totalBookings}</span>
              </div>
              <div className="space-y-3">
                {(data?.mobilityBookings || []).map(b => (
                  <MiniBar
                    key={b.status}
                    label={BOOKING_META[b.status]?.label || b.status}
                    value={Number(b.cnt)}
                    max={totalBookings || 1}
                    color={BOOKING_META[b.status]?.color || '#8899bb'}
                  />
                ))}
                {(!data?.mobilityBookings?.length) && (
                  <div className="text-center py-6 text-xs text-[var(--text3)]">
                    No bookings yet
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}
      </div>

      {/* ── Recent notifications ─────────────────────────── */}
      {loading ? (
        <SkeletonBlock h="h-64" />
      ) : (
        <div className="bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔔</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text3)]">
                Recent Notifications
              </span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text3)]">
              Last {data?.recentNotifications?.length || 0} events
            </span>
          </div>

          {data?.recentNotifications?.length > 0 ? (
            <div className="space-y-2">
              {data.recentNotifications.map((n, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-start gap-3 px-3.5 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                  <span className="text-base mt-0.5 shrink-0">{n.icon || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text)] truncate">{n.title}</div>
                    <div className="text-[11px] text-[var(--text3)] truncate">{n.message}</div>
                  </div>
                  <div className="text-[10px] font-mono text-[var(--text3)] shrink-0 mt-0.5">
                    {n.created_at
                      ? new Date(n.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
                        })
                      : ''}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📭</div>
              <div className="text-xs text-[var(--text3)]">No notifications dispatched yet</div>
            </div>
          )}
        </div>
      )}

      {/* ── System health footer ─────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3 px-1">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
          Backend online
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          SQLite DB
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
          Gate Watcher active (2 min)
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text3)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#63b3ff]" />
          Mock + AeroDataBox data
        </div>
      </div>
    </div>
  );
}
