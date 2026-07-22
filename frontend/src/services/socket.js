// =====================================================
// Socket.IO Client — Real-time connection
// =====================================================
import { io } from 'socket.io-client';
import { useState, useEffect } from 'react';

// Use current page origin so Vite's /socket.io proxy works on any device
// (phone on same WiFi hits 192.168.x.x:5173, Vite proxies /socket.io → localhost:5000)
// In production the backend serves the frontend from the same origin anyway.
const WS_URL = import.meta.env.VITE_WS_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000');

let socket = null;

export function connectSocket(token = null) {
  if (socket?.connected) return socket;

  try {
    socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WS] Connection error (backend may be offline):', err.message);
    });
  } catch (err) {
    console.warn('[WS] Failed to create socket:', err.message);
    socket = null;
  }

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// React hook — returns the socket instance
export function useSocket() {
  const [currentSocket, setCurrentSocket] = useState(socket);

  useEffect(() => {
    // Ensure socket exists
    if (!socket) {
      const token = localStorage.getItem('aerovision_token') || null;
      connectSocket(token);
    }

    // Update state
    setCurrentSocket(socket);

    // Guard: socket might still be null if connectSocket failed
    if (!socket) return;

    const handleConnect    = () => setCurrentSocket(socket);
    const handleDisconnect = () => setCurrentSocket(socket);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket?.off('connect', handleConnect);
      socket?.off('disconnect', handleDisconnect);
    };
  }, []);

  return currentSocket;
}

// Subscribe to radar updates
export function subscribeRadar(callback) {
  if (!socket) return () => {};
  socket.emit('radar:subscribe');
  socket.on('radar:data', callback);
  return () => {
    socket?.emit('radar:unsubscribe');
    socket?.off('radar:data', callback);
  };
}

// Subscribe to flight updates
export function subscribeFlights(callback) {
  if (!socket) return () => {};
  socket.emit('flights:subscribe');
  socket.on('flights:updated', callback);
  return () => socket?.off('flights:updated', callback);
}

// Subscribe to weather updates
export function subscribeWeather(callback) {
  if (!socket) return () => {};
  socket.emit('weather:subscribe');
  socket.on('weather:updated', callback);
  return () => socket?.off('weather:updated', callback);
}

// Listen for notifications
export function onNotification(callback) {
  if (!socket) return () => {};
  socket.on('notification', callback);
  return () => socket?.off('notification', callback);
}
