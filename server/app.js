'use strict';

/**
 * server/app.js
 * ─────────────────────────────────────────────────────────────
 * Express application entry-point.
 *
 * Responsibilities:
 *   1. Load environment variables (.env)
 *   2. Run schema + seed migrations (idempotent — schema uses
 *      CREATE TABLE IF NOT EXISTS, seed is skipped when users
 *      table already has rows)
 *   3. Mount middleware (JSON parser, static files)
 *   4. Expose GET /api/health
 *   5. Start the HTTP server
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const path   = require('path');
const express = require('express');
const { db, execSqlFile, get } = require('./db');
const authRoutes                          = require('./routes/auth');
const boardRoutes                         = require('./routes/boards');
const { boardColumnRouter, columnRouter } = require('./routes/columns');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── 1. Run database migrations ───────────────────────────────
/**
 * Applies schema.sql (DDL) unconditionally — every statement is
 * guarded with IF NOT EXISTS so it is safe to run on each start.
 *
 * Applies seed.sql only when the `users` table is empty, which
 * guarantees idempotency across restarts.
 */
function initDatabase() {
  const SCHEMA = path.resolve(__dirname, '..', 'schema.sql');
  const SEED   = path.resolve(__dirname, '..', 'seed.sql');

  console.log('[db] Applying schema migrations…');
  execSqlFile(SCHEMA);

  const userCount = get('SELECT COUNT(*) AS cnt FROM users');
  if (userCount && userCount.cnt === 0) {
    console.log('[db] Seeding initial data…');
    execSqlFile(SEED);
    console.log('[db] Seed complete.');
  } else {
    console.log('[db] Database already seeded — skipping seed.sql.');
  }

  console.log('[db] Initialization complete.');
}

initDatabase();

// ── 2. Global middleware ─────────────────────────────────────
app.use(express.json());                                   // parse application/json
app.use(express.urlencoded({ extended: false }));          // parse form data
app.use(express.static(path.resolve(__dirname, '..', 'public'))); // serve frontend

// ── 3. API routes ────────────────────────────────────────────
app.use('/api/auth',                authRoutes);
app.use('/api/boards',              boardRoutes);
app.use('/api/boards',              boardColumnRouter); // POST /api/boards/:id/columns
app.use('/api/columns',             columnRouter);      // PUT|DELETE /api/columns/:id

/**
 * GET /api/health
 * Lightweight liveness probe.
 *
 * Response:
 *   200 { status: "ok", timestamp: <ISO-8601> }
 *   503 { status: "error", message: <string> }
 */
app.get('/api/health', (req, res) => {
  try {
    // Ping the database so the health check also validates DB connectivity.
    db.prepare('SELECT 1').get();

    res.json({
      status:    'ok',
      timestamp: new Date().toISOString(),
      database:  'connected',
    });
  } catch (err) {
    console.error('[health] Database ping failed:', err.message);
    res.status(503).json({
      status:    'error',
      timestamp: new Date().toISOString(),
      message:   'Database unreachable',
    });
  }
});

// ── 4. 404 handler for unknown API routes ────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// ── 5. SPA fallback — serve index.html for all non-API GETs ─
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// ── 6. Global error handler ──────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── 7. Start listening ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  TaskBoard server running at http://localhost:${PORT}`);
  console.log(`    Health check → http://localhost:${PORT}/api/health\n`);
});

module.exports = app; // exported for testing
