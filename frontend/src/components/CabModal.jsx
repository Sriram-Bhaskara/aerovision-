import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// BLR Airport coordinates
const BLR_LAT = 13.1979;
const BLR_LNG = 77.7063;
const BLR_PLACE_NAME = 'Kempegowda International Airport, Bengaluru';

function buildOlaLink() {
  // Ola deep link — pickup at BLR
  return `https://book.olacabs.com/?pickup_name=${encodeURIComponent(BLR_PLACE_NAME)}&pickup_lat=${BLR_LAT}&pickup_lng=${BLR_LNG}&drop_name=&utm_source=aerovision`;
}

function buildUberLink() {
  // Uber deep link — pickup at BLR
  return `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${BLR_LAT}&pickup[longitude]=${BLR_LNG}&pickup[nickname]=${encodeURIComponent(BLR_PLACE_NAME)}`;
}

function buildRapidoLink() {
  // Rapido universal link — opens app on mobile if installed, website otherwise
  return `https://www.rapido.bike/`;
}

// Try to open native app via URI scheme; fall back to web URL if app not installed
function openWithAppFallback(appScheme, webUrl) {
  if (!appScheme) {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  // Attempt native app launch
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  let appOpened = false;
  const handleVisibilityChange = () => {
    if (document.hidden) appOpened = true;
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  iframe.src = appScheme;

  // After 1.5 s, if page is still visible (app didn't open), fall back to web
  setTimeout(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.body.removeChild(iframe);
    if (!appOpened) {
      window.open(webUrl, '_blank', 'noopener,noreferrer');
    }
  }, 1500);
}

const CAB_SERVICES = [
  {
    id: 'ola',
    name: 'Ola',
    tagline: 'Auto · Cab · Prime',
    icon: '🟡',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    getLink: buildOlaLink,
    appScheme: `olacabs://book?pickup_lat=${BLR_LAT}&pickup_lng=${BLR_LNG}`,
    note: 'Opens Ola with BLR pickup pre-set',
  },
  {
    id: 'uber',
    name: 'Uber',
    tagline: 'UberGo · Comfort · XL',
    icon: '⬛',
    color: '#e8f0fe',
    bg: 'rgba(232,240,254,0.05)',
    border: 'rgba(232,240,254,0.15)',
    getLink: buildUberLink,
    appScheme: `uber://?action=setPickup&pickup[latitude]=${BLR_LAT}&pickup[longitude]=${BLR_LNG}`,
    note: 'Opens Uber with BLR pickup pre-set',
  },
  {
    id: 'rapido',
    name: 'Rapido',
    tagline: 'Bike · Auto · Cab',
    icon: '🔴',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    getLink: buildRapidoLink,
    appScheme: 'rapido://',
    note: 'Opens Rapido app/website',
  },
];

const TIPS = [
  '🚕 Pre-paid taxi counter is at Level 1, Exit Gate 5 (T1) and Level 2, Exit Gate 8 (T2).',
  '📍 Cab pickup zone is at Ground Floor — follow "Cab / Taxi" signs after the exit.',
  '💡 Surge pricing is highest 5–8 AM and 6–9 PM. Book 10 min early.',
  '🎒 Airport surcharge of ₹50–₹100 applies on all Ola/Uber rides from BLR.',
];

export default function CabModal({ open, onClose }) {
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Rotate tips every 4 seconds
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(id);
  }, [open]);

  function handleBook(service) {
    openWithAppFallback(service.appScheme, service.getLink());
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cab-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="cab-modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed z-[61] inset-0 flex items-center justify-center p-4 pointer-events-none">

            <div className="w-full max-w-md bg-[var(--bg2)] border border-[var(--border2)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] pointer-events-auto overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.25)] flex items-center justify-center text-lg">
                    🚕
                  </div>
                  <div>
                    <div className="font-display text-[15px] font-bold text-[var(--text)]">Get a Cab from BLR</div>
                    <div className="text-[11px] text-[var(--text3)] font-mono">Kempegowda International Airport</div>
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text3)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-all text-sm">
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">

                {/* Location pill */}
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                  <span className="text-[var(--green)] text-sm">📍</span>
                  <div className="text-xs text-[var(--text2)]">
                    Pickup: <span className="text-[var(--text)] font-medium">BLR Airport</span>
                    <span className="ml-2 font-mono text-[var(--text3)]">{BLR_LAT}°N, {BLR_LNG}°E</span>
                  </div>
                </div>

                {/* Cab options */}
                <div className="space-y-2.5">
                  {CAB_SERVICES.map(service => (
                    <motion.button
                      key={service.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleBook(service)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all text-left"
                      style={{ background: service.bg, borderColor: service.border }}>

                      <div className="text-2xl w-9 text-center">{service.icon}</div>

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[14px] text-[var(--text)]">{service.name}</div>
                        <div className="text-[11px] text-[var(--text3)]">{service.tagline}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: service.color }}>{service.note}</div>
                      </div>

                      <div className="flex items-center gap-1 text-[12px] font-medium shrink-0"
                        style={{ color: service.color }}>
                        Open →
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Rotating tip */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tipIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    className="px-3.5 py-2.5 bg-[rgba(59,158,255,0.05)] border border-[rgba(59,158,255,0.12)] rounded-xl">
                    <p className="text-[11px] text-[var(--text3)] leading-relaxed">{TIPS[tipIdx]}</p>
                  </motion.div>
                </AnimatePresence>

                {/* Tip dots */}
                <div className="flex items-center justify-center gap-1.5">
                  {TIPS.map((_, i) => (
                    <button key={i} onClick={() => setTipIdx(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all ${i === tipIdx ? 'bg-[var(--accent2)] w-3' : 'bg-[var(--border2)]'}`} />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
