const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const BLR_LAT = 13.1986;
const BLR_LNG = 77.7066;

// Minutes before departure the user needs to arrive at airport
const CHECKIN_BUFFER = { domestic: 120, international: 180 };

const AREA_ESTIMATES = {
  'devanahalli': 15, 'airport road': 20, 'yelahanka': 25, 'hebbal': 30,
  'thanisandra': 30, 'kogilu': 28, 'jakkur': 28, 'rt nagar': 40,
  'ms ramaiah': 42, 'yeshwanthpur': 48, 'rajajinagar': 50, 'malleshwaram': 52,
  'benson town': 48, 'frazer town': 46, 'ulsoor': 50, 'shivajinagar': 50,
  'mg road': 52, 'brigade road': 52, 'richmond': 55, 'koramangala': 48,
  'domlur': 48, 'indiranagar': 50, 'hsr layout': 45, 'btm layout': 52,
  'jp nagar': 58, 'jayanagar': 58, 'banashankari': 62, 'basavanagudi': 60,
  'marathahalli': 35, 'bellandur': 35, 'sarjapur': 40, 'whitefield': 40,
  'electronic city': 58, 'ecity': 58, 'bommanahalli': 52, 'silk board': 48,
};

function getISTHour() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000).getHours();
}

function applyTrafficMultiplier(baseTimeMinutes) {
  const hour = getISTHour();
  let multiplier = 1.0;

  if ((hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21)) {
    // Peak traffic hours (Bengaluru office rush)
    multiplier = 1.95;
  } else if ((hour >= 11 && hour < 17) || (hour >= 7 && hour < 8) || (hour > 21 && hour <= 23)) {
    // Mid-day / moderate traffic
    multiplier = 1.45;
  } else {
    // Night/early morning (smooth drive)
    multiplier = 1.15;
  }

  const travelTime = Math.round(baseTimeMinutes * multiplier);
  const delay = travelTime - baseTimeMinutes;
  return { travelTime, delay };
}

function estimateDriveTime(location) {
  const loc = (location || '').toLowerCase();
  for (const [area, minutes] of Object.entries(AREA_ESTIMATES)) {
    if (loc.includes(area)) {
      const { travelTime, delay } = applyTrafficMultiplier(minutes);
      return { travel_time_minutes: travelTime, distance_km: Math.round(minutes * 0.85), traffic_delay_minutes: delay, source: 'estimate' };
    }
  }
  const { travelTime, delay } = applyTrafficMultiplier(50);
  return { travel_time_minutes: travelTime, distance_km: 42, traffic_delay_minutes: delay, source: 'estimate' };
}

// Compute when the user should leave home so TomTom can predict that traffic slot.
// We use: departure - checkin_buffer - 45 min (drive buffer) as a first-pass estimate.
// If departure is already past, returns null (fall back to live traffic).
function computeDepartAt(departure_iso, flight_type) {
  if (!departure_iso) return null;
  const dep = new Date(departure_iso);
  if (isNaN(dep.getTime())) return null;
  const buffer = (CHECKIN_BUFFER[flight_type] || 120) + 45; // checkin + drive buffer
  const departAt = new Date(dep.getTime() - buffer * 60000);
  if (departAt <= new Date()) return null; // already past — use live traffic instead
  return departAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function routeFromCoords(originLat, originLng, apiKey, departAt) {
  if (apiKey) {
    try {
      // OpenRouteService expects lon,lat for start and end
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${originLng},${originLat}&end=${BLR_LNG},${BLR_LAT}`;
      const res = await fetch(url, { timeout: 10000 });
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const summary = data.features[0].properties.summary;
          const baseTime = Math.ceil(summary.duration / 60);
          const { travelTime, delay } = applyTrafficMultiplier(baseTime);
          return {
            travel_time_minutes: travelTime,
            distance_km: Math.round(summary.distance / 1000),
            traffic_delay_minutes: delay,
            source: 'openrouteservice',
            depart_at: null,
          };
        }
      } else {
        const errBody = await res.text();
        console.warn('[Travel] OpenRouteService routing failed:', res.status, errBody);
      }
    } catch (err) {
      console.warn('[Travel] OpenRouteService routing error, trying OSRM fallback:', err.message);
    }
  }

  // OSRM Keyless Fallback
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${BLR_LNG},${BLR_LAT}?overview=false`;
    const res = await fetch(url, { timeout: 8000 });
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const baseTime = Math.ceil(route.duration / 60);
      const { travelTime, delay } = applyTrafficMultiplier(baseTime);
      return {
        travel_time_minutes: travelTime,
        distance_km: Math.round(route.distance / 1000),
        traffic_delay_minutes: delay,
        source: 'osrm_keyless',
        depart_at: null,
      };
    }
  } catch (err) {
    console.error('[Travel] OSRM routing failed:', err.message);
  }
  return null;
}

async function geocodeAddress(origin, apiKey) {
  const qClean = origin.trim();

  // 1. Try OpenRouteService Geocoding if API key is present
  if (apiKey) {
    try {
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${encodeURIComponent(qClean)}&size=1`;
      const res = await fetch(url, { timeout: 8000 });
      if (res.ok) {
        const data = await res.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          const coords = feature.geometry.coordinates; // [lon, lat]
          return {
            lat: coords[1],
            lng: coords[0],
            resolved_address: feature.properties.label || origin
          };
        }
      } else {
        const errBody = await res.text();
        console.warn('[Travel] OpenRouteService geocoding failed:', res.status, errBody);
      }
    } catch (err) {
      console.warn('[Travel] OpenRouteService geocode error, trying Nominatim:', err.message);
    }
  }

  // 2. Try Nominatim (OSM) Geocode fallback
  try {
    const queries = [qClean, qClean + ', Bengaluru, India'];
    for (const q of queries) {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, {
        headers: { 'User-Agent': 'AeroVisionPrototype/1.0' },
        timeout: 8000
      });
      const data = await geoRes.json();
      if (data && data.length > 0) {
        const place = data[0];
        return {
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon),
          resolved_address: place.display_name
        };
      }
    }
  } catch (err) {
    console.error('[Travel] Nominatim geocode failed:', err.message);
  }
  return null;
}

// GET /api/travel/time
// Params: (origin | lat+lng+label) + optional departure_iso + flight_type
router.get('/time', async (req, res) => {
  const { origin, lat, lng, label, departure_iso, flight_type } = req.query;
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  const departAt = computeDepartAt(departure_iso, flight_type);

  const inputDesc = lat && lng ? `GPS(${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)})` : `"${origin}"`;
  console.log(`[Travel] Request: ${inputDesc} | flight_type=${flight_type || 'n/a'} | departAt=${departAt || 'now (live)'}`);

  // ── Path 1: GPS coordinates ──
  if (lat && lng) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'Invalid lat/lng values' });
    }
    const result = await routeFromCoords(parsedLat, parsedLng, apiKey, departAt);
    if (result) {
      console.log(`[Travel] Result: ${result.travel_time_minutes} min / ${result.distance_km} km (${result.source})`);
      return res.json({ ...result, resolved_address: label || `${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}` });
    }
    return res.json({ ...estimateDriveTime(''), note: 'Route unavailable — using default estimate', resolved_address: label || 'Your location' });
  }

  // ── Path 2: Text address ──
  if (!origin || !origin.trim()) {
    return res.status(400).json({ error: 'origin or lat/lng params are required' });
  }

  try {
    const geocoded = await geocodeAddress(origin, apiKey);
    if (!geocoded) {
      return res.json({ ...estimateDriveTime(origin), note: 'Address not found — using area estimate' });
    }

    const { lat: oLat, lng: oLng, resolved_address } = geocoded;
    const result = await routeFromCoords(oLat, oLng, apiKey, departAt);
    if (!result) {
      return res.json({ ...estimateDriveTime(origin), note: 'Route unavailable — using area estimate', resolved_address });
    }

    console.log(`[Travel] Result: ${result.travel_time_minutes} min / ${result.distance_km} km (${result.source}) → ${resolved_address}`);
    return res.json({ ...result, resolved_address });
  } catch (err) {
    console.error('[Travel] Error:', err.message);
    return res.json({ ...estimateDriveTime(origin), note: 'Live traffic unavailable — using area estimate' });
  }
});

module.exports = router;
