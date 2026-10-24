import axios from 'axios';

const api = axios.create({
  baseURL: '', // Proxied via Vite to http://localhost:3000
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically inject Authorization: Bearer <token>
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('taskboard_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle session expiration cleanly
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized and not already on auth page, clear token
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
        localStorage.removeItem('taskboard_token');
        localStorage.removeItem('taskboard_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
