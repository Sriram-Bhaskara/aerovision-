// =====================================================
// API Service — Axios client for backend communication
// =====================================================
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aerovision_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (expired token)
// NOTE: redirect to '/' not '/login' — the app uses '/' for auth when no user is set
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('aerovision_token');
      localStorage.removeItem('aerovision_user');
      // Only hard-redirect if we have a stale token (not for guest/unauthenticated)
      const hadToken = !!error.config?.headers?.Authorization;
      if (hadToken && window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// ===== Auth =====
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/password', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
};

// ===== Flights =====
export const flightAPI = {
  getFlights: (params) => api.get('/flights', { params }),
  getStats: () => api.get('/flights/stats'),
  search: (q) => api.get('/flights/search', { params: { q } }),
  predict: (flightIata) => api.get(`/flights/${flightIata}/predict`),
  save: (data) => api.post('/flights/save', data),
  getSaved: () => api.get('/flights/saved/list'),
  removeSaved: (id) => api.delete(`/flights/saved/${id}`),
};

// ===== Weather =====
export const weatherAPI = {
  getCurrent: () => api.get('/weather'),
  refresh: () => api.get('/weather/refresh'),
};

// ===== Radar =====
export const radarAPI = {
  getData: (params) => api.get('/radar', { params }),
};

// ===== Notifications =====
export const notificationAPI = {
  getAll: (unreadOnly) => api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  // Flight tracking
  dismiss: (id) => api.delete(`/notifications/${id}`),
  trackFlight: (flight_iata) => api.post('/notifications/track', { flight_iata }),
  getTracked: () => api.get('/notifications/tracked'),
  untrack: (id) => api.delete(`/notifications/track/${id}`),
};

// ===== Users =====
export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
  updatePreferences: (prefs) => api.put('/users/preferences', { preferences: prefs }),
  getDashboard: () => api.get('/users/dashboard'),
};

// ===== Chatbot =====
export const chatAPI = {
  send: (message, history = []) => api.post('/chatbot/message', { message, history }, { timeout: 45000 }),
  getSuggestions: () => api.get('/chatbot/suggestions'),
};

// ===== Analytics =====
export const analyticsAPI = {
  getCrowd:       (terminal) => api.get('/analytics/crowd',  { params: { terminal } }),
  getAdminStats:  ()         => api.get('/analytics/admin'),
};

// ===== Travel Planner =====
export const travelAPI = {
  getTime: (origin, departure_iso, flight_type) =>
    api.get('/travel/time', { params: { origin, departure_iso, flight_type } }),
  getTimeByCoords: (lat, lng, label, departure_iso, flight_type) =>
    api.get('/travel/time', { params: { lat, lng, label, departure_iso, flight_type } }),
};

// ===== Mobility Assistance =====
export const assistAPI = {
  book: (data) => api.post('/assist/book', data),
  getMyBookings: () => api.get('/assist/my-bookings'),
  cancel: (id) => api.delete(`/assist/${id}`),
  getVerificationStatus: () => api.get('/assist/verify/status'),
  submitVerification: (data) => api.post('/assist/verify', data),
  // Staff dashboard
  adminGetBookings: (params) => api.get('/assist/admin/bookings', { params }),
  updateStatus: (id, status) => api.put(`/assist/${id}/status`, { status }),
};

export default api;
