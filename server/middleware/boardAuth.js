'use strict';

/**
 * server/middleware/boardAuth.js
 * ─────────────────────────────────────────────────────────────
 * Board-level authorization middleware factory.
 *
 * Usage:
 *   const { checkBoardAccess } = require('../middleware/boardAuth');
 *
 *   // Any board member may access:
 *   router.get('/:id', authenticateToken, checkBoardAccess('member'), handler);
 *
 *   // Only the board owner may access:
 *   router.delete('/:id', authenticateToken, checkBoardAccess('owner'), handler);
 *
 * Prerequisites:
 *   - `authenticateToken` must run first so `req.user` is populated.
 *   - Route must expose `:id` or `:boardId` as the board primary key.
 *
 * Side-effects on success:
 *   - Sets req.boardMembership = { role: 'owner' | 'member' }
 * ─────────────────────────────────────────────────────────────
 */

const { get } = require('../db');

/**
 * @param {'member'|'owner'} requiredRole  Minimum role needed.
 * @returns {import('express').RequestHandler}
 */
function checkBoardAccess(requiredRole = 'member') {
  return function boardAccessMiddleware(req, res, next) {
    // Support both /:id and /:boardId parameter names
    const boardId = req.params.id ?? req.params.boardId;

    if (!boardId) {
      return res.status(400).json({ error: 'Board ID is required.' });
    }

    // Verify the board exists at all
    const board = get('SELECT id FROM boards WHERE id = ?', [boardId]);
    if (!board) {
      return res.status(404).json({ error: 'Board not found.' });
    }

    // Check membership
    const member = get(
      'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
      [boardId, req.user.id]
    );

    if (!member) {
      return res.status(403).json({
        error: 'Access denied. You are not a member of this board.',
      });
    }

    if (requiredRole === 'owner' && member.role !== 'owner') {
      return res.status(403).json({ error: 'Owner permission required.' });
    }

    // Attach membership info for downstream handlers
    req.boardMembership = { role: member.role };
    next();
  };
}

module.exports = { checkBoardAccess };
