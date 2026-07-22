import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { assistAPI, userAPI } from '../services/api';
import toast from 'react-hot-toast';

const PICKUP_POINTS = [
  'Main Entrance - T1',
  'Main Entrance - T2',
  'Drop-off Zone - T1',
  'Drop-off Zone - T2',
  'Arrivals Exit - T1',
  'Arrivals Exit - T2',
  'Parking Level 2 - T1',
];

// Eligibility options — pregnant only applies to buggy free tier
const ELIGIBILITY_BY_SERVICE = {
  wheelchair: [
    { value: 'senior',   icon: '👴', label: 'Senior Citizen (60+)',      desc: 'Aged 60 years or above — verified from your date of birth' },
    { value: 'disabled', icon: '♿', label: 'Person with Disability',     desc: 'Certified physical or mobility impairment' },
  ],
  golf_cart: [
    { value: 'senior',   icon: '👴', label: 'Senior Citizen (60+)',      desc: 'Aged 60 years or above — verified from your date of birth' },
    { value: 'pregnant', icon: '🤰', label: 'Pregnant Woman',            desc: 'Currently pregnant — doctor\'s note or ID accepted' },
    { value: 'disabled', icon: '♿', label: 'Person with Disability',     desc: 'Certified physical or mobility impairment' },
  ],
};

// Pregnant can use either; disabled requires medical certificate only
const DOCUMENT_OPTIONS_PREGNANT = [
  { value: 'aadhar',              label: 'Aadhar Card',         desc: 'Government-issued Aadhar confirming pregnancy details' },
  { value: 'medical_certificate', label: 'Medical Certificate', desc: 'Doctor-issued certificate confirming pregnancy' },
];
const DOCUMENT_OPTIONS_DISABLED = [
  { value: 'medical_certificate', label: 'Medical Certificate', desc: 'Doctor-issued certificate confirming your disability or mobility impairment' },
];

const STATUS_STEPS = ['confirmed', 'staff_assigned', 'en_route', 'completed'];
const STATUS_LABELS = { confirmed: 'Confirmed', staff_assigned: 'Staff Assigned', en_route: 'En Route', completed: 'Completed' };
const STATUS_BADGE  = {
  confirmed:     { color: '#63b3ff', bg: 'rgba(59,158,255,0.1)',    label: 'Confirmed' },
  staff_assigned:{ color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',    label: 'Staff Assigned' },
  en_route:      { color: '#f97316', bg: 'rgba(249,115,22,0.1)',    label: 'En Route' },
  completed:     { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',     label: 'Completed' },
  cancelled:     { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',     label: 'Cancelled' },
};

// ── Booking card ─────────────────────────────────────────
function BookingCard({ booking, onCancel }) {
  const isWheelchair = booking.service_type === 'wheelchair';
  const charge       = booking.charge_amount || 0;
  const paid         = booking.payment_status === 'paid';
  const waived       = booking.payment_status === 'waived';
  const isCancelled  = booking.status === 'cancelled';
  const stepIdx      = STATUS_STEPS.indexOf(booking.status);
  const badge        = STATUS_BADGE[booking.status] || STATUS_BADGE.confirmed;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#0d1220] border border-[rgba(99,179,255,0.12)] rounded-xl p-4">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#141c2e] border border-[rgba(99,179,255,0.15)] flex items-center justify-center text-xl flex-shrink-0">
          {isWheelchair ? '♿' : '🛺'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-[#63b3ff] bg-[rgba(59,158,255,0.1)] px-2 py-0.5 rounded">{booking.booking_ref}</span>
            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
            {charge > 0 && paid  && <span className="text-xs text-[#a78bfa] bg-[rgba(167,139,250,0.1)] px-2 py-0.5 rounded">₹{charge} paid</span>}
            {waived               && <span className="text-xs text-[#22c55e] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 rounded">Free</span>}
          </div>
          <div className="mt-1 text-sm font-medium text-[#e8f0fe]">{booking.passenger_name}</div>
          <div className="text-xs text-[#8899bb] mt-0.5">{isWheelchair ? 'Wheelchair' : 'Buggy'} · Flight {booking.flight_iata}</div>
          <div className="text-xs text-[#4a5a7a] mt-0.5">{booking.pickup_point} · {booking.pickup_time}</div>
        </div>
        {!isCancelled && booking.status !== 'completed' && (
          <button onClick={() => onCancel(booking.id)}
            className="text-xs text-[#ef4444] hover:text-[#fca5a5] transition-colors flex-shrink-0 px-2 py-1">
            Cancel
          </button>
        )}
      </div>

      {/* Status timeline */}
      {!isCancelled && (
        <div className="mt-3 pt-3 border-t border-[rgba(99,179,255,0.07)]">
          <div className="flex items-center">
            {STATUS_STEPS.map((step, i) => {
              const done    = stepIdx >= i;
              const current = stepIdx === i;
              return (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all ${
                      done ? 'bg-[#22c55e]' : 'bg-[#1a2540] border border-[rgba(99,179,255,0.18)]'
                    } ${current ? 'ring-2 ring-offset-1 ring-offset-[#0d1220] ring-[rgba(34,197,94,0.5)]' : ''}`} />
                    <span className={`text-[8px] font-mono text-center leading-tight ${done ? 'text-[#22c55e]' : 'text-[#3a4a6a]'}`}>
                      {STATUS_LABELS[step]}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`h-px flex-1 mx-1 mb-3 ${stepIdx > i ? 'bg-[#22c55e]' : 'bg-[rgba(99,179,255,0.1)]'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Verification gate (shared for both services) ─────────
function VerificationGate({ serviceType, onVerified, profileDob }) {
  const fileInputRef    = useRef(null);
  const aadhaarScanRef  = useRef(null);
  const eligibilityOptions = ELIGIBILITY_BY_SERVICE[serviceType] || ELIGIBILITY_BY_SERVICE.wheelchair;
  const [eligibility, setEligibility] = useState('');
  const [docType, setDocType]         = useState('');
  const [file, setFile]               = useState(null);
  const [dragging, setDragging]       = useState(false);
  const [dob, setDob]                 = useState(profileDob || '');
  const [dobSource, setDobSource]     = useState(null); // null | 'manual' | 'aadhaar' | 'profile'
  const [scanning, setScanning]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);

  const isSenior   = eligibility === 'senior';
  const documentOptions = eligibility === 'disabled' ? DOCUMENT_OPTIONS_DISABLED : DOCUMENT_OPTIONS_PREGNANT;

  function extractDobFromText(text) {
    // Full DOB: DOB: DD/MM/YYYY (Aadhaar standard)
    const full = text.match(/(?:DOB|Date\s+of\s+Birth|D\.O\.B)[.\s:]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i);
    if (full) {
      const [, dd, mm, yyyy] = full;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    // Year of Birth only (masked Aadhaar) — approximate to Jan 1
    const yob = text.match(/(?:Year\s+of\s+Birth|YOB)[.\s:]*(\d{4})/i);
    if (yob) return `${yob[1]}-01-01`;
    // Fallback: any DD/MM/19xx or DD/MM/20xx pattern
    const bare = text.match(/(\d{2})[\/\-](\d{2})[\/\-](19\d{2}|20[0-2]\d)/);
    if (bare) {
      const [, dd, mm, yyyy] = bare;
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return null;
  }

  async function handleAadhaarScan(f) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(f.type)) {
      toast.error('Please upload a JPG or PNG image of your Aadhaar card');
      return;
    }
    setScanning(true);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(f);
      await worker.terminate();
      const extracted = extractDobFromText(text);
      if (extracted) {
        setDob(extracted);
        setDobSource('aadhaar');
        toast.success('Date of birth extracted from Aadhaar');
      } else {
        toast.error('Could not read DOB — please enter it manually below');
      }
    } catch (err) {
      console.error('[Aadhaar OCR]', err);
      toast.error('Scan failed — please enter your date of birth manually');
    } finally {
      setScanning(false);
    }
  }

  function handleFile(f) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'].includes(f.type)) {
      toast.error('Only JPG, PNG, or PDF files are accepted'); return;
    }
    if (f.size > 2 * 1024 * 1024) {
      toast.error('File must be under 2 MB'); return;
    }
    setFile(f);
  }

  async function handleSubmit() {
    if (!eligibility) { toast.error('Please select your eligibility type'); return; }

    if (isSenior) {
      if (!dob) { toast.error('Please enter your date of birth'); return; }
      setSubmitting(true);
      try {
        const res = await assistAPI.submitVerification({
          eligibility_type: 'senior',
          date_of_birth: dob,
        });
        onVerified(res.data.verification);
        toast.success('Age verified — senior citizen status confirmed');
      } catch (err) {
        if (err.response?.status === 401) {
          toast.error('Your session has expired — please sign out and sign in again');
        } else {
          toast.error(err.response?.data?.error || 'Verification failed — please try again');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Document path for disabled / pregnant
    if (!docType) { toast.error('Please select a document type'); return; }
    if (!file)    { toast.error('Please upload your proof document'); return; }

    setSubmitting(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await assistAPI.submitVerification({
        eligibility_type: eligibility,
        document_type:    docType,
        document_name:    file.name,
        document_data:    base64,
      });

      onVerified(res.data.verification);
      toast.success('Verification approved — you can now book for free');
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error('Your session has expired — please sign out and sign in again');
      } else {
        toast.error(err.response?.data?.error || 'Verification failed — please try again');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#141c2e] border border-[rgba(245,158,11,0.3)] rounded-2xl p-6 mb-5">

      <div className="flex items-start gap-3 mb-5 pb-5 border-b border-[rgba(99,179,255,0.08)]">
        <div className="w-10 h-10 rounded-xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] flex items-center justify-center text-xl flex-shrink-0">🔒</div>
        <div>
          <h2 className="font-display text-base font-bold text-[#e8f0fe]">Eligibility Verification</h2>
          <p className="text-xs text-[#8899bb] mt-1 leading-relaxed">
            {serviceType === 'wheelchair'
              ? 'Wheelchair assistance is free for senior citizens (60+) or persons with a disability.'
              : 'Free buggy service is available for senior citizens (60+), pregnant women, or persons with a disability.'}
          </p>
        </div>
      </div>

      {/* Step 1 — Select eligibility */}
      <div className="mb-5">
        <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-2">Step 1 — Select Eligibility</label>
        <div className={`grid gap-3 ${eligibilityOptions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {eligibilityOptions.map(opt => (
            <button key={opt.value} type="button" onClick={() => { setEligibility(opt.value); setDocType(''); }}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                eligibility === opt.value
                  ? 'bg-[rgba(251,191,36,0.08)] border-[rgba(251,191,36,0.45)]'
                  : 'bg-[#0d1220] border-[rgba(99,179,255,0.12)] hover:border-[rgba(99,179,255,0.25)]'
              }`}>
              <div className="text-xl mb-1.5">{opt.icon}</div>
              <div className={`text-xs font-semibold ${eligibility === opt.value ? 'text-[#fbbf24]' : 'text-[#e8f0fe]'}`}>{opt.label}</div>
              <div className="text-[10px] text-[#4a5a7a] mt-0.5 leading-relaxed">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Senior path — DOB field + Aadhaar scan */}
      {isSenior && (
        <div className="mb-5">
          <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-2">Step 2 — Date of Birth</label>
          <div className="bg-[rgba(59,158,255,0.05)] border border-[rgba(59,158,255,0.2)] rounded-xl p-4 mb-3 flex items-start gap-2">
            <span className="text-base mt-0.5">ℹ️</span>
            <p className="text-xs text-[#8899bb] leading-relaxed">
              You must be <span className="text-[#fbbf24] font-semibold">60 years or older</span>. Enter your date of birth manually, or upload your Aadhaar card to auto-fill it.
            </p>
          </div>

          {/* Aadhaar scan */}
          <input ref={aadhaarScanRef} type="file" accept=".jpg,.jpeg,.png" className="hidden"
            onChange={e => handleAadhaarScan(e.target.files[0])} />
          <button type="button"
            onClick={() => aadhaarScanRef.current?.click()}
            disabled={scanning}
            className="w-full mb-3 py-2.5 bg-[rgba(99,179,255,0.06)] border border-dashed border-[rgba(99,179,255,0.25)] hover:border-[rgba(99,179,255,0.45)] hover:bg-[rgba(99,179,255,0.1)] rounded-lg text-xs text-[#63b3ff] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
            {scanning ? (
              <>
                <span className="w-3 h-3 border border-[#63b3ff] border-t-transparent rounded-full animate-spin" />
                Scanning Aadhaar...
              </>
            ) : (
              <>
                <span>🪪</span>
                Scan Aadhaar card to auto-fill DOB
              </>
            )}
          </button>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-px bg-[rgba(99,179,255,0.1)]" />
            <span className="text-[10px] text-[#3a4a6a] font-mono">OR ENTER MANUALLY</span>
            <div className="flex-1 h-px bg-[rgba(99,179,255,0.1)]" />
          </div>

          <input
            type="date"
            value={dob}
            onChange={e => { setDob(e.target.value); setDobSource('manual'); }}
            max={new Date().toISOString().split('T')[0]}
            className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-4 py-2.5 text-sm text-[#e8f0fe] focus:outline-none focus:border-[rgba(251,191,36,0.5)] transition-colors"
          />
          {dob && dobSource === 'aadhaar' && (
            <p className="text-[10px] text-[#22c55e] mt-1.5">✓ Date of birth extracted from Aadhaar card</p>
          )}
          {dob && !dobSource && profileDob && dob === profileDob && (
            <p className="text-[10px] text-[#22c55e] mt-1.5">✓ Pre-filled from your profile</p>
          )}
        </div>
      )}

      {/* Non-senior path — document steps */}
      {eligibility && !isSenior && (
        <>
          <div className="mb-5">
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-2">Step 2 — Choose Proof Document</label>
            <div className="grid grid-cols-2 gap-3">
              {documentOptions.map(opt => (
                <button key={opt.value} type="button" onClick={() => setDocType(opt.value)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    docType === opt.value
                      ? 'bg-[rgba(251,191,36,0.08)] border-[rgba(251,191,36,0.45)]'
                      : 'bg-[#0d1220] border-[rgba(99,179,255,0.12)] hover:border-[rgba(99,179,255,0.25)]'
                  }`}>
                  <div className={`text-sm font-semibold ${docType === opt.value ? 'text-[#fbbf24]' : 'text-[#e8f0fe]'}`}>{opt.label}</div>
                  <div className="text-xs text-[#4a5a7a] mt-0.5 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-2">Step 3 — Upload Document</label>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                dragging ? 'border-[#fbbf24] bg-[rgba(251,191,36,0.05)]'
                : file    ? 'border-[rgba(34,197,94,0.4)] bg-[rgba(34,197,94,0.04)]'
                          : 'border-[rgba(99,179,255,0.2)] hover:border-[rgba(99,179,255,0.4)] bg-[#0d1220]'
              }`}>
              <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
                onChange={e => handleFile(e.target.files[0])} />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">✅</span>
                  <div className="text-left">
                    <div className="text-sm font-medium text-[#22c55e]">{file.name}</div>
                    <div className="text-xs text-[#4a5a7a]">{(file.size / 1024).toFixed(0)} KB · Click to change</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-2xl mb-2">📄</div>
                  <div className="text-sm text-[#8899bb]">Drag & drop or <span className="text-[#63b3ff]">click to upload</span></div>
                  <div className="text-xs text-[#4a5a7a] mt-1">JPG, PNG or PDF · Max 2 MB</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        onClick={handleSubmit} disabled={submitting || !eligibility}
        className="w-full py-2.5 bg-[rgba(251,191,36,0.12)] border border-[rgba(251,191,36,0.4)] rounded-lg text-sm font-semibold text-[#fbbf24] hover:bg-[rgba(251,191,36,0.2)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border border-[#fbbf24] border-t-transparent rounded-full animate-spin" />
            Verifying...
          </span>
        ) : isSenior ? 'Verify Age →' : 'Submit for Verification →'}
      </motion.button>
      <p className="text-[10px] text-[#3a4a6a] text-center mt-3">
        {isSenior
          ? 'Your date of birth is saved to your profile for future bookings.'
          : 'Your document is stored securely and used only to verify eligibility.'}
      </p>
    </motion.div>
  );
}

// ── Payment confirmation panel ───────────────────────────
function PaymentConfirm({ onConfirm }) {
  const [confirming, setConfirming] = useState(false);

  async function handlePay() {
    setConfirming(true);
    // Simulate a brief payment processing delay
    await new Promise(r => setTimeout(r, 1200));
    setConfirming(false);
    onConfirm();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#141c2e] border border-[rgba(167,139,250,0.3)] rounded-2xl p-6 mb-5">

      <div className="flex items-start gap-3 mb-5 pb-5 border-b border-[rgba(99,179,255,0.08)]">
        <div className="w-10 h-10 rounded-xl bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.3)] flex items-center justify-center text-xl flex-shrink-0">💳</div>
        <div>
          <h2 className="font-display text-base font-bold text-[#e8f0fe]">Payment Required</h2>
          <p className="text-xs text-[#8899bb] mt-1 leading-relaxed">
            Golf cart service costs <span className="text-[#a78bfa] font-semibold">₹1,000</span> for passengers not in an eligible category. Please confirm your payment to proceed.
          </p>
        </div>
      </div>

      {/* Charge breakdown */}
      <div className="bg-[#0d1220] rounded-xl p-4 mb-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[#8899bb]">Buggy Service</span>
          <span className="text-[#e8f0fe]">₹1,000.00</span>
        </div>
        <div className="flex justify-between text-xs text-[#4a5a7a]">
          <span>GST included</span>
          <span>—</span>
        </div>
        <div className="border-t border-[rgba(99,179,255,0.08)] pt-2 flex justify-between font-semibold">
          <span className="text-[#e8f0fe]">Total</span>
          <span className="text-[#a78bfa]">₹1,000.00</span>
        </div>
      </div>

      <div className="bg-[rgba(251,191,36,0.05)] border border-[rgba(251,191,36,0.2)] rounded-lg px-4 py-3 mb-5 text-xs text-[#fbbf24] flex items-start gap-2">
        <span>💡</span>
        <span>Senior citizens (60+), pregnant women, and persons with disability are eligible for <strong>free</strong> buggy service. Select "I'm Eligible" above if you qualify.</span>
      </div>

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        onClick={handlePay} disabled={confirming}
        className="w-full py-2.5 bg-[rgba(167,139,250,0.15)] border border-[rgba(167,139,250,0.4)] rounded-lg text-sm font-semibold text-[#a78bfa] hover:bg-[rgba(167,139,250,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        {confirming ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border border-[#a78bfa] border-t-transparent rounded-full animate-spin" />
            Processing...
          </span>
        ) : 'Confirm & Pay ₹1,000 →'}
      </motion.button>
    </motion.div>
  );
}

// ── Booking form ─────────────────────────────────────────
function BookingForm({ serviceType, chargeAmount, onSubmit, submitting }) {
  const [form, setForm] = useState({
    passenger_name: '', phone: '', flight_iata: '',
    pickup_point: PICKUP_POINTS[0], pickup_time: '', notes: '',
  });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.passenger_name.trim()) { toast.error('Passenger name is required'); return; }
    if (!form.flight_iata.trim())    { toast.error('Flight number is required'); return; }
    if (!form.pickup_time)           { toast.error('Pickup time is required'); return; }
    onSubmit(form);
  }

  return (
    <motion.div key="booking-form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-6 mb-5">

      {chargeAmount > 0 && (
        <div className="mb-4 px-3 py-2 bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.25)] rounded-lg flex items-center gap-2">
          <span className="text-base">💳</span>
          <span className="text-xs text-[#a78bfa]">Payment of <strong>₹{chargeAmount}</strong> confirmed — complete your booking below.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Passenger Name *</label>
            <input value={form.passenger_name} onChange={e => set('passenger_name', e.target.value)}
              placeholder="Full name"
              className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Phone Number</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="+91 XXXXX XXXXX" type="tel"
              className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Flight Number *</label>
            <input value={form.flight_iata} onChange={e => set('flight_iata', e.target.value.toUpperCase())}
              placeholder="e.g. 6E345"
              className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors font-mono" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Pickup Time *</label>
            <input type="time" value={form.pickup_time} onChange={e => set('pickup_time', e.target.value)}
              className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Pickup Point *</label>
          <select value={form.pickup_point} onChange={e => set('pickup_point', e.target.value)}
            className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors">
            {PICKUP_POINTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Special Requirements</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="e.g. uses own manual wheelchair, needs oxygen, mobility device size..."
            rows={2}
            className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-3 py-2 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors resize-none" />
        </div>

        <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          disabled={submitting}
          className="w-full py-2.5 bg-[rgba(59,158,255,0.15)] border border-[rgba(59,158,255,0.35)] rounded-lg text-sm font-semibold text-[#63b3ff] hover:bg-[rgba(59,158,255,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-3.5 h-3.5 border border-[#63b3ff] border-t-transparent rounded-full animate-spin" />
              Booking...
            </span>
          ) : serviceType === 'wheelchair' ? 'Book Wheelchair ♿' : chargeAmount > 0 ? `Book Buggy · ₹${chargeAmount} 🛺` : 'Book Buggy (Free) 🛺'}
        </motion.button>
      </form>
    </motion.div>
  );
}

// ── Main page ────────────────────────────────────────────
export default function MobilityAssistPage() {
  const navigate = useNavigate();
  const [serviceType,    setServiceType]    = useState('wheelchair');
  const [golfCartMode,   setGolfCartMode]   = useState(null); // null | 'eligible' | 'paid'
  const [golfCartPaid,   setGolfCartPaid]   = useState(false);
  const [verification,   setVerification]   = useState(null);
  const [verifLoading,   setVerifLoading]   = useState(true);
  const [submitting,     setSubmitting]     = useState(false);
  const [confirmed,      setConfirmed]      = useState(null);
  const [bookings,       setBookings]       = useState([]);
  const [loadingBookings,setLoadingBookings]= useState(true);
  const [profileDob,     setProfileDob]     = useState('');

  function refreshBookings() {
    assistAPI.getMyBookings()
      .then(res => setBookings(res.data.bookings || []))
      .catch(() => {});
  }

  useEffect(() => {
    assistAPI.getVerificationStatus()
      .then(res => setVerification(res.data.verification))
      .catch(() => {})
      .finally(() => setVerifLoading(false));

    userAPI.getProfile()
      .then(res => setProfileDob(res.data.user?.date_of_birth || ''))
      .catch(() => {});

    assistAPI.getMyBookings()
      .then(res => setBookings(res.data.bookings || []))
      .catch(() => {})
      .finally(() => setLoadingBookings(false));

    // Poll for status updates every 30 seconds
    const poll = setInterval(refreshBookings, 30000);
    return () => clearInterval(poll);
  }, []);

  // Reset buggy sub-state when switching services
  function selectService(type) {
    setServiceType(type);
    if (type !== 'golf_cart') { setGolfCartMode(null); setGolfCartPaid(false); }
  }

  const isVerified = verification?.status === 'approved';

  // Derive what the booking form should charge
  function resolveCharge() {
    if (serviceType === 'wheelchair') return 0;
    if (serviceType === 'golf_cart') {
      if (isVerified || golfCartMode === 'eligible') return 0;
      if (golfCartPaid) return 1000;
    }
    return 0;
  }

  async function handleBooking(form) {
    const token = localStorage.getItem('aerovision_token');
    if (!token) {
      toast.error('Please sign in to book assistance');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        service_type:     serviceType,
        ...form,
        flight_iata:      form.flight_iata.toUpperCase(),
        is_paid_booking:  serviceType === 'golf_cart' && golfCartPaid && !isVerified,
      };
      const res = await assistAPI.book(payload);
      setConfirmed(res.data);
      setBookings(b => [res.data, ...b]);
      toast.success('Assistance booked successfully!');
    } catch (err) {
      if (err.response?.status === 401) {
        toast.error('Your session has expired — please sign out and sign in again');
      } else {
        toast.error(err.response?.data?.error || 'Booking failed');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id) {
    try {
      await assistAPI.cancel(id);
      setBookings(b => b.filter(x => x.id !== id));
      toast.success('Booking cancelled');
    } catch {
      toast.error('Failed to cancel');
    }
  }

  // ── Derive what to show for buggy ────────────────
  // Wheelchair: verified → form | not verified → verif gate
  // Golf cart: no mode → mode selector
  //            mode=eligible + verified → form (free)
  //            mode=eligible + not verified → verif gate
  //            mode=paid + not paid → payment confirm
  //            mode=paid + paid → form (₹1000)

  const showWheelchairGate = serviceType === 'wheelchair' && !verifLoading && !isVerified;
  const showWheelchairForm = serviceType === 'wheelchair' && !verifLoading && isVerified;

  const showGolfModeSelect  = serviceType === 'golf_cart' && !verifLoading && golfCartMode === null && !isVerified;
  const showGolfVerifGate   = serviceType === 'golf_cart' && !verifLoading && golfCartMode === 'eligible' && !isVerified;
  const showGolfPayment     = serviceType === 'golf_cart' && !verifLoading && golfCartMode === 'paid' && !golfCartPaid;
  const showGolfForm        = serviceType === 'golf_cart' && !verifLoading && (isVerified || (golfCartMode === 'eligible' && isVerified) || (golfCartMode === 'paid' && golfCartPaid));

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1525] border border-[rgba(99,179,255,0.12)] text-[#6677aa] hover:text-[#e8f0fe] hover:border-[rgba(99,179,255,0.28)] hover:bg-[rgba(59,158,255,0.06)] transition-all text-xs font-medium group">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M7.5 9.5L4 6L7.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#2a3a5a]">
          <path d="M5 2L9 7L5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-xs font-mono text-[#8899bb]">Mobility Assistance</span>
      </div>

      <AnimatePresence mode="wait">
        {confirmed ? (
          /* ── Confirmation screen ── */
          <motion.div key="confirm" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="bg-[#141c2e] border border-[rgba(34,197,94,0.3)] rounded-2xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.3)] flex items-center justify-center text-3xl mx-auto mb-4">✅</div>
            <h2 className="font-display text-xl font-bold text-[#e8f0fe] mb-1">Booking Confirmed</h2>
            <div className="font-mono text-2xl text-[#22c55e] mb-4">{confirmed.booking_ref}</div>
            <div className="space-y-2 text-sm text-[#8899bb] mb-4">
              <p>Service: <span className="text-[#e8f0fe] capitalize">{confirmed.service_type.replace('_', ' ')}</span></p>
              <p>Passenger: <span className="text-[#e8f0fe]">{confirmed.passenger_name}</span></p>
              <p>Flight: <span className="text-[#63b3ff] font-mono">{confirmed.flight_iata}</span></p>
              <p>Pickup: <span className="text-[#e8f0fe]">{confirmed.pickup_point}</span></p>
              <p>Time: <span className="text-[#e8f0fe]">{confirmed.pickup_time}</span></p>
            </div>
            {confirmed.charge_amount > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(167,139,250,0.1)] border border-[rgba(167,139,250,0.25)] rounded-lg text-sm text-[#a78bfa] mb-4">
                💳 ₹{confirmed.charge_amount} paid
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)] rounded-lg text-sm text-[#22c55e] mb-4">
                ✓ Free service
              </div>
            )}
            <p className="text-xs text-[#4a5a7a] mb-6">A BLR airport staff member will be at your pickup point at the designated time. Show this reference at the assistance desk if needed.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setConfirmed(null); setGolfCartMode(null); setGolfCartPaid(false); }}
                className="px-5 py-2 bg-[rgba(59,158,255,0.12)] border border-[rgba(59,158,255,0.3)] rounded-lg text-sm text-[#63b3ff] hover:bg-[rgba(59,158,255,0.2)] transition-all">
                Book Another
              </button>
              <button onClick={() => navigate('/')}
                className="px-5 py-2 bg-[#1a2540] border border-[rgba(99,179,255,0.15)] rounded-lg text-sm text-[#8899bb] hover:text-[#e8f0fe] transition-all">
                Home
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* ── Service selector ── */}
            <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-6 mb-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-[rgba(59,158,255,0.1)] border border-[rgba(59,158,255,0.22)] flex items-center justify-center text-xl">♿</div>
                <div>
                  <h1 className="font-display text-lg font-bold text-[#e8f0fe]">Mobility Assistance</h1>
                  <p className="text-xs text-[#4a5a7a]">Book a wheelchair or buggy at BLR airport</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Wheelchair card */}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => selectService('wheelchair')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    serviceType === 'wheelchair'
                      ? 'bg-[rgba(59,158,255,0.1)] border-[rgba(59,158,255,0.4)]'
                      : 'bg-[#0d1220] border-[rgba(99,179,255,0.12)] hover:border-[rgba(99,179,255,0.25)]'
                  }`}>
                  <div className="text-2xl mb-2">♿</div>
                  <div className="text-sm font-semibold text-[#e8f0fe]">Wheelchair</div>
                  <div className="text-xs text-[#4a5a7a] mt-1 leading-relaxed">Assisted wheelchair + escort from entrance to gate or aircraft</div>
                  <div className="mt-2 space-y-0.5">
                    <div className="text-[10px] text-[#22c55e]">✓ Free for senior citizens (60+)</div>
                    <div className="text-[10px] text-[#22c55e]">✓ Free for persons with disability</div>
                    <div className="text-[10px] text-[#fbbf24]">🔒 Proof of eligibility required</div>
                  </div>
                </motion.button>

                {/* Golf cart card */}
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => selectService('golf_cart')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    serviceType === 'golf_cart'
                      ? 'bg-[rgba(167,139,250,0.1)] border-[rgba(167,139,250,0.4)]'
                      : 'bg-[#0d1220] border-[rgba(99,179,255,0.12)] hover:border-[rgba(99,179,255,0.25)]'
                  }`}>
                  <div className="text-2xl mb-2">🛺</div>
                  <div className="text-sm font-semibold text-[#e8f0fe]">Buggy</div>
                  <div className="text-xs text-[#4a5a7a] mt-1 leading-relaxed">Electric buggy ride from entrance to your departure gate</div>
                  <div className="mt-2 space-y-0.5">
                    <div className="text-[10px] text-[#22c55e]">✓ Free for senior (60+) / pregnant / disabled</div>
                    <div className="text-[10px] text-[#a78bfa]">₹ ₹1,000 for all other passengers</div>
                    <div className="text-[10px] text-[#fbbf24]">🔒 Proof required for free service</div>
                  </div>
                </motion.button>
              </div>
            </div>

            {/* ── Verified badge ── */}
            {isVerified && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mb-4 px-4 py-3 bg-[rgba(34,197,94,0.06)] border border-[rgba(34,197,94,0.25)] rounded-xl flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div>
                  <div className="text-sm font-semibold text-[#22c55e]">Eligibility Verified — Free Service</div>
                  <div className="text-xs text-[#4a5a7a]">
                    {verification.eligibility_type === 'senior'   ? 'Senior Citizen (60+)'  :
                     verification.eligibility_type === 'pregnant' ? 'Pregnant Woman'        : 'Person with Disability'} ·{' '}
                    {verification.document_type === 'age_verified' ? 'Age verified from profile' :
                     verification.document_type === 'aadhar'      ? 'Aadhar Card' : 'Medical Certificate'} on file
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="wait">

              {/* ── Wheelchair: verification gate ── */}
              {showWheelchairGate && (
                <motion.div key="wc-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <VerificationGate serviceType="wheelchair" onVerified={setVerification} profileDob={profileDob} />
                </motion.div>
              )}

              {/* ── Wheelchair: booking form ── */}
              {showWheelchairForm && (
                <BookingForm key="wc-form" serviceType="wheelchair" chargeAmount={0}
                  onSubmit={handleBooking} submitting={submitting} />
              )}

              {/* ── Golf cart: mode selector ── */}
              {showGolfModeSelect && (
                <motion.div key="gc-mode" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-[#141c2e] border border-[rgba(99,179,255,0.15)] rounded-2xl p-6 mb-5">
                  <h3 className="text-sm font-semibold text-[#e8f0fe] mb-1">How would you like to book?</h3>
                  <p className="text-xs text-[#4a5a7a] mb-4">Choose your booking type for the buggy service.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setGolfCartMode('eligible')}
                      className="p-4 rounded-xl border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.05)] text-left hover:bg-[rgba(34,197,94,0.1)] transition-all">
                      <div className="text-xl mb-2">🎫</div>
                      <div className="text-sm font-semibold text-[#22c55e]">I'm Eligible — Free</div>
                      <div className="text-xs text-[#4a5a7a] mt-1 leading-relaxed">Senior citizen, pregnant, or person with disability. Upload proof to avail free service.</div>
                    </button>
                    <button onClick={() => setGolfCartMode('paid')}
                      className="p-4 rounded-xl border border-[rgba(167,139,250,0.3)] bg-[rgba(167,139,250,0.05)] text-left hover:bg-[rgba(167,139,250,0.1)] transition-all">
                      <div className="text-xl mb-2">💳</div>
                      <div className="text-sm font-semibold text-[#a78bfa]">Pay ₹1,000</div>
                      <div className="text-xs text-[#4a5a7a] mt-1 leading-relaxed">Book the buggy at the standard passenger rate. Quick and hassle-free.</div>
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Golf cart: eligibility verification gate ── */}
              {showGolfVerifGate && (
                <motion.div key="gc-gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-3">
                    <button onClick={() => setGolfCartMode(null)}
                      className="text-xs text-[#4a5a7a] hover:text-[#8899bb] transition-colors flex items-center gap-1">
                      ← Back to booking options
                    </button>
                  </div>
                  <VerificationGate serviceType="golf_cart" onVerified={v => { setVerification(v); }} profileDob={profileDob} />
                </motion.div>
              )}

              {/* ── Golf cart: payment confirmation ── */}
              {showGolfPayment && (
                <motion.div key="gc-pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="mb-3">
                    <button onClick={() => setGolfCartMode(null)}
                      className="text-xs text-[#4a5a7a] hover:text-[#8899bb] transition-colors flex items-center gap-1">
                      ← Back to booking options
                    </button>
                  </div>
                  <PaymentConfirm onConfirm={() => setGolfCartPaid(true)} />
                </motion.div>
              )}

              {/* ── Golf cart: booking form (free or paid) ── */}
              {showGolfForm && (
                <BookingForm key="gc-form" serviceType="golf_cart" chargeAmount={resolveCharge()}
                  onSubmit={handleBooking} submitting={submitting} />
              )}

            </AnimatePresence>

            {/* ── My bookings ── */}
            {(loadingBookings || bookings.length > 0) && (
              <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.12)] rounded-xl p-5">
                <h3 className="text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-3">My Bookings</h3>
                {loadingBookings ? (
                  <div className="space-y-3">
                    {[0,1].map(i => <div key={i} className="h-16 bg-[#0d1220] rounded-xl animate-pulse" />)}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookings.map(b => <BookingCard key={b.id || b.booking_ref} booking={b} onCancel={handleCancel} />)}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
