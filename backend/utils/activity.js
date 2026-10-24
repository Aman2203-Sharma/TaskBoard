'use strict';

/**
 * server/utils/activity.js
 * ─────────────────────────────────────────────────────────────
 * Lightweight helper to insert rows into activity_log.
 *
 * Usage:
 *   const { logActivity } = require('../utils/activity');
 *   logActivity(boardId, userId, 'TASK_CREATED', { taskId, title });
 *
 * `details` is serialised as JSON so any shape is acceptable.
 * ─────────────────────────────────────────────────────────────
 */

const { run } = require('../db');

/**
 * @param {number}  boardId
 * @param {number}  userId
 * @param {string}  action   — e.g. 'TASK_CREATED', 'TASK_MOVED', 'COMMENT_ADDED'
 * @param {object}  [details] — arbitrary metadata, stored as JSON
 */
function logActivity(boardId, userId, action, details = {}) {
  try {
    const serialized = typeof details === 'string' ? details : JSON.stringify(details);
    run(
      `INSERT INTO activity_log (board_id, user_id, action, details, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [boardId, userId, action, serialized]
    );
  } catch (err) {
    // Activity logging must never break the main request path.
    console.error('[activity] Failed to log:', action, err.message);
  }
}

module.exports = { logActivity };
