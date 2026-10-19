/**
 * public/js/auth.js
 * ─────────────────────────────────────────────────────────────
 * Handles login, registration, auth-guard redirects, and logout.
 *
 * Conventions:
 *   localStorage.taskboard_token  — JWT string
 *   localStorage.taskboard_user   — JSON-stringified user object
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// ── Storage helpers ───────────────────────────────────────────
const Auth = {
  TOKEN_KEY : 'taskboard_token',
  USER_KEY  : 'taskboard_user',

  saveSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  getToken()  { return localStorage.getItem(this.TOKEN_KEY); },
  getUser()   {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY)); }
    catch { return null; }
  },
  isLoggedIn() { return !!this.getToken(); },

  /** Call from any page that requires authentication. */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.replace('/login.html');
    }
  },

  /** Call from login/register pages — bounce away if already authed. */
  redirectIfAuthed(destination = '/index.html') {
    if (this.isLoggedIn()) {
      window.location.replace(destination);
    }
  },

  /** Sign out and return to login. */
  logout() {
    this.clearSession();
    window.location.replace('/login.html');
  },
};

// ── UI helpers ────────────────────────────────────────────────

/**
 * Show an error banner inside `containerEl`.
 * @param {HTMLElement} containerEl   The .auth-error div
 * @param {string}      message
 */
function showError(containerEl, message) {
  containerEl.textContent = message;
  containerEl.hidden = false;
  containerEl.setAttribute('role', 'alert');
}

function hideError(containerEl) {
  containerEl.textContent = '';
  containerEl.hidden = true;
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.originalText;
}

// ── Register form ─────────────────────────────────────────────
function initRegisterForm() {
  const form    = document.getElementById('registerForm');
  const errorEl = document.getElementById('registerError');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (!form) return;

  // Bounce away if already logged in
  Auth.redirectIfAuthed();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const name     = form.name.value.trim();
    const email    = form.email.value.trim();
    const password = form.password.value;

    // Client-side pre-validation (server validates too)
    if (!name)              return showError(errorEl, 'Name is required.');
    if (!email)             return showError(errorEl, 'Email is required.');
    if (password.length < 6) return showError(errorEl, 'Password must be at least 6 characters.');

    setLoading(submitBtn, true);

    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return showError(errorEl, data.error || 'Registration failed.');
      }

      // Registration successful — redirect to login with success hint
      window.location.replace('/login.html?registered=1');
    } catch (err) {
      showError(errorEl, 'Network error. Please check your connection.');
      console.error('[register]', err);
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

// ── Login form ────────────────────────────────────────────────
function initLoginForm() {
  const form      = document.getElementById('loginForm');
  const errorEl   = document.getElementById('loginError');
  const successEl = document.getElementById('loginSuccess');
  const submitBtn = form?.querySelector('button[type="submit"]');
  if (!form) return;

  // Bounce away if already logged in
  Auth.redirectIfAuthed();

  // Show success banner if redirected from registration
  if (new URLSearchParams(window.location.search).get('registered')) {
    if (successEl) {
      successEl.textContent = '✓ Account created! Please log in.';
      successEl.hidden = false;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const email    = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) {
      return showError(errorEl, 'Email and password are required.');
    }

    setLoading(submitBtn, true);

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return showError(errorEl, data.error || 'Login failed.');
      }

      Auth.saveSession(data.token, data.user);
      window.location.replace('/dashboard.html');
    } catch (err) {
      showError(errorEl, 'Network error. Please check your connection.');
      console.error('[login]', err);
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

// ── Logout button(s) ─────────────────────────────────────────
function initLogout() {
  document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
    });
  });
}

// ── Auto-init based on page ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initRegisterForm();
  initLoginForm();
  initLogout();
});

// Export for use by other scripts (e.g. main.js guarding the board)
window.Auth = Auth;
