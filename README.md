# TaskBoard

A modern team workspace & agile Kanban project management application engineered for speed, clarity, and collaboration.

## Architecture

TaskBoard is organized as a clean two-folder monorepo:

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
│   │   ├── pages/            # Login, Register, Dashboard, Workspaces, Board
│   │   ├── styles/           # Modern design system stylesheet
│   │   ├── App.jsx           # Client router
│   │   └── main.jsx          # React DOM entry
│   ├── public/               # Static assets & icons
│   ├── vite.config.js        # Vite dev server & /api proxy to localhost:3000
│   └── package.json          # Frontend dependencies & scripts
│
├── .gitignore
├── package.json              # Monorepo orchestration scripts
└── README.md
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (v9+)

### 2. Install Dependencies
Run the install orchestrator from the project root:
```bash
npm run install-all
```
*(Installs both `backend/` and `frontend/` dependencies)*

### 3. Start Development
Run both the backend API and frontend Vite server concurrently:
```bash
npm run dev
```

- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

---

## Available Scripts

From the repository root:

| Command | Description |
|---|---|
| `npm run dev` | Runs both backend (`localhost:3000`) and frontend (`localhost:5173`) concurrently |
| `npm run server` | Starts only the backend API server with nodemon |
| `npm run client` | Starts only the frontend Vite development server |
| `npm run build` | Compiles the production frontend bundle into `frontend/dist` |
| `npm start` | Boots the backend server in production mode |
| `npm run install-all` | Installs dependencies for both `backend` and `frontend` |

---

## API Endpoints

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

---

## Demo User Credentials

The database is pre-seeded with test accounts ready for instant login:

| Name | Role | Email | Password | Security Answers (`favWork`, `favFood`, `favShow`) |
|---|---|---|---|---|
| **Alice Johnson** | Owner | `alice@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |
| **Bob Smith** | Member | `bob@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |
| **Charlie Brown** | Member | `charlie@taskboard.dev` | `password123` | `demo`, `demo`, `demo` |

---

## Task Ordering Logic

TaskBoard implements a **strict contiguous 0-based integer position index** (`position = 0, 1, 2, ...`) for both columns and tasks within columns.

### 1. Contiguous 0-Based Reindexing
- When a new task or column is created, it is appended at position `max(position) + 1` (or `0` if empty).
- When a task or column is deleted or moved, `reindexColumn(columnId)` iterates over all remaining items ordered by `position ASC` and assigns dense, consecutive integers `0, 1, 2, ...`.
- This guarantees there are never duplicate positions, negative values, or index gaps within any column.

### 2. Atomic Transactional Reordering
- During drag-and-drop or column shifts, position updates execute within an atomic SQLite transaction (`db.transaction(...)`).
- For same-column moves:
  - Moving a card down (`newPos > oldPos`): intervening cards shift up (`position = position - 1`).
  - Moving a card up (`newPos < oldPos`): intervening cards shift down (`position = position + 1`).
- For cross-column moves:
  - The source column gap is closed (`position = position - 1 WHERE position > oldPos`).
  - The target column makes space (`position = position + 1 WHERE position >= newPos`).
  - The moved task receives its new `column_id` and exact `new_position`.
- Running these updates inside an immediate transaction prevents concurrent write race conditions, ghost shifts, and index drift across simultaneous client interactions.

