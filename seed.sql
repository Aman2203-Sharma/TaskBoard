-- =============================================================
-- TaskBoard Seed Data
-- Run ONLY when the tables are freshly created.
-- Passwords below are bcrypt hashes of "password123"
-- (cost factor 10) — replace with real hashes in production.
-- =============================================================

-- ----------------------------------------------------
-- Users
-- ----------------------------------------------------
INSERT INTO users (name, email, password_hash) VALUES
  (
    'Alice Johnson',
    'alice@taskboard.dev',
    '$2b$10$xrxlcyT1bwDEfW3VG5s7ZOKBA2Vnk92s646OMGCJ8jw6x1kvv.O1.'
  ),
  (
    'Bob Smith',
    'bob@taskboard.dev',
    '$2b$10$xrxlcyT1bwDEfW3VG5s7ZOKBA2Vnk92s646OMGCJ8jw6x1kvv.O1.'
  );

-- ----------------------------------------------------
-- Board (owned by Alice – user id 1)
-- ----------------------------------------------------
INSERT INTO boards (name, description, owner_id) VALUES
  (
    'Product Launch Q4',
    'All tasks related to the Q4 product release cycle.',
    1
  );

-- ----------------------------------------------------
-- Board Members
--   Alice  → owner
--   Bob    → member
-- ----------------------------------------------------
INSERT INTO board_members (board_id, user_id, role) VALUES
  (1, 1, 'owner'),
  (1, 2, 'member');

-- ----------------------------------------------------
-- Columns  (board_id = 1)
-- ----------------------------------------------------
INSERT INTO columns (board_id, name, position) VALUES
  (1, 'To Do',       0),
  (1, 'In Progress', 1),
  (1, 'Done',        2);

-- column ids will be: To Do = 1, In Progress = 2, Done = 3

-- ----------------------------------------------------
-- Tasks  (8 tasks spread across the 3 columns)
-- ----------------------------------------------------
INSERT INTO tasks
  (board_id, column_id, title, description, priority, due_date, assignee_id, created_by, position)
VALUES
  -- To Do (column_id = 1)
  (1, 1, 'Define product requirements',
   'Write the PRD covering all MVP features.',
   'High', '2026-11-01', 1, 1, 0),

  (1, 1, 'Design system audit',
   'Review existing design tokens and propose updates.',
   'Medium', '2026-11-05', 2, 1, 1),

  (1, 1, 'Set up CI/CD pipeline',
   'Configure GitHub Actions for lint, test, and deploy.',
   'High', '2026-11-03', 2, 1, 2),

  -- In Progress (column_id = 2)
  (1, 2, 'Implement user authentication',
   'JWT-based login, registration, and token refresh.',
   'High', '2026-11-10', 1, 1, 0),

  (1, 2, 'Build Kanban board UI',
   'Drag-and-drop columns and task cards in Vanilla JS.',
   'High', '2026-11-12', 2, 1, 1),

  (1, 2, 'REST API for tasks',
   'CRUD endpoints: GET /tasks, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id.',
   'Medium', '2026-11-08', 1, 1, 2),

  -- Done (column_id = 3)
  (1, 3, 'Project scaffolding',
   'Express + SQLite project structure, env config, health check.',
   'Low', '2026-10-20', 1, 1, 0),

  (1, 3, 'Database schema design',
   'ERD, DDL migrations, seed data.',
   'Medium', '2026-10-22', 2, 1, 1);
