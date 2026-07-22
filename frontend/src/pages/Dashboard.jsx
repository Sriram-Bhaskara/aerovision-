// =====================================================
// Dashboard — User profile, saved flights, travel history
// =====================================================
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { flightAPI, notificationAPI, userAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [savedFlights, setSavedFlights] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('saved');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [savedRes, notifRes] = await Promise.all([
          flightAPI.getSaved().catch(() => ({ data: [] })),
          notificationAPI.getAll().catch(() => ({ data: { notifications: [] } })),
        ]);
        setSavedFlights(savedRes.data?.saved || savedRes.data?.flights || []);
        setNotifications(notifRes.data?.notifications || notifRes.data || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const removeSaved = async (id) => {
    try {
      await flightAPI.removeSaved(id);
      setSavedFlights(prev => prev.filter(f => f.id !== id));
      toast.success('Flight removed');
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <button onClick={() => navigate('/')} className="text-[#8899bb] text-sm hover:text-[#63b3ff] transition-colors">← Back</button>
        <div>
          <h1 className="font-display text-xl font-bold">My Dashboard</h1>
          <p className="text-sm text-[#8899bb]">Personal flight watchlist, alert summary, and airport readiness for BLR.</p>
        </div>
      </div>

      <div className="grid gap-4 mb-6 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Saved flights', value: savedFlights.length, accent: '#3b9eff', desc: 'Tracked departures & arrivals' },
          { label: 'Unread alerts', value: notifications.filter(n => !n.is_read).length, accent: '#f59e0b', desc: 'Actionable updates waiting' },
          { label: 'Status', value: user?.full_name ? 'Verified' : 'Guest', accent: '#22c55e', desc: 'Profile access level' },
          { label: 'Airport', value: 'BLR', accent: '#8b5cf6', desc: 'Kempegowda International' },
        ].map(card => (
          <div key={card.label} className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-3xl p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#4a5a7a] mb-2 font-mono">{card.label}</div>
            <div className="text-3xl font-bold" style={{ color: card.accent }}>{card.value}</div>
            <div className="text-xs text-[#6677aa] mt-2">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* User card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#3b9eff] to-[#8b5cf6] flex items-center justify-center text-2xl">
              {user?.full_name?.[0]?.toUpperCase() || '👤'}
            </div>
            <div>
              <div className="text-lg font-semibold">{user?.full_name || 'Guest User'}</div>
              <div className="text-sm text-[#8899bb]">{user?.email || 'guest@aerovision.app'}</div>
              <div className="text-xs text-[#4a5a7a] mt-1 font-mono">Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Today'}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            className="px-4 py-2 border border-[rgba(239,68,68,0.3)] text-[#ef4444] rounded-lg text-sm hover:bg-[rgba(239,68,68,0.08)] transition-all">
            Sign Out
          </button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#141c2e] rounded-lg p-1 mb-6 w-fit">
        {[
          { id: 'saved', label: '⭐ Saved Flights', count: savedFlights.length },
          { id: 'notifications', label: '🔔 Notifications', count: notifications.length },
          { id: 'settings', label: '⚙️ Settings' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === t.id ? 'bg-[#3b9eff] text-white' : 'text-[#8899bb] hover:text-white'}`}>
            {t.label} {t.count !== undefined && <span className="ml-1 text-xs opacity-70">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'saved' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {loading ? (
            <div className="text-center py-16 text-[#4a5a7a]">
              <div className="animate-spin w-8 h-8 border-2 border-[#3b9eff] border-t-transparent rounded-full mx-auto mb-3" />
            </div>
          ) : savedFlights.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">✈️</div>
              <div className="text-[#8899bb] mb-2">No saved flights yet</div>
              <button onClick={() => navigate('/flights')} className="text-sm text-[#3b9eff] hover:underline">Browse Live Board →</button>
            </div>
          ) : savedFlights.map(f => (
            <div key={f.id} className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="font-mono text-[#63b3ff] font-medium text-lg">{f.flight_iata}</div>
                <div>
                  <div className="text-sm">{f.airline_name || 'Flight'}</div>
                  <div className="text-xs text-[#4a5a7a]">{f.flight_date}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => navigate(`/flights/${encodeURIComponent(f.flight_iata)}`)}
                  className="px-3 py-1.5 bg-[#111827] border border-[rgba(99,179,255,0.22)] rounded-lg text-xs text-[#8899bb] hover:border-[#3b9eff] transition-all">
                  Track
                </button>
                <button onClick={() => removeSaved(f.id)}
                  className="px-3 py-1.5 border border-[rgba(239,68,68,0.25)] rounded-lg text-xs text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] transition-all">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {activeTab === 'notifications' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-[#4a5a7a]">No notifications yet</div>
          ) : notifications.map((n, i) => (
            <div key={n.id || i} className={`bg-[#141c2e] border rounded-xl p-4 flex gap-3 ${n.is_read ? 'border-[rgba(99,179,255,0.08)]' : 'border-[rgba(99,179,255,0.22)] bg-[#1a2540]'}`}>
              <span className="text-xl">{n.icon || '🔔'}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-[#8899bb] mt-0.5">{n.message}</div>
                <div className="text-[10px] text-[#4a5a7a] mt-1 font-mono">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {activeTab === 'settings' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-6 space-y-4">
          <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-3">Preferences</h3>
          {[
            { label: 'Push Notifications', desc: 'Get alerts for flight changes', key: 'notifications' },
            { label: 'Delay Alerts', desc: 'Notify when saved flights are delayed', key: 'delay_alerts' },
            { label: 'Gate Changes', desc: 'Alert on gate changes for saved flights', key: 'gate_alerts' },
            { label: 'Weather Alerts', desc: 'Severe weather notifications', key: 'weather_alerts' },
          ].map(pref => (
            <div key={pref.key} className="flex items-center justify-between py-2 border-b border-[rgba(99,179,255,0.06)] last:border-0">
              <div>
                <div className="text-sm">{pref.label}</div>
                <div className="text-xs text-[#4a5a7a]">{pref.desc}</div>
              </div>
              <div className="w-10 h-6 bg-[#3b9eff] rounded-full relative cursor-pointer">
                <div className="absolute top-0.5 right-0.5 w-5 h-5 bg-white rounded-full transition-all" />
              </div>
            </div>
          ))}

          <div className="pt-4">
            <h3 className="font-mono text-xs tracking-wider uppercase text-[#4a5a7a] mb-3">Default Airport</h3>
            <div className="flex items-center gap-3">
              <div className="bg-[#0d1220] border border-[rgba(99,179,255,0.22)] rounded-lg px-4 py-2 font-mono text-[#63b3ff]">BLR</div>
              <span className="text-sm text-[#8899bb]">Kempegowda International Airport, Bengaluru</span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
