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
const { logActivity }       = require('../utils/activity');
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
 * optionally filtered by workspace_id, enriched with workspace name,
 * column count, task count, and caller's role.
 *
 * 200 { boards: [...] }
 * 403 access denied if workspace_id specified and caller is not a member
 */
router.get('/', authenticateToken, (req, res) => {
  const workspaceId = req.query.workspace_id ? Number(req.query.workspace_id) : null;

  if (workspaceId) {
    const wsMember = get(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, req.user.id]
    );
    if (!wsMember) {
      return res.status(403).json({ error: 'Access denied to this workspace.' });
    }
  }

  const sql = `
    SELECT
      b.id,
      b.name,
      b.description,
      b.owner_id,
      b.workspace_id,
      w.name                                           AS workspace_name,
      COALESCE(b.color, 'indigo')                      AS color,
      b.created_at,
      bm.role                                          AS my_role,
      COUNT(DISTINCT c.id)                             AS column_count,
      COUNT(DISTINCT t.id)                             AS task_count
    FROM boards b
    JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
    LEFT JOIN workspaces w ON w.id = b.workspace_id
    LEFT JOIN columns   c  ON c.board_id  = b.id
    LEFT JOIN tasks     t  ON t.board_id  = b.id
    ${workspaceId ? 'WHERE b.workspace_id = ?' : ''}
    GROUP BY b.id
    ORDER BY b.created_at DESC
  `;

  const params = workspaceId ? [req.user.id, workspaceId] : [req.user.id];
  const boards = all(sql, params);

  return res.json({ boards });
});

// ─────────────────────────────────────────────────────────────
// POST /api/boards
// ─────────────────────────────────────────────────────────────
/**
 * Body: { name: string, description?: string, color?: string, workspace_id?: number, auto_add_team?: boolean }
 *
 * Creates the board within the specified workspace, adds creator as 'owner'
 * in board_members, and inserts 3 default columns.
 *
 * 201 { board, columns }
 * 400 missing name
 * 403 not a member of target workspace
 */
router.post('/', authenticateToken, (req, res) => {
  const name        = req.body?.name?.trim();
  const description = req.body?.description ? (String(req.body.description).trim() || null) : null;
  const color       = req.body?.color?.trim() || 'indigo';
  const autoAddTeam = req.body?.auto_add_team === true || req.body?.auto_add_team === 'true';
  let workspaceId   = req.body?.workspace_id ? Number(req.body.workspace_id) : null;

  if (!name) {
    return res.status(400).json({ error: 'Board name is required.' });
  }

  // Resolve and verify workspace membership
  if (workspaceId) {
    const wsMember = get(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, req.user.id]
    );
    if (!wsMember) {
      return res.status(403).json({ error: 'You are not a member of this workspace.' });
    }
  } else {
    // Default to the first workspace the user belongs to
    const defaultWs = get(
      'SELECT workspace_id FROM workspace_members WHERE user_id = ? ORDER BY workspace_id ASC LIMIT 1',
      [req.user.id]
    );
    if (defaultWs) {
      workspaceId = defaultWs.workspace_id;
    } else {
      // Create initial workspace for this user if somehow absent
      const wsResult = run(
        'INSERT INTO workspaces (name, slug, owner_id) VALUES (?, ?, ?)',
        [`${req.user.name || 'Personal'}'s Workspace`, `workspace-${req.user.id}-${Date.now().toString(36)}`, req.user.id]
      );
      workspaceId = wsResult.lastInsertRowid;
      run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [workspaceId, req.user.id, 'owner']);
    }
  }

  let newBoard, newColumns;

  transaction(({ run: tRun, all: tAll }) => {
    // 1. Insert board with workspace_id
    const boardResult = tRun(
      'INSERT INTO boards (name, description, owner_id, color, workspace_id) VALUES (?, ?, ?, ?, ?)',
      [name, description, req.user.id, color, workspaceId]
    );
    const boardId = boardResult.lastInsertRowid;

    // 2. Add creator as owner in board_members
    tRun(
      'INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
      [boardId, req.user.id, 'owner']
    );

    // Auto-add teammates belonging to the SAME workspace
    if (autoAddTeam && workspaceId) {
      const workspaceTeammates = (tAll || all)(
        `SELECT u.id
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
         WHERE wm.workspace_id = ? AND wm.user_id != ?`,
        [workspaceId, req.user.id]
      );
      for (const u of workspaceTeammates) {
        tRun(
          'INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
          [boardId, u.id, 'member']
        );
      }
    }

    // Add explicitly chosen initial_members
    const initialMembers = req.body?.initial_members || req.body?.members || req.body?.member_ids;
    if (Array.isArray(initialMembers) && initialMembers.length > 0) {
      for (const item of initialMembers) {
        let uid = null;
        if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item.trim()))) {
          uid = Number(item);
        } else if (typeof item === 'object' && item?.id) {
          uid = Number(item.id);
        } else if (typeof item === 'string' && item.includes('@')) {
          const u = get('SELECT id FROM users WHERE LOWER(email) = ?', [item.trim().toLowerCase()]);
          if (u) uid = u.id;
        }
        if (uid && uid !== req.user.id) {
          tRun(
            'INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
            [boardId, uid, 'member']
          );
        }
      }
    }

    // 3. Insert default columns
    for (const col of DEFAULT_COLUMNS) {
      tRun(
        'INSERT INTO columns (board_id, name, position) VALUES (?, ?, ?)',
        [boardId, col.name, col.position]
      );
    }

    newBoard   = get('SELECT b.*, w.name AS workspace_name FROM boards b LEFT JOIN workspaces w ON w.id = b.workspace_id WHERE b.id = ?', [boardId]);
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
    `SELECT b.*, w.name AS workspace_name,
            COALESCE(bm.role, wm.role, CASE WHEN b.owner_id = ? THEN 'owner' ELSE 'member' END) AS my_role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     LEFT JOIN workspaces w ON w.id = b.workspace_id
     LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = ?
     WHERE b.id = ?`,
    [req.user.id, req.user.id, req.user.id, boardId]
  );

  const columns = all(
    'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
    [boardId]
  );

  const members = all(
    `SELECT DISTINCT
       u.id,
       u.name,
       u.email,
       COALESCE(bm.role, CASE WHEN b.owner_id = u.id THEN 'owner' ELSE 'member' END) AS role
     FROM boards b
     JOIN users u ON (b.owner_id = u.id OR u.id IN (SELECT user_id FROM board_members WHERE board_id = b.id))
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = u.id
     WHERE b.id = ?
     ORDER BY CASE WHEN b.owner_id = u.id THEN 1 ELSE 2 END, u.name ASC`,
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
// GET /api/boards/:id/members
// ─────────────────────────────────────────────────────────────
/**
 * Returns all explicit members/collaborators eligible for this board.
 *
 * 200 { members: [...] }
 */
const handleGetBoardMembers = (req, res) => {
  const boardId = Number(req.params.id || req.params.boardId);

  const members = all(
    `SELECT DISTINCT
       u.id,
       u.name,
       u.email,
       COALESCE(bm.role, CASE WHEN b.owner_id = u.id THEN 'owner' ELSE 'member' END) AS role
     FROM boards b
     JOIN users u ON (b.owner_id = u.id OR u.id IN (SELECT user_id FROM board_members WHERE board_id = b.id))
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = u.id
     WHERE b.id = ?
     ORDER BY CASE WHEN b.owner_id = u.id THEN 1 ELSE 2 END, u.name ASC`,
    [boardId]
  );

  return res.json({ members });
};

router.get('/:id/members', authenticateToken, checkBoardAccess('member'), handleGetBoardMembers);
router.get('/:boardId/members', authenticateToken, checkBoardAccess('member'), handleGetBoardMembers);

// ─────────────────────────────────────────────────────────────
// PATCH & PUT /api/boards/:id
// ─────────────────────────────────────────────────────────────
/**
 * Body: { title?: string, name?: string, description?: string, color?: string }
 * Restrict permission to board owner or workspace owner.
 *
 * 200 { board }
 */
const handleUpdateBoard = (req, res) => {
  const boardId = Number(req.params.id);
  const rawTitle = req.body.title !== undefined ? req.body.title : req.body.name;
  const { description, color } = req.body ?? {};

  const updates = [];
  const params  = [];
  let updatedTitle = null;

  if (rawTitle !== undefined) {
    const trimmed = String(rawTitle).trim();
    if (!trimmed || trimmed.length > 100) {
      return res.status(400).json({ error: 'Board title must be between 1 and 100 characters.' });
    }
    updates.push('name = ?');
    params.push(trimmed);
    updatedTitle = trimmed;
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(String(description).trim() || null);
  }
  if (color !== undefined) {
    updates.push('color = ?');
    params.push(String(color).trim() || 'indigo');
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Provide at least one field to update (title or description).' });
  }

  params.push(boardId);
  run(`UPDATE boards SET ${updates.join(', ')} WHERE id = ?`, params);

  // Log activity
  logActivity(boardId, req.user.id, 'BOARD_UPDATED', {
    title: updatedTitle,
    description: description !== undefined ? description : undefined,
  });

  const board = get(
    `SELECT b.*, w.name AS workspace_name, bm.role AS my_role
     FROM boards b
     LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
     LEFT JOIN workspaces w ON w.id = b.workspace_id
     WHERE b.id = ?`,
    [req.user.id, boardId]
  );

  return res.json({
    board,
    ...board,
  });
};

router.patch('/:id', authenticateToken, checkBoardAccess('owner'), handleUpdateBoard);
router.put('/:id', authenticateToken, checkBoardAccess('owner'), handleUpdateBoard);

// ─────────────────────────────────────────────────────────────
// DELETE /api/boards/:id
// ─────────────────────────────────────────────────────────────
/**
 * Hard-deletes the board inside a SQLite transaction cascading:
 *   comments, tasks, columns, activity logs, board members, and board.
 * Restrict permission strictly to board owner or workspace owner.
 *
 * 200 { success: true, message }
 */
router.delete('/:id', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId = Number(req.params.id);

  try {
    transaction((trx) => {
      // Find all tasks in this board
      const taskIds = trx.all('SELECT id FROM tasks WHERE board_id = ?', [boardId]).map((t) => t.id);

      // Cascade comments for all tasks in this board
      if (taskIds.length > 0) {
        trx.run(`DELETE FROM comments WHERE task_id IN (${taskIds.map(() => '?').join(',')})`, taskIds);
      }

      // Cascade tasks
      trx.run('DELETE FROM tasks WHERE board_id = ?', [boardId]);

      // Cascade columns
      trx.run('DELETE FROM columns WHERE board_id = ?', [boardId]);

      // Cascade activity logs
      trx.run('DELETE FROM activity_log WHERE board_id = ?', [boardId]);

      // Cascade board members
      trx.run('DELETE FROM board_members WHERE board_id = ?', [boardId]);

      // Delete board itself
      trx.run('DELETE FROM boards WHERE id = ?', [boardId]);
    });

    return res.json({ success: true, message: 'Board deleted successfully' });
  } catch (err) {
    console.error('[boards] Delete error:', err);
    return res.status(500).json({ error: 'Failed to delete board.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/boards/:id/available-members
// ─────────────────────────────────────────────────────────────
/**
 * Returns users belonging to the SAME workspace as the board,
 * who are NOT yet members of this board.
 * Prevents leaking registered users outside the workspace.
 *
 * 200 { users: [...] }
 */
router.get('/:id/available-members', authenticateToken, checkBoardAccess('member'), (req, res) => {
  const boardId = Number(req.params.id);
  const board = get('SELECT id, workspace_id FROM boards WHERE id = ?', [boardId]);
  if (!board) {
    return res.status(404).json({ error: 'Board not found.' });
  }

  let users = [];
  if (board.workspace_id) {
    users = all(
      `SELECT u.id, u.name, u.email
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = ?
         AND u.id NOT IN (SELECT user_id FROM board_members WHERE board_id = ?)
       ORDER BY u.name ASC`,
      [board.workspace_id, boardId]
    );
  } else {
    users = all(
      `SELECT u.id, u.name, u.email
       FROM users u
       WHERE u.id NOT IN (SELECT user_id FROM board_members WHERE board_id = ?)
       ORDER BY u.name ASC`,
      [boardId]
    );
  }

  return res.json({ users });
});

// ─────────────────────────────────────────────────────────────
// POST /api/boards/:id/members
// ─────────────────────────────────────────────────────────────
/**
 * Body: { email?: string, user_id?: number, member_ids?: number[], emails?: string[], members?: any[] }
 * Adds one or more registered users to the board as 'member'.
 * Strictly enforces checkBoardAccess('owner').
 *
 * 201 { success: true, member, members }
 * 400 error
 * 403 owner permission required
 * 404 user/board not found
 */
router.post('/:id/members', authenticateToken, checkBoardAccess('owner'), (req, res) => {
  const boardId = Number(req.params.id);

  // Normalize inputs to a list of identifiers (emails, IDs, or user objects)
  let items = [];
  if (Array.isArray(req.body?.member_ids)) {
    items = req.body.member_ids;
  } else if (Array.isArray(req.body?.user_ids)) {
    items = req.body.user_ids;
  } else if (Array.isArray(req.body?.emails)) {
    items = req.body.emails;
  } else if (Array.isArray(req.body?.members)) {
    items = req.body.members;
  } else if (req.body?.user_id !== undefined && req.body?.user_id !== null) {
    items = [req.body.user_id];
  } else if (req.body?.email) {
    items = [req.body.email];
  }

  if (items.length === 0) {
    return res.status(400).json({ error: 'At least one member email or ID is required.' });
  }

  const board = get('SELECT id, workspace_id FROM boards WHERE id = ?', [boardId]);
  if (!board) {
    return res.status(404).json({ error: 'Board not found.' });
  }

  const added = [];
  const errors = [];

  for (const item of items) {
    if (!item) continue;
    let user = null;
    if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item.trim()))) {
      user = get('SELECT id, name, email FROM users WHERE id = ?', [Number(item)]);
    } else if (typeof item === 'string') {
      user = get('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [item.trim().toLowerCase()]);
    } else if (typeof item === 'object') {
      if (item.id) {
        user = get('SELECT id, name, email FROM users WHERE id = ?', [Number(item.id)]);
      } else if (item.email) {
        user = get('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [String(item.email).trim().toLowerCase()]);
      }
    }

    if (!user) {
      errors.push(`User not found: ${JSON.stringify(item)}`);
      continue;
    }

    // Check workspace membership if board belongs to a workspace
    if (board.workspace_id) {
      const inWorkspace = get(
        'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
        [board.workspace_id, user.id]
      );
      if (!inWorkspace) {
        // Auto-add to workspace so user can collaborate on this board
        run(
          'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
          [board.workspace_id, user.id, 'member']
        );
      }
    }

    // Insert into board_members
    run(
      'INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)',
      [boardId, user.id, 'member']
    );

    added.push({ id: user.id, name: user.name, email: user.email, role: 'member' });
  }

  if (added.length === 0 && errors.length > 0) {
    return res.status(400).json({ error: errors[0] });
  }

  return res.status(201).json({
    success: true,
    member: added[0] || null,
    members: added,
    added_count: added.length,
    message: `Added ${added.length} member${added.length === 1 ? '' : 's'} to board.`,
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/boards/:id/members/:userId & /:boardId/members/:userId
// ─────────────────────────────────────────────────────────────
/**
 * Remove a member from the board.
 * Restrict permission strictly to board owner or workspace owner.
 *
 * 200 { success: true, message: "Member removed" }
 * 400 target is board owner / removing self
 * 404 membership not found
 */
const handleRemoveBoardMember = (req, res) => {
  const boardId      = Number(req.params.id || req.params.boardId);
  const targetUserId = Number(req.params.userId);

  if (!boardId || !targetUserId) {
    return res.status(400).json({ error: 'Board ID and User ID are required.' });
  }

  const board = get('SELECT id, owner_id FROM boards WHERE id = ?', [boardId]);
  if (!board) {
    return res.status(404).json({ error: 'Board not found.' });
  }

  // Prevent removing the board owner
  if (targetUserId === board.owner_id) {
    return res.status(400).json({ error: 'Cannot remove the board owner.' });
  }

  // Prevent user from removing themselves if they are the board owner
  if (targetUserId === req.user.id && req.user.id === board.owner_id) {
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

  // Remove from board_members
  run('DELETE FROM board_members WHERE board_id = ? AND user_id = ?', [boardId, targetUserId]);

  // Unassign this user from any tasks on this board
  run('UPDATE tasks SET assignee_id = NULL WHERE board_id = ? AND assignee_id = ?', [boardId, targetUserId]);

  // Record in activity_log
  logActivity(boardId, req.user.id, 'MEMBER_REMOVED', 'Removed member from board');

  return res.status(200).json({ success: true, message: 'Member removed' });
};

router.delete('/:id/members/:userId', authenticateToken, checkBoardAccess('owner'), handleRemoveBoardMember);
router.delete('/:boardId/members/:userId', authenticateToken, checkBoardAccess('owner'), handleRemoveBoardMember);

// ─────────────────────────────────────────────────────────────
// GET /api/boards/:id/activity
// ─────────────────────────────────────────────────────────────
/**
 * Returns the latest 50 activity log entries for the board.
 * Requires board member access.
 * Auto-seeds an initial 'board_created' entry if none exist.
 *
 * 200 { activity: [...], activities: [...] } (or array if wrap=array)
 */
router.get('/:id/activity', authenticateToken, checkBoardAccess('member'), (req, res) => {
  const boardId = Number(req.params.id);

  // Auto-seed initial activity log entry if none exists yet for this board
  const existingLog = get('SELECT id FROM activity_log WHERE board_id = ? LIMIT 1', [boardId]);
  if (!existingLog) {
    const board = get('SELECT id, owner_id, created_at FROM boards WHERE id = ?', [boardId]);
    if (board) {
      run(
        `INSERT INTO activity_log (board_id, user_id, action, details, created_at)
         VALUES (?, ?, 'board_created', 'Board created', COALESCE(?, datetime('now')))`,
        [boardId, board.owner_id || req.user.id, board.created_at]
      );
    }
  }

  const activities = all(
    `SELECT
       a.id,
       a.action,
       a.details,
       a.created_at,
       u.name  AS user_name,
       u.email AS user_email
     FROM activity_log a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE a.board_id = ?
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [boardId]
  );

  // Parse details JSON for each entry if JSON, otherwise preserve string
  const parsed = activities.map((a) => {
    let details = a.details;
    if (typeof a.details === 'string') {
      try {
        const json = JSON.parse(a.details);
        if (typeof json === 'object' && json !== null) {
          details = json;
        }
      } catch {
        details = a.details;
      }
    }
    return {
      ...a,
      details,
    };
  });

  if (req.query.wrap === 'array') {
    return res.json(parsed);
  }

  return res.json({
    activity: parsed,
    activities: parsed,
  });
});

// ── Nested column creation: POST /api/boards/:id/columns ─────
// Mount with mergeParams so /:id flows through from the parent router.
router.use('/:id/columns', boardColumnRouter);

module.exports = router;
