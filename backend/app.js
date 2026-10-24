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
const fs     = require('fs');
const express = require('express');
const cors   = require('cors');
const { db, execSqlFile, get } = require('./db');
const authRoutes                          = require('./routes/auth');
const userRoutes                          = require('./routes/users');
const workspaceRoutes                     = require('./routes/workspaces');
const boardRoutes                         = require('./routes/boards');
const { columnRouter } = require('./routes/columns');
const taskRoutes       = require('./routes/tasks');

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
  const SCHEMA = fs.existsSync(path.resolve(__dirname, 'schema.sql'))
    ? path.resolve(__dirname, 'schema.sql')
    : path.resolve(__dirname, '..', 'schema.sql');
  const SEED   = fs.existsSync(path.resolve(__dirname, 'seed.sql'))
    ? path.resolve(__dirname, 'seed.sql')
    : path.resolve(__dirname, '..', 'seed.sql');

  console.log('[db] Applying schema migrations…');
  execSqlFile(SCHEMA);

  // Safe incremental migration: add color column to boards if missing
  try {
    db.exec("ALTER TABLE boards ADD COLUMN color TEXT DEFAULT 'indigo'");
  } catch {
    // Column already exists, safe to ignore
  }

  // Safe incremental migration: add security questions columns to users
  try {
    db.exec("ALTER TABLE users ADD COLUMN sec_q1_hash TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN sec_q2_hash TEXT");
  } catch {}
  try {
    db.exec("ALTER TABLE users ADD COLUMN sec_q3_hash TEXT");
  } catch {}

  // Pre-seed demo users with security questions hash (answer: "demo")
  try {
    const demoSecHash = '$2b$10$J/skO5RQD.qnh1voaQDGe.FwC593phVjCGTBBUhZB654iyKuprgUi';
    db.prepare(`
      UPDATE users
      SET sec_q1_hash = COALESCE(sec_q1_hash, ?),
          sec_q2_hash = COALESCE(sec_q2_hash, ?),
          sec_q3_hash = COALESCE(sec_q3_hash, ?)
      WHERE LOWER(email) IN ('alice@taskboard.dev', 'bob@taskboard.dev', 'amansharma888930@gmail.com', 'charlie@taskboard.dev')
    `).run(demoSecHash, demoSecHash, demoSecHash);
  } catch (err) {
    console.error('[db] Error seeding security question hashes:', err.message);
  }

  // Safe incremental migration: ensure workspaces tables and board workspace_id column
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id          INTEGER  PRIMARY KEY AUTOINCREMENT,
        name        TEXT     NOT NULL,
        slug        TEXT     UNIQUE NOT NULL,
        description TEXT,
        owner_id    INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role         TEXT    NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
        joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, user_id)
      );
    `);
  } catch (err) {
    console.error('[db] Error creating workspace tables:', err.message);
  }

  try {
    db.exec("ALTER TABLE workspaces ADD COLUMN description TEXT");
  } catch {
    // Column already exists, safe to ignore
  }

  try {
    db.exec("ALTER TABLE boards ADD COLUMN workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE");
  } catch {
    // Column already exists, safe to ignore
  }

  // Safe incremental migration: ensure task_comments table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    const hasCommentsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").get();
    if (hasCommentsTable) {
      db.exec(`
        INSERT OR IGNORE INTO task_comments (id, task_id, user_id, text, created_at)
        SELECT id, task_id, user_id, content, created_at FROM comments;
      `);
    }
  } catch (err) {
    console.error('[db] Error creating task_comments table:', err.message);
  }

  const userCount = get('SELECT COUNT(*) AS cnt FROM users');
  if (userCount && userCount.cnt === 0) {
    console.log('[db] Seeding initial data…');
    execSqlFile(SEED);
    console.log('[db] Seed complete.');
  } else {
    console.log('[db] Database already seeded — skipping seed.sql.');

    // Ensure default workspace exists and existing data is migrated
    try {
      const firstUser = get('SELECT id FROM users ORDER BY id ASC LIMIT 1');
      if (firstUser) {
        // Never strictly check against a single slug or recreate if any Acme Corp or valid workspace already exists
        let defaultWs = get("SELECT id FROM workspaces WHERE slug IN ('acme-corp', 'acme-corp-1') OR name = 'Acme Corp' ORDER BY id ASC LIMIT 1")
                     || get("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
        if (!defaultWs) {
          const wsRes = db.prepare('INSERT INTO workspaces (name, slug, owner_id) VALUES (?, ?, ?)').run('Acme Corp', 'acme-corp', firstUser.id);
          defaultWs = { id: wsRes.lastInsertRowid };
        }

        // Associate seed users Alice (id 1), Bob (id 2), Aman (id 7), and Charlie (id 42) with default workspace
        const seedUserIds = [1, 2, 7, 42];
        for (const uid of seedUserIds) {
          const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(uid);
          if (userExists) {
            const role = uid === firstUser.id ? 'owner' : 'member';
            db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)').run(defaultWs.id, uid, role);
          }
        }

        // Migrate existing boards to default workspace if not set
        db.prepare('UPDATE boards SET workspace_id = ? WHERE workspace_id IS NULL').run(defaultWs.id);
      }
    } catch (err) {
      console.error('[db] Workspace migration error:', err.message);
    }
  }

  // Safe migration: Ensure board_members is populated for existing boards (idempotent)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'seed_board_members_v1'").get();
    if (!migrated) {
      db.exec(`
        INSERT OR IGNORE INTO board_members (board_id, user_id, role)
        SELECT b.id, b.owner_id, 'owner'
        FROM boards b;

        INSERT OR IGNORE INTO board_members (board_id, user_id, role)
        SELECT b.id, wm.user_id, 'member'
        FROM boards b
        JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
        WHERE b.owner_id != wm.user_id;
      `);
      db.prepare("INSERT INTO _migrations (name) VALUES ('seed_board_members_v1')").run();
      console.log('[db] Seeded initial board_members from existing workspaces.');
    }
  } catch (err) {
    console.error('[db] Board members initial sync error:', err.message);
  }

  console.log('[db] Initialization complete.');
}

initDatabase();

// ── 2. Global middleware ─────────────────────────────────────
app.use(cors());                                           // enable Cross-Origin Resource Sharing
app.use(express.json());                                   // parse application/json
app.use(express.urlencoded({ extended: false }));          // parse form data

// ── 3. API routes ────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/boards',     boardRoutes);  // includes nested /:id/columns
app.use('/api/columns', columnRouter); // PUT|DELETE /api/columns/:id
app.use('/api',         taskRoutes);   // tasks + comments (handles /api/columns/:id/tasks, /api/tasks/:id, /api/comments/:id)

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

// ── 4. Root & API Discovery ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    name: 'TaskBoard API Server',
    message: 'Backend API is running. In development, access the React frontend via Vite at http://localhost:5173.',
    health: '/api/health'
  });
});

// ── 5. 404 handler for unknown API routes ────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

// ── 6. Client & Production Routing ───────────────────────────
const clientDistPath = path.resolve(__dirname, '..', 'frontend', 'dist');

if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDistPath)) {
  // In production, serve the built React client assets and SPA fallback
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // In development, Vite dev server handles client routes (e.g. /dashboard, /workspaces) at http://localhost:5173.
  // Express focuses strictly on serving JSON API endpoints and does not intercept client routes.
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      message: `Cannot ${req.method} ${req.originalUrl}. In development, React client routes are served by Vite at http://localhost:5173.`
    });
  });
}

// ── 6. Global error handler ──────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── 7. Start listening ───────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`\n🚀  TaskBoard server running at http://localhost:${PORT}`);
    console.log(`    Health check → http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app; // exported for testing
