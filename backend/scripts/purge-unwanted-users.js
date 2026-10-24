'use strict';

/**
 * backend/scripts/purge-unwanted-users.js
 * ─────────────────────────────────────────────────────────────
 * Complete cascade deletion script to purge all user accounts
 * and permanently remove every single entity, task, and record
 * related to them, EXCEPT for the whitelisted accounts:
 *   - Alice Johnson   (alice@taskboard.dev, id 1)
 *   - Bob Smith       (bob@taskboard.dev, id 2)
 *   - AMAN SHARMA     (amansharma888930@gmail.com, id 7)
 *   - Charlie Brown   (charlie@taskboard.dev, id 42)
 *
 * Execution:
 *   node backend/scripts/purge-unwanted-users.js
 * ─────────────────────────────────────────────────────────────
 */

const { db } = require('../db');

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

console.log('====================================================');
console.log('   TaskBoard Database User & Entity Purge Script    ');
console.log('====================================================\n');

// 1. Whitelist definition
const WHITELIST_EMAILS = [
  'alice@taskboard.dev',
  'bob@taskboard.dev',
  'amansharma888930@gmail.com',
  'charlie@taskboard.dev'
];

const WHITELIST_NAMES = [
  'Alice Johnson',
  'Bob Smith',
  'AMAN SHARMA',
  'Charlie Brown'
];

console.log('[1/5] Identifying target users to purge...');
console.log('Whitelisted accounts to KEEP:');
const keptUsers = db.prepare(`
  SELECT id, name, email FROM users
  WHERE email IN ('alice@taskboard.dev', 'bob@taskboard.dev', 'amansharma888930@gmail.com', 'charlie@taskboard.dev')
     OR id IN (1, 2, 7, 42)
`).all();
keptUsers.forEach(u => console.log(`  ✓ Keep [ID ${u.id}] ${u.name} <${u.email}>`));

// Identify IDs of all users whose email/name does NOT match Alice, Bob, Aman, or Charlie
// Also catches test accounts, solouser_*, and charlie_*
const targetUsers = db.prepare(`
  SELECT id, name, email FROM users
  WHERE (
    email NOT IN ('alice@taskboard.dev', 'bob@taskboard.dev', 'amansharma888930@gmail.com', 'charlie@taskboard.dev')
    AND (
      (name NOT LIKE '%Alice%' AND name NOT LIKE '%Bob%' AND name NOT LIKE '%Aman%' AND name NOT LIKE '%Charlie%')
      OR email LIKE 'charlie_%'
      OR email LIKE 'solouser_%'
      OR email = 'test@taskboard.dev'
    )
  )
  AND id NOT IN (1, 2, 7, 42)
`).all();

const targetUserIds = targetUsers.map(u => u.id);

if (targetUserIds.length === 0) {
  console.log('\nNo target users found to purge. Database is already clean.');
  console.log('\nPurge Summary:');
  console.log('  - Deleted users:    0');
  console.log('  - Deleted boards:   0');
  console.log('  - Deleted tasks:    0');
  console.log('  - Deleted comments: 0');
  process.exit(0);
}

console.log(`\nFound ${targetUserIds.length} target users to permanently purge:`);
targetUsers.forEach(u => console.log(`  ✗ Purge [ID ${u.id}] ${u.name} <${u.email}>`));

// Counters
let deletedUsersCount = 0;
let deletedBoardsCount = 0;
let deletedTasksCount = 0;
let deletedCommentsCount = 0;

// Execute entire cascade deletion inside a single SQLite transaction
const purgeTransaction = db.transaction(() => {
  const userPlaceholders = targetUserIds.map(() => '?').join(',');

  // -----------------------------------------------------------------
  // Step A: Workspaces owned by target users
  // -----------------------------------------------------------------
  const targetWorkspaces = db.prepare(`
    SELECT id FROM workspaces WHERE owner_id IN (${userPlaceholders})
  `).all(...targetUserIds);
  const targetWorkspaceIds = targetWorkspaces.map(w => w.id);

  // -----------------------------------------------------------------
  // Step B: Boards owned by target users OR inside target workspaces
  // -----------------------------------------------------------------
  let targetBoards = [];
  if (targetWorkspaceIds.length > 0) {
    const wsPlaceholders = targetWorkspaceIds.map(() => '?').join(',');
    targetBoards = db.prepare(`
      SELECT id FROM boards
      WHERE owner_id IN (${userPlaceholders}) OR workspace_id IN (${wsPlaceholders})
    `).all(...targetUserIds, ...targetWorkspaceIds);
  } else {
    targetBoards = db.prepare(`
      SELECT id FROM boards WHERE owner_id IN (${userPlaceholders})
    `).all(...targetUserIds);
  }
  const targetBoardIds = [...new Set(targetBoards.map(b => b.id))];

  // -----------------------------------------------------------------
  // Step C: Tasks to delete
  // 1. Created by target users
  // 2. Assigned to target users
  // 3. Belonging to target boards
  // -----------------------------------------------------------------
  let taskQueries = [
    `created_by IN (${userPlaceholders})`,
    `assignee_id IN (${userPlaceholders})`
  ];
  let taskParams = [...targetUserIds, ...targetUserIds];

  if (targetBoardIds.length > 0) {
    const bPlaceholders = targetBoardIds.map(() => '?').join(',');
    taskQueries.push(`board_id IN (${bPlaceholders})`);
    taskParams.push(...targetBoardIds);
  }

  const targetTasks = db.prepare(`
    SELECT id FROM tasks WHERE ${taskQueries.join(' OR ')}
  `).all(...taskParams);
  const targetTaskIds = [...new Set(targetTasks.map(t => t.id))];

  // -----------------------------------------------------------------
  // 1 & 2. Delete comments on target tasks OR written by target users
  // -----------------------------------------------------------------
  let commentQueries = [`user_id IN (${userPlaceholders})`];
  let commentParams = [...targetUserIds];

  if (targetTaskIds.length > 0) {
    const tPlaceholders = targetTaskIds.map(() => '?').join(',');
    commentQueries.push(`task_id IN (${tPlaceholders})`);
    commentParams.push(...targetTaskIds);
  }

  // task_comments table
  try {
    const res = db.prepare(`
      DELETE FROM task_comments WHERE ${commentQueries.join(' OR ')}
    `).run(...commentParams);
    deletedCommentsCount += res.changes;
  } catch (err) {
    console.warn('  Note on task_comments:', err.message);
  }

  // comments legacy table if present
  try {
    const hasComments = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").get();
    if (hasComments) {
      const res = db.prepare(`
        DELETE FROM comments WHERE ${commentQueries.join(' OR ')}
      `).run(...commentParams);
      deletedCommentsCount += res.changes;
    }
  } catch (err) {
    console.warn('  Note on legacy comments table:', err.message);
  }

  // -----------------------------------------------------------------
  // 3. Delete tasks created by or assigned to target users, or on target boards
  // -----------------------------------------------------------------
  if (targetTaskIds.length > 0) {
    const tPlaceholders = targetTaskIds.map(() => '?').join(',');
    const res = db.prepare(`DELETE FROM tasks WHERE id IN (${tPlaceholders})`).run(...targetTaskIds);
    deletedTasksCount += res.changes;
  }

  // -----------------------------------------------------------------
  // 4. Activity Logs generated by target users OR for target boards
  // -----------------------------------------------------------------
  let actQueries = [`user_id IN (${userPlaceholders})`];
  let actParams = [...targetUserIds];

  if (targetBoardIds.length > 0) {
    const bPlaceholders = targetBoardIds.map(() => '?').join(',');
    actQueries.push(`board_id IN (${bPlaceholders})`);
    actParams.push(...targetBoardIds);
  }

  db.prepare(`DELETE FROM activity_log WHERE ${actQueries.join(' OR ')}`).run(...actParams);

  // -----------------------------------------------------------------
  // 5. Delete boards owned by target users
  // -----------------------------------------------------------------
  if (targetBoardIds.length > 0) {
    const bPlaceholders = targetBoardIds.map(() => '?').join(',');

    // Delete any remaining columns for these boards
    db.prepare(`DELETE FROM columns WHERE board_id IN (${bPlaceholders})`).run(...targetBoardIds);

    // Delete member mappings in board_members for these boards
    db.prepare(`DELETE FROM board_members WHERE board_id IN (${bPlaceholders})`).run(...targetBoardIds);

    // Delete the boards
    const res = db.prepare(`DELETE FROM boards WHERE id IN (${bPlaceholders})`).run(...targetBoardIds);
    deletedBoardsCount += res.changes;
  }

  // -----------------------------------------------------------------
  // 6. Board & Workspace memberships for target users
  // -----------------------------------------------------------------
  db.prepare(`DELETE FROM board_members WHERE user_id IN (${userPlaceholders})`).run(...targetUserIds);
  db.prepare(`DELETE FROM workspace_members WHERE user_id IN (${userPlaceholders})`).run(...targetUserIds);

  // -----------------------------------------------------------------
  // 7. Workspaces owned by target users
  // -----------------------------------------------------------------
  if (targetWorkspaceIds.length > 0) {
    const wsPlaceholders = targetWorkspaceIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM workspace_members WHERE workspace_id IN (${wsPlaceholders})`).run(...targetWorkspaceIds);
    db.prepare(`DELETE FROM workspaces WHERE id IN (${wsPlaceholders})`).run(...targetWorkspaceIds);
  }

  // -----------------------------------------------------------------
  // 8. Delete the users
  // -----------------------------------------------------------------
  const userDeleteRes = db.prepare(`DELETE FROM users WHERE id IN (${userPlaceholders})`).run(...targetUserIds);
  deletedUsersCount += userDeleteRes.changes;
});

// Run the transaction
console.log('\n[2/5] Executing cascade purge transaction...');
purgeTransaction();
console.log('✓ Transaction committed successfully.');

// Vacuum database to reclaim space
console.log('\n[3/5] Vacuuming database to optimize storage...');
try {
  db.pragma('incremental_vacuum');
  console.log('✓ Storage optimized.');
} catch (vErr) {
  console.warn('Vacuum warning:', vErr.message);
}

// Verification
console.log('\n[4/5] Verifying remaining accounts in database...');
const remainingUsers = db.prepare('SELECT id, name, email FROM users ORDER BY id ASC').all();
remainingUsers.forEach(u => console.log(`  ✓ Active User [ID ${u.id}] ${u.name} <${u.email}>`));

console.log('\n====================================================');
console.log('             Purge Execution Summary                ');
console.log('====================================================');
console.log(`- Number of deleted users:    ${deletedUsersCount}`);
console.log(`- Number of deleted boards:   ${deletedBoardsCount}`);
console.log(`- Number of deleted tasks:    ${deletedTasksCount}`);
console.log(`- Number of deleted comments: ${deletedCommentsCount}`);
console.log('====================================================\n');
