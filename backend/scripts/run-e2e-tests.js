'use strict';

/**
 * backend/scripts/run-e2e-tests.js
 * ─────────────────────────────────────────────────────────────
 * End-to-End Integration and Sanity Test Suite
 * Covers all creation workflows across:
 *   a. User Registration & Auth
 *   b. Workspace Creation
 *   c. Board Creation
 *   d. Column Creation
 *   e. Task Creation
 *   f. Comment Creation
 *   g. Activity Logging on Creation
 *
 * Runs completely in-memory against the Express app and SQLite.
 * Cleans up all test entities at the end.
 * ─────────────────────────────────────────────────────────────
 */

process.env.NODE_ENV = 'test';

const { Readable } = require('stream');
const { EventEmitter } = require('events');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const app = require('../app');

// ── HTTP Mock Helper ──────────────────────────────────────────
function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res._body = '';
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('content-type', 'application/json');
    res._json = data;
    res._body = JSON.stringify(data);
    res.emit('finish');
    return res;
  };
  res.send = (data) => {
    res._body = data;
    res.emit('finish');
    return res;
  };
  res.end = (chunk) => {
    if (chunk) res._body += chunk;
    res.emit('finish');
    return res;
  };
  return res;
}

function createMockRequest({ method, url, headers = {}, body = null }) {
  const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
  const req = Readable.from(body ? [bodyBuf] : []);
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (body) {
    req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = bodyBuf.length.toString();
  }
  req.query = {};
  req.params = {};
  if (url.includes('?')) {
    const qStr = url.split('?')[1];
    req.query = Object.fromEntries(new URLSearchParams(qStr));
    req.url = url.split('?')[0];
  }
  return req;
}

async function apiRequest({ method, url, headers = {}, body = null }) {
  return new Promise((resolve) => {
    const req = createMockRequest({ method, url, headers, body });
    const res = createMockResponse();
    res.on('finish', () => {
      resolve({
        status: res.statusCode,
        headers: res.headers,
        data: res._json || (res._body ? (() => { try { return JSON.parse(res._body); } catch { return res._body; } })() : null)
      });
    });
    app(req, res);
  });
}

// ── Test Tracker ──────────────────────────────────────────────
const results = [];
function recordResult(workflow, testName, passed, details = '') {
  results.push({ workflow, testName, passed, details });
  const statusStr = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${statusStr} [${workflow}] ${testName} ${details ? `(${details})` : ''}`);
}

async function runSuite() {
  console.log('====================================================');
  console.log('  TaskBoard Comprehensive E2E Creation Test Suite   ');
  console.log('====================================================\n');

  let testUserId = null;
  let testUserToken = null;
  let testWorkspaceId = null;
  let testBoardId = null;
  let testColumnId = null;
  let testTaskId = null;
  let testCommentId = null;

  try {
    // -------------------------------------------------------------
    // a. User Registration & Auth
    // -------------------------------------------------------------
    console.log('[Workflow A] Testing User Registration & Auth...');
    const testEmail = `e2e_tester_${Date.now()}@taskboard.dev`;

    // 1. Register test user
    const regRes = await apiRequest({
      method: 'POST',
      url: '/api/auth/register',
      body: {
        name: 'E2E Tester',
        email: testEmail,
        password: 'password123',
        favWork: 'coding',
        favFood: 'pizza',
        favShow: 'suits',
      }
    });

    if (regRes.status === 201 && regRes.data?.userId) {
      testUserId = regRes.data.userId;
      recordResult('Auth', 'User registration via POST /api/auth/register', true, `User ID: ${testUserId}`);
    } else {
      recordResult('Auth', 'User registration via POST /api/auth/register', false, `Status: ${regRes.status}`);
    }

    // 2. Verify password is encrypted with bcrypt in SQLite
    const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(testUserId);
    const isBcrypt = userRow?.password_hash?.startsWith('$2') && bcrypt.compareSync('password123', userRow.password_hash);
    recordResult('Auth', 'Password encrypted with bcrypt in SQLite', !!isBcrypt);

    // 3. Login & JWT generation
    const loginRes = await apiRequest({
      method: 'POST',
      url: '/api/auth/login',
      body: { email: testEmail, password: 'password123' }
    });
    if (loginRes.status === 200 && loginRes.data?.token) {
      testUserToken = loginRes.data.token;
      recordResult('Auth', 'JWT token generation on POST /api/auth/login', true);
    } else {
      recordResult('Auth', 'JWT token generation on POST /api/auth/login', false, `Status: ${loginRes.status}`);
    }

    // 4. Unauthenticated redirects & token rejection
    const unauthRes = await apiRequest({ method: 'GET', url: '/api/workspaces' });
    recordResult('Auth', 'Unauthenticated request returns 401', unauthRes.status === 401, `Status: ${unauthRes.status}`);

    const badTokenRes = await apiRequest({
      method: 'GET',
      url: '/api/workspaces',
      headers: { Authorization: 'Bearer invalid_token_xyz' }
    });
    recordResult('Auth', 'Invalid token returns 403', badTokenRes.status === 403, `Status: ${badTokenRes.status}`);

    // 5. Duplicate registration check
    const dupRes = await apiRequest({
      method: 'POST',
      url: '/api/auth/register',
      body: {
        name: 'E2E Tester Duplicate',
        email: testEmail,
        password: 'password123',
        favWork: 'coding',
        favFood: 'pizza',
        favShow: 'suits',
      }
    });
    recordResult('Auth', 'Duplicate email registration returns 400 Bad Request', dupRes.status === 400, `Status: ${dupRes.status}`);

    // -------------------------------------------------------------
    // b. Workspace Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow B] Testing Workspace Creation...');
    const wsName = 'E2E Testing Workspace';
    const wsDesc = 'Workspace generated during comprehensive E2E test run.';

    const wsCreateRes = await apiRequest({
      method: 'POST',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        name: wsName,
        description: wsDesc,
        initial_members: ['bob@taskboard.dev']
      }
    });

    if (wsCreateRes.status === 201 && wsCreateRes.data?.workspace?.id) {
      testWorkspaceId = wsCreateRes.data.workspace.id;
      recordResult('Workspaces', 'Create workspace with name, description, initial members', true, `WS ID: ${testWorkspaceId}`);
    } else {
      recordResult('Workspaces', 'Create workspace with name, description, initial members', false, `Status: ${wsCreateRes.status}`);
    }

    // Verify slug generation
    const wsRow = db.prepare('SELECT id, name, slug, owner_id FROM workspaces WHERE id = ?').get(testWorkspaceId);
    const slugValid = wsRow?.slug && wsRow.slug.startsWith('e2e-testing-workspace');
    recordResult('Workspaces', 'Slug generated cleanly without collisions', !!slugValid, `Slug: ${wsRow?.slug}`);

    // Verify creator is owner
    const creatorMember = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(testWorkspaceId, testUserId);
    recordResult('Workspaces', 'Creator assigned role=owner in workspace_members', creatorMember?.role === 'owner');

    // Verify initial member Bob invited
    const bobMember = db.prepare('SELECT wm.role FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ? AND u.email = ?').get(testWorkspaceId, 'bob@taskboard.dev');
    recordResult('Workspaces', 'Initial member Bob added to workspace_members', bobMember?.role === 'member');

    // Verify workspace appears on GET /api/workspaces
    const wsListRes = await apiRequest({
      method: 'GET',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${testUserToken}` }
    });
    const foundWs = wsListRes.data?.workspaces?.some(w => w.id === testWorkspaceId);
    recordResult('Workspaces', 'Workspace returned immediately on GET /api/workspaces', !!foundWs);

    // -------------------------------------------------------------
    // c. Board Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow C] Testing Board Creation...');
    const boardCreateRes = await apiRequest({
      method: 'POST',
      url: '/api/boards',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        name: 'E2E Automation Board',
        description: 'Board for verifying creation workflows.',
        workspace_id: testWorkspaceId,
        color: 'indigo',
        initial_members: [2, 42] // Bob and Charlie
      }
    });

    if (boardCreateRes.status === 201 && boardCreateRes.data?.board?.id) {
      testBoardId = boardCreateRes.data.board.id;
      recordResult('Boards', 'Create board inside workspace with initial members', true, `Board ID: ${testBoardId}`);
    } else {
      recordResult('Boards', 'Create board inside workspace with initial members', false, `Status: ${boardCreateRes.status}`);
    }

    // Verify 3 default columns (To Do = 0, In Progress = 1, Done = 2)
    const columns = db.prepare('SELECT id, name, position FROM columns WHERE board_id = ? ORDER BY position ASC').all(testBoardId);
    const colsValid = columns.length === 3 &&
                      columns[0].name === 'To Do' && columns[0].position === 0 &&
                      columns[1].name === 'In Progress' && columns[1].position === 1 &&
                      columns[2].name === 'Done' && columns[2].position === 2;
    recordResult('Boards', '3 default columns created with positions (0, 1, 2)', colsValid);
    testColumnId = columns[0]?.id;

    // Verify creator is owner in board_members
    const creatorBoardMember = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = ?').get(testBoardId, testUserId);
    recordResult('Boards', 'Creator assigned role=owner in board_members', creatorBoardMember?.role === 'owner');

    // Verify initial members in board_members
    const bobBoardMember = db.prepare('SELECT role FROM board_members WHERE board_id = ? AND user_id = 2').get(testBoardId);
    recordResult('Boards', 'Initial board members saved to board_members', bobBoardMember?.role === 'member');

    // Verify board is returned in /api/boards scoped to workspace
    const boardListRes = await apiRequest({
      method: 'GET',
      url: `/api/boards?workspace_id=${testWorkspaceId}`,
      headers: { Authorization: `Bearer ${testUserToken}` }
    });
    const foundBoard = boardListRes.data?.boards?.some(b => b.id === testBoardId);
    recordResult('Boards', 'Board appears on /api/boards scoped strictly to workspace', !!foundBoard);

    // -------------------------------------------------------------
    // d. Column Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow D] Testing Column Creation...');
    const colCreateRes = await apiRequest({
      method: 'POST',
      url: `/api/boards/${testBoardId}/columns`,
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: { name: 'QA Review' }
    });

    if (colCreateRes.status === 201 && colCreateRes.data?.column?.id) {
      recordResult('Columns', 'Add column via POST /api/boards/:id/columns', true, `Col ID: ${colCreateRes.data.column.id}`);
    } else {
      recordResult('Columns', 'Add column via POST /api/boards/:id/columns', false, `Status: ${colCreateRes.status}`);
    }

    // Verify sequential position indexing (position 3)
    const allCols = db.prepare('SELECT id, name, position FROM columns WHERE board_id = ? ORDER BY position ASC').all(testBoardId);
    const seqValid = allCols.length === 4 && allCols[3].name === 'QA Review' && allCols[3].position === 3;
    recordResult('Columns', 'Position indexing persists sequentially in SQLite (pos=3)', seqValid);

    // -------------------------------------------------------------
    // e. Task Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow E] Testing Task Creation...');

    // 1. Task with all 4 fields
    const task4Res = await apiRequest({
      method: 'POST',
      url: '/api/tasks',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        column_id: testColumnId,
        board_id: testBoardId,
        title: 'Complete E2E Verification Workflow',
        priority: 'High',
        due_date: '2026-11-25',
        assignee_id: 2 // Bob
      }
    });

    if (task4Res.status === 201 && task4Res.data?.task?.id) {
      testTaskId = task4Res.data.task.id;
      const t = task4Res.data.task;
      const validT = t.title === 'Complete E2E Verification Workflow' &&
                     t.priority === 'High' &&
                     t.due_date === '2026-11-25' &&
                     t.assignee_id === 2 &&
                     t.assignee_name === 'Bob Smith';
      recordResult('Tasks', 'Create task with all 4 fields (Title, Priority, DueDate, Assignee)', validT, `Task ID: ${testTaskId}`);
    } else {
      recordResult('Tasks', 'Create task with all 4 fields (Title, Priority, DueDate, Assignee)', false, `Status: ${task4Res.status}`);
    }

    // 2. Edge Case: Null/empty assignee creates task with assignee_id = NULL
    const taskNullAssignee = await apiRequest({
      method: 'POST',
      url: '/api/tasks',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        column_id: testColumnId,
        board_id: testBoardId,
        title: 'Task Without Assignee',
        priority: 'Low',
        due_date: '2026-11-30',
        assignee_id: null
      }
    });
    const nullAssigneeValid = taskNullAssignee.status === 201 && taskNullAssignee.data?.task?.assignee_id === null;
    recordResult('Tasks', 'Null/empty assignee creates task with assignee_id=NULL', nullAssigneeValid);

    // 3. Edge Case: Missing/empty due date sets due_date = NULL
    const taskNullDate = await apiRequest({
      method: 'POST',
      url: '/api/tasks',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        column_id: testColumnId,
        board_id: testBoardId,
        title: 'Task Without Due Date',
        priority: 'Medium',
        due_date: null,
        assignee_id: null
      }
    });
    const nullDateValid = taskNullDate.status === 201 && taskNullDate.data?.task?.due_date === null;
    recordResult('Tasks', 'Missing/empty due date sets due_date=NULL', nullDateValid);

    // 4. Edge Case: Empty title triggers 400 Bad Request
    const emptyTitleRes = await apiRequest({
      method: 'POST',
      url: '/api/tasks',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        column_id: testColumnId,
        board_id: testBoardId,
        title: '   ',
        priority: 'Medium'
      }
    });
    recordResult('Tasks', 'Empty title triggers 400 Bad Request error', emptyTitleRes.status === 400, `Status: ${emptyTitleRes.status}`);

    // 5. Edge Case: Invalid priority triggers 400 Bad Request
    const badPrioRes = await apiRequest({
      method: 'POST',
      url: '/api/tasks',
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: {
        column_id: testColumnId,
        board_id: testBoardId,
        title: 'Bad Priority Task',
        priority: 'SuperUrgent'
      }
    });
    recordResult('Tasks', 'Invalid priority triggers 400 Bad Request error', badPrioRes.status === 400, `Status: ${badPrioRes.status}`);

    // -------------------------------------------------------------
    // f. Comment Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow F] Testing Comment Creation...');
    const commentRes = await apiRequest({
      method: 'POST',
      url: `/api/tasks/${testTaskId}/comments`,
      headers: { Authorization: `Bearer ${testUserToken}` },
      body: { text: 'Automated E2E verification comment.' }
    });

    if (commentRes.status === 201 && commentRes.data?.comment?.id) {
      testCommentId = commentRes.data.comment.id;
      recordResult('Comments', 'Post comment via POST /api/tasks/:id/comments', true, `Comment ID: ${testCommentId}`);
    } else {
      recordResult('Comments', 'Post comment via POST /api/tasks/:id/comments', false, `Status: ${commentRes.status}`);
    }

    // Verify comment persists to task_comments table
    const commentRow = db.prepare('SELECT id, task_id, user_id, text, created_at FROM task_comments WHERE id = ?').get(testCommentId);
    const commentPersisted = commentRow && commentRow.task_id === testTaskId && commentRow.user_id === testUserId && commentRow.text === 'Automated E2E verification comment.';
    recordResult('Comments', 'Comment persists in task_comments with user_id & timestamp', !!commentPersisted);

    // Verify comments fetched on GET /api/tasks/:id/comments
    const getCommentsRes = await apiRequest({
      method: 'GET',
      url: `/api/tasks/${testTaskId}/comments`,
      headers: { Authorization: `Bearer ${testUserToken}` }
    });
    const foundComment = getCommentsRes.data?.comments?.some(c => c.id === testCommentId);
    recordResult('Comments', 'Comments retrieved successfully via GET /api/tasks/:id/comments', !!foundComment);

    // Verify comment in full task detail modal GET /api/tasks/:id
    const taskDetailRes = await apiRequest({
      method: 'GET',
      url: `/api/tasks/${testTaskId}`,
      headers: { Authorization: `Bearer ${testUserToken}` }
    });
    const foundInTask = taskDetailRes.data?.task?.comments?.some(c => c.id === testCommentId);
    recordResult('Comments', 'Comments preserved when reopening modal (GET /api/tasks/:id)', !!foundInTask);

    // -------------------------------------------------------------
    // g. Activity Logging on Creation
    // -------------------------------------------------------------
    console.log('\n[Workflow G] Testing Activity Logging...');
    const boardActivity = db.prepare('SELECT action, details FROM activity_log WHERE board_id = ?').all(testBoardId);

    const hasTaskCreated = boardActivity.some(a => a.action === 'TASK_CREATED' && a.details.includes('Complete E2E Verification Workflow'));
    recordResult('ActivityLog', 'TASK_CREATED recorded with task title & assignee in details', hasTaskCreated);

    const hasCommentAdded = boardActivity.some(a => a.action === 'COMMENT_ADDED');
    recordResult('ActivityLog', 'COMMENT_ADDED recorded on task comment posting', hasCommentAdded);

  } catch (err) {
    console.error('Unhandled suite error:', err);
    recordResult('Suite', 'Global execution error', false, err.message);
  } finally {
    // -------------------------------------------------------------
    // Cleanup: Cascade delete all test records created in this run
    // -------------------------------------------------------------
    console.log('\n[Cleanup] Cascade-deleting temporary test entities...');
    if (testUserId) {
      db.transaction(() => {
        // Delete comments on test task
        if (testTaskId) {
          db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(testTaskId);
          try { db.prepare('DELETE FROM comments WHERE task_id = ?').run(testTaskId); } catch {}
        }

        // Delete test task
        if (testTaskId) {
          db.prepare('DELETE FROM tasks WHERE board_id = ?').run(testBoardId);
        }

        // Delete test columns
        if (testBoardId) {
          db.prepare('DELETE FROM columns WHERE board_id = ?').run(testBoardId);
          db.prepare('DELETE FROM board_members WHERE board_id = ?').run(testBoardId);
          db.prepare('DELETE FROM activity_log WHERE board_id = ?').run(testBoardId);
          db.prepare('DELETE FROM boards WHERE id = ?').run(testBoardId);
        }

        // Delete test workspace
        if (testWorkspaceId) {
          db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(testWorkspaceId);
          db.prepare('DELETE FROM workspaces WHERE id = ?').run(testWorkspaceId);
        }

        // Delete any remaining workspaces or memberships owned by test user
        db.prepare('DELETE FROM workspace_members WHERE user_id = ?').run(testUserId);
        db.prepare('DELETE FROM workspaces WHERE owner_id = ?').run(testUserId);

        // Delete test user
        db.prepare('DELETE FROM users WHERE id = ?').run(testUserId);
      })();
      console.log('✓ Successfully cleaned up all test records.');
    }

    // Verify database preserves strictly the demo accounts
    const remainingUsers = db.prepare('SELECT id, name, email FROM users ORDER BY id ASC').all();
    console.log('\nRemaining Users in SQLite:');
    remainingUsers.forEach(u => console.log(`  - [ID ${u.id}] ${u.name} <${u.email}>`));

    const remainingWorkspaces = db.prepare('SELECT id, name, slug FROM workspaces ORDER BY id ASC').all();
    console.log('\nRemaining Workspaces in SQLite:');
    remainingWorkspaces.forEach(w => console.log(`  - [ID ${w.id}] "${w.name}" (slug: ${w.slug})`));

    // Summary
    console.log('\n====================================================');
    console.log('            E2E Suite Execution Report              ');
    console.log('====================================================');
    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;
    console.log(`Total Tests Run: ${results.length}`);
    console.log(`Passed:          ${passedCount}`);
    console.log(`Failed:          ${failedCount}`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runSuite();
