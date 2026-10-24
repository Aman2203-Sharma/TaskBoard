-- =============================================================
-- TaskBoard Schema
-- SQLite with foreign key enforcement (PRAGMA foreign_keys = ON)
-- =============================================================

-- ----------------------------------------------------
-- 1. users
--    Root entity. Deleting a user cascades to boards,
--    board_members, comments, and nullifies task assignees.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  name          TEXT     NOT NULL,
  email         TEXT     UNIQUE NOT NULL,
  password_hash TEXT     NOT NULL,
  sec_q1_hash   TEXT,
  sec_q2_hash   TEXT,
  sec_q3_hash   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 2. workspaces
--    Organization/team boundary isolating boards & members.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  name        TEXT     NOT NULL,
  slug        TEXT     UNIQUE NOT NULL,
  description TEXT,
  owner_id    INTEGER  NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 3. workspace_members
--    Junction table for workspace membership and role.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id INTEGER NOT NULL
                 REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL
                 REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT    NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  joined_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

-- ----------------------------------------------------
-- 4. boards
--    Owned by a user and scoped to a workspace.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS boards (
  id           INTEGER  PRIMARY KEY AUTOINCREMENT,
  name         TEXT     NOT NULL,
  description  TEXT,
  owner_id     INTEGER  NOT NULL
                 REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER
                 REFERENCES workspaces(id) ON DELETE CASCADE,
  color        TEXT     DEFAULT 'indigo',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 5. board_members
--    Junction table — which users belong to which board.
--    Cascades on board OR user deletion to keep clean.
--    UNIQUE(board_id, user_id) prevents duplicate rows.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS board_members (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL
              REFERENCES boards(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL
              REFERENCES users(id)  ON DELETE CASCADE,
  role     TEXT    NOT NULL CHECK(role IN ('owner', 'member')),
  UNIQUE(board_id, user_id)
);

-- ----------------------------------------------------
-- 4. columns
--    Ordered columns inside a board (To Do, In Progress…).
--    Deleted when the parent board is deleted.
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS columns (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL
              REFERENCES boards(id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,
  position INTEGER NOT NULL
);

-- ----------------------------------------------------
-- 5. tasks
--    Core work item. Linked to a board AND a column.
--    assignee_id uses SET NULL so the task survives
--    even if the assigned user is removed.
--    created_by keeps an audit trail (also SET NULL on
--    user delete so the task is not lost).
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER  PRIMARY KEY AUTOINCREMENT,
  board_id    INTEGER  NOT NULL
                REFERENCES boards(id)   ON DELETE CASCADE,
  column_id   INTEGER  NOT NULL
                REFERENCES columns(id)  ON DELETE CASCADE,
  title       TEXT     NOT NULL,
  description TEXT,
  priority    TEXT     DEFAULT 'Medium'
                CHECK(priority IN ('Low', 'Medium', 'High')),
  due_date    DATE,
  assignee_id INTEGER
                REFERENCES users(id)    ON DELETE SET NULL,
  created_by  INTEGER  NOT NULL
                REFERENCES users(id)    ON DELETE SET NULL,
  position    INTEGER  NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger: auto-update tasks.updated_at on every row update
CREATE TRIGGER IF NOT EXISTS tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- ----------------------------------------------------
-- 6. task_comments / comments
--    Threaded comments on a task. Removed when the task
--    or the commenting user is deleted (cascade both).
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS task_comments (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER  NOT NULL,
  user_id    INTEGER  NOT NULL,
  text       TEXT     NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER  NOT NULL
               REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER  NOT NULL
               REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT     NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------
-- 7. activity_log
--    Board-scoped audit trail. Entries survive user
--    deletion (user_id SET NULL). Removed when the
--    parent board is deleted (CASCADE).
-- ----------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER  PRIMARY KEY AUTOINCREMENT,
  board_id   INTEGER  NOT NULL
               REFERENCES boards(id) ON DELETE CASCADE,
  user_id    INTEGER
               REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT     NOT NULL,
  details    TEXT,                    -- JSON string for arbitrary metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
