// =====================================================
// AeroVision Backend — Express + Socket.IO Server
// =====================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const cron = require('node-cron');

// Initialize database (async — sql.js needs to load WASM)
const { initPromise } = require('./database/init');

// Route imports
const authRoutes = require('./routes/auth');
const flightRoutes = require('./routes/flights');
const weatherRoutes = require('./routes/weather');
const radarRoutes = require('./routes/radar');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const chatbotRoutes = require('./routes/chatbot');
const analyticsRoutes = require('./routes/analytics');
const travelRoutes    = require('./routes/travel');
const assistRoutes    = require('./routes/assist');
const currencyRoutes  = require('./routes/currency');

// Service imports
const { setupWebSocket } = require('./websocket');
const flightService = require('./services/flightService');
const weatherService = require('./services/weatherService');
const { generateNotifications } = require('./services/notificationService');
const { startGateWatcher } = require('./services/gateWatcher');

const app = express();
const server = http.createServer(app);

// ===== CORS origin helper =====
// In development, allow any origin so the app can be tested from phones/tablets
// on the local network (e.g. http://192.168.x.x:5173).
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const corsOrigin = isDev
  ? true   // allow all origins in dev
  : (process.env.FRONTEND_URL || 'http://localhost:5173');

// ===== Socket.IO Setup =====
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

// Make io accessible to routes
app.set('io', io);

// ===== Middleware =====
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
});

// ===== API Routes =====
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/radar', radarRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/travel',    travelRoutes);
app.use('/api/assist',   assistRoutes);
app.use('/api/currency', currencyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ===== WebSocket =====
setupWebSocket(io);

// ===== Cron Jobs =====
// Refresh flight data every 5 minutes + generate notifications
cron.schedule('*/5 * * * *', async () => {
  console.log('[CRON] Refreshing flight data...');
  try {
    await flightService.refreshFlights();
    io.emit('flights:updated', { timestamp: new Date().toISOString() });
    // Generate notifications from fresh flight/weather/crowd data
    await generateNotifications(io);
  } catch (err) {
    console.error('[CRON] Flight refresh error:', err.message);
  }
});

// Refresh weather every 10 minutes
cron.schedule('*/10 * * * *', async () => {
  console.log('[CRON] Refreshing weather data...');
  try {
    await weatherService.refreshWeather();
    io.emit('weather:updated', { timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[CRON] Weather refresh error:', err.message);
  }
});

// ===== Start Server (after DB is ready) =====
const PORT = process.env.PORT || 5000;
initPromise
  .then(() => {
    server.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║   AeroVision API Server                  ║
  ║   Running on port ${PORT}                    ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}           ║
  ╚══════════════════════════════════════════╝
      `);
    });

    // Start gate watcher — monitors tracked flights every 2 min for gate/status/delay changes
    startGateWatcher(io);
    console.log('[INIT] Gate watcher started (2-minute interval)');

    // Initial data fetch on startup (don't wait for first cron tick)
    console.log('[INIT] Fetching initial flight and weather data...');
    flightService.refreshFlights()
      .then(async () => {
        console.log('[INIT] Flights loaded');
        // Tell the frontend real data is ready — clears the cold-start mock badge immediately
        io.emit('flights:updated', { timestamp: new Date().toISOString() });
        // Generate initial notifications from the fresh data
        await generateNotifications(io);
        console.log('[INIT] Notifications generated');
      })
      .catch(err => console.error('[INIT] Flight fetch error:', err.message));

    weatherService.refreshWeather()
      .then(() => console.log('[INIT] Weather loaded'))
      .catch(err => console.error('[INIT] Weather fetch error:', err.message));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });