import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assistAPI } from '../services/api';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  confirmed:      { label: 'Confirmed',      color: '#63b3ff', bg: 'rgba(59,158,255,0.1)',  icon: '🕐' },
  staff_assigned: { label: 'Staff Assigned', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: '👤' },
  en_route:       { label: 'En Route',       color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: '🚶' },
  completed:      { label: 'Completed',      color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  icon: '✅' },
  cancelled:      { label: 'Cancelled',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  icon: '✕' },
};

const NEXT_STATUS = {
  confirmed:      { label: 'Assign Staff →',   next: 'staff_assigned', color: '#fbbf24' },
  staff_assigned: { label: 'Mark En Route →',  next: 'en_route',       color: '#f97316' },
  en_route:       { label: 'Mark Complete →',  next: 'completed',      color: '#22c55e' },
};

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
        style={{ background: `rgba(${color},0.08)`, border: `1px solid rgba(${color},0.2)` }}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-display font-bold text-[var(--text)]">{value}</div>
        <div className="text-xs text-[var(--text3)]">{label}</div>
      </div>
    </div>
  );
}

function AdminBookingCard({ booking, onStatusUpdate, updating }) {
  const isWheelchair = booking.service_type === 'wheelchair';
  const status       = STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed;
  const nextAction   = NEXT_STATUS[booking.status];
  const charge       = booking.charge_amount || 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[var(--bg2)] border border-[var(--border3)] rounded-xl p-4">

      <div className="flex items-start gap-3">
        {/* Service icon */}
        <div className="w-10 h-10 rounded-xl bg-[#141c2e] border border-[rgba(99,179,255,0.12)] flex items-center justify-center text-xl flex-shrink-0">
          {isWheelchair ? '♿' : '🛺'}
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-[#63b3ff] bg-[rgba(59,158,255,0.1)] px-2 py-0.5 rounded font-bold">
              {booking.booking_ref}
            </span>
            <span className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1"
              style={{ color: status.color, background: status.bg }}>
              {status.icon} {status.label}
            </span>
            {charge > 0 && (
              <span className="text-xs text-[#a78bfa] bg-[rgba(167,139,250,0.1)] px-2 py-0.5 rounded">
                ₹{charge} paid
              </span>
            )}
            {booking.payment_status === 'waived' && (
              <span className="text-xs text-[#22c55e] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded">
                Free
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <div><span className="text-[#4a5a7a]">Passenger: </span><span className="text-[#e8f0fe]">{booking.passenger_name}</span></div>
            <div><span className="text-[#4a5a7a]">Flight: </span><span className="text-[#63b3ff] font-mono">{booking.flight_iata}</span></div>
            <div><span className="text-[#4a5a7a]">Pickup: </span><span className="text-[#8899bb]">{booking.pickup_point}</span></div>
            <div><span className="text-[#4a5a7a]">Time: </span><span className="text-[#8899bb]">{booking.pickup_time}</span></div>
            {booking.user_name && <div><span className="text-[#4a5a7a]">User: </span><span className="text-[#8899bb]">{booking.user_name}</span></div>}
            {booking.phone && <div><span className="text-[#4a5a7a]">Phone: </span><span className="text-[#8899bb]">{booking.phone}</span></div>}
          </div>

          {booking.notes && (
            <div className="mt-1.5 text-xs text-[#4a5a7a] italic">
              Note: {booking.notes}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {nextAction && (
        <div className="mt-3 pt-3 border-t border-[rgba(99,179,255,0.07)] flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => onStatusUpdate(booking.id, nextAction.next)}
            disabled={updating}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: nextAction.color, background: `${nextAction.color}14`, border: `1px solid ${nextAction.color}44` }}>
            {updating ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Updating...
              </span>
            ) : nextAction.label}
          </motion.button>

          {booking.status !== 'cancelled' && (
            <button
              onClick={() => onStatusUpdate(booking.id, 'cancelled')}
              disabled={updating}
              className="px-3 py-1.5 rounded-lg text-xs text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.08)] transition-all disabled:opacity-40">
              Cancel
            </button>
          )}
        </div>
      )}

      {booking.status === 'completed' && (
        <div className="mt-3 pt-3 border-t border-[rgba(99,179,255,0.07)] flex items-center justify-between">
          <div className="text-xs text-[#22c55e] flex items-center gap-1.5">
            <span>✓</span> Assistance completed successfully
          </div>
          <button
            onClick={() => onStatusUpdate(booking.id, 'cancelled')}
            disabled={updating}
            className="px-3 py-1.5 rounded-lg text-xs text-[#ef4444] border border-[rgba(239,68,68,0.2)] hover:bg-[rgba(239,68,68,0.08)] transition-all disabled:opacity-40">
            Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default function AdminAssistPage() {
  const navigate = useNavigate();
  const [bookings,     setBookings]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [updating,     setUpdating]     = useState({});
  const [filterSvc,    setFilterSvc]    = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [lastRefresh,  setLastRefresh]  = useState(null);

  const load = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const params = {};
      if (filterSvc)    params.service_type = filterSvc;
      if (filterStatus) params.status       = filterStatus;
      const res = await assistAPI.adminGetBookings(params);
      setBookings(res.data.bookings || []);
      setLastRefresh(new Date());
    } catch {
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [filterSvc, filterStatus]);

  useEffect(() => { load(true); }, [load]);

  // Auto-refresh every 20 seconds
  useEffect(() => {
    const id = setInterval(() => load(false), 20000);
    return () => clearInterval(id);
  }, [load]);

  async function handleStatusUpdate(id, newStatus) {
    setUpdating(u => ({ ...u, [id]: true }));
    try {
      await assistAPI.updateStatus(id, newStatus);
      toast.success(`Status updated to ${STATUS_CONFIG[newStatus]?.label}`);
      await load(false);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setUpdating(u => ({ ...u, [id]: false }));
    }
  }

  // Stats
  const pending    = bookings.filter(b => b.status === 'confirmed').length;
  const inProgress = bookings.filter(b => ['staff_assigned', 'en_route'].includes(b.status)).length;
  const completed  = bookings.filter(b => b.status === 'completed').length;
  const total      = bookings.length;

  const active = bookings.filter(b => !['completed', 'cancelled'].includes(b.status));
  const done   = bookings.filter(b =>  ['completed', 'cancelled'].includes(b.status));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
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
        <span className="text-xs font-mono text-[var(--text2)]">Staff Dashboard</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--text)]">Mobility Assistance — Staff Dashboard</h1>
          <p className="text-xs text-[var(--text3)] mt-0.5">
            Manage wheelchair and buggy bookings · Auto-refreshes every 20s
            {lastRefresh && <span className="ml-2">· Last updated {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>}
          </p>
        </div>
        <button onClick={() => load(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--accent2)] hover:bg-[rgba(59,158,255,0.08)] transition-all">
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Pending"     value={pending}    icon="🕐" color="59,158,255" />
        <StatCard label="In Progress" value={inProgress} icon="🚶" color="249,115,22" />
        <StatCard label="Completed"   value={completed}  icon="✅" color="34,197,94"  />
        <StatCard label="Total Today" value={total}      icon="📋" color="167,139,250" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="text-xs text-[#4a5a7a] font-mono uppercase tracking-wider">Filter:</span>

        {/* Service type */}
        {['', 'wheelchair', 'golf_cart'].map(v => (
          <button key={v} onClick={() => setFilterSvc(v)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filterSvc === v
                ? 'bg-[rgba(59,158,255,0.15)] border border-[rgba(59,158,255,0.4)] text-[var(--accent2)]'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text4)] hover:text-[var(--text2)]'
            }`}>
            {v === '' ? 'All Services' : v === 'wheelchair' ? '♿ Wheelchair' : '🛺 Buggy'}
          </button>
        ))}

        <div className="w-px h-4 bg-[rgba(99,179,255,0.1)]" />

        {/* Status */}
        {['', 'confirmed', 'staff_assigned', 'en_route', 'completed', 'cancelled'].map(v => (
          <button key={v} onClick={() => setFilterStatus(v)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
              filterStatus === v
                ? 'bg-[rgba(59,158,255,0.15)] border border-[rgba(59,158,255,0.4)] text-[var(--accent2)]'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text4)] hover:text-[var(--text2)]'
            }`}>
            {v === '' ? 'All Statuses' : STATUS_CONFIG[v]?.icon + ' ' + STATUS_CONFIG[v]?.label}
          </button>
        ))}
      </div>

      {/* Booking list */}
      {loading ? (
        <div className="space-y-3">
          {[0,1,2].map(i => <div key={i} className="h-32 bg-[#141c2e] rounded-xl animate-pulse" />)}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">📭</div>
          <div className="text-sm text-[var(--text3)]">No bookings found for the selected filters</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active bookings */}
          {active.length > 0 && (
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#f97316] rounded-full animate-pulse" />
                Active Bookings ({active.length})
              </h3>
              <div className="space-y-3">
                <AnimatePresence>
                  {active.map(b => (
                    <AdminBookingCard key={b.id} booking={b}
                      onStatusUpdate={handleStatusUpdate}
                      updating={!!updating[b.id]} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Completed / cancelled */}
          {done.length > 0 && (
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-3">
                Completed / Cancelled ({done.length})
              </h3>
              <div className="space-y-3 opacity-60">
                {done.map(b => (
                  <AdminBookingCard key={b.id} booking={b}
                    onStatusUpdate={handleStatusUpdate}
                    updating={!!updating[b.id]} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
