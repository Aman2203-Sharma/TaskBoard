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

/** Fetch membership row for a task's parent board (with workspace and owner fallback). */
function getBoardMembership(taskId, userId) {
  return get(
    `SELECT COALESCE(bm.role, wm.role, CASE WHEN b.owner_id = ? THEN 'owner' ELSE 'member' END) AS role,
            t.board_id
     FROM tasks t
     JOIN boards b ON b.id = t.board_id
     LEFT JOIN board_members bm ON bm.board_id = t.board_id AND bm.user_id = ?
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = ?
     WHERE t.id = ? AND (bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR b.owner_id = ?)`,
    [userId, userId, userId, taskId, userId]
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
// POST /api/columns/:columnId/tasks & POST /api/tasks
// ─────────────────────────────────────────────────────────────
const handleCreateTask = (req, res) => {
  const columnId = Number(req.params.columnId || req.body?.column_id);
  if (!columnId || isNaN(columnId)) {
    return res.status(400).json({ error: 'Column ID is required.' });
  }

  const col = get(
    'SELECT c.*, b.id AS board_id, b.owner_id, b.workspace_id FROM columns c JOIN boards b ON b.id = c.board_id WHERE c.id = ?',
    [columnId]
  );
  if (!col) return res.status(404).json({ error: 'Column not found.' });

  const membership = get(
    `SELECT COALESCE(bm.role, wm.role, CASE WHEN b.owner_id = ? THEN 'owner' ELSE 'member' END) AS role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = ?
     WHERE b.id = ? AND (bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR b.owner_id = ?)`,
    [req.user.id, req.user.id, req.user.id, col.board_id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const title       = req.body?.title?.trim();
  const description = req.body?.description?.trim() ?? null;
  const rawPriority = req.body?.priority;
  const normalizedPriority = rawPriority
    ? (String(rawPriority).charAt(0).toUpperCase() + String(rawPriority).slice(1).toLowerCase())
    : 'Medium';

  const rawDueDate  = req.body?.due_date;
  let cleanDueDate  = null;
  if (rawDueDate && typeof rawDueDate === 'string' && rawDueDate.trim()) {
    const trimmed = rawDueDate.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !isNaN(Date.parse(trimmed))) {
      cleanDueDate = trimmed;
    }
  }

  const rawAssignee = req.body?.assignee_id;
  const parsedAssignee = (rawAssignee === '' || rawAssignee === null || rawAssignee === undefined || rawAssignee === 'unassigned')
    ? null
    : Number(rawAssignee);
  const assignee_id = (parsedAssignee !== null && !isNaN(parsedAssignee) && parsedAssignee > 0)
    ? parsedAssignee
    : null;

  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  if (!VALID_PRIORITIES.includes(normalizedPriority)) {
    return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}.` });
  }
  if (assignee_id !== null) {
    const am = get(
      `SELECT 1
       FROM users u
       LEFT JOIN board_members bm ON bm.board_id = ? AND bm.user_id = u.id
       LEFT JOIN boards b ON b.id = ?
       LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = u.id
       WHERE u.id = ? AND (bm.board_id = ? OR (b.workspace_id IS NOT NULL AND wm.workspace_id = b.workspace_id))`,
      [col.board_id, col.board_id, assignee_id, col.board_id]
    );
    if (!am) return res.status(400).json({ error: 'Assignee must be a member of this board.' });
  }

  const maxRow   = get('SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE column_id = ?', [columnId]);
  const position = (maxRow?.maxPos ?? -1) + 1;

  const result = run(
    `INSERT INTO tasks (board_id, column_id, title, description, priority, due_date, assignee_id, created_by, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [col.board_id, columnId, title, description, normalizedPriority, cleanDueDate, assignee_id, req.user.id, position]
  );

  const task = get(
    `SELECT t.*, u_a.name AS assignee_name, u_a.email AS assignee_email, u_c.name AS created_by_name
     FROM tasks t
     LEFT JOIN users u_a ON u_a.id = t.assignee_id
     LEFT JOIN users u_c ON u_c.id = t.created_by
     WHERE t.id = ?`,
    [result.lastInsertRowid]
  );

  const assignedText = task.assignee_name ? ` assigned to ${task.assignee_name}` : '';
  const message = `Created task "${title}"${assignedText}`;
  logActivity(col.board_id, req.user.id, 'TASK_CREATED', {
    taskId: task.id,
    title,
    assigneeName: task.assignee_name,
    message
  });

  return res.status(201).json({ success: true, task });
};

router.post('/columns/:columnId/tasks', authenticateToken, handleCreateTask);
router.post('/tasks', authenticateToken, handleCreateTask);

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

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const comments = all(
    `SELECT c.id, c.text, c.text AS content, c.created_at, u.id AS user_id, u.name AS user_name, u.name AS author_name, u.email AS user_email
     FROM task_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.task_id = ?
     ORDER BY c.created_at ASC`,
    [taskId]
  );

  return res.json({ task: { ...task, comments }, comments });
});

// ─────────────────────────────────────────────────────────────
// PUT & PATCH /api/tasks/:id
// ─────────────────────────────────────────────────────────────
const handleUpdateTask = (req, res) => {
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

  if (description !== undefined) {
    fields.description = (typeof description === 'string' && description.trim()) ? description.trim() : null;
  }

  if (priority !== undefined) {
    const normalizedPriority = priority
      ? (String(priority).charAt(0).toUpperCase() + String(priority).slice(1).toLowerCase())
      : 'Medium';
    if (!VALID_PRIORITIES.includes(normalizedPriority)) {
      return res.status(400).json({ error: 'priority must be one of: Low, Medium, High.' });
    }
    fields.priority = normalizedPriority;
  }

  if (due_date !== undefined) {
    if (!due_date || typeof due_date !== 'string' || !due_date.trim()) {
      fields.due_date = null;
    } else {
      const trimmedDate = due_date.trim().slice(0, 10);
      fields.due_date = (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate) && !isNaN(Date.parse(trimmedDate)))
        ? trimmedDate
        : null;
    }
  }

  if (assignee_id !== undefined) {
    const parsedAssignee = (assignee_id === '' || assignee_id === null || assignee_id === undefined || assignee_id === 'unassigned')
      ? null
      : Number(assignee_id);

    if (parsedAssignee !== null && !isNaN(parsedAssignee) && parsedAssignee > 0) {
      const am = get(
        `SELECT 1
         FROM users u
         LEFT JOIN board_members bm ON bm.board_id = ? AND bm.user_id = u.id
         LEFT JOIN boards b ON b.id = ?
         LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = u.id
         WHERE u.id = ? AND (bm.board_id = ? OR (b.workspace_id IS NOT NULL AND wm.workspace_id = b.workspace_id))`,
        [task.board_id, task.board_id, parsedAssignee, task.board_id]
      );
      if (!am) return res.status(400).json({ error: 'Assignee must be a member of this board.' });
      fields.assignee_id = parsedAssignee;
    } else {
      fields.assignee_id = null;
    }
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

  return res.json({ success: true, task: updated });
};

router.put('/tasks/:id', authenticateToken, handleUpdateTask);
router.patch('/tasks/:id', authenticateToken, handleUpdateTask);

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

  // Log activity
  const detailsMsg = `Moved "${task.title}" to ${targetCol.name}`;
  try {
    run(
      `INSERT INTO activity_log (board_id, user_id, action, details, created_at)
       VALUES (?, ?, 'moved_task', ?, datetime('now'))`,
      [task.board_id, req.user.id, detailsMsg]
    );
  } catch (err) {
    console.error('[tasks] Failed to log activity:', err);
  }

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
// GET /api/tasks/:taskId/comments & /api/tasks/:id/comments
// ─────────────────────────────────────────────────────────────
const handleGetTaskComments = (req, res) => {
  const taskId = Number(req.params.taskId || req.params.id);
  if (!taskId || isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task id.' });
  }

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const comments = all(
    `SELECT c.id, c.text, c.text AS content, c.created_at,
            u.id AS user_id, u.name AS user_name, u.name AS author_name, u.email AS user_email
     FROM task_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.task_id = ?
     ORDER BY c.created_at ASC`,
    [taskId]
  );

  return res.json({ comments });
};

router.get('/tasks/:taskId/comments', authenticateToken, handleGetTaskComments);
router.get('/tasks/:id/comments', authenticateToken, handleGetTaskComments);

// ─────────────────────────────────────────────────────────────
// POST /api/tasks/:taskId/comments & /api/tasks/:id/comments
// ─────────────────────────────────────────────────────────────
const handleCreateTaskComment = (req, res) => {
  const taskId = Number(req.params.taskId || req.params.id);
  if (!taskId || isNaN(taskId)) {
    return res.status(400).json({ error: 'Invalid task id.' });
  }

  const task = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  const membership = getBoardMembership(taskId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this board.' });
  }

  const text = (req.body?.text ?? req.body?.content ?? '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Comment text is required.' });
  }

  const result = run(
    'INSERT INTO task_comments (task_id, user_id, text) VALUES (?, ?, ?)',
    [taskId, req.user.id, text]
  );
  const newCommentId = result.lastInsertRowid;

  // Sync to legacy comments table if present
  try {
    run(
      'INSERT OR IGNORE INTO comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)',
      [newCommentId, taskId, req.user.id, text]
    );
  } catch {}

  const comment = get(
    `SELECT c.id, c.text, c.text AS content, c.created_at,
            u.id AS user_id, u.name AS user_name, u.name AS author_name, u.email AS user_email
     FROM task_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [newCommentId]
  );

  logActivity(task.board_id, req.user.id, 'COMMENT_ADDED', {
    taskId,
    taskTitle: task.title,
    message: 'Commented on task'
  });

  return res.status(201).json({ success: true, comment });
};

router.post('/tasks/:taskId/comments', authenticateToken, handleCreateTaskComment);
router.post('/tasks/:id/comments', authenticateToken, handleCreateTaskComment);

// ─────────────────────────────────────────────────────────────
// DELETE /api/tasks/:taskId/comments/:commentId & /api/comments/:id
// ─────────────────────────────────────────────────────────────
const handleDeleteTaskComment = (req, res) => {
  const commentId = Number(req.params.commentId || req.params.id);
  if (!commentId || isNaN(commentId)) {
    return res.status(400).json({ error: 'Invalid comment id.' });
  }

  let comment = get(
    `SELECT c.*, t.board_id, b.owner_id AS board_owner_id, b.workspace_id,
            w.owner_id AS workspace_owner_id, wm.role AS workspace_role
     FROM task_comments c
     JOIN tasks t ON t.id = c.task_id
     JOIN boards b ON b.id = t.board_id
     LEFT JOIN workspaces w ON w.id = b.workspace_id
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = ?
     WHERE c.id = ?`,
    [req.user.id, commentId]
  );

  if (!comment) {
    try {
      comment = get(
        `SELECT c.*, t.board_id, b.owner_id AS board_owner_id, b.workspace_id,
                w.owner_id AS workspace_owner_id, wm.role AS workspace_role
         FROM comments c
         JOIN tasks t ON t.id = c.task_id
         JOIN boards b ON b.id = t.board_id
         LEFT JOIN workspaces w ON w.id = b.workspace_id
         LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = ?
         WHERE c.id = ?`,
        [req.user.id, commentId]
      );
    } catch {}
  }

  if (!comment) {
    return res.status(404).json({ error: 'Comment not found.' });
  }

  const isAuthor = comment.user_id === req.user.id;
  const isBoardOwner = comment.board_owner_id === req.user.id;
  const isWorkspaceOwner = comment.workspace_owner_id === req.user.id || comment.workspace_role === 'owner';

  if (!isAuthor && !isBoardOwner && !isWorkspaceOwner) {
    return res.status(403).json({ error: 'You do not have permission to delete this comment.' });
  }

  try {
    run('DELETE FROM task_comments WHERE id = ?', [commentId]);
  } catch {}
  try {
    run('DELETE FROM comments WHERE id = ?', [commentId]);
  } catch {}

  return res.json({ success: true, message: 'Comment deleted successfully.' });
};

router.delete('/tasks/:taskId/comments/:commentId', authenticateToken, handleDeleteTaskComment);
router.delete('/tasks/:id/comments/:commentId', authenticateToken, handleDeleteTaskComment);
router.delete('/comments/:id', authenticateToken, handleDeleteTaskComment);
router.delete('/comments/:commentId', authenticateToken, handleDeleteTaskComment);

module.exports = router;
