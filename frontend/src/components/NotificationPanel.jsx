import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { notificationAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../services/socket';
import toast from 'react-hot-toast';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS = {
  scheduled: '#3b9eff',
  active:    '#22c55e',
  landed:    '#8b5cf6',
  cancelled: '#ef4444',
  delayed:   '#f59e0b',
  unknown:   '#4a5a7a',
};

export default function NotificationPanel({ open, onClose }) {
  const { isAuthenticated } = useAuth();
  const socket = useSocket();
  const [tab, setTab] = useState('alerts');
  const [notifications, setNotifications] = useState([]);
  const [trackedFlights, setTrackedFlights] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trackInput, setTrackInput] = useState('');
  const [tracking, setTracking] = useState(false);
  const inputRef = useRef(null);

  // Fetch notifications when panel opens
  useEffect(() => {
    if (open && isAuthenticated) {
      setLoading(true);
      Promise.all([
        notificationAPI.getAll(),
        notificationAPI.getTracked(),
      ]).then(([notifRes, trackedRes]) => {
        const items = (notifRes.data?.notifications || []).map(n => ({
          id: n.id,
          icon: n.icon || '🔔',
          title: n.title,
          message: n.message,
          time: timeAgo(n.created_at),
          unread: !n.is_read,
          type: n.type,
          flight_iata: n.flight_iata,
          isTracked: (n.type || '').startsWith('tracked_'),
        }));
        setNotifications(items);
        setUnreadCount(notifRes.data?.unreadCount || 0);
        setTrackedFlights(trackedRes.data?.tracked || []);
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [open, isAuthenticated]);

  // Live push
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      setNotifications(prev => [{
        id: Date.now(),
        icon: data.icon || '🔔',
        title: data.title,
        message: data.message,
        time: 'just now',
        unread: true,
        type: data.type,
        flight_iata: data.flight_iata,
        isTracked: data.tracked || false,
      }, ...prev]);
      setUnreadCount(c => c + 1);
    };
    socket.on('notification', handler);
    return () => socket.off('notification', handler);
  }, [socket]);

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
      setUnreadCount(0);
    } catch {}
  };

  const markOneRead = async (id) => {
    try {
      await notificationAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const dismissOne = async (id, wasUnread) => {
    try {
      await notificationAPI.dismiss(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (wasUnread) setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  // ── Track a flight ──
  const handleTrack = async () => {
    const iata = trackInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!iata || tracking) return;

    setTracking(true);
    try {
      const res = await notificationAPI.trackFlight(iata);
      toast.success(`Tracking ${iata}`);
      setTrackInput('');

      // Refresh tracked flights
      const trackedRes = await notificationAPI.getTracked();
      setTrackedFlights(trackedRes.data?.tracked || []);

      // Also refresh notifications (a tracking confirmation was created)
      const notifRes = await notificationAPI.getAll();
      const items = (notifRes.data?.notifications || []).map(n => ({
        id: n.id,
        icon: n.icon || '🔔',
        title: n.title,
        message: n.message,
        time: timeAgo(n.created_at),
        unread: !n.is_read,
        type: n.type,
        flight_iata: n.flight_iata,
        isTracked: (n.type || '').startsWith('tracked_'),
      }));
      setNotifications(items);
      setUnreadCount(notifRes.data?.unreadCount || 0);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to track flight');
    } finally {
      setTracking(false);
    }
  };

  const handleUntrack = async (id, iata) => {
    try {
      await notificationAPI.untrack(id);
      setTrackedFlights(prev => prev.filter(f => f.id !== id));
      toast.success(`Stopped tracking ${iata}`);
    } catch {
      toast.error('Failed to untrack');
    }
  };

  const handleTrackKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTrack();
    }
  };

  // Filter notifications by tab
  const filteredNotifs = tab === 'tracked'
    ? notifications.filter(n => n.isTracked || n.type === 'tracking')
    : notifications;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      )}

      <div className={`fixed right-0 top-[58px] bottom-0 w-full max-w-[380px] bg-aero-bg2 border-l border-aero-border2 z-50 flex flex-col transition-transform duration-300 shadow-[-8px_0_40px_rgba(0,0,0,0.4)] ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2.5">
              <span className="font-display text-lg font-bold text-[var(--text)]">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(59,158,255,0.15)] text-[var(--accent)] border border-[rgba(59,158,255,0.3)]">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-[11px] text-[var(--accent)] hover:text-[var(--accent2)] font-mono transition-colors">
                  Mark all read
                </button>
              )}
              <button onClick={onClose} className="text-[var(--text2)] text-lg hover:text-[var(--text)] transition-colors w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[var(--border5)]">
                &times;
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-[var(--bg)] rounded-lg p-1 gap-1">
            <button onClick={() => setTab('alerts')}
              className={`flex-1 text-center py-1.5 rounded-md text-[11px] font-medium transition-all ${
                tab === 'alerts' ? 'bg-[var(--surface2)] text-[var(--text)] shadow-sm' : 'text-[var(--text3)] hover:text-[var(--text2)]'
              }`}>
              All Alerts
            </button>
            <button onClick={() => setTab('tracked')}
              className={`flex-1 text-center py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                tab === 'tracked' ? 'bg-[var(--surface2)] text-[var(--text)] shadow-sm' : 'text-[var(--text3)] hover:text-[var(--text2)]'
              }`}>
              My Flights
              {trackedFlights.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[rgba(59,158,255,0.2)] text-[var(--accent)] text-[9px] font-bold flex items-center justify-center">
                  {trackedFlights.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Track a flight input (shown in "My Flights" tab) */}
        <AnimatePresence>
          {tab === 'tracked' && isAuthenticated && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[var(--border3)]"
            >
              <div className="p-3 bg-[var(--surface)]">
                <div className="text-[11px] font-mono text-[var(--text3)] mb-2">
                  Track a flight to get personalized alerts
                </div>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value.toUpperCase())}
                    onKeyDown={handleTrackKey}
                    placeholder="e.g. 6E 2341 or AI302"
                    maxLength={10}
                    className="flex-1 px-3 py-2 bg-[var(--bg)] border border-[var(--border4)] rounded-lg text-sm text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(59,158,255,0.1)] transition-all font-mono tracking-wider"
                  />
                  <button
                    onClick={handleTrack}
                    disabled={!trackInput.trim() || tracking}
                    className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-40 shadow-[0_0_12px_rgba(59,158,255,0.2)] flex items-center gap-1.5"
                  >
                    {tracking ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span className="text-[10px]">📌</span>
                        Track
                      </>
                    )}
                  </button>
                </div>

                {/* Tracked flights list */}
                {trackedFlights.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {trackedFlights.map(f => (
                      <div key={f.id}
                        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-white">{f.flight_iata}</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                              style={{
                                color: STATUS_COLORS[f.status] || STATUS_COLORS.unknown,
                                backgroundColor: `${STATUS_COLORS[f.status] || STATUS_COLORS.unknown}18`,
                                border: `1px solid ${STATUS_COLORS[f.status] || STATUS_COLORS.unknown}33`,
                              }}
                            >
                              {f.status}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#6677aa] mt-0.5">
                            {f.airline_name ? `${f.airline_name} · ` : ''}{f.route || ''}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[#4a5a7a]">
                            {f.departure_gate && (
                              <span>Gate <span className="text-[#3b9eff]">{f.departure_gate}</span></span>
                            )}
                            {f.departure_terminal && (
                              <span>{f.departure_terminal}</span>
                            )}
                            {f.delay_minutes > 0 && (
                              <span className="text-[#f59e0b]">+{f.delay_minutes}min delay</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUntrack(f.id, f.flight_iata)}
                          className="text-[#4a5a7a] hover:text-[#ef4444] transition-colors text-xs font-mono px-2 py-1 rounded border border-transparent hover:border-[rgba(239,68,68,0.2)] flex-shrink-0"
                          title="Stop tracking"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {trackedFlights.length === 0 && (
                  <div className="mt-3 text-center py-4">
                    <div className="text-2xl mb-1.5">{'✈️'}</div>
                    <div className="text-[11px] text-[#4a5a7a]">No flights tracked yet</div>
                    <div className="text-[10px] text-[#2a3a5a] mt-0.5">Enter a flight number above to get started</div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,179,255,0.15) transparent' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#3b9eff] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="text-3xl mb-3">{'🔐'}</div>
              <div className="text-[#6677aa] text-sm font-medium">Sign in to view notifications</div>
              <div className="text-[#2a3a5a] text-xs mt-1">Flight alerts, delays, and gate changes</div>
            </div>
          ) : filteredNotifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="text-3xl mb-3">{tab === 'tracked' ? '📌' : '✨'}</div>
              <div className="text-[#6677aa] text-sm font-medium">
                {tab === 'tracked' ? 'No tracked flight alerts yet' : 'All caught up!'}
              </div>
              <div className="text-[#2a3a5a] text-xs mt-1">
                {tab === 'tracked'
                  ? 'Track a flight above to get personalized alerts'
                  : 'Flight alerts will appear here'}
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <AnimatePresence initial={false}>
              {filteredNotifs.map(n => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                  className={`p-3 rounded-xl border flex gap-3 transition-all group ${
                    n.unread
                      ? 'bg-[#111d35] border-[rgba(59,158,255,0.2)] hover:bg-[#152240]'
                      : 'bg-[#0d1525] border-[rgba(99,179,255,0.08)] opacity-70 hover:opacity-90'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5">{n.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13px] font-semibold text-[#e8f0fe] truncate">{n.title}</div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {n.isTracked && (
                          <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[rgba(139,92,246,0.1)] text-[#8b5cf6] border border-[rgba(139,92,246,0.2)]">
                            TRACKED
                          </span>
                        )}
                        {n.unread && (
                          <span className="w-2 h-2 rounded-full bg-[#3b9eff] flex-shrink-0" />
                        )}
                      </div>
                    </div>
                    <div className="text-[12px] text-[#8899bb] mt-0.5 leading-relaxed">{n.message}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-[#4a5a7a]">{n.time}</span>
                        {n.flight_iata && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[rgba(59,158,255,0.08)] text-[#3b9eff] border border-[rgba(59,158,255,0.15)]">
                            {n.flight_iata}
                          </span>
                        )}
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {n.unread && (
                          <button
                            onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded text-[#3b9eff] border border-[rgba(59,158,255,0.25)] hover:bg-[rgba(59,158,255,0.1)] transition-all"
                            title="Mark as read"
                          >
                            ✓ Read
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); dismissOne(n.id, n.unread); }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded text-[#4a5a7a] border border-[rgba(99,179,255,0.1)] hover:text-[#ef4444] hover:border-[rgba(239,68,68,0.25)] hover:bg-[rgba(239,68,68,0.06)] transition-all"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-aero-border bg-aero-bg2">
          <div className="flex items-center justify-between font-mono text-[10px] text-[#2a3a5a]">
            <span>
              {tab === 'tracked'
                ? `${trackedFlights.length} flight${trackedFlights.length !== 1 ? 's' : ''} tracked`
                : `${filteredNotifs.length} notification${filteredNotifs.length !== 1 ? 's' : ''}`}
            </span>
            <span>Real-time alerts</span>
          </div>
        </div>
      </div>
    </>
  );
}
