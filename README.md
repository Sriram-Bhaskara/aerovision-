# AeroVision — Real-Time Flight Intelligence Platform

> A production-ready aviation intelligence web application for **Kempegowda International Airport (BLR), Bengaluru**. Real-time flight tracking, live radar, AI-powered assistant, weather intelligence, crowd analytics, and indoor airport navigation.

---

## Features

| Feature | Description | API/Technology |
|---------|-------------|----------------|
| **Live Flight Board** | Real-time departures & arrivals with gate, terminal, delay, and status info | AviationStack API |
| **Radar Tracking** | Live aircraft positions on an interactive map | OpenSky Network ADS-B |
| **Weather Intelligence** | Aviation weather, METAR reports, runway conditions, flight impact analysis | OpenWeather API |
| **AI Flight Assistant** | Conversational chatbot for flight queries, gate info, navigation | OpenAI GPT API |
| **Delay Prediction** | AI-based delay probability with contributing factors | Custom ML engine |
| **Crowd Analytics** | Terminal zone congestion, wait times, heatmap visualization | Real-time analytics |
| **Indoor Navigation** | BLR airport blueprint with gates, restaurants, lounges, pathfinding | SVG + Pathfinding |
| **User Dashboard** | Saved flights, notifications, preferences, travel history | JWT Authentication |
| **Real-time Updates** | WebSocket push for flight changes, weather, gate changes | Socket.IO |

## Tech Stack

**Frontend:** React 18 · Tailwind CSS · Framer Motion · Leaflet.js · Chart.js · Socket.IO  
**Backend:** Node.js · Express · Socket.IO · JWT Auth · REST APIs  
**Database:** SQLite (dev) / PostgreSQL (production)  
**APIs:** AviationStack · OpenSky Network · OpenWeather · OpenAI

## Quick Start

### Prerequisites
- Node.js 18+ and npm

### 1. Clone & Install

```bash
cd AeroVision

# Backend
cd backend
npm install
cp .env.example .env   # Edit with your API keys

# Frontend
cd ../frontend
npm install
```

### 2. Configure API Keys

Edit `backend/.env`:

```env
AVIATIONSTACK_API_KEY=your_key_here    # Required — aviationstack.com/signup/free
OPENWEATHER_API_KEY=your_key_here      # Optional — openweathermap.org/api
OPENAI_API_KEY=your_key_here           # Optional — platform.openai.com/api-keys
```

### 3. Initialize Database

```bash
cd backend
npm run db:init
```

### 4. Start Development

```bash
# Terminal 1 — Backend (port 5000)
cd backend && npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev
```

Open http://localhost:5173

## Project Structure

```
AeroVision/
├── frontend/                  # React + Vite + Tailwind
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Route pages
│   │   │   ├── AuthPage.jsx       # Login / Register
│   │   │   ├── HomePage.jsx       # Dashboard home
│   │   │   ├── FlightBoard.jsx    # Live departures/arrivals
│   │   │   ├── FlightDetail.jsx   # Individual flight tracking
│   │   │   ├── RadarPage.jsx      # Live radar map
│   │   │   ├── WeatherPage.jsx    # Aviation weather
│   │   │   ├── ChatbotPage.jsx    # AI assistant
│   │   │   ├── CrowdPage.jsx      # Crowd density analytics
│   │   │   ├── IndoorNav.jsx      # BLR airport blueprint
│   │   │   └── Dashboard.jsx      # User profile & saved flights
│   │   ├── services/          # API & Socket clients
│   │   ├── context/           # React context (auth)
│   │   └── App.jsx            # Router & layout
│   └── package.json
│
├── backend/                   # Express + Socket.IO
│   ├── routes/                # REST API routes
│   │   ├── auth.js            # Registration, login, JWT
│   │   ├── flights.js         # Flight data from AviationStack
│   │   ├── radar.js           # OpenSky radar data
│   │   ├── weather.js         # OpenWeather aviation data
│   │   ├── chatbot.js         # OpenAI chatbot
│   │   ├── notifications.js   # User notifications
│   │   ├── users.js           # User profile & preferences
│   │   └── analytics.js       # Crowd density analytics
│   ├── services/              # Business logic
│   │   ├── flightService.js       # AviationStack API integration
│   │   ├── radarService.js        # OpenSky API integration
│   │   ├── weatherService.js      # OpenWeather API integration
│   │   ├── chatService.js         # OpenAI integration
│   │   └── delayPredictionService.js  # AI delay prediction
│   ├── middleware/            # Auth, validation
│   ├── database/              # SQLite schema & init
│   ├── websocket/             # Socket.IO real-time engine
│   ├── app.js                 # Server entry point
│   └── package.json
│
└── README.md
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Sign in with email/password |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/password` | Change password |

### Flights
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/flights` | List departures/arrivals at BLR |
| GET | `/api/flights/stats` | Flight statistics dashboard |
| GET | `/api/flights/search?q=` | Search flight by number |
| GET | `/api/flights/:id/predict` | AI delay prediction |
| POST | `/api/flights/save` | Save flight to dashboard |
| GET | `/api/flights/saved/list` | Get saved flights |

### Radar
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/radar` | Live aircraft positions (OpenSky) |

### Weather
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/weather` | Current aviation weather at BLR |

### Chatbot
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chatbot/message` | Send message to AI assistant |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/crowd` | Terminal crowd density |

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `flights:updated` | Server → Client | Flight data refreshed |
| `weather:updated` | Server → Client | Weather data refreshed |
| `radar:data` | Server → Client | Live aircraft positions |
| `notification` | Server → Client | Push notification |
| `crowd:updated` | Server → Client | Crowd density change |

## Database Schema

8 tables: `users`, `airports`, `flights`, `saved_flights`, `notifications`, `weather_logs`, `delay_predictions`, `chat_history`, `crowd_density`

All tables have proper indexes, foreign keys, and timestamps.

## Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy dist/ to Vercel
```

### Backend (Render / Railway)
```bash
cd backend
# Set environment variables in dashboard
# Deploy — auto-detected Node.js
```

## Airport Coverage

This platform is exclusively configured for **Kempegowda International Airport (BLR/VOBL), Bengaluru, India**:

- Terminal 1 (Domestic) — Gates A1-A9, B1-B8
- Terminal 2 (International) — Gates C1-C6, D1-D8
- Full indoor navigation blueprint with restaurants, lounges, restrooms, shops, transport
- Real runway data (09R/27L, 09L/27R)
- BLR airspace radar coverage (~220km radius)

## Contributors

Done by :
1. Sriram Bhaskara-1CR25CS187
2. Suhaas S Reddy-1CR25CS188
3. Rechitha V-1CR25EC168
4. Ratan Ojha-1CR25EC167

## License

Private — All rights reserved.
