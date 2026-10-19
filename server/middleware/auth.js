'use strict';

/**
 * server/middleware/auth.js
 * ─────────────────────────────────────────────────────────────
 * JWT Bearer-token authentication middleware.
 *
 * Usage (protect a route):
 *   const { authenticateToken } = require('../middleware/auth');
 *   router.get('/protected', authenticateToken, handler);
 *
 * On success, attaches the decoded JWT payload to `req.user`:
 *   { id, name, email, iat, exp }
 * ─────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'taskboard_dev_secret_change_in_production';

/**
 * Extracts and verifies a Bearer token from the Authorization header.
 *
 * Authorization: Bearer <token>
 *
 * 401 – header missing or token absent
 * 403 – token present but invalid / expired
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Header must be present and start with "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // TokenExpiredError or JsonWebTokenError
      const message = err.name === 'TokenExpiredError'
        ? 'Token has expired. Please log in again.'
        : 'Invalid token.';
      return res.status(403).json({ error: message });
    }

    // Attach decoded payload so downstream handlers can read req.user
    req.user = decoded; // { id, name, email, iat, exp }
    next();
  });
}

module.exports = { authenticateToken };
