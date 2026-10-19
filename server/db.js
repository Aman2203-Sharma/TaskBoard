'use strict';

/**
 * server/db.js
 * ─────────────────────────────────────────────────────────────
 * Single point of truth for the SQLite connection.
 *
 * Exports:
 *   db          — the raw better-sqlite3 Database instance
 *   run(sql, params)          — exec a single non-query statement
 *   get(sql, params)          — fetch one row (or undefined)
 *   all(sql, params)          — fetch all rows
 *   transaction(fn)           — wrap fn in a BEGIN/COMMIT transaction
 * ─────────────────────────────────────────────────────────────
 */

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

// ── Resolve the database file path ──────────────────────────
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '..', 'taskboard.db');

// ── Open (or create) the database ───────────────────────────
const db = new Database(DB_PATH, {
  // verbose: console.log,  // ← uncomment to log every SQL statement
});

// ── Enable foreign-key enforcement ──────────────────────────
// Must be set per-connection; SQLite does NOT enable it by default.
db.pragma('foreign_keys = ON');

// ── WAL mode for better read/write concurrency ──────────────
db.pragma('journal_mode = WAL');

// ── Helper: run schema + seed migrations ────────────────────
/**
 * Executes a .sql file as a batch of statements.
 * Uses db.exec() which handles multi-statement scripts.
 *
 * @param {string} filePath  Absolute path to the SQL file.
 */
function execSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  db.exec(sql);
}

// ── Thin query helpers ───────────────────────────────────────

/**
 * Execute a statement that does not return rows
 * (INSERT, UPDATE, DELETE, PRAGMA, …).
 *
 * @param {string} sql
 * @param {any[]}  [params=[]]
 * @returns {import('better-sqlite3').RunResult}
 */
function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

/**
 * Fetch at most one row.
 *
 * @param {string} sql
 * @param {any[]}  [params=[]]
 * @returns {Object|undefined}
 */
function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

/**
 * Fetch all matching rows.
 *
 * @param {string} sql
 * @param {any[]}  [params=[]]
 * @returns {Object[]}
 */
function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

/**
 * Wrap a callback in a BEGIN/COMMIT transaction.
 * On error the transaction is automatically rolled back.
 *
 * Usage:
 *   const result = transaction((trx) => {
 *     trx.run('INSERT INTO …', […]);
 *     trx.run('UPDATE  …', […]);
 *     return something;
 *   });
 *
 * The callback receives an object with the same { run, get, all }
 * helpers so callers don't need to import db directly.
 *
 * @param {Function} fn
 * @returns {*} whatever fn returns
 */
function transaction(fn) {
  const helpers = { run, get, all };
  return db.transaction(() => fn(helpers))();
}

module.exports = { db, execSqlFile, run, get, all, transaction };
