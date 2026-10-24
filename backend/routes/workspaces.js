'use strict';

/**
 * server/routes/workspaces.js
 * ─────────────────────────────────────────────────────────────
 * Workspace / Organization management endpoints.
 *
 * GET    /api/workspaces                 — List workspaces for logged-in user
 * POST   /api/workspaces                 — Create new workspace
 * GET    /api/workspaces/:id/members     — List members of a workspace (id or slug)
 * POST   /api/workspaces/:id/members     — Invite user by email (owner/admin only)
 * DELETE /api/workspaces/:id/members/:userId — Remove member from workspace (owner/admin only)
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const { get, run, all, transaction } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Finds a workspace by either integer ID or slug string.
 */
function findWorkspace(idOrSlug) {
  if (!idOrSlug) return null;
  const num = Number(idOrSlug);
  if (!Number.isNaN(num) && Number.isInteger(num) && num > 0) {
    const ws = get('SELECT * FROM workspaces WHERE id = ?', [num]);
    if (ws) return ws;
  }
  return get('SELECT * FROM workspaces WHERE slug = ?', [String(idOrSlug)]);
}

// ─────────────────────────────────────────────────────────────
// GET /api/workspaces
// ─────────────────────────────────────────────────────────────
/**
 * Returns all workspaces the logged-in user belongs to,
 * with caller's role, member count, and board count.
 *
 * 200 { workspaces: [...] }
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const existingCount = get(
      'SELECT COUNT(*) as count FROM workspace_members wm WHERE wm.user_id = ?',
      [req.user.id]
    )?.count || 0;

    // Only associate with a default workspace if the user belongs to ZERO workspaces across all memberships
    if (existingCount === 0) {
      const defaultWs = get("SELECT id FROM workspaces WHERE slug IN ('acme-corp', 'acme-corp-1') OR name = 'Acme Corp' ORDER BY id ASC LIMIT 1")
                     || get("SELECT id FROM workspaces ORDER BY id ASC LIMIT 1");
      if (defaultWs) {
        run('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [defaultWs.id, req.user.id, 'member']);
      }
    }

    const workspaces = all(
      `SELECT
         w.id,
         w.name,
         w.slug,
         w.description,
         w.owner_id,
         w.created_at,
         wm.role AS my_role,
         (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) AS member_count,
         (SELECT COUNT(*) FROM boards WHERE workspace_id = w.id) AS board_count
       FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ?
       ORDER BY w.created_at ASC`,
      [req.user.id]
    );

    return res.json({ workspaces });
  } catch (err) {
    console.error('[workspaces/list]', err);
    return res.status(500).json({ error: 'Failed to retrieve workspaces.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/workspaces
// ─────────────────────────────────────────────────────────────
/**
 * Body: { name: string, description?: string, initial_members?: string[] | string }
 * Creates a new workspace, adds creator as 'owner', and immediately invites valid initial_members.
 *
 * 201 { workspace }
 * 400 validation error
 */
router.post('/', authenticateToken, (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Workspace name is required.' });
  }

  const description = typeof req.body?.description === 'string'
    ? (req.body.description.trim() || null)
    : null;

  // Parse initial_members: array of email strings or user IDs, or comma-separated emails
  let memberItems = [];
  const rawMembers = req.body?.initial_members;
  if (Array.isArray(rawMembers)) {
    memberItems = rawMembers;
  } else if (typeof rawMembers === 'string') {
    memberItems = rawMembers.split(/[,;\n]+/);
  }

  const slug = slugify(name);
  let createdWorkspace;
  let totalMembers = 1;

  try {
    transaction(({ run: tRun, get: tGet }) => {
      // 1. Insert new workspace with description
      const wsResult = tRun(
        'INSERT INTO workspaces (name, slug, description, owner_id) VALUES (?, ?, ?, ?)',
        [name, slug, description, req.user.id]
      );
      const wsId = wsResult.lastInsertRowid;

      // 2. Add creator as owner in workspace_members
      tRun(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
        [wsId, req.user.id, 'owner']
      );

      // 3. Invite initial members (supports emails, user IDs, or objects)
      for (const item of memberItems) {
        if (!item) continue;
        let user = null;
        if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item.trim()))) {
          const uid = Number(item);
          if (uid === req.user.id) continue;
          user = tGet('SELECT id FROM users WHERE id = ?', [uid]);
        } else if (typeof item === 'string') {
          const email = item.trim().toLowerCase();
          if (!email || !email.includes('@') || email === req.user.email?.toLowerCase()) continue;
          user = tGet('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
        } else if (typeof item === 'object') {
          if (item.id && Number(item.id) !== req.user.id) {
            user = tGet('SELECT id FROM users WHERE id = ?', [item.id]);
          } else if (item.email) {
            const email = String(item.email).trim().toLowerCase();
            if (email && email !== req.user.email?.toLowerCase()) {
              user = tGet('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
            }
          }
        }
        if (user && user.id) {
          tRun(
            'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
            [wsId, user.id, 'member']
          );
        }
      }

      createdWorkspace = tGet('SELECT * FROM workspaces WHERE id = ?', [wsId]);
      const countRes = tGet('SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ?', [wsId]);
      totalMembers = countRes ? countRes.count : 1;
    });

    return res.status(201).json({
      workspace: {
        ...createdWorkspace,
        my_role: 'owner',
        member_count: totalMembers,
        board_count: 0,
      },
    });
  } catch (err) {
    console.error('[workspaces/create]', err);
    return res.status(500).json({ error: 'Failed to create workspace.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/workspaces/:id/members
// ─────────────────────────────────────────────────────────────
/**
 * Lists all members of a workspace. Caller must belong to the workspace.
 * Supports both integer workspace ID and string slug.
 *
 * 200 { workspace, members: [...] }
 * 403 access denied
 * 404 workspace not found
 */
router.get('/:id/members', authenticateToken, (req, res) => {
  // 1. Resolve workspace by ID or slug
  const workspace = findWorkspace(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  // 2. Verify caller belongs to workspace
  const membership = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, req.user.id]
  );
  if (!membership) {
    return res.status(403).json({ error: 'Access denied. You are not a member of this workspace.' });
  }

  // 3. Return members cleanly ordered by role DESC, name ASC
  const members = all(
    `SELECT u.id, u.name, u.email, wm.role, wm.joined_at
     FROM workspace_members wm
     JOIN users u ON wm.user_id = u.id
     WHERE wm.workspace_id = ?
     ORDER BY wm.role DESC, u.name ASC`,
    [workspace.id]
  );

  return res.json({ workspace, members });
});

// ─────────────────────────────────────────────────────────────
// POST /api/workspaces/:id/members
// ─────────────────────────────────────────────────────────────
/**
 * Body: { email: string, role?: 'member' | 'admin' }
 * Adds an existing user by exact email into workspace_members.
 * Only workspace owners or admins can invite.
 * Supports both integer workspace ID and string slug.
 *
 * 201 { member }
 * 400 email missing / already a member
 * 403 not owner/admin
 * 404 workspace not found / user not registered
 */
router.post('/:id/members', authenticateToken, (req, res) => {
  // 1. Resolve workspace by ID or slug
  const workspace = findWorkspace(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  // 2. Authorize caller (owner or admin)
  const caller = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, req.user.id]
  );
  if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
    return res.status(403).json({ error: 'Only workspace owners or admins can invite members.' });
  }

  const role = (req.body?.role === 'admin') ? 'admin' : 'member';

  // Normalize inputs to support single email/user_id or multiple emails/member_ids/members
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
    return res.status(400).json({ error: 'Email address or user ID is required.' });
  }

  const added = [];
  const errors = [];

  for (const item of items) {
    if (!item) continue;
    let targetUser = null;
    if (typeof item === 'number' || (typeof item === 'string' && /^\d+$/.test(item.trim()))) {
      targetUser = get('SELECT id, name, email FROM users WHERE id = ?', [Number(item)]);
    } else if (typeof item === 'string') {
      targetUser = get('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [item.trim().toLowerCase()]);
    } else if (typeof item === 'object') {
      if (item.id) {
        targetUser = get('SELECT id, name, email FROM users WHERE id = ?', [Number(item.id)]);
      } else if (item.email) {
        targetUser = get('SELECT id, name, email FROM users WHERE LOWER(email) = ?', [String(item.email).trim().toLowerCase()]);
      }
    }

    if (!targetUser) {
      errors.push(`No registered user found for ${JSON.stringify(item)}`);
      continue;
    }

    const existing = get(
      'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspace.id, targetUser.id]
    );
    if (!existing) {
      run(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)',
        [workspace.id, targetUser.id, role]
      );
    }

    added.push({
      id: targetUser.id,
      name: targetUser.name,
      email: targetUser.email,
      role,
      joined_at: new Date().toISOString(),
    });
  }

  if (added.length === 0 && errors.length > 0) {
    return res.status(404).json({ error: errors[0] });
  }

  return res.status(201).json({
    success: true,
    member: added[0] || null,
    members: added,
    added_count: added.length,
    message: `Added ${added.length} member${added.length === 1 ? '' : 's'} to workspace.`,
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/workspaces/:id/members/:userId
// ─────────────────────────────────────────────────────────────
/**
 * Remove a member from the workspace.
 * Only workspace owners or admins can remove members.
 * Workspace owners cannot remove themselves.
 * Supports both integer workspace ID and string slug.
 *
 * 200 { message }
 * 400 cannot remove owner / self
 * 403 not authorized
 * 404 workspace or member not found
 */
router.delete('/:id/members/:userId', authenticateToken, (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  const targetUserId = Number(req.params.userId);
  if (!targetUserId) {
    return res.status(400).json({ error: 'Valid user ID is required.' });
  }

  // Authorize caller (owner or admin)
  const caller = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, req.user.id]
  );
  if (!caller || (caller.role !== 'owner' && caller.role !== 'admin')) {
    return res.status(403).json({ error: 'Only workspace owners or admins can remove members.' });
  }

  if (targetUserId === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself from the workspace.' });
  }

  const targetMembership = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, targetUserId]
  );
  if (!targetMembership) {
    return res.status(404).json({ error: 'This user is not a member of the workspace.' });
  }

  if (targetMembership.role === 'owner') {
    return res.status(400).json({ error: 'Cannot remove a workspace owner. Transfer ownership first.' });
  }

  transaction(({ run: tRun }) => {
    tRun('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [workspace.id, targetUserId]);
    // Also remove from any boards in this workspace
    tRun(
      `DELETE FROM board_members
       WHERE user_id = ?
         AND board_id IN (SELECT id FROM boards WHERE workspace_id = ?)`,
      [targetUserId, workspace.id]
    );
  });

  return res.json({ message: 'Member removed from workspace successfully.' });
});


// ─────────────────────────────────────────────────────────────
// PATCH /api/workspaces/:id
// ─────────────────────────────────────────────────────────────
/**
 * Rename a workspace. Only the workspace owner can rename it.
 * Body: { name: string }
 *
 * 200 { workspace }
 * 400 validation error
 * 403 not owner
 * 404 workspace not found
 */
router.patch('/:id', authenticateToken, (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  // Authorize owner
  const caller = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, req.user.id]
  );
  if (!caller || caller.role !== 'owner') {
    return res.status(403).json({ error: 'Only the workspace owner can rename this workspace.' });
  }

  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: 'Workspace name is required.' });
  }
  if (name.length > 50) {
    return res.status(400).json({ error: 'Workspace name cannot exceed 50 characters.' });
  }

  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
  const newSlug = `${baseSlug}-${workspace.id}`;

  const description = req.body?.description !== undefined
    ? (typeof req.body.description === 'string' ? req.body.description.trim() || null : null)
    : workspace.description;

  run('UPDATE workspaces SET name = ?, slug = ?, description = ? WHERE id = ?', [name, newSlug, description, workspace.id]);

  const updated = get(
    `SELECT
       w.id,
       w.name,
       w.slug,
       w.description,
       w.owner_id,
       w.created_at,
       'owner' AS my_role,
       (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) AS member_count,
       (SELECT COUNT(*) FROM boards WHERE workspace_id = w.id) AS board_count
     FROM workspaces w
     WHERE w.id = ?`,
    [workspace.id]
  );

  return res.json({ workspace: updated });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/workspaces/:id
// ─────────────────────────────────────────────────────────────
/**
 * Delete a workspace. Only the workspace owner can delete it.
 * Prevents deletion if it is the user's only workspace.
 * Cascades deletion to associated boards, columns, tasks, comments, and members.
 *
 * 200 { success: true, message: string }
 * 400 cannot delete only workspace
 * 403 not owner
 * 404 workspace not found
 */
router.delete('/:id', authenticateToken, (req, res) => {
  const workspace = findWorkspace(req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found.' });
  }

  // Authorize owner
  const caller = get(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspace.id, req.user.id]
  );
  if (!caller || caller.role !== 'owner') {
    return res.status(403).json({ error: 'Only the workspace owner can delete this workspace.' });
  }

  // Check if this is the user's only workspace
  const userWsCount = get(
    'SELECT COUNT(*) as count FROM workspace_members WHERE user_id = ?',
    [req.user.id]
  );
  if (userWsCount.count <= 1) {
    return res.status(400).json({
      error: 'Cannot delete your only workspace. You must retain at least one workspace.',
    });
  }

  transaction(({ run: tRun }) => {
    // 1. Delete comments on tasks on boards of this workspace
    tRun(`
      DELETE FROM comments
      WHERE task_id IN (
        SELECT t.id FROM tasks t
        JOIN columns c ON c.id = t.column_id
        JOIN boards b ON b.id = c.board_id
        WHERE b.workspace_id = ?
      )
    `, [workspace.id]);

    // 2. Delete tasks on boards of this workspace
    tRun(`
      DELETE FROM tasks
      WHERE board_id IN (SELECT id FROM boards WHERE workspace_id = ?)
    `, [workspace.id]);

    // 3. Delete columns on boards of this workspace
    tRun(`
      DELETE FROM columns
      WHERE board_id IN (SELECT id FROM boards WHERE workspace_id = ?)
    `, [workspace.id]);

    // 4. Delete activity_log for boards of this workspace
    tRun(`
      DELETE FROM activity_log
      WHERE board_id IN (SELECT id FROM boards WHERE workspace_id = ?)
    `, [workspace.id]);

    // 5. Delete board_members for boards of this workspace
    tRun(`
      DELETE FROM board_members
      WHERE board_id IN (SELECT id FROM boards WHERE workspace_id = ?)
    `, [workspace.id]);

    // 6. Delete boards of this workspace
    tRun('DELETE FROM boards WHERE workspace_id = ?', [workspace.id]);

    // 7. Delete workspace_members
    tRun('DELETE FROM workspace_members WHERE workspace_id = ?', [workspace.id]);

    // 8. Delete workspace
    tRun('DELETE FROM workspaces WHERE id = ?', [workspace.id]);
  });

  return res.json({ success: true, message: 'Workspace and all associated boards deleted successfully.' });
});

module.exports = router;
