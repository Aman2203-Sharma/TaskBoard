# TaskBoard

A modern team workspace & agile Kanban project management application engineered for speed, clarity, and collaboration.

---

## Section 1: What Approach Did We Take?

### 1. Monorepo Architecture & Modular Separation
TaskBoard is organized as a clean two-folder monorepo separating a robust backend REST API from a lightweight, reactive frontend single-page application:

```
taskboard/
├── backend/                  # Node.js, Express & SQLite REST API
│   ├── middleware/           # JWT auth & board permission guards
│   ├── routes/               # Modular API routes (auth, users, workspaces, boards, columns, tasks)
│   ├── utils/                # Audit & activity logging utilities
│   ├── db.js                 # better-sqlite3 connection & helpers
│   ├── index.js              # Server entry point
│   ├── app.js                # Express app setup & route mounting
│   ├── schema.sql            # SQLite schema migrations
│   ├── seed.sql              # Initial database seed
│   ├── taskboard.db          # SQLite database file
│   └── package.json          # Backend dependencies & scripts
│
├── frontend/                 # Vite + React 19 Single Page Application
│   ├── src/
│   │   ├── api/              # Axios API client with auth interceptors
│   │   ├── context/          # AuthContext & WorkspaceContext
│   │   ├── components/       # Modals, Navbar, ActivityDrawer, ProtectedRoute
│   │   ├── pages/            # Login, Register, Dashboard, Workspaces, Board, LandingPage
│   │   ├── styles/           # Modern design system stylesheet
│   │   ├── App.jsx           # Client router
│   │   └── main.jsx          # React DOM entry
│   ├── public/               # Static assets & icons
│   ├── vite.config.js        # Vite dev server & /api proxy to localhost:3000
│   └── package.json          # Frontend dependencies & scripts
│
├── .gitignore
├── package.json              # Monorepo orchestration scripts
├── schema.sql                # Root schema migration deliverable
├── seed.sql                  # Root database seed deliverable
└── README.md
```

### 2. Core Engineering Strategies
- **Native SQLite WAL Engine via `better-sqlite3`**:
  - Leverages synchronous C++ bindings (`better-sqlite3`) executing sub-millisecond queries with zero network latency.
  - Enforces relational referential integrity on connection startup (`db.pragma('foreign_keys = ON')`).
  - Operates in Write-Ahead Logging mode (`db.pragma('journal_mode = WAL')`) for high concurrent read/write throughput without database lockups.
- **Atomic Database Transactions for State Consistency**:
  - All multi-step mutating workflows (drag-and-drop repositioning, cascade deletions of boards/workspaces, initial column provisioning) execute inside explicit SQLite transactions (`db.transaction(...)`).
- **Contiguous 0-Based Integer Task & Column Indexing**:
  - Eliminates fractional positioning bugs and floating-point drift.
  - Automatically heals gaps on deletion or cross-column movement using sequential `0, 1, 2, ...` re-indexing (`reindexColumn`).
- **Progressive Touch & Desktop Interaction Fallbacks**:
  - **Desktop (`>= 768px`)**: Native HTML5 Drag-and-Drop enabled for both task cards and columns with visible drag grip indicators (`⋮⋮`).
  - **Mobile & Touch (`< 768px`)**: Drag-and-drop automatically disabled (`draggable={false}`) to prevent touch-scroll conflicts. Columns feature left/right shift arrow buttons (`←` / `→`) and every task card features an accessible fallback `"Move:"` select dropdown.
- **Robust JWT Authentication & Security-Questions Account Recovery**:
  - Encrypts user passwords using `bcryptjs` (cost factor 10) and signs stateless HS256 JWT tokens.
  - 2-step password reset mechanism protected by 3 deterministic single-word lowercase security questions.

---

## Section 2: What Points / Features Are We Covering?

TaskBoard covers a comprehensive set of production-grade agile features grouped by module:

### 1. Authentication & Account Recovery (AUTH-1 to AUTH-5)
- **AUTH-1 (User Registration)**: Registration with full name, unique email validation, and password constraints; automatically initializes a default personal workspace.
- **AUTH-2 (Password Hashing)**: Secure one-way bcrypt hashing with 10 salt rounds for passwords and security questions.
- **AUTH-3 (JWT Issuance & Verification)**: Signs stateless JSON Web Tokens on login; client injects `Authorization: Bearer <token>` on all requests.
- **AUTH-4 (Route Protection & Session Clearance)**: `ProtectedRoute` wrapper guarding private views; `logout()` immediately purges tokens and active workspaces.
- **AUTH-5 (Security Questions & Viewport Fix)**: 2-step password reset flow enforcing single-word lowercase answers; responsive, scrollable registration layout without viewport clipping.

### 2. Workspaces & Boards (BRD-1 to BRD-6)
- **BRD-1 (Workspace & Board Listing)**: Multi-workspace switcher and board dashboard scoped by active workspace.
- **BRD-2 (Board Creation & Default Columns)**: Create boards with name and optional description; automatically initializes `'To Do'`, `'In Progress'`, and `'Done'`.
- **BRD-3 (Owner-Restricted Management)**: Board renaming and cascading deletion strictly guarded for board owners.
- **BRD-4 (Teammate Invitations)**: Search registered users by email to add/remove board members.
- **BRD-5 (Header Member Facepile)**: Overlapping circular avatar cluster showing member initials (up to 4 visible + `+N` overflow pill) on the board header.
- **BRD-6 (Total Task Count Badges)**: Board cards render live column count (`📊 N cols`) and task count (`📝 N tasks`).

### 3. Dynamic Columns (COL-1 to COL-5)
- **COL-1 (Ordered Horizontal Canvas)**: Columns displayed in sequential `position` order inside an overflow-x touch-scrolling canvas.
- **COL-2 (Column Renaming)**: Inline title editing and pencil trigger with `PUT /api/columns/:id` persistence.
- **COL-3 (Column Deletion)**: Owner-only column deletion with confirmation dialog and cascading task cleanup.
- **COL-4 (Responsive Column Reordering)**:
  - *Desktop*: Native HTML5 drag-and-drop across columns with drag grip indicator.
  - *Mobile*: Left and right shift arrow buttons (`←` / `→`) for touch-friendly reordering.
- **COL-5 (Column Task Counter)**: Real-time task count pill displayed on every column header.

### 4. Task Lifecycle & Drag-and-Drop (TSK-1 to TSK-8)
- **TSK-1 (Quick-Add Task Bar)**: Inline expandable task form at the bottom of each column with title, priority, due date, and assignee selector.
- **TSK-2 (Task Detail Modal)**: Rich task modal for editing title, description, priority, due date, and assignee.
- **TSK-3 (Task Deletion)**: Delete task with confirmation dialog, cascading comments and audit logs.
- **TSK-4 (Transactional Drag-and-Drop)**: Seamless vertical reordering and cross-column moves with atomic position updates.
- **TSK-5 (Color-Coded Priority Badges)**: Distinct visual tags for `Low`, `Medium`, and `High` priorities.
- **TSK-6 (Overdue Indicator)**: Red border highlight and warning badge (`⚠️ Overdue`) for past-due tasks not in `'Done'`.
- **TSK-7 (Assignee Badges)**: Circular avatar initials and member name pill on task cards.
- **TSK-8 (Accessible Fallback Move Dropdown)**: Accessible `"Move:"` column dropdown on cards and detail modals (also included in the interactive landing demo).

### 5. Search, Filters & Activity Logs (SRC-1 to ACT-1)
- **SRC-1 (Keyword Search Bar)**: Real-time search filtering tasks by title and description with quick clear (`×`).
- **SRC-2 (Filter Toolbar)**: Priority toggle pills (`All`, `High`, `Medium`, `Low`), `"👤 My Tasks Only"` filter, and `"Reset Filters"` trigger.
- **CMT-1 & CMT-2 (Threaded Comments)**: Add and view timestamped task discussions; author/owner-only comment deletion.
- **ACT-1 (Activity Audit Drawer)**: Integrated audit log recording task creations, movements, edits, and comments with relative timestamps (`2m ago`, `1h ago`).

### 6. Mobile & Tablet Responsiveness
- Standardized `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`.
- Fluid horizontal swipe and touch scrolling on Kanban canvas without column squishing.
- Responsive landing page hero interactive preview demo adapting gracefully to mobile viewports.

---

## Section 3: How to Run This Project?

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Installation
Clone the repository and install all dependencies using the monorepo orchestrator:
```bash
npm run install-all
```
*(Installs dependencies for both `backend/` and `frontend/`)*

### 3. Start Development Servers
Run both the backend API and frontend Vite development server concurrently:
```bash
npm run dev
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)
- **API Health Probe**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

### 4. Available Scripts
From the repository root:

| Command | Description |
|---|---|
| `npm run dev` | Runs both backend (`localhost:3000`) and frontend (`localhost:5173`) concurrently |
| `npm run server` | Starts only the backend API server with nodemon |
| `npm run client` | Starts only the frontend Vite development server |
| `npm run build` | Compiles the production frontend bundle into `frontend/dist` |
| `npm start` | Boots the backend server in production mode |
| `npm run install-all` | Installs dependencies for both `backend` and `frontend` |

### 5. Demo User Credentials
The database is pre-seeded with test accounts ready for instant login:

| Name | Role | Email | Password | Security Answers (`favWork`, `favFood`, `favShow`) |
|---|---|---|---|---|
| **Alice Johnson** | Owner | `alice@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |
| **Bob Smith** | Member | `bob@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |
| **Charlie Brown** | Member | `charlie@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |

---

## Remaining Technical Details

### API Endpoints Reference
All endpoints are served under `/api/*`:

- `GET /api/health` — Service and database health probe
- `POST /api/auth/register` — Create a new user account
- `POST /api/auth/login` — Sign in and receive JWT token
- `GET /api/auth/me` — Verify current user session
- `GET /api/users` — Live user search for invitations
- `GET /api/workspaces` — List workspaces for the authenticated user
- `POST /api/workspaces` — Create workspace with optional initial members
- `PATCH /api/workspaces/:id` — Rename workspace (Owner only)
- `DELETE /api/workspaces/:id` — Delete workspace and cascade items (Owner only)
- `GET /api/boards` — List boards in active workspace
- `POST /api/boards` — Create board in active workspace
- `GET /api/boards/:id` — Get board columns and tasks
- `GET /api/boards/:id/activity` — Get board audit activity history
- `PATCH /api/tasks/:id/move` — Drag-and-drop card movement across columns
- `PUT /api/tasks/:id/reorder` — Position-aware transactional reorder within and across columns
- `PUT /api/columns/:id` — Rename or reposition a column
- `DELETE /api/columns/:id` — Delete column and cascade tasks
- `POST /api/tasks/:id/comments` — Add comment to task
- `GET /api/tasks/:id/comments` — Retrieve comments for task
- `DELETE /api/tasks/:id/comments/:commentId` — Delete task comment (author only)
- `POST /api/auth/verify-email` — Step 1 of password reset
- `POST /api/auth/reset-password` — Step 2 of password reset with security questions

### Task Ordering Logic & Transaction Breakdown
TaskBoard implements a **strict contiguous 0-based integer position index** (`position = 0, 1, 2, ...`) for both columns and tasks within columns.

#### 1. Contiguous 0-Based Reindexing
- When a new task or column is created, it is appended at position `max(position) + 1` (or `0` if empty).
- When a task or column is deleted or moved, `reindexColumn(columnId)` iterates over all remaining items ordered by `position ASC` and assigns dense, consecutive integers `0, 1, 2, ...`.
- This guarantees there are never duplicate positions, negative values, or index gaps within any column.

#### 2. Atomic Transactional Reordering
- During drag-and-drop or column shifts, position updates execute within an atomic SQLite transaction (`db.transaction(...)`).
- **For same-column moves**:
  - Moving a card down (`newPos > oldPos`): intervening cards shift up (`position = position - 1`).
  - Moving a card up (`newPos < oldPos`): intervening cards shift down (`position = position + 1`).
- **For cross-column moves**:
  - The source column gap is closed (`position = position - 1 WHERE position > oldPos`).
  - The target column makes space (`position = position + 1 WHERE position >= newPos`).
  - The moved task receives its new `column_id` and exact `new_position`.
- Running these updates inside an immediate transaction prevents concurrent write race conditions, ghost shifts, and index drift across simultaneous client interactions.
