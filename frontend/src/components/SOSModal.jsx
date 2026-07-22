import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SOS_CONTACTS = [
  {
    category: 'Emergency',
    items: [
      { label: 'Airport Emergency',    number: '1800-425-4425', icon: '🚨', color: '#ef4444' },
      { label: 'CISF Police Post',     number: '080-66782152', icon: '👮', color: '#f97316' },
      { label: 'Airport Medical',      number: '080-66782220', icon: '🏥', color: '#3b9eff' },
    ],
  },
  {
    category: 'Assistance',
    items: [
      { label: 'Lost & Found',         number: '080-66782349', icon: '🔍', color: '#a78bfa' },
      { label: 'Child Helpline',       number: '1098',         icon: '🧒', color: '#22c55e' },
      { label: 'Accessibility Desk',   number: '1800-425-4425', icon: '♿', color: '#63b3ff' },
      { label: 'Women Helpline',       number: '1091',         icon: '🆘', color: '#f472b6' },
    ],
  },
  {
    category: 'Airport Services',
    items: [
      { label: 'BIAL Customer Care',   number: '1800-425-4425', icon: '📞', color: '#fbbf24' },
      { label: 'Baggage Services',     number: '080-66782350', icon: '🧳', color: '#34d399' },
    ],
  },
];

export default function SOSModal({ open, onClose }) {
  const [copied, setCopied] = useState(null); // stores the number that was just copied

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset copied state when modal closes
  useEffect(() => { if (!open) setCopied(null); }, [open]);

  const handleCopy = useCallback((e, number) => {
    e.preventDefault();   // don't trigger the tel: link
    e.stopPropagation();
    navigator.clipboard.writeText(number).then(() => {
      setCopied(number);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = number;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(number);
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sos-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="sos-modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed z-[61] inset-0 flex items-center justify-center p-4 pointer-events-none">

            <div className="w-full max-w-md bg-[var(--bg2)] border border-[rgba(239,68,68,0.3)] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] pointer-events-auto overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(239,68,68,0.15)] bg-[rgba(239,68,68,0.06)]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.3)] flex items-center justify-center text-base font-bold text-[#ef4444]">
                    SOS
                  </div>
                  <div>
                    <div className="font-display text-[15px] font-bold text-[var(--text)]">Emergency Contacts</div>
                    <div className="text-[11px] text-[#ef4444]">BLR / Kempegowda International Airport</div>
                  </div>
                </div>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text3)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-all text-sm">
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">

                {/* Alert banner */}
                <div className="flex items-center gap-2.5 p-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-xl">
                  <span className="text-lg animate-pulse">🚨</span>
                  <div className="text-xs text-[#ef4444] leading-relaxed">
                    Immediate danger? Call <strong>112</strong> (National Emergency) · <strong>100</strong> (Police) · <strong>108</strong> (Ambulance) · <strong>101</strong> (Fire).
                  </div>
                </div>

                {/* How clicking works — contextual hint */}
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                  <span className="text-[11px]">📱</span>
                  <p className="text-[10px] text-[var(--text3)]">
                    <strong className="text-[var(--text2)]">On mobile:</strong> tap a contact to open your dialler.&nbsp;
                    <strong className="text-[var(--text2)]">On desktop:</strong> use the copy button (📋) to copy the number.
                  </p>
                </div>

                {SOS_CONTACTS.map(group => (
                  <div key={group.category}>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text3)] mb-2.5">
                      {group.category}
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map(item => {
                        const justCopied = copied === item.number;
                        return (
                          <a
                            key={item.label}
                            href={`tel:${item.number.replace(/[-\s]/g, '')}`}
                            className="flex items-center gap-3 px-3.5 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--border2)] hover:bg-[var(--surface2)] transition-all group">

                            {/* Icon */}
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                              style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}>
                              {item.icon}
                            </div>

                            {/* Label + number */}
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-[var(--text)] group-hover:text-[var(--accent2)] transition-colors">
                                {item.label}
                              </div>
                              <div className="text-[11px] font-mono text-[var(--text3)]">{item.number}</div>
                            </div>

                            {/* Call icon (visible on mobile hover) */}
                            <span className="text-[var(--text3)] group-hover:text-[var(--accent2)] transition-colors text-xs shrink-0 hidden sm:block">
                              📞
                            </span>

                            {/* Copy button */}
                            <button
                              onClick={(e) => handleCopy(e, item.number)}
                              title="Copy number"
                              className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] border transition-all ${
                                justCopied
                                  ? 'bg-[rgba(34,197,94,0.15)] border-[rgba(34,197,94,0.4)] text-[#22c55e]'
                                  : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text3)] hover:border-[var(--border2)] hover:text-[var(--text)]'
                              }`}>
                              {justCopied ? '✓' : '📋'}
                            </button>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Copied toast */}
                <AnimatePresence>
                  {copied && (
                    <motion.div
                      key="copy-toast"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#22c55e] text-white text-[12px] font-semibold rounded-full shadow-lg z-[70]">
                      ✓ {copied} copied to clipboard
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
