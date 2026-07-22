// =====================================================
// RadarPage — Real-time aircraft tracking with Leaflet
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { radarAPI, flightAPI } from '../services/api';

const BLR_CENTER = [13.1986, 77.7066];
const DEFAULT_ZOOM = 9;
const RADAR_REFRESH_MS = 15000;
const BOARD_REFRESH_MS = 60000;

// ── Airport coordinates for route interpolation ───────────────────────────────
const AIRPORT_COORDS = {
  BLR:[13.1986,77.7066], DEL:[28.5665,77.1031], BOM:[19.0896,72.8656],
  MAA:[12.9941,80.1709], HYD:[17.2313,78.4298], CCU:[22.6520,88.4463],
  GOI:[15.3808,73.8314], COK:[10.1520,76.3919], AMD:[23.0770,72.6347],
  PNQ:[18.5822,73.9197], JAI:[26.8242,75.8122], IXC:[30.6735,76.7885],
  VTZ:[17.7212,83.2245], BBI:[20.2444,85.8178], TRV:[8.4782,76.9201],
  IXM:[9.8348,78.0933],  DXB:[25.2532,55.3657], DOH:[25.2731,51.6082],
  SIN:[1.3644,103.9915], LHR:[51.4775,-0.4614], FRA:[50.0379,8.5622],
  CDG:[49.0097,2.5479],  AUH:[24.4330,54.6511], KUL:[2.7456,101.7099],
  BKK:[13.6811,100.7472],HKG:[22.3080,113.9185],NRT:[35.7720,140.3929],
  SFO:[37.6213,-122.379],JFK:[40.6413,-73.7781], RUH:[24.9578,46.6989],
  JED:[21.6796,39.1565], KWI:[29.2267,47.9689], BAH:[26.2708,50.6336],
  MCT:[23.5933,58.2844], PEK:[40.0799,116.603], PVG:[31.1443,121.808],
  SYD:[-33.939,151.175], MEL:[-37.673,144.843], JNB:[-26.137,28.242],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  const t = date.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Kolkata' });
  const h = parseInt(new Intl.DateTimeFormat('en-IN',{hour:'numeric',hour12:false,timeZone:'Asia/Kolkata'}).format(date));
  return `${t} ${h < 12 ? 'AM' : 'PM'}`;
}

/** True bearing from point A to point B (degrees) */
function computeHeading(fromLat, fromLng, toLat, toLng) {
  const dLon = (toLng - fromLng) * Math.PI / 180;
  const lat1 = fromLat * Math.PI / 180;
  const lat2 = toLat  * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/** Linear lat/lng interpolation at progress 0→1 */
function interpolatePosition(fromLat, fromLng, toLat, toLng, progress) {
  const p = Math.max(0, Math.min(1, progress));
  return { lat: fromLat + (toLat - fromLat) * p, lng: fromLng + (toLng - fromLng) * p };
}

/** For ADS-B aircraft: extrapolate position based on speed + heading */
function extrapolatePosition(lat, lng, speedKmh, headingDeg, elapsedSec) {
  if (!speedKmh || !headingDeg) return { lat, lng };
  const speedKms = speedKmh / 3600;
  const rad = headingDeg * Math.PI / 180;
  const dlat = (speedKms * Math.cos(rad)) / 111;
  const dlng = (speedKms * Math.sin(rad)) / (111 * Math.cos(lat * Math.PI / 180));
  return { lat: lat + dlat * elapsedSec, lng: lng + dlng * elapsedSec };
}

/** Haversine distance in km between two lat/lng points */
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format decimal degrees to readable coordinate string */
function fmtCoord(lat, lng) {
  return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
}

/**
 * Compute current position + motion data for an in-flight board flight.
 * Returns null if position cannot be determined.
 * Clamps slightly out-of-range progress values that arise when serving
 * stale cached data (e.g. AeroDataBox 2-hour cache).
 */
function computeBoardFlightPos(f) {
  const depTs  = f.actual_departure || f.estimated_departure || f.scheduled_departure;
  const arrTs  = f.estimated_arrival || f.scheduled_arrival;
  if (!depTs || !arrTs) return null;

  const depMs  = new Date(depTs).getTime();
  const arrMs  = new Date(arrTs).getTime();
  const nowMs  = Date.now();
  const durMs  = arrMs - depMs;
  if (durMs <= 0) return null;

  let progress = (nowMs - depMs) / durMs;

  // Clamp for stale cache — flight is still marked 'active' but timestamps
  // are slightly off (e.g. a 2-hour-old AeroDataBox cache).
  if (progress < 0) {
    if (progress < -0.25) return null; // clearly hasn't departed yet
    progress = 0.05;                   // just lifted off
  }
  if (progress > 1) {
    if (progress > 2.5) return null;   // well past arrival, truly landed
    progress = 0.92;                   // near destination, still shown in-flight
  }

  const from = AIRPORT_COORDS[f.departure_airport] || AIRPORT_COORDS['BLR'];
  const to   = AIRPORT_COORDS[f.arrival_airport];
  if (!to) return null;

  const pos     = interpolatePosition(from[0], from[1], to[0], to[1], progress);
  const heading = computeHeading(from[0], from[1], to[0], to[1]);

  // Degrees per second of movement (for animation frame)
  const dlatPerSec = (to[0] - from[0]) / (durMs / 1000);
  const dlngPerSec = (to[1] - from[1]) / (durMs / 1000);

  return { lat: pos.lat, lng: pos.lng, heading, dlatPerSec, dlngPerSec, computedAt: nowMs };
}

// ── Icon builders ─────────────────────────────────────────────────────────────
function buildAircraftIconHtml(ac, isTracked, isSearched) {
  let color = '#22c55e';
  if (isSearched)        color = '#00e5ff';
  else if (isTracked)    color = '#f59e0b';
  else if (ac.altitude > 30000) color = '#ef4444';
  else if (ac.altitude > 15000) color = '#f59e0b';
  else if (ac.altitude > 5000)  color = '#3b9eff';

  const rotation = ac.heading || 0;
  const size = isSearched ? '22px' : isTracked ? '20px' : '14px';
  const glow = isSearched
    ? `drop-shadow(0 0 12px ${color}) drop-shadow(0 0 6px ${color})`
    : isTracked ? `drop-shadow(0 0 8px ${color})` : `drop-shadow(0 0 3px ${color})`;

  const pulse = isSearched
    ? `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:38px;height:38px;border:2.5px solid ${color};border-radius:50%;opacity:0.5;animation:radarPulse 1.2s ease-out infinite;pointer-events:none;"></span>
       <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;border:1.5px solid ${color};border-radius:50%;opacity:0.3;animation:radarPulse 1.2s ease-out 0.4s infinite;pointer-events:none;"></span>`
    : isTracked
      ? `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:32px;height:32px;border:2px solid ${color};border-radius:50%;opacity:0.4;animation:radarPulse 1.6s ease-out infinite;pointer-events:none;"></span>`
      : '';

  const w = isSearched ? '30px' : '24px';
  return `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${w};height:${w};">
    ${pulse}
    <div style="transform:rotate(${rotation}deg);color:${color};font-size:${size};filter:${glow};cursor:pointer;position:relative;z-index:1;">▲</div>
  </div>`;
}

/** Board flight icon: in-flight (moving arrow) */
function buildBoardActiveIconHtml(heading, isSearched) {
  const color = isSearched ? '#00e5ff' : '#f59e0b';
  const pulse = isSearched
    ? `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:38px;height:38px;border:2.5px solid ${color};border-radius:50%;opacity:0.5;animation:radarPulse 1.2s ease-out infinite;pointer-events:none;"></span>
       <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:56px;height:56px;border:1.5px solid ${color};border-radius:50%;opacity:0.3;animation:radarPulse 1.2s ease-out 0.4s infinite;pointer-events:none;"></span>`
    : `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;border:1.5px solid ${color};border-radius:50%;opacity:0.45;animation:radarPulse 1.8s ease-out infinite;pointer-events:none;"></span>`;
  return `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:24px;height:24px;">
    ${pulse}
    <div style="transform:rotate(${heading || 0}deg);color:${color};font-size:18px;filter:drop-shadow(0 0 8px ${color});cursor:pointer;position:relative;z-index:1;">▲</div>
  </div>`;
}

/** Board flight icon: ground / scheduled */
function buildGroundIconHtml(isSearched) {
  const color = isSearched ? '#00e5ff' : '#a78bfa';
  const pulse = isSearched
    ? `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border:2px solid ${color};border-radius:50%;opacity:0.5;animation:radarPulse 1.2s ease-out infinite;pointer-events:none;"></span>
       <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:42px;height:42px;border:1.5px solid ${color};border-radius:50%;opacity:0.3;animation:radarPulse 1.2s ease-out 0.4s infinite;pointer-events:none;"></span>`
    : `<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;border:1.5px solid ${color};border-radius:50%;opacity:0.45;animation:radarPulse 2s ease-out infinite;pointer-events:none;"></span>`;
  return `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:20px;height:20px;">
    ${pulse}
    <div style="color:${color};font-size:11px;filter:drop-shadow(0 0 4px ${color});cursor:pointer;position:relative;z-index:1;">✈</div>
  </div>`;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RadarPage() {
  const navigate = useNavigate();
  const mapRef        = useRef(null);
  const mapInstance   = useRef(null);
  const markersLayer  = useRef(null);
  const markerDataRef = useRef({});
  const animFrameRef  = useRef(null);
  const fetchTimeRef  = useRef(Date.now());

  const [aircraft, setAircraft]           = useState([]);
  const [boardFlights, setBoardFlights]   = useState([]);
  const [selectedAircraft, setSelectedAircraft] = useState(null);
  const [lastUpdated, setLastUpdated]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [altFilter, setAltFilter]         = useState('all');
  const [trackedOnly, setTrackedOnly]     = useState(false);
  const [mapReady, setMapReady]           = useState(false);
  const [stats, setStats]                 = useState({ total: 0, tracked: 0 });

  const [searchQuery, setSearchQuery]       = useState('');
  const [searchedKey, setSearchedKey]       = useState(null);
  const [searchResult, setSearchResult]     = useState(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [livePos, setLivePos]               = useState(null); // { lat, lng, progress? }
  const [copiedCoords, setCopiedCoords]     = useState(false);

  // ── Leaflet load ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('radar-styles')) {
      const style = document.createElement('style');
      style.id = 'radar-styles';
      style.textContent = `
        @keyframes radarPulse {
          0%   { transform:translate(-50%,-50%) scale(0.8); opacity:0.6; }
          100% { transform:translate(-50%,-50%) scale(2.2); opacity:0; }
        }
        .leaflet-popup-content-wrapper {
          background:#141c2e!important; border:1px solid rgba(99,179,255,0.22)!important;
          border-radius:8px!important; color:#e8f0fe!important;
        }
        .leaflet-popup-tip { background:#141c2e!important; }
      `;
      document.head.appendChild(style);
    }
    if (window.L) { setMapReady(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(link); document.head.removeChild(script); } catch {} };
  }, []);

  // ── Init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstance.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { center: BLR_CENTER, zoom: DEFAULT_ZOOM, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const airportIcon = L.divIcon({ className: '',
      html: `<div style="width:24px;height:24px;background:rgba(59,158,255,0.3);border:2px solid #3b9eff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;box-shadow:0 0 20px rgba(59,158,255,0.4)">✈</div>`,
      iconSize:[24,24], iconAnchor:[12,12] });
    L.marker(BLR_CENTER, { icon: airportIcon }).addTo(map).bindPopup('<b>BLR / VOBL</b><br>Kempegowda International Airport');
    L.circle(BLR_CENTER, { radius:55500, color:'rgba(59,158,255,0.3)', fillColor:'rgba(59,158,255,0.05)', weight:1, dashArray:'5,5' }).addTo(map);
    L.polyline([[13.2020,77.6920],[13.1950,77.7210]], { color:'#3b9eff', weight:3, opacity:0.7 }).addTo(map);
    L.polyline([[13.2060,77.6940],[13.1990,77.7230]], { color:'#3b9eff', weight:3, opacity:0.7 }).addTo(map);
    markersLayer.current = L.layerGroup().addTo(map);
    mapInstance.current  = map;
  }, [mapReady]);

  // ── Fetch radar ────────────────────────────────────────────────────────────
  const fetchRadar = useCallback(async () => {
    try {
      const res = await radarAPI.getData({ altitude: altFilter !== 'all' ? altFilter : undefined });
      setAircraft(res.data.aircraft || []);
      setLastUpdated(res.data.lastUpdated);
      setStats({ total: res.data.total || 0, tracked: res.data.tracked || 0 });
      fetchTimeRef.current = Date.now();
    } catch (err) { console.error('Radar fetch error:', err); }
    finally { setLoading(false); }
  }, [altFilter]);

  useEffect(() => { fetchRadar(); }, [fetchRadar]);
  useEffect(() => { const t = setInterval(fetchRadar, RADAR_REFRESH_MS); return () => clearInterval(t); }, [fetchRadar]);

  // ── Fetch board flights ────────────────────────────────────────────────────
  const fetchBoardFlights = useCallback(async () => {
    try {
      const [deps, arrs] = await Promise.all([
        flightAPI.getFlights({ type: 'departure' }),
        flightAPI.getFlights({ type: 'arrival' }),
      ]);
      // Only show active (in-flight) flights freely on radar.
      // For scheduled flights, limit to those departing/arriving within 90 min
      // to avoid a massive purple ground cluster near BLR from cached data.
      const now = Date.now();
      const SOON_MS = 90 * 60 * 1000; // 90 minutes

      const allDeps = (deps.data.flights || []).map(f => ({ ...f, flightType: 'departure' }));
      const allArrs = (arrs.data.flights || []).map(f => ({ ...f, flightType: 'arrival' }));
      const all = [...allDeps, ...allArrs];

      const active = all.filter(f => f.status === 'active');
      const scheduled = all.filter(f => {
        if (f.status !== 'scheduled') return false;
        const ts = f.scheduled_departure || f.scheduled_arrival;
        if (!ts) return false;
        const diff = new Date(ts).getTime() - now;
        return diff > -10 * 60 * 1000 && diff < SOON_MS; // 10 min past to 90 min ahead
      });

      setBoardFlights([...active, ...scheduled]);
    } catch (e) { console.error('Board flights fetch error:', e); }
  }, []);

  useEffect(() => { fetchBoardFlights(); }, [fetchBoardFlights]);
  useEffect(() => { const t = setInterval(fetchBoardFlights, BOARD_REFRESH_MS); return () => clearInterval(t); }, [fetchBoardFlights]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    function animate() {
      const adsbElapsed = (Date.now() - fetchTimeRef.current) / 1000;
      Object.values(markerDataRef.current).forEach(({ marker, ac }) => {
        if (ac.acType === 'board-active') {
          // Interpolated board flight — drift using precomputed per-second deltas
          const elapsed = (Date.now() - ac.computedAt) / 1000;
          marker.setLatLng([
            ac.latitude  + ac.dlatPerSec * elapsed,
            ac.longitude + ac.dlngPerSec * elapsed,
          ]);
        } else if (!ac.onGround && ac.speed && ac.heading) {
          // ADS-B aircraft
          const pos = extrapolatePosition(ac.latitude, ac.longitude, ac.speed, ac.heading, adsbElapsed);
          marker.setLatLng([pos.lat, pos.lng]);
        }
      });
      animFrameRef.current = requestAnimationFrame(animate);
    }
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [mapReady]);

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim().toUpperCase().replace(/\s/g, '');
    if (!q) { setSearchedKey(null); setSearchResult(null); setSearchNotFound(false); return; }

    // Priority 1: ADS-B aircraft currently on radar
    const foundAc = aircraft.find(ac => {
      const cs   = (ac.callsign || '').replace(/\s/g,'').toUpperCase();
      const iata = (ac.flightDetails?.flight_iata || '').replace(/\s/g,'').toUpperCase();
      return cs === q || iata === q || cs.includes(q) || iata.includes(q);
    });
    if (foundAc) {
      const key = `adsb_${foundAc.icao24}`;
      setSearchedKey(key); setSearchResult({ type: 'adsb', ac: foundAc, flight: foundAc.flightDetails }); setSearchNotFound(false);
      if (mapInstance.current) mapInstance.current.flyTo([foundAc.latitude, foundAc.longitude], 11, { duration: 1.5 });
      setSelectedAircraft(null); return;
    }

    // Priority 2: Board flights already loaded on radar (active + within 90 min)
    const foundBoard = boardFlights.find(f => {
      const iata = (f.flight_iata || '').replace(/\s/g,'').toUpperCase();
      return iata === q || iata.includes(q);
    });
    if (foundBoard) {
      const key = `board_${foundBoard.flight_iata}`;
      setSearchedKey(key); setSearchResult({ type: 'board', flight: foundBoard }); setSearchNotFound(false);
      const entry = markerDataRef.current[key];
      if (entry && mapInstance.current) {
        const ll = entry.marker.getLatLng();
        mapInstance.current.flyTo([ll.lat, ll.lng], 12, { duration: 1.5 });
      }
      setSelectedAircraft(null); return;
    }

    // Priority 3: Full flight database search (covers landed, cancelled, far-range active)
    try {
      const res = await flightAPI.search(q);
      const f = res.data?.flight || res.data;
      if (f && f.flight_iata) {
        const key = `board_${f.flight_iata}`;
        setSearchedKey(key);
        setSearchResult({ type: 'board', flight: { ...f, flightType: f.departure_airport === 'BLR' ? 'departure' : 'arrival' } });
        setSearchNotFound(false);
        // Pan map to estimated position if possible
        const pos = computeBoardFlightPos(f);
        if (pos && mapInstance.current) {
          mapInstance.current.flyTo([pos.lat, pos.lng], 6, { duration: 1.5 });
        } else {
          // Pan to BLR for ground/unknown
          const depCoords = AIRPORT_COORDS[f.departure_airport] || BLR_CENTER;
          if (mapInstance.current) mapInstance.current.flyTo(depCoords, 8, { duration: 1.5 });
        }
        setSelectedAircraft(null); return;
      }
    } catch { /* fall through to not-found */ }

    setSearchedKey(null); setSearchResult(null); setSearchNotFound(true);
    setTimeout(() => setSearchNotFound(false), 3000);
  }, [searchQuery, aircraft, boardFlights]);

  const clearSearch = () => {
    setSearchQuery(''); setSearchedKey(null); setSearchResult(null); setSearchNotFound(false);
    if (mapInstance.current) mapInstance.current.flyTo(BLR_CENTER, DEFAULT_ZOOM, { duration: 1.2 });
  };

  useEffect(() => { if (searchedKey && searchQuery) handleSearch(); }, [aircraft]);

  // ── Live position tracker ──────────────────────────────────────────────────
  useEffect(() => {
    if (!searchResult && !selectedAircraft) { setLivePos(null); return; }

    function tick() {
      if (searchResult?.type === 'adsb' && searchResult.ac) {
        const ac = searchResult.ac;
        const elapsed = (Date.now() - fetchTimeRef.current) / 1000;
        const pos = (!ac.onGround && ac.speed && ac.heading)
          ? extrapolatePosition(ac.latitude, ac.longitude, ac.speed, ac.heading, elapsed)
          : { lat: ac.latitude, lng: ac.longitude };
        setLivePos({ lat: pos.lat, lng: pos.lng, live: true });

      } else if (searchResult?.type === 'board') {
        const f = searchResult.flight;
        if (f.status === 'active') {
          const base = computeBoardFlightPos(f);
          if (base) {
            const elapsed = (Date.now() - base.computedAt) / 1000;
            const lat = base.lat + base.dlatPerSec * elapsed;
            const lng = base.lng + base.dlngPerSec * elapsed;
            const depMs = new Date(f.actual_departure || f.estimated_departure || f.scheduled_departure).getTime();
            const arrMs = new Date(f.estimated_arrival || f.scheduled_arrival).getTime();
            const progress = Math.max(0, Math.min(1, (Date.now() - depMs) / (arrMs - depMs)));
            setLivePos({ lat, lng, live: false, isGround: false, progress });
          }
        } else {
          // Ground / scheduled / landed — show the airport the aircraft is currently at.
          // Departures: aircraft is at the departure airport (BLR).
          // Arrivals  : aircraft is at its origin airport until it departs.
          const depCoords = AIRPORT_COORDS[f.departure_airport];
          const coords = (f.flightType === 'departure')
            ? (depCoords || BLR_CENTER)
            : (depCoords || BLR_CENTER);
          setLivePos({ lat: coords[0], lng: coords[1], live: false, isGround: true });
        }

      } else if (selectedAircraft) {
        const ac = selectedAircraft;
        const elapsed = (Date.now() - fetchTimeRef.current) / 1000;
        const pos = (!ac.onGround && ac.speed && ac.heading)
          ? extrapolatePosition(ac.latitude, ac.longitude, ac.speed, ac.heading, elapsed)
          : { lat: ac.latitude, lng: ac.longitude };
        setLivePos({ lat: pos.lat, lng: pos.lng, live: true });
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [searchResult, selectedAircraft]);

  // ── Rebuild markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current || !window.L) return;
    const L = window.L;
    const seenKeys = new Set();

    // 1. ADS-B aircraft
    const displayed = trackedOnly ? aircraft.filter(a => a.isTracked) : aircraft;
    displayed.forEach(ac => {
      const key        = `adsb_${ac.icao24}`;
      const isSearched = key === searchedKey;
      seenKeys.add(key);

      const html = buildAircraftIconHtml(ac, ac.isTracked, isSearched);
      const icon = L.divIcon({ className:'', html, iconSize: isSearched ? [30,30] : [24,24], iconAnchor: isSearched ? [15,15] : [12,12] });

      const acClickHandler = () => {
        if (ac.flightDetails?.flight_iata) {
          setSearchResult({ type: 'adsb', ac, flight: ac.flightDetails });
          setSearchedKey(key);
          setSelectedAircraft(null);
        } else {
          setSelectedAircraft(ac);
        }
      };
      if (markerDataRef.current[key]) {
        markerDataRef.current[key].marker.setIcon(icon);
        markerDataRef.current[key].marker.off('click').on('click', acClickHandler);
        markerDataRef.current[key].ac = ac;
      } else {
        const marker = L.marker([ac.latitude, ac.longitude], { icon });
        marker.on('click', acClickHandler);
        marker.addTo(markersLayer.current);
        markerDataRef.current[key] = { marker, ac };
      }
    });

    // 2. Board flights
    const adsbCallsigns = new Set(
      aircraft.map(a => (a.flightDetails?.flight_iata || '').replace(/\s/g,'').toUpperCase()).filter(Boolean)
    );

    const visibleGroundFlights = boardFlights
      .filter(f => f.status !== 'active' && f.status !== 'cancelled')
      .sort((a, b) => {
        const ta = new Date(a.scheduled_departure || a.scheduled_arrival || 0).getTime();
        const tb = new Date(b.scheduled_departure || b.scheduled_arrival || 0).getTime();
        return ta - tb;
      })
      .slice(0, 8);
    const visibleGroundKeys = new Set(visibleGroundFlights.map(f => `board_${f.flight_iata}`));

    // Group board flights: active (in-flight) get moving markers; rest get ground markers
    let groundIndex = 0;
    boardFlights.forEach(f => {
      const iata = (f.flight_iata || '').replace(/\s/g,'').toUpperCase();
      if (!iata || adsbCallsigns.has(iata)) return; // already shown as ADS-B

      const key        = `board_${f.flight_iata}`;
      const isSearched = key === searchedKey;
      const isGroundVisible = f.status === 'active' || isSearched || visibleGroundKeys.has(key);

      // ── Try to show active flights at interpolated in-flight positions ──
      if (f.status === 'active') {
        const pos = computeBoardFlightPos(f);
        if (pos) {
          seenKeys.add(key);
          // Successfully computed position — show amber moving marker
          const html = buildBoardActiveIconHtml(pos.heading, isSearched);
          const icon = L.divIcon({ className:'', html, iconSize:[24,24], iconAnchor:[12,12] });

          const acData = {
            acType: 'board-active',
            latitude: pos.lat, longitude: pos.lng,
            heading: pos.heading,
            dlatPerSec: pos.dlatPerSec, dlngPerSec: pos.dlngPerSec,
            computedAt: pos.computedAt,
            onGround: false,
          };

          if (markerDataRef.current[key]) {
            const m = markerDataRef.current[key].marker;
            m.setLatLng([pos.lat, pos.lng]);
            m.setIcon(icon);
            m.off('click').on('click', () => { setSearchResult({ type: 'board', flight: f }); setSearchedKey(key); setSelectedAircraft(null); });
            markerDataRef.current[key].ac = acData;
          } else {
            const marker = L.marker([pos.lat, pos.lng], { icon });
            marker.on('click', () => {
              setSearchResult({ type: 'board', flight: f });
              setSearchedKey(key);
              setSelectedAircraft(null);
            });
            marker.addTo(markersLayer.current);
            markerDataRef.current[key] = { marker, ac: acData };
          }

          // Draw a faint route line if searched
          if (isSearched) {
            const routeKey = `route_${f.flight_iata}`;
            if (!markerDataRef.current[routeKey]) {
              const from = AIRPORT_COORDS[f.departure_airport] || BLR_CENTER;
              const to   = AIRPORT_COORDS[f.arrival_airport];
              if (to) {
                const line = L.polyline([from, to], {
                  color: '#00e5ff', weight: 1.5, opacity: 0.35, dashArray: '6,6',
                }).addTo(markersLayer.current);
                markerDataRef.current[routeKey] = { marker: line, ac: { onGround: true } };
                seenKeys.add(routeKey);
              }
            } else {
              seenKeys.add(routeKey);
            }
          }

          return; // marker placed — skip ground rendering
        }
        // pos === null: can't interpolate (timestamps unusable) — fall through
        // and render as a ground marker so the flight stays visible on the map
      }

      if (f.status !== 'cancelled') {
        if (!isGroundVisible) return;
        seenKeys.add(key);
        // ── Ground / scheduled / landed flight ──
        if (trackedOnly) { groundIndex++; return; }

        const row = Math.floor(groundIndex / 6);
        const col = groundIndex % 6;
        const lat = BLR_CENTER[0] - 0.04 - row * 0.015;
        const lng = BLR_CENTER[1] - 0.04 + col * 0.016;
        groundIndex++;

        const html = buildGroundIconHtml(isSearched);
        const icon = L.divIcon({ className:'', html, iconSize:[20,20], iconAnchor:[10,10] });

        const groundClickHandler = () => { setSearchResult({ type: 'board', flight: f }); setSearchedKey(key); setSelectedAircraft(null); };
        if (markerDataRef.current[key]) {
          markerDataRef.current[key].marker.setIcon(icon);
          markerDataRef.current[key].marker.off('click').on('click', groundClickHandler);
        } else {
          const marker = L.marker([lat, lng], { icon });
          marker.on('click', groundClickHandler);
          marker.addTo(markersLayer.current);
          markerDataRef.current[key] = { marker, ac:{ latitude:lat, longitude:lng, onGround:true } };
        }
      }
    });

    // Remove stale markers
    Object.keys(markerDataRef.current).forEach(key => {
      if (!seenKeys.has(key)) {
        markersLayer.current.removeLayer(markerDataRef.current[key].marker);
        delete markerDataRef.current[key];
      }
    });
  }, [aircraft, boardFlights, trackedOnly, navigate, searchedKey]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const sr = searchResult;

  return (
    <div className="p-4 md:p-8">
      <div className="bg-[#141c2e] border border-[rgba(99,179,255,0.22)] rounded-2xl overflow-hidden">

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-[rgba(99,179,255,0.22)] flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-[#8899bb] text-sm hover:text-[#63b3ff] transition-colors">← Back</button>
            <h2 className="font-display text-lg font-bold">Live Radar</h2>
            <span className="text-xs font-mono text-[#4a5a7a]">BLR / VOBL Airspace</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="Search flight (e.g. 6E2341)"
                  className={`bg-[#0d1220] border rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono outline-none w-44 transition-all ${
                    searchNotFound ? 'border-[#ef4444] text-[#ef4444]'
                    : searchResult ? 'border-[#00e5ff] text-[#00e5ff]'
                    : 'border-[rgba(99,179,255,0.22)] text-[#8899bb]'
                  }`}
                />
                {searchQuery && (
                  <button onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#4a5a7a] hover:text-white text-xs">✕</button>
                )}
              </div>
              <button onClick={handleSearch}
                className="px-3 py-1.5 bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.3)] rounded-lg text-xs text-[#00e5ff] hover:bg-[rgba(0,229,255,0.2)] transition-all font-mono">
                Track
              </button>
            </div>

            <button onClick={() => setTrackedOnly(v => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                trackedOnly ? 'bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.4)] text-[#f59e0b]'
                : 'bg-transparent border-[rgba(99,179,255,0.22)] text-[#8899bb] hover:text-white'
              }`}>
              ★ BLR Flights Only
            </button>

            <select value={altFilter} onChange={e => setAltFilter(e.target.value)}
              className="bg-[#0d1220] border border-[rgba(99,179,255,0.22)] rounded-lg px-3 py-1.5 text-xs text-[#8899bb] outline-none">
              <option value="all">All Altitudes</option>
              <option value="ground">On Ground</option>
              <option value="low">Below FL200</option>
              <option value="high">Above FL200</option>
            </select>

            <div className="flex items-center gap-2 text-xs font-mono text-[#4a5a7a]">
              <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
              {stats.total} aircraft · <span className="text-[#f59e0b]">{stats.tracked} BLR tracked</span>
              · <span className="text-[#a78bfa]">{boardFlights.length} on board</span>
            </div>
          </div>
        </div>

        {/* Map */}
        <div className="relative">
          <div ref={mapRef} className="w-full h-[580px] bg-[#04090f]" />

          {/* Overlay chips */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-[1000]">
            <div className="bg-[rgba(4,9,15,0.88)] border border-[rgba(99,179,255,0.22)] rounded-lg px-3 py-1.5 font-mono text-[11px] text-[#8899bb]">
              BLR APPROACH · 124.850 MHz
            </div>
            <div className="bg-[rgba(4,9,15,0.88)] border border-[rgba(99,179,255,0.22)] rounded-lg px-3 py-1.5 font-mono text-[11px] text-[#8899bb]">
              {lastUpdated ? (() => {
                const d = new Date(lastUpdated);
                const t = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Kolkata' });
                const h = parseInt(new Intl.DateTimeFormat('en-IN',{hour:'numeric',hour12:false,timeZone:'Asia/Kolkata'}).format(d));
                return `${t} ${h < 12 ? 'AM' : 'PM'}`;
              })() : '—'} IST
            </div>
            <AnimatePresence>
              {searchNotFound && (
                <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  className="bg-[rgba(239,68,68,0.15)] border border-[rgba(239,68,68,0.4)] rounded-lg px-3 py-1.5 font-mono text-[11px] text-[#ef4444] pointer-events-auto">
                  ✕ Flight not found on radar
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-[rgba(4,9,15,0.88)] border border-[rgba(99,179,255,0.22)] rounded-lg px-3 py-2 z-[1000]">
            <div className="text-[10px] font-mono text-[#4a5a7a] mb-1 uppercase">Legend</div>
            {[
              { color:'#00e5ff', label:'Searched / tracked flight' },
              { color:'#f59e0b', label:'In flight — live or interpolated' },
              { color:'#a78bfa', label:'Ground / scheduled / landed' },
              { color:'#22c55e', label:'Other ADS-B · <5000ft' },
              { color:'#3b9eff', label:'Other ADS-B · 5000–15000ft' },
              { color:'#ef4444', label:'Other ADS-B · >30000ft' },
            ].map(l => (
              <div key={l.label} className="flex items-center gap-2 text-[10px] font-mono text-[#8899bb]">
                <span className="w-2 h-2 rounded-full" style={{ background: l.color }} /> {l.label}
              </div>
            ))}
            <div className="mt-1.5 text-[10px] font-mono text-[#4a5a7a]">Click any flight → full details</div>
          </div>

          {/* Searched flight panel */}
          <AnimatePresence>
            {sr && (
              <motion.div key="search-panel"
                initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:20 }}
                className="absolute top-3 right-3 bg-[#0d1220] border border-[rgba(0,229,255,0.35)] rounded-xl shadow-2xl z-[1001] w-72 flex flex-col"
                style={{ maxHeight: 'calc(100% - 24px)' }}>
                {/* Sticky header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,229,255,0.15)] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                    <div>
                      <div className="font-mono text-[#00e5ff] text-base font-bold">
                        {sr.flight?.flight_iata || sr.ac?.callsign || '—'}
                      </div>
                      <div className="text-[11px] text-[#4a5a7a]">{sr.flight?.airline_name || 'Unknown airline'}</div>
                    </div>
                  </div>
                  <button onClick={clearSearch} className="text-[#4a5a7a] hover:text-white text-lg">✕</button>
                </div>
                {/* Scrollable body */}
                <div className="px-4 py-3 space-y-3 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,229,255,0.15) transparent' }}>
                  {sr.flight && (
                    <div className="flex items-center justify-between">
                      <div className="text-center">
                        <div className="font-mono text-lg font-bold text-white">{sr.flight.departure_airport || 'BLR'}</div>
                        <div className="text-[10px] text-[#4a5a7a]">Origin</div>
                      </div>
                      <div className="flex-1 flex flex-col items-center">
                        <div className="text-[#00e5ff] text-sm">✈</div>
                        <div className="w-full h-px bg-[rgba(0,229,255,0.2)]" />
                        <div className="text-[10px] text-[#4a5a7a] font-mono mt-0.5">
                          {sr.flight.status === 'active' ? 'In Flight' : sr.flight.flightType === 'arrival' ? 'Arriving' : 'Departing'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-lg font-bold text-white">{sr.flight.arrival_airport || '—'}</div>
                        <div className="text-[10px] text-[#4a5a7a]">Destination</div>
                      </div>
                    </div>
                  )}
                  {sr.flight && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label:'Status',   value: sr.flight.statusLabel || sr.flight.status || '—' },
                        { label:'Terminal', value: sr.flight.departure_terminal || sr.flight.arrival_terminal || 'TBD' },
                        { label:'Gate',     value: sr.flight.departure_gate || sr.flight.arrival_gate || 'TBD' },
                        { label:'Delay',    value: sr.flight.delay_minutes > 0 ? `${sr.flight.delay_minutes} min` : 'None' },
                      ].map(d => (
                        <div key={d.label} className="bg-[#141c2e] rounded-lg p-2">
                          <div className="text-[10px] text-[#4a5a7a]">{d.label}</div>
                          <div className="font-mono text-sm text-white">{d.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sr.type === 'adsb' && sr.ac && (
                    <>
                      <div className="text-[10px] font-mono text-[#4a5a7a] uppercase tracking-wider">Live ADS-B Telemetry</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label:'Altitude', value:`${(sr.ac.altitude||0).toLocaleString()} ft` },
                          { label:'Speed',    value:`${sr.ac.speed} km/h` },
                          { label:'Heading',  value:`${sr.ac.heading}°` },
                          { label:'V/Speed',  value:`${sr.ac.verticalRate} ft/m` },
                        ].map(d => (
                          <div key={d.label} className="bg-[#141c2e] rounded-lg p-2">
                            <div className="text-[10px] text-[#4a5a7a]">{d.label}</div>
                            <div className="font-mono text-sm text-white">{d.value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] font-mono text-[#4a5a7a]">
                        ICAO24: {sr.ac.icao24} · {sr.ac.onGround ? '🟡 On Ground' : '🟢 Airborne'}
                      </div>
                    </>
                  )}
                  {/* Position block */}
                  {livePos && (
                    <div className={`bg-[#0a1020] rounded-lg p-2.5 border ${
                      livePos.live ? 'border-[rgba(34,197,94,0.2)]'
                      : livePos.isGround ? 'border-[rgba(167,139,250,0.2)]'
                      : 'border-[rgba(245,158,11,0.2)]'
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                            livePos.live ? 'bg-[#22c55e]'
                            : livePos.isGround ? 'bg-[#a78bfa]'
                            : 'bg-[#f59e0b]'
                          }`} />
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${
                            livePos.live ? 'text-[#22c55e]'
                            : livePos.isGround ? 'text-[#a78bfa]'
                            : 'text-[#f59e0b]'
                          }`}>
                            {livePos.live ? 'Live ADS-B Position' : livePos.isGround ? 'Airport Position' : 'In-Flight Estimate'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${livePos.lat.toFixed(6)}, ${livePos.lng.toFixed(6)}`);
                            setCopiedCoords(true);
                            setTimeout(() => setCopiedCoords(false), 1800);
                          }}
                          className="text-[9px] font-mono text-[#4a5a7a] hover:text-[#00e5ff] transition-colors px-1.5 py-0.5 rounded border border-[rgba(99,179,255,0.1)] hover:border-[rgba(0,229,255,0.3)]">
                          {copiedCoords ? '✓ Copied' : '⎘ Copy'}
                        </button>
                      </div>
                      <div className="font-mono text-[13px] text-white tracking-wide">
                        {fmtCoord(livePos.lat, livePos.lng)}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="text-[10px] text-[#4a5a7a]">
                          {distanceKm(livePos.lat, livePos.lng, BLR_CENTER[0], BLR_CENTER[1]).toFixed(0)} km from BLR
                        </div>
                        {livePos.progress != null && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-20 h-1 bg-[rgba(99,179,255,0.1)] rounded-full overflow-hidden">
                              <div className="h-full bg-[#f59e0b] rounded-full transition-all" style={{ width: `${(livePos.progress * 100).toFixed(0)}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-[#f59e0b]">{(livePos.progress * 100).toFixed(0)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {sr.type === 'board' && sr.flight?.status === 'active' && (
                    <div className="text-[10px] font-mono text-[#f59e0b]">
                      ✦ No ADS-B signal — position interpolated from schedule data
                    </div>
                  )}
                  {sr.type === 'board' && sr.flight?.status !== 'active' && (
                    <div className="text-[10px] font-mono text-[#a78bfa]">
                      ✈ {sr.flight?.statusLabel || sr.flight?.status} — coordinates show current airport location
                    </div>
                  )}
                  {sr.flight && (
                    <div className="flex justify-between text-[11px] font-mono border-t border-[rgba(0,229,255,0.1)] pt-2">
                      <div>
                        <div className="text-[#4a5a7a]">Scheduled Dep</div>
                        <div className="text-white">{formatTime(sr.flight.scheduled_departure)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[#4a5a7a]">Scheduled Arr</div>
                        <div className="text-white">{formatTime(sr.flight.scheduled_arrival)}</div>
                      </div>
                    </div>
                  )}
                  {sr.flight?.flight_iata && (
                    <button onClick={() => navigate(`/flights/${encodeURIComponent(sr.flight.flight_iata)}`)}
                      className="w-full py-2 bg-[rgba(0,229,255,0.1)] border border-[rgba(0,229,255,0.3)] rounded-lg text-xs font-mono text-[#00e5ff] hover:bg-[rgba(0,229,255,0.2)] transition-all">
                      View Full Flight Details →
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Untracked aircraft panel */}
          <AnimatePresence>
            {selectedAircraft && !selectedAircraft.flightDetails && !sr && (
              <motion.div initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:20 }}
                className="absolute top-3 right-3 bg-[#0d1220] border border-[rgba(99,179,255,0.22)] rounded-xl shadow-2xl z-[1000] w-64 flex flex-col"
                style={{ maxHeight: 'calc(100% - 24px)' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(99,179,255,0.12)] flex-shrink-0">
                  <div>
                    <div className="font-mono text-[#63b3ff] text-lg font-bold">{selectedAircraft.callsign}</div>
                    <div className="text-xs text-[#4a5a7a]">{selectedAircraft.country} · not on BLR board</div>
                  </div>
                  <button onClick={() => setSelectedAircraft(null)} className="text-[#4a5a7a] hover:text-white text-lg">✕</button>
                </div>
                <div className="px-4 py-3 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,179,255,0.15) transparent' }}>
                  <div className="text-[10px] font-mono text-[#4a5a7a] uppercase mb-2">Live Telemetry</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label:'Altitude', value:`${(selectedAircraft.altitude||0).toLocaleString()} ft` },
                      { label:'Speed',    value:`${selectedAircraft.speed} km/h` },
                      { label:'Heading',  value:`${selectedAircraft.heading}°` },
                      { label:'V/Speed',  value:`${selectedAircraft.verticalRate} ft/m` },
                    ].map(d => (
                      <div key={d.label} className="bg-[#141c2e] rounded-lg p-2">
                        <div className="text-[10px] text-[#4a5a7a] mb-0.5">{d.label}</div>
                        <div className="font-mono text-sm text-white">{d.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] font-mono text-[#4a5a7a]">
                    ICAO24: {selectedAircraft.icao24} · {selectedAircraft.onGround ? '🟡 On Ground' : '🟢 Airborne'}
                  </div>
                  {livePos && (
                    <div className="mt-2 bg-[#0a1020] border border-[rgba(99,179,255,0.12)] rounded-lg p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                          <span className="text-[10px] font-mono text-[#63b3ff] uppercase tracking-wider">Live Position</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${livePos.lat.toFixed(6)}, ${livePos.lng.toFixed(6)}`);
                            setCopiedCoords(true);
                            setTimeout(() => setCopiedCoords(false), 1800);
                          }}
                          className="text-[9px] font-mono text-[#4a5a7a] hover:text-[#63b3ff] transition-colors px-1.5 py-0.5 rounded border border-[rgba(99,179,255,0.1)]">
                          {copiedCoords ? '✓ Copied' : '⎘ Copy'}
                        </button>
                      </div>
                      <div className="font-mono text-[12px] text-white">{fmtCoord(livePos.lat, livePos.lng)}</div>
                      <div className="text-[10px] text-[#4a5a7a] mt-0.5">
                        {distanceKm(livePos.lat, livePos.lng, BLR_CENTER[0], BLR_CENTER[1]).toFixed(0)} km from BLR
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
