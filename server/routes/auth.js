'use strict';

/**
 * server/routes/auth.js
 * ─────────────────────────────────────────────────────────────
 * Authentication endpoints:
 *   POST /api/auth/register  — create account
 *   POST /api/auth/login     — issue JWT
 *   GET  /api/auth/me        — return current user (protected)
 * ─────────────────────────────────────────────────────────────
 */

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const { get, run } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET  = process.env.JWT_SECRET  || 'taskboard_dev_secret_change_in_production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';
const SALT_ROUNDS = 10;

// ── Validation helpers ───────────────────────────────────────

/** Basic email format check (RFC-5321 simplified). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate registration payload.
 * Returns an array of human-readable error strings (empty = valid).
 */
function validateRegister({ name, email, password }) {
  const errors = [];
  if (!name   || typeof name   !== 'string' || name.trim().length   === 0) errors.push('Name is required.');
  if (!email  || typeof email  !== 'string' || !EMAIL_RE.test(email.trim())) errors.push('A valid email address is required.');
  if (!password || typeof password !== 'string' || password.length < 6)      errors.push('Password must be at least 6 characters.');
  return errors;
}

/**
 * Validate login payload.
 */
function validateLogin({ email, password }) {
  const errors = [];
  if (!email    || typeof email    !== 'string' || !EMAIL_RE.test(email.trim())) errors.push('A valid email address is required.');
  if (!password || typeof password !== 'string' || password.length === 0)         errors.push('Password is required.');
  return errors;
}

// ── POST /api/auth/register ──────────────────────────────────
/**
 * Body: { name: string, email: string, password: string }
 *
 * 201 { message, userId }
 * 400 validation error | email already taken
 * 500 unexpected server error
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    // 1. Input validation
    const errors = validateRegister({ name, email, password });
    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Duplicate email check
    const existing = get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Persist user
    const result = run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), normalizedEmail, password_hash]
    );

    return res.status(201).json({
      message: 'User registered successfully.',
      userId: result.lastInsertRowid,
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────
/**
 * Body: { email: string, password: string }
 *
 * 200 { token, user: { id, name, email } }
 * 400 validation error
 * 401 wrong credentials
 * 500 unexpected server error
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    // 1. Input validation
    const errors = validateLogin({ email, password });
    if (errors.length) {
      return res.status(400).json({ error: errors[0], errors });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Look up user — use a deliberate generic message to prevent
    //    user-enumeration attacks.
    const user = get(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 3. Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // 4. Sign JWT — never include password_hash in the payload
    const payload = { id: user.id, name: user.name, email: user.email };
    const token   = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    return res.status(200).json({
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me (protected) ─────────────────────────────
/**
 * Returns the currently authenticated user's profile.
 * Useful for the frontend to rehydrate session on page load.
 *
 * 200 { user: { id, name, email, created_at } }
 * 401 / 403 from authenticateToken middleware
 */
router.get('/me', authenticateToken, (req, res) => {
  const user = get(
    'SELECT id, name, email, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  return res.json({ user });
});

module.exports = router;
