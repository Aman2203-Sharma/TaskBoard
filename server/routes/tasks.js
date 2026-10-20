'use strict';

/**
 * server/routes/tasks.js
 * ─────────────────────────────────────────────────────────────
 * Task CRUD + comment + reorder endpoints.
 *
 * Mounted at /api in app.js:
 *   POST   /api/columns/:columnId/tasks   — create task
 *   GET    /api/tasks/:id                 — get task + comments
 *   PUT    /api/tasks/:id                 — update task fields
 *   PATCH  /api/tasks/:id/move            — change column / position (simple, no log)
 *   PUT    /api/tasks/:id/reorder         — position-aware transactional reorder (with activity log)
 *   DELETE /api/tasks/:id                 — delete & reindex column
 *   POST   /api/tasks/:id/comments        — add comment
 *   DELETE /api/comments/:id              — delete own comment
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { get, run, all, transaction } = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { logActivity }       = require('../utils/activity');

const router = express.Router();

// ── Constants ─────────────────────────────────────────────────
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];

// ── Shared helpers ────────────────────────────────────────────

/** Fetch membership row for a task's parent board. */
function getBoardMembership(taskId, userId) {
  return get(
    `SELECT bm.role, t.board_id
     FROM tasks t
     JOIN board_members bm ON bm.board_id = t.board_id AND bm.user_id = ?
     WHERE t.id = ?`,
    [userId, taskId]
  );
}

/**
 * Close position gaps in a column after a deletion or move.
 * Ensures positions are always contiguous 0-based integers.
 */
function reindexColumn(columnId) {
  const tasks = all(
    'SELECT id FROM tasks WHERE column_id = ? ORDER BY position ASC',
    [columnId]
  );
  tasks.forEach((t, i) => run('UPDATE tasks SET position = ? WHERE id = ?', [i, t.id]));
}

// ─────────────────────────────────────────────────────────────
// POST /api/columns/:columnId/tasks
// ─────────────────────────────────────────────────────────────
router.post('/columns/:columnId/tasks', authenticateToken, (req, res) => {
  const columnId = Number(req.params.columnId);

  const col = get(
    'SELECT c.*, b.id AS board_id FROM columns c JOIN boards b ON b.id = c.board_id WHERE c.id = ?',
    [columnId]
  );
  if (!col) return res.status(404).json({ error: 'Column not found.' });

  const membership = get(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [col.board_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const title       = req.body?.title?.trim();
  const description = req.body?.description?.trim() ?? null;
  const priority    = req.body?.priority ?? 'Medium';
  const due_date    = req.body?.due_date ?? null;
  const assignee_id = req.body?.assignee_id ?? null;

  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  if (!VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.` });
  }
  if (assignee_id !== null) {
    const am = get('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?', [col.board_id, assignee_id]);
    if (!am) return res.status(400).json({ error: 'Assignee must be a member of this board.' });
  }

  const maxRow   = get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE column_id = ?', [columnId]);
  const position = (maxRow?.maxPos ?? -1) + 1;

  const result = run(
    `INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assignee_id, created_by, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [col.board_id, columnId, title, description, priority, due_date, assignee_id, req.user.id, position]
  );

  const task = get(
    `SELECT t.*, u_a.name AS assignee_name, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [result.lastInsertRowid]
  );

  logActivity(col.board_id, req.user.id, 'TASK_CREATED', { taskId: task.id, title });

  return res.status(201).json({ task });
});

// ─────────────────────────────────────────────────────────────
// GET /api/tasks/:id
// ─────────────────────────────────────────────────────────────
router.get('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get(
    `SELECT t.*, u_a.name AS assignee_name, u_a.email AS assignee_email, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [taskId]
  );
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = get(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [task.board_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const comments = all(
    `SELECT c.*, u.name AS author_name
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.task_id = ? ORDER BY c.created_at ASC`,
    [taskId]
  );

  return res.json({ task, comments });
});

// ─────────────────────────────────────────────────────────────
// PUT /api/tasks/:id
// ─────────────────────────────────────────────────────────────
router.put('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const fields = {};
  const { title, description, priority, due_date, assignee_id } = req.body ?? {};

  if (title !== undefined) {
    const t = String(title).trim();
    if (!t) return res.status(400).json({ error: 'Task title cannot be empty.' });
    fields.title = t;
  }
  if (description !== undefined) fields.description = String(description).trim() || null;
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.` });
    }
    fields.priority = priority;
  }
  if (due_date !== undefined) fields.due_date = due_date || null;
  if (assignee_id !== undefined) {
    if (assignee_id !== null) {
      const am = get('SELECT id FROM board_members WHERE board_id = ? AND user_id = ?', [task.board_id, assignee_id]);
      if (!am) return res.status(400).json({ error: 'Assignee must be a member of this board.' });
    }
    fields.assignee_id = assignee_id;
  }

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No fields provided to update.' });
  }

  fields.updated_at = new Date().toISOString();
  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  run(`UPDATE tasks SET ${setClauses} WHERE id = ?`, [...Object.values(fields), taskId]);

  const updated = get(
    `SELECT t.*, u_a.name AS assignee_name, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [taskId]
  );

  logActivity(task.board_id, req.user.id, 'TASK_UPDATED', { taskId, changes: Object.keys(fields) });

  return res.json({ task: updated });
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/tasks/:id/move  (simple column move, no position shifting)
// ─────────────────────────────────────────────────────────────
router.patch('/tasks/:id/move', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const { column_id, position } = req.body ?? {};
  if (column_id === undefined) return res.status(400).json({ error: 'column_id is required.' });

  const targetCol = get('SELECT * FROM columns WHERE id = ?', [column_id]);
  if (!targetCol) return res.status(404).json({ error: 'Target column not found.' });
  if (targetCol.board_id !== task.board_id) {
    return res.status(400).json({ error: 'Cannot move task to a column on a different board.' });
  }

  const oldColumnId = task.column_id;
  let newPos = position;
  if (newPos === undefined || newPos === null) {
    const maxRow = get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE column_id = ?', [column_id]);
    newPos = (maxRow?.maxPos ?? -1) + 1;
  }

  run('UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
    [column_id, newPos, new Date().toISOString(), taskId]);

  reindexColumn(oldColumnId);
  if (Number(column_id) !== oldColumnId) reindexColumn(Number(column_id));

  const updated = get(
    `SELECT t.*, u_a.name AS assignee_name, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [taskId]
  );
  return res.json({ task: updated });
});

// ─────────────────────────────────────────────────────────────
// PUT /api/tasks/:id/reorder
// ─────────────────────────────────────────────────────────────
/**
 * Transactional, position-aware reorder.
 *
 * Body: { target_column_id, new_position }
 *
 * Algorithm:
 *   Same column — moving DOWN (newPos > oldPos):
 *     Shift tasks where pos > oldPos AND pos <= newPos  → pos - 1
 *     Set dragged task pos = newPos
 *
 *   Same column — moving UP (newPos < oldPos):
 *     Shift tasks where pos >= newPos AND pos < oldPos  → pos + 1
 *     Set dragged task pos = newPos
 *
 *   Different columns:
 *     Source: shift tasks where pos > oldPos            → pos - 1
 *     Target: shift tasks where pos >= newPos           → pos + 1
 *     Set dragged task column_id = targetColId, pos = newPos
 *
 * 200 { success: true, task }
 * 400 validation
 * 403/404 access
 */
router.put('/tasks/:id/reorder', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const { target_column_id, new_position } = req.body ?? {};

  if (target_column_id === undefined || new_position === undefined) {
    return res.status(400).json({ error: 'target_column_id and new_position are required.' });
  }
  if (!Number.isInteger(new_position) || new_position < 0) {
    return res.status(400).json({ error: 'new_position must be a non-negative integer.' });
  }

  const targetColId = Number(target_column_id);
  const targetCol   = get('SELECT * FROM columns WHERE id = ?', [targetColId]);
  if (!targetCol) return res.status(404).json({ error: 'Target column not found.' });
  if (targetCol.board_id !== task.board_id) {
    return res.status(400).json({ error: 'Target column belongs to a different board.' });
  }

  // Fetch column names for activity log
  const sourceCol = get('SELECT name FROM columns WHERE id = ?', [task.column_id]);

  const oldColId  = task.column_id;
  const oldPos    = task.position;
  const newPos    = new_position;
  const sameCol   = (oldColId === targetColId);

  transaction(({ run: tRun }) => {
    if (sameCol) {
      if (newPos === oldPos) return; // no-op

      if (newPos > oldPos) {
        // Moving down: shift intervening tasks up
        tRun(
          'UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?',
          [oldColId, oldPos, newPos]
        );
      } else {
        // Moving up: shift intervening tasks down
        tRun(
          'UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?',
          [oldColId, newPos, oldPos]
        );
      }
      tRun('UPDATE tasks SET position = ?, updated_at = ? WHERE id = ?',
        [newPos, new Date().toISOString(), taskId]);
    } else {
      // Shrink source column gap
      tRun(
        'UPDATE tasks SET position = position - 1 WHERE column_id = ? AND position > ?',
        [oldColId, oldPos]
      );
      // Make room in target column
      tRun(
        'UPDATE tasks SET position = position + 1 WHERE column_id = ? AND position >= ?',
        [targetColId, newPos]
      );
      // Place the task
      tRun(
        'UPDATE tasks SET column_id = ?, position = ?, updated_at = ? WHERE id = ?',
        [targetColId, newPos, new Date().toISOString(), taskId]
      );
    }
  });

  logActivity(task.board_id, req.user.id, 'TASK_MOVED', {
    taskId,
    taskTitle:        task.title,
    from_column:      sourceCol?.name ?? oldColId,
    to_column:        targetCol.name,
    from_column_id:   oldColId,
    to_column_id:     targetColId,
    old_position:     oldPos,
    new_position:     newPos,
  });

  const updated = get(
    `SELECT t.*, u_a.name AS assignee_name, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [taskId]
  );

  return res.json({ success: true, task: updated });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/tasks/:id
// ─────────────────────────────────────────────────────────────
router.delete('/tasks/:id', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const colId = task.column_id;
  run('DELETE FROM tasks WHERE id = ?', [taskId]);
  reindexColumn(colId);

  logActivity(task.board_id, req.user.id, 'TASK_DELETED', { taskId, title: task.title });

  return res.json({ message: 'Task deleted successfully.' });
});

// ─────────────────────────────────────────────────────────────
// POST /api/tasks/:id/comments
// ─────────────────────────────────────────────────────────────
router.post('/tasks/:id/comments', authenticateToken, (req, res) => {
  const taskId = Number(req.params.id);

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const content = req.body?.content?.trim();
  if (!content) return res.status(400).json({ error: 'Comment content is required.' });

  const result = run(
    'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)',
    [taskId, req.user.id, content]
  );

  const comment = get(
    `SELECT c.*, u.name AS author_name
     FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [result.lastInsertRowid]
  );

  logActivity(task.board_id, req.user.id, 'COMMENT_ADDED', { taskId, taskTitle: task.title });

  return res.status(201).json({ comment });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/comments/:id
// ─────────────────────────────────────────────────────────────
router.delete('/comments/:id', authenticateToken, (req, res) => {
  const commentId = Number(req.params.id);

  const comment = get('SELECT * FROM comments WHERE id = ?', [commentId]);
  if (!comment) return res.status(404).json({ error: 'Comment not found.' });

  if (comment.user_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own comments.' });
  }

  run('DELETE FROM comments WHERE id = ?', [commentId]);
  return res.json({ message: 'Comment deleted.' });
});

module.exports = router;
