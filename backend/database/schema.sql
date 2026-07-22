-- =====================================================
-- AeroVision — PostgreSQL Database Schema
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===== USERS =====
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    preferences JSONB DEFAULT '{"notifications": true, "defaultAirport": "BLR", "theme": "dark"}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email);

-- ===== AIRPORTS =====
CREATE TABLE airports (
    id SERIAL PRIMARY KEY,
    iata_code VARCHAR(3) UNIQUE NOT NULL,
    icao_code VARCHAR(4) UNIQUE,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255),
    country VARCHAR(255),
    latitude DECIMAL(10, 6),
    longitude DECIMAL(10, 6),
    timezone VARCHAR(100),
    terminal_count INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_airports_iata ON airports(iata_code);

-- ===== FLIGHTS =====
CREATE TABLE flights (
    id SERIAL PRIMARY KEY,
    flight_iata VARCHAR(10) NOT NULL,
    flight_icao VARCHAR(10),
    airline_name VARCHAR(255),
    airline_iata VARCHAR(3),
    departure_airport VARCHAR(3) REFERENCES airports(iata_code),
    arrival_airport VARCHAR(3) REFERENCES airports(iata_code),
    departure_terminal VARCHAR(10),
    arrival_terminal VARCHAR(10),
    departure_gate VARCHAR(10),
    arrival_gate VARCHAR(10),
    scheduled_departure TIMESTAMP WITH TIME ZONE,
    scheduled_arrival TIMESTAMP WITH TIME ZONE,
    estimated_departure TIMESTAMP WITH TIME ZONE,
    estimated_arrival TIMESTAMP WITH TIME ZONE,
    actual_departure TIMESTAMP WITH TIME ZONE,
    actual_arrival TIMESTAMP WITH TIME ZONE,
    status VARCHAR(30) DEFAULT 'scheduled',
    delay_minutes INTEGER DEFAULT 0,
    aircraft_type VARCHAR(50),
    aircraft_registration VARCHAR(20),
    flight_date DATE NOT NULL,
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_flights_iata ON flights(flight_iata);
CREATE INDEX idx_flights_date ON flights(flight_date);
CREATE INDEX idx_flights_dep_airport ON flights(departure_airport);
CREATE INDEX idx_flights_arr_airport ON flights(arrival_airport);
CREATE INDEX idx_flights_status ON flights(status);

-- ===== SAVED FLIGHTS =====
CREATE TABLE saved_flights (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    flight_iata VARCHAR(10) NOT NULL,
    flight_date DATE NOT NULL,
    alert_gate_change BOOLEAN DEFAULT true,
    alert_delay BOOLEAN DEFAULT true,
    alert_cancellation BOOLEAN DEFAULT true,
    alert_boarding BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, flight_iata, flight_date)
);

CREATE INDEX idx_saved_flights_user ON saved_flights(user_id);

-- ===== NOTIFICATIONS =====
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    flight_iata VARCHAR(10),
    icon VARCHAR(10) DEFAULT '🔔',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ===== WEATHER LOGS =====
CREATE TABLE weather_logs (
    id SERIAL PRIMARY KEY,
    airport_iata VARCHAR(3) REFERENCES airports(iata_code),
    temperature DECIMAL(5, 2),
    feels_like DECIMAL(5, 2),
    humidity INTEGER,
    pressure INTEGER,
    visibility DECIMAL(8, 2),
    wind_speed DECIMAL(6, 2),
    wind_deg INTEGER,
    wind_gust DECIMAL(6, 2),
    weather_main VARCHAR(50),
    weather_description VARCHAR(255),
    weather_icon VARCHAR(10),
    clouds INTEGER,
    metar TEXT,
    raw_data JSONB,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_weather_airport ON weather_logs(airport_iata);
CREATE INDEX idx_weather_time ON weather_logs(recorded_at DESC);

-- ===== DELAY PREDICTIONS =====
CREATE TABLE delay_predictions (
    id SERIAL PRIMARY KEY,
    flight_iata VARCHAR(10) NOT NULL,
    flight_date DATE NOT NULL,
    predicted_delay_minutes INTEGER,
    delay_probability DECIMAL(5, 2),
    risk_level VARCHAR(20) CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    factors JSONB,
    model_version VARCHAR(20) DEFAULT 'v1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_predictions_flight ON delay_predictions(flight_iata, flight_date);

-- ===== CHAT HISTORY =====
CREATE TABLE chat_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100),
    role VARCHAR(10) CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_user ON chat_history(user_id);
CREATE INDEX idx_chat_session ON chat_history(session_id);

-- ===== CROWD DENSITY =====
CREATE TABLE crowd_density (
    id SERIAL PRIMARY KEY,
    airport_iata VARCHAR(3) REFERENCES airports(iata_code),
    zone_name VARCHAR(100) NOT NULL,
    terminal VARCHAR(10),
    density_percent INTEGER CHECK (density_percent >= 0 AND density_percent <= 100),
    level VARCHAR(10) CHECK (level IN ('low', 'medium', 'high')),
    estimated_wait_minutes INTEGER,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_crowd_airport ON crowd_density(airport_iata);

-- ===== SEED DATA: Airports =====
INSERT INTO airports (iata_code, icao_code, name, city, country, latitude, longitude, timezone, terminal_count) VALUES
('BLR', 'VOBL', 'Kempegowda International Airport', 'Bengaluru', 'India', 13.1986, 77.7066, 'Asia/Kolkata', 2),
('DEL', 'VIDP', 'Indira Gandhi International Airport', 'New Delhi', 'India', 28.5562, 77.1000, 'Asia/Kolkata', 3),
('BOM', 'VABB', 'Chhatrapati Shivaji Maharaj International Airport', 'Mumbai', 'India', 19.0896, 72.8656, 'Asia/Kolkata', 2),
('MAA', 'VOMM', 'Chennai International Airport', 'Chennai', 'India', 12.9941, 80.1707, 'Asia/Kolkata', 2),
('HYD', 'VOHS', 'Rajiv Gandhi International Airport', 'Hyderabad', 'India', 17.2403, 78.4294, 'Asia/Kolkata', 1),
('CCU', 'VECC', 'Netaji Subhas Chandra Bose International Airport', 'Kolkata', 'India', 22.6547, 88.4467, 'Asia/Kolkata', 2),
('DXB', 'OMDB', 'Dubai International Airport', 'Dubai', 'UAE', 25.2532, 55.3657, 'Asia/Dubai', 3),
('DOH', 'OTHH', 'Hamad International Airport', 'Doha', 'Qatar', 25.2731, 51.6081, 'Asia/Qatar', 1),
('SIN', 'WSSS', 'Changi Airport', 'Singapore', 'Singapore', 1.3644, 103.9915, 'Asia/Singapore', 4);

-- ===== Updated at trigger function =====
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flights_updated_at BEFORE UPDATE ON flights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
