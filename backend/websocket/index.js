// =====================================================
// WebSocket (Socket.IO) — Real-time updates
// =====================================================
const jwt = require('jsonwebtoken');
const radarService = require('../services/radarService');

function setupWebSocket(io) {
  // Authentication middleware for WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
      } catch (e) {
        // Guest connection allowed
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id} (user: ${socket.userId || 'guest'})`);

    // Join user-specific room for targeted notifications
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Join airport room
    socket.join('airport:BLR');

    // Client requests radar update
    socket.on('radar:subscribe', async () => {
      socket.join('radar');
      try {
        const data = await radarService.getRadarData();
        socket.emit('radar:data', data);
      } catch (e) {
        socket.emit('error', { message: 'Radar data unavailable' });
      }
    });

    socket.on('radar:unsubscribe', () => {
      socket.leave('radar');
    });

    // Client requests flight board updates
    socket.on('flights:subscribe', () => {
      socket.join('flights');
    });

    // Client requests weather updates
    socket.on('weather:subscribe', () => {
      socket.join('weather');
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  // Periodic radar broadcast to subscribed clients (every 15s)
  const radarInterval = setInterval(async () => {
    const radarRoom = io.sockets.adapter.rooms.get('radar');
    if (radarRoom && radarRoom.size > 0) {
      try {
        const data = await radarService.getRadarData();
        io.to('radar').emit('radar:data', data);
      } catch (e) {
        // Silently fail
      }
    }
  }, 15000);

  process.on('SIGTERM', () => clearInterval(radarInterval));
  process.on('SIGINT', () => clearInterval(radarInterval));

  console.log('[WS] WebSocket server initialized');
}

/**
 * Send notification to a specific user via WebSocket
 */
function sendToUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, data);
}

/**
 * Broadcast to all connected clients
 */
function broadcast(io, event, data) {
  io.emit(event, data);
}

module.exports = { setupWebSocket, sendToUser, broadcast };
