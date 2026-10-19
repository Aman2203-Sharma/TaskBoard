'use strict';

/**
 * public/js/dashboard.js
 * ─────────────────────────────────────────────────────────────
 * Dashboard page controller.
 *
 * Responsibilities:
 *   1. Auth guard — redirect to /login.html if not authenticated.
 *   2. Fetch GET /api/boards and render board cards.
 *   3. Handle "Create Board" modal: POST /api/boards, re-render.
 *   4. Logout button.
 * ─────────────────────────────────────────────────────────────
 */

// ── 1. Auth guard ─────────────────────────────────────────────
if (!Auth.isLoggedIn()) {
  window.location.replace('/login.html');
}

// ── DOM refs ─────────────────────────────────────────────────
const boardGrid         = document.getElementById('boardGrid');
const navUser           = document.getElementById('navUser');
const openModalBtn      = document.getElementById('openCreateModal');
const closeModalBtn     = document.getElementById('closeCreateModal');
const cancelModalBtn    = document.getElementById('cancelCreateBoard');
const modalBackdrop     = document.getElementById('createModalBackdrop');
const createBoardForm   = document.getElementById('createBoardForm');
const createBoardBtn    = document.getElementById('createBoardBtn');
const createBoardError  = document.getElementById('createBoardError');

// ── Populate navbar username ──────────────────────────────────
const currentUser = Auth.getUser();
if (navUser && currentUser) {
  navUser.textContent = currentUser.name;
}

// ── Logout ────────────────────────────────────────────────────
document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
  btn.addEventListener('click', (e) => { e.preventDefault(); Auth.logout(); });
});

// ── API helper ────────────────────────────────────────────────
async function apiFetch(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${Auth.getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 || res.status === 403) {
    Auth.logout(); // token expired
    return null;
  }

  return res;
}

// ── Board rendering ───────────────────────────────────────────

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Renders a single board card.
 * @param {{ id, name, description, my_role, column_count, task_count }} board
 */
function renderBoardCard(board) {
  const roleLabel = board.my_role === 'owner' ? 'Owner' : 'Member';
  const roleClass = board.my_role === 'owner' ? 'role-badge--owner' : 'role-badge--member';
  const desc      = board.description
    ? `<p class="board-card__desc">${escHtml(board.description)}</p>`
    : '';

  return `
    <a class="board-card" href="/board.html?id=${board.id}" aria-label="Open board: ${escHtml(board.name)}">
      <div class="board-card__header">
        <span class="board-card__name">${escHtml(board.name)}</span>
        <span class="role-badge ${roleClass}">${roleLabel}</span>
      </div>
      ${desc}
      <div class="board-card__meta">
        <div class="board-card__counts">
          <span class="board-card__count" title="Columns">
            &#9776; ${board.column_count ?? 0} columns
          </span>
          <span class="board-card__count" title="Tasks">
            &#9998; ${board.task_count ?? 0} tasks
          </span>
        </div>
      </div>
    </a>
  `;
}

/**
 * Fetch boards from the API and render them into #boardGrid.
 */
async function loadBoards() {
  boardGrid.innerHTML = '<div class="board-grid__loading">Loading your boards…</div>';

  try {
    const res = await apiFetch('GET', '/api/boards');
    if (!res) return; // redirected to login

    const { boards } = await res.json();

    if (!boards || boards.length === 0) {
      boardGrid.innerHTML = `
        <div class="board-grid__empty">
          <p>You don't have any boards yet.</p>
          <p style="margin-top:.4rem;font-size:.85rem">Click <strong>+ New Board</strong> to get started.</p>
        </div>`;
      return;
    }

    boardGrid.innerHTML = boards.map(renderBoardCard).join('');
  } catch (err) {
    boardGrid.innerHTML = '<div class="board-grid__empty">Failed to load boards. Please refresh.</div>';
    console.error('[dashboard] loadBoards:', err);
  }
}

// ── Create Board Modal ────────────────────────────────────────

function openModal()  {
  createBoardForm.reset();
  hideCreateError();
  modalBackdrop.hidden = false;
  document.getElementById('boardName').focus();
}
function closeModal() { modalBackdrop.hidden = true; }

function showCreateError(msg) {
  createBoardError.textContent = msg;
  createBoardError.style.display = 'block';
}
function hideCreateError() {
  createBoardError.textContent = '';
  createBoardError.style.display = 'none';
}

openModalBtn?.addEventListener('click', openModal);
closeModalBtn?.addEventListener('click', closeModal);
cancelModalBtn?.addEventListener('click', closeModal);

// Close on backdrop click
modalBackdrop?.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalBackdrop.hidden) closeModal();
});

createBoardForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideCreateError();

  const name        = createBoardForm.name.value.trim();
  const description = createBoardForm.description.value.trim();

  if (!name) return showCreateError('Board name is required.');

  createBoardBtn.disabled = true;
  createBoardBtn.textContent = 'Creating…';

  try {
    const res  = await apiFetch('POST', '/api/boards', { name, description: description || undefined });
    if (!res) return;

    const data = await res.json();

    if (!res.ok) {
      return showCreateError(data.error || 'Failed to create board.');
    }

    closeModal();
    await loadBoards(); // re-render grid without page reload
  } catch (err) {
    showCreateError('Network error. Please try again.');
    console.error('[dashboard] createBoard:', err);
  } finally {
    createBoardBtn.disabled = false;
    createBoardBtn.textContent = 'Create Board';
  }
});

// ── Init ──────────────────────────────────────────────────────
loadBoards();
