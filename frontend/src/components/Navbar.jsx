import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCompare } from '../context/CompareContext';
import { notificationAPI } from '../services/api';
import { useSocket } from '../services/socket';
import NotificationPanel from './NotificationPanel';
import SOSModal from './SOSModal';
import CabModal from './CabModal';
import toast from 'react-hot-toast';

const NAV_LINKS = [
  { to: '/flights',  label: 'Live Board', icon: '✈' },
  { to: '/radar',    label: 'Radar',      icon: '◎' },
  { to: '/weather',  label: 'Weather',    icon: '◈' },
  { to: '/crowd',    label: 'Crowd',      icon: '◉' },
  { to: '/travel',   label: 'Travel',     icon: '🗺' },
  { to: '/assist',   label: 'Assist',     icon: '♿' },
  { to: '/currency', label: 'Currency',   icon: '💱' },
  { to: '/chatbot',  label: 'Assistant',  icon: '◆' },
];

export default function Navbar() {
  const { user, logout, isAuthenticated, notificationsEnabled } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const { compareList } = useCompare();
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocket();
  const [showNotif,  setShowNotif]  = useState(false);
  const [showMenu,   setShowMenu]   = useState(false);
  const [showSOS,    setShowSOS]    = useState(false);
  const [showCab,    setShowCab]    = useState(false);
  const [scrolled,   setScrolled]   = useState(false);
  const [time,       setTime]       = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(() => {
    if (!isAuthenticated) return;
    notificationAPI.getAll(true).then(res => {
      setUnreadCount(res.data?.unreadCount || 0);
    }).catch(() => {});
  }, [isAuthenticated]);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  useEffect(() => {
    if (socket) {
      const handler = (data) => {
        setUnreadCount(c => c + 1);
        if (notificationsEnabled) {
          if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(data.title || 'AeroVision Alert', { body: data.message || '', icon: data.icon || undefined }); } catch {}
          }
          toast(`${data.title || 'Alert'} · ${data.message || ''}`, { icon: data.icon || '🔔', duration: 6000 });
        }
      };
      socket.on('notification', handler);
      return () => socket.off('notification', handler);
    }
  }, [socket, notificationsEnabled]);

  useEffect(() => {
    if (!showNotif) fetchUnread();
  }, [showNotif, fetchUnread]);

  useEffect(() => {
    const tick = () => {
      setTime(new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Asia/Kolkata',
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (!e.target.closest('[data-usermenu]')) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const isActive = (p) => p === '/' ? location.pathname === '/' : location.pathname.startsWith(p);

  return (
    <>
      <nav className={`sticky top-0 z-50 flex items-center justify-between px-4 md:px-8 h-[58px] transition-all duration-200 ${
        scrolled
          ? 'bg-[var(--bg2)] backdrop-blur-2xl shadow-[0_1px_0_var(--border)]'
          : 'bg-[var(--bg)] backdrop-blur-xl border-b border-[var(--border3)]'
      }`}>

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-7 h-7 rounded-md bg-[rgba(59,158,255,0.12)] border border-[rgba(59,158,255,0.25)] flex items-center justify-center text-sm group-hover:bg-[rgba(59,158,255,0.22)] transition-all">✈</div>
          <span className="font-display text-[17px] font-extrabold tracking-tight text-[var(--text)]">
            Aero<span className="text-[var(--accent)]">Vision</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-0.5">
          {NAV_LINKS.map(l => {
            const active = isActive(l.to);
            return (
              <Link key={l.to} to={l.to}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium tracking-wide transition-all ${
                  active
                    ? 'text-[var(--text)] bg-[rgba(59,158,255,0.1)]'
                    : 'text-[var(--text4)] hover:text-[var(--text5)] hover:bg-[rgba(99,179,255,0.05)]'
                }`}>
                <span className="text-[10px] opacity-70">{l.icon}</span>
                {l.label}
                {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-[var(--accent)]" />}
              </Link>
            );
          })}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Clock */}
          <div className="hidden lg:flex items-center gap-1.5 font-mono text-[11px] text-[var(--text3)] bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 rounded-lg select-none">
            <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full animate-pulse" />
            {time} IST
          </div>

          {/* Dark/Light toggle */}
          <button onClick={toggleTheme} title={isDark ? 'Light mode' : 'Dark mode'}
            className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[14px] hover:bg-[var(--surface2)] hover:border-[var(--border2)] transition-all">
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* 🚕 Cab */}
          <button onClick={() => setShowCab(true)} title="Get a cab from BLR"
            className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[14px] hover:bg-[var(--surface2)] hover:border-[var(--border2)] transition-all">
            🚕
          </button>

          {/* 🆘 SOS */}
          <button onClick={() => setShowSOS(true)} title="Emergency contacts"
            className="w-8 h-8 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] flex items-center justify-center text-[13px] font-bold text-[var(--red)] hover:bg-[rgba(239,68,68,0.18)] transition-all">
            SOS
          </button>

          {/* Compare flights badge */}
          {compareList.length > 0 && (
            <button onClick={() => navigate('/compare')} title={`Compare ${compareList.length} flight${compareList.length > 1 ? 's' : ''}`}
              className="relative flex items-center gap-1 px-2.5 h-8 rounded-lg bg-[rgba(99,179,255,0.1)] border border-[rgba(99,179,255,0.3)] text-[#63b3ff] text-[11px] font-mono font-bold hover:bg-[rgba(99,179,255,0.18)] transition-all">
              ⊞
              <span className="text-[10px]">{compareList.length}</span>
            </button>
          )}

          {/* Notifications */}
          <button onClick={() => setShowNotif(!showNotif)}
            className="relative w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[13px] hover:bg-[var(--surface2)] hover:border-[var(--border2)] transition-all">
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-[var(--red)] rounded-full text-[8px] font-bold flex items-center justify-center border border-[var(--bg)] px-0.5 text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User menu */}
          <div className="relative" data-usermenu>
            <button onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-[12px] text-[var(--text2)] hover:border-[var(--border2)] hover:text-[var(--text)] transition-all">
              <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#3b9eff] to-[#8b5cf6] flex items-center justify-center text-[8px] font-bold text-white shrink-0">
                {(user?.full_name?.[0] || 'G').toUpperCase()}
              </div>
              <span className="hidden sm:block max-w-[72px] truncate">{user?.full_name || 'Guest'}</span>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-44 bg-[var(--surface3)] border border-[var(--border2)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] z-50 overflow-hidden">
                {isAuthenticated && (
                  <Link to="/dashboard" onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text2)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors">
                    Dashboard
                  </Link>
                )}
                {isAuthenticated && (
                  <Link to="/admin/assist" onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text2)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors border-t border-[var(--border5)]">
                    <span className="text-[11px]">♿</span> Staff Dashboard
                  </Link>
                )}
                {user && (
                  <Link to="/admin/analytics" onClick={() => setShowMenu(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text2)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors border-t border-[var(--border5)]">
                    <span className="text-[11px]">📊</span> Analytics
                  </Link>
                )}
                <button onClick={() => { logout(); setShowMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[var(--red)] hover:bg-[var(--surface)] transition-colors border-t border-[var(--border5)]">
                  {isAuthenticated ? 'Sign Out' : 'Exit'}
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setShowMenu(v => !v)}
            className="md:hidden flex flex-col items-center justify-center gap-[5px] w-8 h-8">
            {[0,1,2].map(i => (
              <span key={i} className={`block h-[1.5px] bg-[var(--text2)] rounded transition-all duration-200 ${
                showMenu
                  ? i === 0 ? 'w-5 rotate-45 translate-y-[6.5px]'
                  : i === 1 ? 'w-0 opacity-0'
                  : 'w-5 -rotate-45 -translate-y-[6.5px]'
                  : 'w-5'
              }`} />
            ))}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {showMenu && (
        <div className="md:hidden fixed inset-0 top-[58px] z-40 bg-[var(--bg)] backdrop-blur-xl p-6 flex flex-col">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setShowMenu(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all ${
                  isActive(l.to) ? 'bg-[rgba(59,158,255,0.1)] text-[var(--text)]' : 'text-[var(--text4)]'
                }`}>
                <span>{l.icon}</span> {l.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { setShowCab(true); setShowMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text2)]">
              🚕 Get Cab
            </button>
            <button onClick={() => { setShowSOS(true); setShowMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-sm font-bold text-[var(--red)]">
              🆘 SOS
            </button>
            <button onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text2)]">
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="mt-auto pt-6 border-t border-[var(--border5)]">
            <div className="font-mono text-xs text-[var(--text3)] flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full animate-pulse" />
              {time} IST · BLR / VOBL
            </div>
          </div>
        </div>
      )}

      <NotificationPanel open={showNotif} onClose={() => setShowNotif(false)} />
      <SOSModal open={showSOS} onClose={() => setShowSOS(false)} />
      <CabModal open={showCab} onClose={() => setShowCab(false)} />
    </>
  );
}
