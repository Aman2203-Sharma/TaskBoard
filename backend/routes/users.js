'use strict';

/**
 * server/routes/users.js
 * ─────────────────────────────────────────────────────────────
 * User directory endpoints.
 *
 * GET /api/users — list all registered team members.
 * Requires authentication; excludes sensitive password hashes.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { all } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/users
 * Returns list of registered users: id, name, email, created_at.
 * Supports optional ?q= query param to search by name or email.
 * Requires a valid Bearer token.
 *
 * 200 { users: [...] }
 * 401 unauthenticated
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim().toLowerCase() : '';
    let users;
    if (q) {
      users = all(
        'SELECT id, name, email, created_at FROM users WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ? ORDER BY name ASC',
        [`%${q}%`, `%${q}%`]
      );
    } else {
      users = all(
        'SELECT id, name, email, created_at FROM users ORDER BY name ASC'
      );
    }
    return res.json({ users });
  } catch (err) {
    console.error('[users/list]', err);
    return res.status(500).json({ error: 'Failed to retrieve user directory.' });
  }
});

module.exports = router;
