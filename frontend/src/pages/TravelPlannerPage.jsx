import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { travelAPI, flightAPI } from '../services/api';
import toast from 'react-hot-toast';

const BUFFER = {
  domestic: {
    checkin_before: 120,
    checkin_duration: 20,
    baggage_duration: 10,
    security_duration: 25,
    gate_walk: 10,
    board_before: 20,
  },
  international: {
    checkin_before: 180,
    checkin_duration: 25,
    baggage_duration: 15,
    security_duration: 30,
    immigration_duration: 25,
    gate_walk: 15,
    board_before: 30,
  },
};

// All Indian airport IATA codes — anything else is international
const INDIA_AIRPORTS = new Set([
  'DEL','BOM','MAA','HYD','CCU','BLR','COK','AMD','PNQ','JAI','IXC','VTZ','BBI','TRV',
  'IXM','GOI','LKO','NAG','VNS','PAT','GAU','IXJ','IXL','IXD','IXE','IXB','IXA','IXR',
  'IXS','IXU','RPR','BHO','IDR','UDR','JDH','JSA','CJB','TRZ','SHL','IMF','IXN','IXV',
  'IXH','IXI','IXG','IXK','IXP','IXW','IXY','IXZ','IXT','BDQ','ATQ','KNU','PNQ','VGA',
]);

function isInternational(arrivalAirport) {
  if (!arrivalAirport) return false;
  return !INDIA_AIRPORTS.has(arrivalAirport.toUpperCase());
}

function addMin(base, mins) {
  return new Date(base.getTime() + mins * 60000);
}

function fmtTime(d) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

function buildTimeline(departureISO, travelMin, flightType) {
  const dep = new Date(departureISO);
  const buf = BUFFER[flightType];
  const arriveAirport = addMin(dep, -(buf.checkin_before));
  const leaveHome = addMin(arriveAirport, -(travelMin + 15));

  const steps = [
    { icon: '🏠', label: 'Leave Home', time: leaveHome, sub: `Allow ${travelMin} min drive + 15 min buffer`, highlight: true },
    { icon: '✈', label: 'Arrive at Airport', time: arriveAirport, sub: 'Head to check-in counters' },
    { icon: '🎫', label: 'Check-in', time: arriveAirport, duration: buf.checkin_duration, sub: `~${buf.checkin_duration} min` },
    { icon: '🧳', label: 'Baggage Drop', time: addMin(arriveAirport, buf.checkin_duration), duration: buf.baggage_duration, sub: `~${buf.baggage_duration} min` },
  ];

  let cursor = addMin(arriveAirport, buf.checkin_duration + buf.baggage_duration);

  if (flightType === 'international') {
    steps.push({ icon: '🛂', label: 'Immigration', time: cursor, duration: buf.immigration_duration, sub: `~${buf.immigration_duration} min — have passport ready` });
    cursor = addMin(cursor, buf.immigration_duration);
  }

  steps.push({ icon: '🔒', label: 'Security Check', time: cursor, duration: buf.security_duration, sub: `~${buf.security_duration} min — remove laptops & liquids` });
  cursor = addMin(cursor, buf.security_duration);

  steps.push({ icon: '🚶', label: 'Walk to Gate', time: cursor, duration: buf.gate_walk, sub: `~${buf.gate_walk} min to your gate` });
  cursor = addMin(cursor, buf.gate_walk);

  steps.push({ icon: '🚪', label: 'Boarding Opens', time: addMin(dep, -buf.board_before), sub: 'Be at gate by this time' });
  steps.push({ icon: '🛫', label: 'Departure', time: dep, sub: 'Scheduled departure', highlight: true });

  return steps;
}

export default function TravelPlannerPage() {
  const navigate = useNavigate();
  const [origin, setOrigin] = useState('');
  const [gpsCoords, setGpsCoords] = useState(null); // { lat, lng, label }
  const [gpsLoading, setGpsLoading] = useState(false);
  const [flightIata, setFlightIata] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setGpsCoords({ lat: latitude, lng: longitude, label: 'Current Location (GPS)' });
        setOrigin('');
        setGpsLoading(false);
        toast.success('Location detected — GPS coordinates locked');
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location permission denied — please type your address instead');
        } else {
          toast.error('Could not detect location — please type your address');
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  function clearGps() {
    setGpsCoords(null);
  }

  async function handleCalculate() {
    const hasGps = !!gpsCoords;
    if (!hasGps && !origin.trim()) { toast.error('Please enter your address or use GPS location'); return; }
    if (!flightIata.trim()) { toast.error('Please enter a flight number'); return; }

    setLoading(true);
    setResult(null);
    try {
      let flightInfo, departureISO, flightType;
      try {
        const fRes = await flightAPI.search(flightIata.trim().toUpperCase());
        flightInfo = fRes.data.flight || fRes.data;
        departureISO = flightInfo.scheduled_departure || flightInfo.estimated_departure;
        flightType = isInternational(flightInfo.arrival_airport) ? 'international' : 'domestic';
      } catch {
        toast.error(`Flight ${flightIata.trim().toUpperCase()} not found on the live board`);
        setLoading(false);
        return;
      }

      if (!departureISO) {
        toast.error('Departure time not available for this flight');
        setLoading(false);
        return;
      }

      // Use GPS coords if available, otherwise text address.
      // Pass departure_iso + flightType so backend can predict traffic at actual drive time.
      let travelRes;
      if (hasGps) {
        travelRes = await travelAPI.getTimeByCoords(gpsCoords.lat, gpsCoords.lng, gpsCoords.label, departureISO, flightType);
      } else {
        travelRes = await travelAPI.getTime(origin.trim(), departureISO, flightType);
      }
      const { travel_time_minutes, distance_km, source, note, traffic_delay_minutes, resolved_address, depart_at } = travelRes.data;

      const timeline = buildTimeline(departureISO, travel_time_minutes, flightType);
      setResult({ travel_time_minutes, distance_km, source, note, traffic_delay_minutes, resolved_address, depart_at, timeline, flightInfo, departureISO, flightType });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || '';
      if (msg.toLowerCase().includes('origin') || err.response?.status === 400) {
        toast.error('Travel lookup failed — please restart the backend and try again');
      } else {
        toast.error('Failed to calculate — please try again');
      }
      console.error('[TravelPlanner]', err.response?.status, msg, err);
    } finally {
      setLoading(false);
    }
  }

  const sourceLabel = result?.source === 'tomtom_predicted' ? 'Predicted traffic'
                    : result?.source === 'tomtom_live'      ? 'Live traffic'
                    : 'Area estimate';
  const sourceColor = (result?.source === 'tomtom_live' || result?.source === 'tomtom_predicted')
                    ? '#22c55e' : '#f59e0b';

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
        <span className="text-xs font-mono text-[#8899bb]">Travel Planner</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl p-6 mb-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[rgba(59,158,255,0.1)] border border-[rgba(59,158,255,0.22)] flex items-center justify-center text-xl">🗺️</div>
          <div>
            <h1 className="font-display text-lg font-bold text-[#e8f0fe]">Airport Travel Planner</h1>
            <p className="text-xs text-[#4a5a7a]">Real-time drive time + personalised airport timeline for BLR</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a]">Your Location / Full Address</label>
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={gpsLoading}
                className="flex items-center gap-1.5 text-[11px] font-medium text-[#63b3ff] hover:text-[#93c5fd] disabled:opacity-50 transition-colors">
                {gpsLoading ? (
                  <span className="w-3 h-3 border border-[#63b3ff] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span>📍</span>
                )}
                {gpsLoading ? 'Detecting...' : 'Use my location'}
              </button>
            </div>

            {gpsCoords ? (
              <div className="flex items-center gap-2 bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-lg px-4 py-2.5">
                <span className="text-base flex-shrink-0">📍</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#22c55e] font-medium">GPS Location Locked</div>
                  <div className="text-[10px] text-[#4a5a7a] font-mono">{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</div>
                </div>
                <button onClick={clearGps} className="text-[#4a5a7a] hover:text-[#ef4444] text-xs transition-colors flex-shrink-0">✕</button>
              </div>
            ) : (
              <input
                value={origin}
                onChange={e => setOrigin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCalculate()}
                placeholder="e.g. 123 Indiranagar 100 Feet Road, Bengaluru"
                className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-4 py-2.5 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors"
              />
            )}
            <p className="text-[10px] text-[#4a5a7a] mt-1">
              {gpsCoords ? 'GPS gives the most accurate live traffic route' : 'Enter a full address for best accuracy, or click "Use my location" for GPS'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-1.5">Flight Number *</label>
            <input
              value={flightIata}
              onChange={e => setFlightIata(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleCalculate()}
              placeholder="e.g. 6E345, AI502, EK568"
              className="w-full bg-[#0d1220] border border-[rgba(99,179,255,0.15)] rounded-lg px-4 py-2.5 text-sm text-[#e8f0fe] placeholder-[#3a4a6a] focus:outline-none focus:border-[rgba(59,158,255,0.45)] transition-colors font-mono"
            />
            <p className="text-[10px] text-[#4a5a7a] mt-1">Must be a flight currently on the live board</p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleCalculate}
            disabled={loading}
            className="w-full py-2.5 bg-[rgba(59,158,255,0.15)] border border-[rgba(59,158,255,0.35)] rounded-lg text-sm font-semibold text-[#63b3ff] hover:bg-[rgba(59,158,255,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border border-[#63b3ff] border-t-transparent rounded-full animate-spin" />
                Looking up flight...
              </span>
            ) : 'Calculate My Journey →'}
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {result && (
          <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

            {/* Flight info card */}
            {result.flightInfo && (
              <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.15)] rounded-xl p-4 mb-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#111828] border border-[rgba(99,179,255,0.18)] flex items-center justify-center text-[13px] font-mono font-bold text-[#63b3ff] flex-shrink-0">
                  {(result.flightInfo.airline_iata || '??').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-white">{result.flightInfo.flight_iata}</span>
                    <span className="text-xs text-[#8899bb]">{result.flightInfo.airline_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${result.flightType === 'international' ? 'text-[#a78bfa] border-[rgba(167,139,250,0.3)] bg-[rgba(167,139,250,0.08)]' : 'text-[#22c55e] border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)]'}`}>
                      {result.flightType === 'international' ? 'International' : 'Domestic'}
                    </span>
                  </div>
                  <div className="text-xs text-[#4a5a7a] mt-0.5">
                    BLR → {result.flightInfo.arrival_airport} · Dep {new Date(result.departureISO).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })} IST
                  </div>
                </div>
              </div>
            )}

            {/* Drive summary card */}
            <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.15)] rounded-xl p-5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-[#4a5a7a]">Drive to BLR Airport</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border" style={{ color: sourceColor, borderColor: sourceColor + '44' }}>
                  {sourceLabel}
                </span>
              </div>
              <div className="flex items-end gap-6">
                <div>
                  <div className="text-4xl font-display font-extrabold text-[#63b3ff]">{result.travel_time_minutes}</div>
                  <div className="text-xs text-[#4a5a7a] mt-0.5">minutes</div>
                </div>
                <div>
                  <div className="text-2xl font-display font-bold text-[#8899bb]">{result.distance_km} km</div>
                  <div className="text-xs text-[#4a5a7a] mt-0.5">distance</div>
                </div>
                {result.traffic_delay_minutes > 0 && (
                  <div className="ml-auto text-right">
                    <div className="text-sm font-mono text-[#f59e0b]">+{result.traffic_delay_minutes} min</div>
                    <div className="text-xs text-[#4a5a7a]">traffic delay</div>
                  </div>
                )}
              </div>
              {result.resolved_address && (
                <div className="mt-2 text-xs text-[#4a5a7a] truncate">From: {result.resolved_address}</div>
              )}
              {result.depart_at && (
                <div className="mt-1 text-[11px] text-[#22c55e]">
                  Traffic predicted for{' '}
                  {new Date(result.depart_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
                  })}{' '}
                  IST — when you'll actually be driving
                </div>
              )}
              {result.note && (
                <div className="mt-2 text-[10px] text-[#f59e0b] bg-[rgba(245,158,11,0.08)] rounded px-2 py-1">{result.note}</div>
              )}
            </div>

            {/* Timeline */}
            <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.15)] rounded-xl p-5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-[#4a5a7a] mb-4">Your Airport Timeline</h3>
              <div className="flex flex-col">
                {result.timeline.map((step, i) => (
                  <div key={i} className="flex gap-3 pb-4">
                    <div className="flex flex-col items-center w-8">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                        step.highlight ? 'bg-[rgba(59,158,255,0.15)] border border-[rgba(59,158,255,0.4)]' : 'bg-[#1a2540] border border-[rgba(99,179,255,0.12)]'
                      }`}>
                        {step.icon}
                      </div>
                      {i < result.timeline.length - 1 && (
                        <div className="flex-1 w-px bg-[rgba(99,179,255,0.1)] mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${step.highlight ? 'text-[#63b3ff]' : 'text-[#e8f0fe]'}`}>
                          {step.label}
                        </span>
                        <span className="font-mono text-sm text-[#8899bb] ml-auto">{fmtTime(step.time)}</span>
                      </div>
                      <div className="text-xs text-[#4a5a7a] mt-0.5">{step.sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-4 border-t border-[rgba(99,179,255,0.08)] flex items-start gap-2">
                <span className="text-base">💡</span>
                <p className="text-xs text-[#6677aa]">
                  {result.flightType === 'international'
                    ? 'International flights require valid passport + visa. Immigration can take longer during peak hours.'
                    : 'Domestic flights — carry a valid photo ID. Web check-in saves queue time at the airport.'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
