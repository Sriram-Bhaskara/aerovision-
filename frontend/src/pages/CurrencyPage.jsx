// =====================================================
// CurrencyPage — INR Forex Converter (travel-focused)
// Rates from Fawaz Ahmed free currency API via backend proxy
// =====================================================
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';

// Currencies relevant to BLR international travelers
const CURRENCIES = [
  { code: 'USD', name: 'US Dollar',          symbol: '$',  flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro',               symbol: '€',  flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',      symbol: '£',  flag: '🇬🇧' },
  { code: 'AED', name: 'UAE Dirham',         symbol: 'د.إ',flag: '🇦🇪' },
  { code: 'SGD', name: 'Singapore Dollar',   symbol: 'S$', flag: '🇸🇬' },
  { code: 'JPY', name: 'Japanese Yen',       symbol: '¥',  flag: '🇯🇵' },
  { code: 'AUD', name: 'Australian Dollar',  symbol: 'A$', flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar',    symbol: 'C$', flag: '🇨🇦' },
  { code: 'THB', name: 'Thai Baht',          symbol: '฿',  flag: '🇹🇭' },
  { code: 'MYR', name: 'Malaysian Ringgit',  symbol: 'RM', flag: '🇲🇾' },
  { code: 'HKD', name: 'Hong Kong Dollar',   symbol: 'HK$',flag: '🇭🇰' },
  { code: 'CHF', name: 'Swiss Franc',        symbol: 'Fr', flag: '🇨🇭' },
];

const INR = { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' };
const ALL_CURRENCIES = [INR, ...CURRENCIES];

function fmt(n, code) {
  if (n === null || n === undefined) return '—';
  // JPY and THB have no sub-units; show 0 decimal places if whole, 2 otherwise
  const decimals = ['JPY', 'THB'].includes(code) ? 0 : (n >= 100 ? 2 : n >= 10 ? 3 : 4);
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function CurrencySelect({ value, onChange, currencies }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-all cursor-pointer appearance-none pr-8"
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%236677aa\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
    >
      {currencies.map(c => (
        <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
      ))}
    </select>
  );
}

export default function CurrencyPage() {
  const navigate = useNavigate();
  const [rates,      setRates]      = useState(null);   // { usd: 0.012, eur: 0.011, ... } keyed lowercase
  const [rateDate,   setRateDate]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [stale,      setStale]      = useState(false);
  const [fromCode,   setFromCode]   = useState('INR');
  const [toCode,     setToCode]     = useState('USD');
  const [fromAmount, setFromAmount] = useState('1000');
  const [toAmount,   setToAmount]   = useState('');
  const [lastEdited, setLastEdited] = useState('from'); // 'from' | 'to'

  const loadRates = useCallback(async () => {
    try {
      const res = await api.get('/currency/rates');
      // rates are INR-based: { usd: 0.012, eur: 0.011, ... }
      setRates(res.data.rates);
      setRateDate(res.data.date);
      setStale(!!res.data.stale);
      setError(null);
    } catch {
      setError('Could not load exchange rates. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  // Convert any amount between any two currencies (all relative to INR base)
  function convert(amount, from, to) {
    if (!rates || !amount || isNaN(amount)) return '';
    const num = parseFloat(amount);
    if (from === 'INR' && to === 'INR') return fmt(num, 'INR');
    // INR → other
    if (from === 'INR') {
      const rate = rates[to.toLowerCase()];
      return rate ? fmt(num * rate, to) : '—';
    }
    // other → INR
    if (to === 'INR') {
      const rate = rates[from.toLowerCase()];
      return rate ? fmt(num / rate, 'INR') : '—';
    }
    // other → other (via INR)
    const fromRate = rates[from.toLowerCase()];
    const toRate   = rates[to.toLowerCase()];
    if (!fromRate || !toRate) return '—';
    const inrAmount = num / fromRate;
    return fmt(inrAmount * toRate, to);
  }

  function getRateToINR(code) {
    if (code === 'INR') return 1;
    return rates ? (1 / (rates[code.toLowerCase()] || 1)) : null;
  }

  function getSymbol(code) {
    return ALL_CURRENCIES.find(c => c.code === code)?.symbol || code;
  }

  // Recalculate when inputs change
  useEffect(() => {
    if (!rates) return;
    if (lastEdited === 'from') {
      setToAmount(convert(fromAmount, fromCode, toCode));
    } else {
      setFromAmount(convert(toAmount, toCode, fromCode));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, fromCode, toCode, fromAmount, toAmount, lastEdited]);

  function handleFromChange(val) {
    setLastEdited('from');
    setFromAmount(val);
    if (rates) setToAmount(convert(val, fromCode, toCode));
  }
  function handleToChange(val) {
    setLastEdited('to');
    setToAmount(val);
    if (rates) setFromAmount(convert(val, toCode, fromCode));
  }
  function handleSwap() {
    setFromCode(toCode);
    setToCode(fromCode);
    setLastEdited('from');
    // Recalculate from → to with swapped codes
    if (rates) setToAmount(convert(fromAmount, toCode, fromCode));
  }

  // Display rate line
  function rateDisplay() {
    if (!rates) return null;
    const val = convert('1', fromCode, toCode);
    return `1 ${fromCode} = ${val} ${toCode}`;
  }

  // All currencies converted from 1 unit of fromCode
  const allConverted = CURRENCIES.map(c => {
    const val = rates ? convert(fromAmount || '1', fromCode, c.code) : null;
    return { ...c, converted: val };
  });
  const maxVal = allConverted.reduce((m, c) => {
    const n = parseFloat((c.converted || '').replace(/,/g, ''));
    return n > m ? n : m;
  }, 1);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto pb-20">

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
        <span className="text-xs font-mono text-[var(--text2)]">Currency Converter</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[rgba(99,179,255,0.1)] border border-[rgba(99,179,255,0.2)] flex items-center justify-center text-base">
              💱
            </div>
            Currency Converter
          </h1>
          <p className="text-[12px] text-[var(--text3)] mt-1.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[var(--green)] rounded-full animate-pulse inline-block" />
            Live forex rates · Travel currencies · BLR Airport
            {rateDate && <span>· Rates from {rateDate}</span>}
            {stale && <span className="text-[#f59e0b]">· (cached)</span>}
          </p>
        </div>
        <button onClick={loadRates}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--accent2)] hover:bg-[rgba(59,158,255,0.08)] hover:border-[rgba(59,158,255,0.3)] transition-all font-medium shrink-0">
          ↻ Refresh rates
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] rounded-xl mb-6 text-sm text-[#ef4444]">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* ── Main converter card ───────────────────────── */}
      <div className="bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl p-6 mb-5">
        {loading ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-14 bg-[var(--surface)] rounded-xl" />
            <div className="h-8 bg-[var(--surface)] rounded-xl w-24 mx-auto" />
            <div className="h-14 bg-[var(--surface)] rounded-xl" />
          </div>
        ) : (
          <>
            {/* From row */}
            <div className="flex items-center gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <span className="text-2xl shrink-0">
                {ALL_CURRENCIES.find(c => c.code === fromCode)?.flag}
              </span>
              <input
                type="number"
                min="0"
                value={fromAmount}
                onChange={e => handleFromChange(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-display font-bold text-[var(--text)] outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
              />
              <CurrencySelect value={fromCode} onChange={c => { setFromCode(c); setLastEdited('from'); }} currencies={ALL_CURRENCIES} />
            </div>

            {/* Swap button */}
            <div className="flex items-center justify-center py-3 gap-4">
              <div className="flex-1 h-px bg-[var(--border3)]" />
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleSwap}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border2)] text-[var(--accent2)] text-sm font-medium hover:bg-[rgba(59,158,255,0.08)] transition-all">
                ⇅ Swap
              </motion.button>
              <div className="flex-1 h-px bg-[var(--border3)]" />
            </div>

            {/* To row */}
            <div className="flex items-center gap-3 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
              <span className="text-2xl shrink-0">
                {ALL_CURRENCIES.find(c => c.code === toCode)?.flag}
              </span>
              <input
                type="number"
                min="0"
                value={typeof toAmount === 'string' ? toAmount.replace(/,/g, '') : toAmount}
                onChange={e => handleToChange(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-display font-bold text-[var(--accent2)] outline-none min-w-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
              />
              <CurrencySelect value={toCode} onChange={c => { setToCode(c); setLastEdited('from'); }} currencies={ALL_CURRENCIES} />
            </div>

            {/* Rate display */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${fromCode}-${toCode}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 text-center text-[12px] text-[var(--text3)] font-mono"
              >
                {rateDisplay()}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ── Quick reference: convert fromAmount to all currencies ── */}
      <div className="bg-[var(--bg2)] border border-[var(--border3)] rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm">🌍</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text3)]">
            {fromAmount || '1'} {fromCode} equals
          </span>
        </div>
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[0,1,2,3,4,5].map(i => <div key={i} className="h-8 bg-[var(--surface)] rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {allConverted.map((c, i) => {
              if (c.code === fromCode) return null;
              const numVal = parseFloat((c.converted || '0').replace(/,/g, '')) || 0;
              const pct    = maxVal > 0 ? (numVal / maxVal) * 100 : 0;
              return (
                <motion.div
                  key={c.code}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 group cursor-pointer"
                  onClick={() => { setToCode(c.code); setLastEdited('from'); }}
                >
                  <span className="text-base shrink-0 w-7 text-center">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-mono text-[var(--text3)]">{c.code}</span>
                      <span className="text-[13px] font-mono font-bold text-[var(--text)]">
                        {c.symbol}{c.converted || '—'}
                      </span>
                    </div>
                    <div className="h-1 bg-[var(--surface)] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-[var(--accent)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut', delay: i * 0.03 }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Airport forex tip ──────────────────────────── */}
      <div className="flex items-start gap-3 p-4 bg-[rgba(245,158,11,0.06)] border border-[rgba(245,158,11,0.2)] rounded-xl">
        <span className="text-xl shrink-0">💡</span>
        <div className="text-[12px] text-[var(--text3)] leading-relaxed space-y-1.5">
          <p>
            <span className="font-semibold text-[#f59e0b]">Airport forex vs. online rates:</span>{' '}
            Money changers inside BLR terminals (Thomas Cook, BookMyForex counters) typically offer rates
            2–4% worse than these interbank rates. For large amounts, pre-order forex online and collect at the airport.
          </p>
          <p>
            <span className="font-semibold text-[var(--text2)]">ATM tip:</span>{' '}
            Withdraw local currency at your destination airport ATM — usually better than exchanging at BLR.
            Decline "dynamic currency conversion" offers (DCC) — always pay in local currency.
          </p>
        </div>
      </div>
    </div>
  );
}
