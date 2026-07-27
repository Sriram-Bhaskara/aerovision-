import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const { login, register, continueAsGuest, saveNotificationPreference } = useAuth();
  const [tab, setTab] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [notifyOptIn, setNotifyOptIn] = useState(localStorage.getItem('aerovision_notify_opt_in') !== 'false');
  const [loading, setLoading] = useState(false);

  const requestBrowserNotificationPermission = () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(form.email, form.password);
        toast.success('Signed in successfully');
      } else {
        await register(form.email, form.password, form.full_name);
        toast.success('Welcome to AeroVision!');
      }
      saveNotificationPreference(notifyOptIn);
      if (notifyOptIn) requestBrowserNotificationPermission();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[var(--bg)] flex">
      {/* Left — visual panel (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d1f3c 40%, #081020 100%)' }}>

        {/* Animated radar sweep */}
        <div className="absolute w-[500px] h-[500px] rounded-full border border-[rgba(59,158,255,0.08)]">
          <div className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(59,158,255,0.12) 30deg, transparent 60deg)',
              animation: 'radarSweep 4s linear infinite',
            }} />
          <div className="absolute w-[350px] h-[350px] rounded-full border border-[rgba(59,158,255,0.06)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute w-[200px] h-[200px] rounded-full border border-[rgba(59,158,255,0.05)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          {/* Center dot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[#3b9eff] rounded-full shadow-[0_0_12px_rgba(59,158,255,0.6)]" />
          {/* Blips */}
          <div className="absolute top-[30%] left-[65%] w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
          <div className="absolute top-[55%] left-[25%] w-1.5 h-1.5 bg-[#f59e0b] rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute top-[70%] left-[60%] w-1.5 h-1.5 bg-[#3b9eff] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Text overlay */}
        <div className="absolute bottom-12 left-12 right-12">
          <div className="font-display text-[42px] font-extrabold leading-[1.1] tracking-[-1.5px] mb-3">
            Aero<span className="text-[#3b9eff]">Vision</span>
          </div>
          <p className="text-[#4a5a7a] text-[15px] leading-relaxed max-w-[360px]">
            Real-time flight intelligence, ADS-B radar tracking, and AI-powered analytics for Kempegowda International Airport.
          </p>
          <div className="flex items-center gap-4 mt-5 font-mono text-[11px] text-[#2a3a5a]">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" /> Live Data</span>
            <span>BLR / VOBL</span>
            <span>ADS-B Radar</span>
          </div>
        </div>

        {/* CSS for radar sweep */}
        <style>{`
          @keyframes radarSweep {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {/* Right — auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[400px]">

          {/* Mobile-only brand */}
          <div className="lg:hidden text-center mb-8">
            <div className="font-display text-3xl font-extrabold tracking-tight">
              Aero<span className="text-[#3b9eff]">Vision</span>
            </div>
            <p className="text-[#4a5a7a] text-sm mt-1">Airport Intelligence Platform</p>
          </div>

          {/* Desktop subtitle */}
          <div className="hidden lg:block mb-8">
            <h2 className="font-display text-2xl font-bold tracking-tight mb-1">
              {tab === 'login' ? 'Welcome back' : 'Get started'}
            </h2>
            <p className="text-[#4a5a7a] text-sm">
              {tab === 'login' ? 'Sign in to access your dashboard and saved flights.' : 'Create an account to save flights and get alerts.'}
            </p>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
            {/* Tabs */}
            <div className="flex bg-[var(--bg)] rounded-lg p-1 mb-6">
              <button onClick={() => setTab('login')}
                className={`flex-1 text-center py-2.5 rounded-md text-sm font-medium transition-all ${tab === 'login' ? 'bg-[var(--surface2)] text-[var(--text)] shadow-sm' : 'text-[var(--text3)] hover:text-[var(--text2)]'}`}>
                Sign In
              </button>
              <button onClick={() => setTab('signup')}
                className={`flex-1 text-center py-2.5 rounded-md text-sm font-medium transition-all ${tab === 'signup' ? 'bg-[var(--surface2)] text-[var(--text)] shadow-sm' : 'text-[var(--text3)] hover:text-[var(--text2)]'}`}>
                Create Account
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {tab === 'signup' && (
                <div className="mb-4">
                  <label className="block text-[11px] text-[var(--text4)] font-mono tracking-wider uppercase mb-1.5">Full Name</label>
                  <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Enter your name" required
                    className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(59,158,255,0.1)] transition-all" />
                </div>
              )}

              <div className="mb-4">
                <label className="block text-[11px] text-[var(--text4)] font-mono tracking-wider uppercase mb-1.5">Email</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com" required
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(59,158,255,0.1)] transition-all" />
              </div>

              <div className="mb-5">
                <label className="block text-[11px] text-[var(--text4)] font-mono tracking-wider uppercase mb-1.5">Password</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter password" required
                  className="w-full px-4 py-3 bg-[var(--bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--text)] placeholder-[var(--text3)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(59,158,255,0.1)] transition-all" />
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3.5 bg-[var(--accent)] text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50 shadow-[0_4px_20px_rgba(59,158,255,0.25)]">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Please wait...
                  </span>
                ) : tab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="text-center text-[var(--text3)] text-xs my-5 relative">
              <span className="relative z-10 bg-[var(--surface)] px-3">or</span>
              <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-[var(--border)]" />
            </div>

            <div className="mb-5 flex items-center justify-between p-4 bg-[var(--bg)] border border-[var(--border)] rounded-2xl">
              <div>
                <div className="text-sm font-semibold text-[var(--text)]">Enable notifications</div>
                <div className="text-[11px] text-[var(--text4)]">Receive live alerts while using AeroVision.</div>
              </div>
              <button type="button" onClick={() => setNotifyOptIn(v => !v)}
                className={`w-12 h-6 rounded-full transition ${notifyOptIn ? 'bg-[var(--accent)]' : 'bg-[var(--surface2)]'}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyOptIn ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            <button onClick={() => {
                saveNotificationPreference(notifyOptIn);
                if (notifyOptIn) requestBrowserNotificationPermission();
                continueAsGuest();
              }}
              className="w-full py-3 bg-transparent text-[#6677aa] border border-[rgba(99,179,255,0.12)] rounded-xl text-sm font-medium hover:border-[rgba(59,158,255,0.35)] hover:text-[#63b3ff] hover:bg-[rgba(59,158,255,0.03)] transition-all flex items-center justify-center gap-2">
              Continue as Guest
            </button>
          </div>

          <p className="text-center text-[#2a3a5a] text-[11px] mt-5 font-mono">
            JWT auth · Saved flights · Real-time alerts
          </p>
        </motion.div>
      </div>
    </div>
  );
}
