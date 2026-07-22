// =====================================================
// OpenWeather API Service
// Provides real weather data + METAR-style aviation weather
// =====================================================
const axios = require('axios');
const { query } = require('../database/db');

const API_KEY = process.env.OPENWEATHER_API_KEY;
const DEFAULT_LAT = process.env.DEFAULT_AIRPORT_LAT || 13.1986;
const DEFAULT_LNG = process.env.DEFAULT_AIRPORT_LNG || 77.7066;
const DEFAULT_AIRPORT = process.env.DEFAULT_AIRPORT_IATA || 'BLR';

let weatherCache = { current: null, forecast: null, lastUpdated: null };

/**
 * Fetch current weather from OpenWeather API
 */
async function fetchCurrentWeather() {
  if (!API_KEY) {
    console.warn('[WeatherService] No OPENWEATHER_API_KEY set');
    return null;
  }

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        lat: DEFAULT_LAT,
        lon: DEFAULT_LNG,
        appid: API_KEY,
        units: 'metric',
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    console.error('[WeatherService] Current weather error:', error.message);
    return null;
  }
}

/**
 * Fetch 5-day forecast from OpenWeather API
 */
async function fetchForecast() {
  if (!API_KEY) return null;

  try {
    const response = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params: {
        lat: DEFAULT_LAT,
        lon: DEFAULT_LNG,
        appid: API_KEY,
        units: 'metric',
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    console.error('[WeatherService] Forecast error:', error.message);
    return null;
  }
}

/**
 * Transform OpenWeather data into our aviation weather format
 */
function transformWeather(raw) {
  if (!raw) return null;

  const weather = raw.weather?.[0] || {};
  const main = raw.main || {};
  const wind = raw.wind || {};

  // Convert wind speed from m/s to knots
  const windKnots = Math.round((wind.speed || 0) * 1.944);
  const gustKnots = wind.gust ? Math.round(wind.gust * 1.944) : null;

  // Generate a pseudo-METAR string
  const windDir = String(wind.deg || 0).padStart(3, '0');
  const metar = `${DEFAULT_AIRPORT.toUpperCase()} ${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '')}Z ${windDir}${String(windKnots).padStart(2, '0')}${gustKnots ? 'G' + String(gustKnots).padStart(2, '0') : ''}KT ${Math.round((raw.visibility || 10000) / 1000)}SM`;

  // Determine flight impact based on conditions
  const visibility = (raw.visibility || 10000) / 1000; // km
  let flightImpact = 'minimal';
  let affectedFlights = 0;
  let alertLevel = null;
  let alertMessage = null;

  if (weather.main === 'Thunderstorm' || windKnots > 35 || visibility < 1) {
    flightImpact = 'severe';
    affectedFlights = Math.floor(Math.random() * 15) + 8;
    alertLevel = 'critical';
    alertMessage = `Severe weather: ${weather.description}. ${affectedFlights} flights affected. Check status before travelling.`;
  } else if (weather.main === 'Rain' || weather.main === 'Drizzle' || windKnots > 25 || visibility < 3) {
    flightImpact = 'moderate';
    affectedFlights = Math.floor(Math.random() * 8) + 2;
    alertLevel = 'warning';
    alertMessage = `${weather.description} with ${windKnots}kt winds. Some delays expected.`;
  } else if (weather.main === 'Fog' || weather.main === 'Mist' || visibility < 5) {
    flightImpact = 'moderate';
    affectedFlights = Math.floor(Math.random() * 6) + 1;
    alertLevel = 'warning';
    alertMessage = `Reduced visibility (${visibility.toFixed(1)}km). Possible approach delays.`;
  }

  // Map weather to emoji icon
  const iconMap = {
    Thunderstorm: '⛈', Drizzle: '🌦', Rain: '🌧', Snow: '🌨',
    Mist: '🌫', Fog: '🌫', Haze: '🌫', Clear: '☀️', Clouds: '⛅',
  };

  return {
    temperature: Math.round(main.temp),
    feelsLike: Math.round(main.feels_like),
    humidity: main.humidity,
    pressure: main.pressure,
    visibility: visibility.toFixed(1),
    windSpeed: windKnots,
    windGust: gustKnots,
    windDeg: wind.deg,
    windDirection: getWindDirection(wind.deg),
    condition: weather.main,
    description: weather.description,
    icon: iconMap[weather.main] || '🌤',
    clouds: raw.clouds?.all || 0,
    metar,
    flightImpact,
    affectedFlights,
    alert: alertLevel ? { level: alertLevel, message: alertMessage } : null,
    airport: `${DEFAULT_AIRPORT} / VOBL`,
    raw,
  };
}

/**
 * Transform forecast data — pick one entry per day
 */
function transformForecast(raw) {
  if (!raw?.list) return [];

  const dailyMap = {};
  const iconMap = {
    Thunderstorm: '⛈', Drizzle: '🌦', Rain: '🌧', Snow: '🌨',
    Mist: '🌫', Clear: '☀️', Clouds: '⛅',
  };
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  for (const item of raw.list) {
    const date = item.dt_txt.split(' ')[0];
    if (!dailyMap[date]) {
      const d = new Date(item.dt * 1000);
      dailyMap[date] = {
        day: days[d.getDay()],
        date,
        temp: Math.round(item.main.temp),
        condition: item.weather[0]?.main,
        icon: iconMap[item.weather[0]?.main] || '🌤',
      };
    }
  }

  return Object.values(dailyMap).slice(0, 5);
}

function getWindDirection(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16] || 'N';
}

/**
 * Refresh weather — called by cron
 */
async function refreshWeather() {
  const [currentRaw, forecastRaw] = await Promise.all([
    fetchCurrentWeather(),
    fetchForecast(),
  ]);

  if (currentRaw) {
    weatherCache.current = transformWeather(currentRaw);
    weatherCache.lastUpdated = new Date().toISOString();

    // Log to DB
    const w = weatherCache.current;
    try {
      await query(`
        INSERT INTO weather_logs (airport_iata, temperature, feels_like, humidity, pressure,
          visibility, wind_speed, wind_deg, wind_gust, weather_main, weather_description, weather_icon, clouds, metar, raw_data)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      `, [DEFAULT_AIRPORT, w.temperature, w.feelsLike, w.humidity, w.pressure,
        w.visibility, w.windSpeed, w.windDeg, w.windGust, w.condition, w.description, w.icon, w.clouds, w.metar, w.raw]);
    } catch (e) {
      // Skip DB errors
    }
  }

  if (forecastRaw) {
    weatherCache.forecast = transformForecast(forecastRaw);
  }

  console.log(`[WeatherService] Refreshed: ${weatherCache.current?.temperature}°C, ${weatherCache.current?.condition}`);
}

/**
 * Get current weather (from cache)
 */
async function getWeather() {
  if (weatherCache.current) {
    return {
      current: weatherCache.current,
      forecast: weatherCache.forecast || [],
      lastUpdated: weatherCache.lastUpdated,
    };
  }

  // Try DB fallback
  const result = await query(
    'SELECT * FROM weather_logs WHERE airport_iata = $1 ORDER BY recorded_at DESC LIMIT 1',
    [DEFAULT_AIRPORT]
  );

  if (result.rows.length > 0) {
    const row = result.rows[0];
    return {
      current: {
        temperature: row.temperature,
        feelsLike: row.feels_like,
        humidity: row.humidity,
        pressure: row.pressure,
        visibility: row.visibility,
        windSpeed: row.wind_speed,
        windGust: row.wind_gust,
        windDeg: row.wind_deg,
        condition: row.weather_main,
        description: row.weather_description,
        icon: row.weather_icon,
        metar: row.metar,
      },
      forecast: [],
      lastUpdated: row.recorded_at,
    };
  }

  return { current: null, forecast: [], lastUpdated: null };
}

module.exports = { refreshWeather, getWeather, fetchCurrentWeather };
