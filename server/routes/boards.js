'use strict';

/**
 * server/routes/boards.js
 * ─────────────────────────────────────────────────────────────
 * Board & member management endpoints.
 *
 * All routes require `authenticateToken` (req.user populated).
 * Routes that operate on a specific board further require
 * `checkBoardAccess('member' | 'owner')`.
 *
 * GET    /api/boards            — list boards for current user
 * POST   /api/boards            — create board (with default columns)
 * GET    /api/boards/:id        — full board detail (member)
 * PUT    /api/boards/:id        — update name/description (owner)
 * DELETE /api/boards/:id        — delete board (owner, cascades all)
 * POST   /api/boards/:id/members          — add member by email (owner)
 * DELETE /api/boards/:id/members/:userId  — remove member (owner)
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { get, run, all, transaction } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { checkBoardAccess }  = require('../middleware/boardAuth');
const { boardColumnRouter } = require('./columns'); // nested column creation

const router = express.Router();

// ── Default columns inserted with every new board ─────────────
const DEFAULT_COLUMNS = [
  { name: 'To Do',       position: 0 },
  { name: 'In Progress', position: 1 },
  { name: 'Done',        position: 2 },
];

// ─────────────────────────────────────────────────────────────
// GET /api/boards
// ─────────────────────────────────────────────────────────────
/**
 * Returns every board the authenticated user belongs to,
 * enriched with column count, task count, and the caller's role.
 *
 * 200 { boards: [...] }
 */
router.get('/', authenticateToken, (req, res) => {
  const boards = all(
    `SELECT
       b.id,
       b.name,
       b.description,
       b.owner_id,
       b.created_at,
       bm.role                                          AS my_role,
       COUNT(DISTINCT c.id)                             AS column_count,
       COUNT(DISTINCT t.id)                             AS task_count
     FROM boards b
     JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     LEFT JOIN columns   c  ON c.board_id  = b.id
     LEFT JOIN tasks     t  ON t.board_id  = b.id
     GROUP BY b.id
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );

  return res.json({ boards });
});

// ─────────────────────────────────────────────────────────────
// POST /api/boards
// ─────────────────────────────────────────────────────────────
/**
 * Body: { name: string, description?: string }
 *
 * Creates the board, adds the creator as 'owner' in board_members,
 * and inserts the 3 default columns — all inside one transaction.
 *
 * 201 { board, columns }
 * 400 missing name
 */
router.post('/', authenticateToken, (req, res) => {
  const name        = req.body?.name?.trim();
  const description = req.body?.description?.trim() ?? null;

  if (!name) {
    return res.status(400).json({ error: 'Board name is required.' });
  }

  let newBoard, newColumns;

  transaction(({ run: tRun }) => {
    // 1. Insert board
    const boardResult = tRun(
      'INSERT INTO boards (name, description, owner_id) VALUES (?, ?, ?)',
      [name, description, req.user.id]
    );
    const boardId = boardResult.lastInsertRowid;

    // 2. Add creator as owner
    tRun(
      'INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
      [boardId, req.user.id, 'owner']
    );

    // 3. Insert default columns
    for (const col of DEFAULT_COLUMNS) {
      tRun(
        'INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)',
        [boardId, col.name, col.position]
      );
    }

    newBoard   = get('SELECT * FROM boards  WHERE id = ?', [boardId]);
    newColumns = all('SELECT * FROM columns WHERE board_id = ? ORDER BY position', [boardId]);
  });

  return res.status(201).json({ board: { ...newBoard, my_role: 'owner' }, columns: newColumns });
});

// ─────────────────────────────────────────────────────────────
// GET /api/boards/:id
// ─────────────────────────────────────────────────────────────
/**
 * Full board payload: board meta, columns (ordered), members, tasks.
 *
 * 200 { board, columns, members, tasks }
 * 403/404 from middleware
 */
router.get('/:id', authenticateToken, checkBoardAccess('member'), (req, res) => {
  const boardId = Number(req.params.id);

  const board = get(
    `SELECT b.*, bm.role AS my_role
     FROM boards b
     JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     WHERE b.id = ?`,
    [req.user.id, boardId]
  );

  const columns = all(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
    [boardId]
  );

  const members = all(
    `SELECT u.id, u.name, u.email, bm.role
     FROM board_members bm
     JOIN users u ON u.id = bm.user_id
     WHERE bm.board_id = ?
     ORDER BY bm.role DESC, u.name`,  // owners first
    [boardId]
  );

  const tasks = all(
    `SELECT
       t.*,
       u_assignee.name  AS assignee_name,
       u_creator.name   AS created_by_name
     FROM tasks t
     LEFT JOIN users u_assignee ON u_assignee.id = t.assignee_id
     LEFT JOIN users u_creator  ON u_creator.id  = t.created_by
     WHERE t.board_id = ?
     ORDER BY t.column_id, t.position`,
    [boardId]
  );

  return res.json({ board, columns, members, tasks });
});

// ─────────────────────────────────────────────────────────────
// PUT /api/boards/:id
// ─────────────────────────────────────────────────────────────
/**
 * Body: { name?: string, description?: string }
 * At least one field must be present.
 *
 * 200 { board }
 */
router.put('/:id', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId = Number(req.params.id);
  const { name, description } = req.body ?? {};

  const updates = [];
  const params  = [];

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ error: 'Board name cannot be empty.' });
    updates.push('name = ?');
    params.push(trimmed);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(String(description).trim() || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update (name or description).' });
  }

  params.push(boardId);
  run(`UPDATE boards SET ${updates.join(', ')} WHERE id = ?`, params);

  const board = get(
    `SELECT b.*, bm.role AS my_role
     FROM boards b
     JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     WHERE b.id = ?`,
    [req.user.id, boardId]
  );

  return res.json({ board });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/boards/:id
// ─────────────────────────────────────────────────────────────
/**
 * Hard-deletes the board. SQLite CASCADE removes:
 *   board_members, columns, tasks, comments.
 *
 * 200 { message }
 */
router.delete('/:id', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId = Number(req.params.id);
  run('DELETE FROM boards WHERE id = ?', [boardId]);
  return res.json({ message: 'Board and all associated data deleted successfully.' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/boards/:id/members
// ─────────────────────────────────────────────────────────────
/**
 * Body: { email: string }
 * Adds a registered user to the board as 'member'.
 *
 * 201 { member }
 * 400 already a member
 * 404 user not found
 */
router.post('/:id/members', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId = Number(req.params.id);
  const email   = req.body?.email?.trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  // Find user by email
  const user = get('SELECT id, name, email FROM users WHERE email = ?', [email]);
  if (!user) {
    return res.status(404).json({ error: 'No user found with that email address.' });
  }

  // Check for existing membership
  const existing = get(
    'SELECT id FROM board_members WHERE board_id = ? AND user_id = ?',
    [boardId, user.id]
  );
  if (existing) {
    return res.status(400).json({ error: 'User is already a member of this board.' });
  }

  run(
    'INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
    [boardId, user.id, 'member']
  );

  return res.status(201).json({
    member: { id: user.id, name: user.name, email: user.email, role: 'member' },
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/boards/:id/members/:userId
// ─────────────────────────────────────────────────────────────
/**
 * Remove a member from the board.
 * An owner cannot remove themselves (board must have at least one owner).
 *
 * 200 { message }
 * 400 target is board owner / removing self
 * 404 membership not found
 */
router.delete('/:id/members/:userId', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId      = Number(req.params.id);
  const targetUserId = Number(req.params.userId);

  // Prevent removing the only owner (i.e., self)
  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself from a board you own.' });
  }

  const membership = get(
    'SELECT id, role FROM board_members WHERE board_id = ? AND user_id = ?',
    [boardId, targetUserId]
  );
  if (!membership) {
    return res.status(404).json({ error: 'This user is not a member of the board.' });
  }
  if (membership.role === 'owner') {
    return res.status(400).json({ error: 'Cannot remove another owner. Transfer ownership first.' });
  }

  run('DELETE FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, targetUserId]);
  return res.json({ message: 'Member removed successfully.' });
});

// ─────────────────────────────────────────────────────────────
// GET /api/boards/:id/activity
// ─────────────────────────────────────────────────────────────
/**
 * Returns the latest 30 activity log entries for the board.
 * Requires board member access.
 *
 * 200 { activities: [...] }
 */
router.get('/:id/activity', authenticateToken, checkBoardAccess('member'), (req, res) => {
  const boardId = Number(req.params.id);

  const activities = all(
    `SELECT
       al.id,
       al.action,
       al.details,
       al.created_at,
       u.id    AS user_id,
       u.name  AS user_name,
       u.email AS user_email
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.board_id = ?
     ORDER BY al.created_at DESC
     LIMIT 30`,
    [boardId]
  );

  // Parse details JSON for each entry
  const parsed = activities.map(a => ({
    ...a,
    details: a.details ? (() => { try { return JSON.parse(a.details); } catch { return {}; } })() : {},
  }));

  return res.json({ activities: parsed });
});

// ── Nested column creation: POST /api/boards/:id/columns ─────
// Mount with mergeParams so /:id flows through from the parent router.
router.use('/:id/columns', boardColumnRouter);

module.exports = router;
