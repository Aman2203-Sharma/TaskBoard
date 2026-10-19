'use strict';

/**
 * server/routes/columns.js
 * ─────────────────────────────────────────────────────────────
 * Column management endpoints.
 *
 * Mounted at /api in app.js, so full paths are:
 *   POST   /api/boards/:id/columns   — create column (member)
 *   PUT    /api/columns/:id          — rename / reposition (member)
 *   DELETE /api/columns/:id          — delete column (owner)
 *
 * Cascade behaviour on DELETE:
 *   SQLite ON DELETE CASCADE removes all tasks (and their comments)
 *   that belong to the deleted column automatically.
 *   No client-side "block if tasks exist" — the cascade is intentional
 *   and documented here. If you want a block instead, swap the delete
 *   statement for a task-count check first.
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { get, run, all } = require('../db');
const { authenticateToken }  = require('../middleware/auth');
const { checkBoardAccess }   = require('../middleware/boardAuth');

// Two separate routers so they can be mounted at different paths
const boardColumnRouter  = express.Router({ mergeParams: true }); // mounted under /api/boards/:id/columns
const columnRouter       = express.Router();                       // mounted under /api/columns

// ── POST /api/boards/:id/columns ─────────────────────────────
/**
 * Create a new column on a board at the next available position.
 * Body: { name: string }
 *
 * 201 { column }
 * 400 missing name
 * 403/404 from middleware
 */
boardColumnRouter.post(
  '/',
  authenticateToken,
  checkBoardAccess('member'),
  (req, res) => {
    const boardId = Number(req.params.id);
    const name    = req.body?.name?.trim();

    if (!name) {
      return res.status(400).json({ error: 'Column name is required.' });
    }

    // Next position = max(position) + 1, or 0 for first column
    const maxRow  = get(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM columns WHERE board_id = ?',
      [boardId]
    );
    const position = (maxRow?.maxPos ?? -1) + 1;

    const result = run(
      'INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)',
      [boardId, name, position]
    );

    const column = get('SELECT * FROM columns WHERE id = ?', [result.lastInsertRowid]);
    return res.status(201).json({ column });
  }
);

// ── PUT /api/columns/:id ─────────────────────────────────────
/**
 * Rename or reposition a column.
 * Body: { name?: string, position?: number }
 *
 * 200 { column }
 * 400 no fields to update
 * 403 not a board member
 * 404 column not found
 */
columnRouter.put('/:id', authenticateToken, (req, res) => {
  const columnId = Number(req.params.id);

  const col = get('SELECT * FROM columns WHERE id = ?', [columnId]);
  if (!col) return res.status(404).json({ error: 'Column not found.' });

  // Verify caller is a member of the column's parent board
  const membership = get(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [col.board_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const { name, position } = req.body ?? {};
  const updates = [];
  const params  = [];

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Column name cannot be empty.' });
    updates.push('name = ?');
    params.push(trimmed);
  }
  if (position !== undefined) {
    if (!Number.isInteger(position) || position < 0) {
      return res.status(400).json({ error: 'position must be a non-negative integer.' });
    }
    updates.push('position = ?');
    params.push(position);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update (name or position).' });
  }

  params.push(columnId);
  run(`UPDATE columns SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = get('SELECT * FROM columns WHERE id = ?', [columnId]);
  return res.json({ column: updated });
});

// ── DELETE /api/columns/:id ───────────────────────────────────
/**
 * Delete a column. CASCADE removes all its tasks and comments.
 *
 * 200 { message }
 * 403 not owner of the board
 * 404 column not found
 */
columnRouter.delete('/:id', authenticateToken, (req, res) => {
  const columnId = Number(req.params.id);

  const col = get('SELECT * FROM columns WHERE id = ?', [columnId]);
  if (!col) return res.status(404).json({ error: 'Column not found.' });

  // Only board owners may delete columns
  const membership = get(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [col.board_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }
  if (membership.role !== 'owner') {
    return res.status(403).json({ error: 'Owner permission required.' });
  }

  // Count tasks so caller knows what was cascaded
  const { taskCount } = get(
    'SELECT COUNT(*) AS taskCount FROM tasks WHERE column_id = ?',
    [columnId]
  );

  run('DELETE FROM columns WHERE id = ?', [columnId]);

  return res.json({
    message: `Column deleted. ${taskCount} task(s) and their comments were also removed.`,
  });
});

module.exports = { boardColumnRouter, columnRouter };
