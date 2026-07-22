// =====================================================
// Database initialization — Creates tables and seeds data
// Uses sql.js (pure JavaScript SQLite)
// =====================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { dbReady, query } = require('./db');

async function initDatabase() {
  // Wait for sql.js to load
  const db = await dbReady;
  console.log('[DB] Initializing AeroVision database...');

  // Create tables one at a time (sql.js doesn't support multi-statement exec well)
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT DEFAULT 'user',
      preferences TEXT DEFAULT '{"notifications":true,"defaultAirport":"BLR","theme":"dark"}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS airports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iata_code TEXT UNIQUE NOT NULL,
      icao_code TEXT UNIQUE,
      name TEXT NOT NULL,
      city TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      timezone TEXT,
      terminal_count INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_iata TEXT NOT NULL,
      flight_icao TEXT,
      airline_name TEXT,
      airline_iata TEXT,
      departure_airport TEXT,
      arrival_airport TEXT,
      departure_terminal TEXT,
      arrival_terminal TEXT,
      departure_gate TEXT,
      arrival_gate TEXT,
      scheduled_departure TEXT,
      scheduled_arrival TEXT,
      estimated_departure TEXT,
      estimated_arrival TEXT,
      actual_departure TEXT,
      actual_arrival TEXT,
      status TEXT DEFAULT 'scheduled',
      delay_minutes INTEGER DEFAULT 0,
      aircraft_type TEXT,
      aircraft_registration TEXT,
      flight_date TEXT NOT NULL,
      raw_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS saved_flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      flight_iata TEXT NOT NULL,
      flight_date TEXT NOT NULL,
      alert_gate_change INTEGER DEFAULT 1,
      alert_delay INTEGER DEFAULT 1,
      alert_cancellation INTEGER DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, flight_iata, flight_date)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      flight_iata TEXT,
      icon TEXT DEFAULT '🔔',
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS weather_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      airport_iata TEXT,
      temperature REAL,
      feels_like REAL,
      humidity INTEGER,
      pressure INTEGER,
      visibility REAL,
      wind_speed REAL,
      wind_deg INTEGER,
      wind_gust REAL,
      weather_main TEXT,
      weather_description TEXT,
      weather_icon TEXT,
      clouds INTEGER,
      metar TEXT,
      raw_data TEXT,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS delay_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_iata TEXT NOT NULL,
      flight_date TEXT NOT NULL,
      predicted_delay_minutes INTEGER,
      delay_probability REAL,
      risk_level TEXT,
      factors TEXT,
      model_version TEXT DEFAULT 'v1',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      session_id TEXT,
      role TEXT,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS crowd_density (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      airport_iata TEXT,
      zone_name TEXT NOT NULL,
      terminal TEXT,
      density_percent INTEGER,
      level TEXT,
      estimated_wait_minutes INTEGER,
      recorded_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tracked_flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      flight_iata TEXT NOT NULL,
      flight_date TEXT NOT NULL,
      airline_name TEXT,
      route TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, flight_iata, flight_date)
    )`,
    `CREATE TABLE IF NOT EXISTS mobility_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      service_type TEXT NOT NULL,
      passenger_name TEXT NOT NULL,
      phone TEXT,
      flight_iata TEXT NOT NULL,
      pickup_point TEXT DEFAULT 'Main Entrance - T1',
      pickup_time TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'confirmed',
      charge_amount INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'na',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS assist_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      eligibility_type TEXT NOT NULL,
      document_type TEXT NOT NULL,
      document_name TEXT,
      document_data TEXT,
      status TEXT DEFAULT 'approved',
      submitted_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of tables) {
    try { db.run(sql); } catch (e) { console.warn('[DB] Table warning:', e.message.substring(0, 60)); }
  }

  // Migrations — add columns to existing DBs (safe to run repeatedly)
  const migrations = [
    "ALTER TABLE mobility_bookings ADD COLUMN charge_amount INTEGER DEFAULT 0",
    "ALTER TABLE mobility_bookings ADD COLUMN payment_status TEXT DEFAULT 'na'",
    "ALTER TABLE users ADD COLUMN date_of_birth TEXT",
    // Gate watcher persistence — stores last known gate so server restarts don't miss changes
    "ALTER TABLE tracked_flights ADD COLUMN last_known_gate TEXT",
    "ALTER TABLE tracked_flights ADD COLUMN last_known_status TEXT",
    "ALTER TABLE tracked_flights ADD COLUMN last_known_delay INTEGER DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch (e) { /* column already exists — expected on repeat runs */ }
  }

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_flights_iata ON flights(flight_iata)',
    'CREATE INDEX IF NOT EXISTS idx_flights_date ON flights(flight_date)',
    'CREATE INDEX IF NOT EXISTS idx_flights_dep ON flights(departure_airport)',
    'CREATE INDEX IF NOT EXISTS idx_flights_arr ON flights(arrival_airport)',
    'CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_flights(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_weather_airport ON weather_logs(airport_iata)',
    'CREATE INDEX IF NOT EXISTS idx_crowd_airport ON crowd_density(airport_iata)',
    'CREATE INDEX IF NOT EXISTS idx_tracked_user ON tracked_flights(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_tracked_flight ON tracked_flights(flight_iata)',
  ];
  for (const sql of indexes) {
    try { db.run(sql); } catch (e) { /* index may already exist */ }
  }

  // Seed airports
  const airports = [
    ['BLR', 'VOBL', 'Kempegowda International Airport', 'Bengaluru', 'India', 13.1986, 77.7066, 'Asia/Kolkata', 2],
    ['DEL', 'VIDP', 'Indira Gandhi International Airport', 'New Delhi', 'India', 28.5562, 77.1000, 'Asia/Kolkata', 3],
    ['BOM', 'VABB', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'India', 19.0896, 72.8656, 'Asia/Kolkata', 2],
    ['MAA', 'VOMM', 'Chennai International Airport', 'Chennai', 'India', 12.9941, 80.1707, 'Asia/Kolkata', 2],
    ['HYD', 'VOHS', 'Rajiv Gandhi International Airport', 'Hyderabad', 'India', 17.2403, 78.4294, 'Asia/Kolkata', 1],
    ['DXB', 'OMDB', 'Dubai International Airport', 'Dubai', 'UAE', 25.2532, 55.3657, 'Asia/Dubai', 3],
    ['SIN', 'WSSS', 'Changi Airport', 'Singapore', 'Singapore', 1.3644, 103.9915, 'Asia/Singapore', 4],
  ];

  for (const a of airports) {
    try {
      db.run(
        'INSERT OR IGNORE INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, timezone, terminal_count) VALUES (?,?,?,?,?,?,?,?,?)',
        a
      );
    } catch (e) { /* already exists */ }
  }

  // Save to disk
  const fs = require('fs');
  const path = require('path');
  const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'aerovision.db');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));

  console.log('[DB] Database initialized successfully!');
  console.log('[DB] Tables: users, airports, flights, saved_flights, notifications, weather_logs, delay_predictions, chat_history, crowd_density');
}

// Run init and export the promise
const initPromise = initDatabase().catch(err => {
  console.error('[DB] Init failed:', err);
});

module.exports = { initPromise };
