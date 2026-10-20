'use strict';

/**
 * public/js/board.js
 * ─────────────────────────────────────────────────────────────
 * Full Kanban board controller.
 *  – Renders columns + task cards from /api/boards/:id
 *  – Quick-add task at column footer
 *  – Keyword / priority / assignee filter bar
 *  – Task detail modal (view, edit, move, delete, comments)
 *  – HTML5 Drag-and-Drop reorder with optimistic UI + rollback
 *  – Activity drawer (slide-over) via GET /api/boards/:id/activity
 * ─────────────────────────────────────────────────────────────
 */

// ── 1. Auth guard ─────────────────────────────────────────────
if (!Auth.isLoggedIn()) window.location.replace('/login.html');

const TOKEN    = Auth.getToken();
const ME       = Auth.getUser();
const BOARD_ID = new URLSearchParams(location.search).get('id');
if (!BOARD_ID) window.location.replace('/dashboard.html');

// ── DOM refs ──────────────────────────────────────────────────
const kanbanScroll    = document.getElementById('kanbanScroll');
const boardTitleEl    = document.getElementById('boardTitle');
const navUserEl       = document.getElementById('navUser');
const filterKeyword   = document.getElementById('filterKeyword');
const filterPriority  = document.getElementById('filterPriority');
const filterAssignee  = document.getElementById('filterAssignee');

// Task modal
const taskModalBackdrop = document.getElementById('taskModalBackdrop');
const closeTaskModalBtn = document.getElementById('closeTaskModal');
const cancelTaskBtn     = document.getElementById('cancelTaskBtn');
const saveTaskBtn       = document.getElementById('saveTaskBtn');
const deleteTaskBtn     = document.getElementById('deleteTaskBtn');
const modalTaskTitle    = document.getElementById('modalTaskTitle');
const modalTaskDesc     = document.getElementById('modalTaskDesc');
const modalPriority     = document.getElementById('modalPriority');
const modalDueDate      = document.getElementById('modalDueDate');
const modalAssignee     = document.getElementById('modalAssignee');
const modalColumn       = document.getElementById('modalColumn');
const modalCreatedBy    = document.getElementById('modalCreatedBy');
const modalCreatedAt    = document.getElementById('modalCreatedAt');
const commentsSection   = document.getElementById('commentsSection');
const commentForm       = document.getElementById('commentForm');
const commentInput      = document.getElementById('commentInput');

// Activity drawer
const activityBtn     = document.getElementById('activityBtn');
const activityDrawer  = document.getElementById('activityDrawer');
const closeDrawerBtn  = document.getElementById('closeDrawerBtn');
const drawerOverlay   = document.getElementById('drawerOverlay');
const activityList    = document.getElementById('activityList');

if (navUserEl && ME) navUserEl.textContent = ME.name;

document.querySelectorAll('[data-action="logout"]').forEach(b =>
  b.addEventListener('click', e => { e.preventDefault(); Auth.logout(); })
);

// ── State ─────────────────────────────────────────────────────
let boardState   = null;  // { board, columns, members, tasks }
let activeTaskId = null;
let dragState    = null;  // { taskId, sourceColId, sourcePos, snapshotTasks }

// ── API helper ────────────────────────────────────────────────
async function apiFetch(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) { Auth.logout(); return null; }
  return res;
}

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function isOverdue(d) {
  if (!d) return false;
  return new Date(d + 'T00:00:00') < new Date(new Date().toDateString());
}
function timeAgo(isoStr) {
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Load board ────────────────────────────────────────────────
async function loadBoard() {
  const res = await apiFetch('GET', `/api/boards/${BOARD_ID}`);
  if (!res) return;
  if (!res.ok) {
    kanbanScroll.innerHTML = '<div class="text-muted">Board not found or access denied.</div>';
    return;
  }
  boardState = await res.json();
  boardTitleEl.textContent = boardState.board.name;
  document.title = `${boardState.board.name} – TaskBoard`;
  populateAssigneeDropdowns(boardState.members);
  renderBoard();
}

// ── Assignee dropdowns ────────────────────────────────────────
function populateAssigneeDropdowns(members) {
  filterAssignee.innerHTML = '<option value="">All assignees</option>';
  modalAssignee.innerHTML  = '<option value="">Unassigned</option>';
  members.forEach(m => {
    const opt = `<option value="${m.id}">${escHtml(m.name)}</option>`;
    filterAssignee.innerHTML += opt;
    modalAssignee.innerHTML  += opt;
  });
}

// ── Render whole board ────────────────────────────────────────
function renderBoard() {
  const { columns, tasks } = boardState;

  modalColumn.innerHTML = columns
    .slice().sort((a, b) => a.position - b.position)
    .map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  kanbanScroll.innerHTML = '';

  columns.slice().sort((a, b) => a.position - b.position).forEach(col => {
    const colTasks = tasks
      .filter(t => t.column_id === col.id)
      .sort((a, b) => a.position - b.position);
    kanbanScroll.appendChild(buildColumnEl(col, colTasks));
  });

  applyFilters();
}

// ── Build column element ──────────────────────────────────────
function buildColumnEl(col, tasks) {
  const el = document.createElement('div');
  el.className    = 'kanban-col';
  el.dataset.colId = col.id;

  el.innerHTML = `
    <div class="kanban-col__header">
      <span class="kanban-col__name">${escHtml(col.name)}</span>
      <span class="kanban-col__count">${tasks.length}</span>
    </div>
    <div class="kanban-col__tasks" id="col-tasks-${col.id}" data-col-id="${col.id}"></div>
    <div class="kanban-col__add">
      <form class="quick-add-form" data-col-id="${col.id}">
        <input class="quick-add-input" type="text" placeholder="Add a task…" />
        <button type="submit" class="quick-add-btn">Add</button>
      </form>
    </div>`;

  const tasksContainer = el.querySelector(`#col-tasks-${col.id}`);

  if (tasks.length === 0) {
    tasksContainer.innerHTML = '<div class="no-tasks" data-placeholder>No tasks</div>';
  } else {
    tasks.forEach(t => tasksContainer.appendChild(buildTaskCard(t)));
  }

  // Quick-add
  el.querySelector('.quick-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('.quick-add-input');
    const title = input.value.trim();
    if (!title) return;
    input.disabled = true;
    await createTask(col.id, { title });
    input.value    = '';
    input.disabled = false;
    input.focus();
  });

  // DnD: drop zone on the tasks container
  attachDropZone(tasksContainer);

  return el;
}

// ── Build task card ───────────────────────────────────────────
function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className          = 'task-card';
  card.dataset.taskId     = task.id;
  card.dataset.priority   = task.priority;
  card.dataset.assigneeId = task.assignee_id ?? '';
  card.dataset.titleLower = (task.title || '').toLowerCase();
  card.draggable          = true;

  const due    = formatDate(task.due_date);
  const over   = isOverdue(task.due_date);
  const dueCls = over ? 'task-due task-due--overdue' : 'task-due';
  const dueHtml  = due
    ? `<span class="${dueCls}" title="${task.due_date}">${over ? '⚠ ' : ''}${escHtml(due)}</span>` : '';
  const avaHtml  = task.assignee_name
    ? `<span class="avatar" title="${escHtml(task.assignee_name)}">${initials(task.assignee_name)}</span>` : '';

  card.innerHTML = `
    <div class="task-card__title">${escHtml(task.title)}</div>
    <div class="task-card__meta">
      <div class="task-card__left">
        <span class="priority-pill priority-pill--${escHtml(task.priority)}">${escHtml(task.priority)}</span>
        ${dueHtml}
      </div>
      <div class="task-card__right">${avaHtml}</div>
    </div>`;

  // Open modal on click (but not during drag)
  card.addEventListener('click', () => { if (!dragState) openTaskModal(task.id); });

  // ── DnD events ────────────────────────────────────────────
  card.addEventListener('dragstart', (e) => {
    dragState = {
      taskId:        task.id,
      sourceColId:   task.column_id,
      sourcePos:     task.position,
      // Deep snapshot so we can rollback
      snapshotTasks: JSON.parse(JSON.stringify(boardState.tasks)),
    };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.drop-zone-active').forEach(el => el.classList.remove('drop-zone-active'));
  });

  return card;
}

// ── Drop-zone logic ───────────────────────────────────────────
function attachDropZone(container) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    container.classList.add('drop-zone-active');

    // Remove any existing indicator
    container.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    // Find the card we're hovering over
    const afterEl = getDragAfterElement(container, e.clientY);
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (!afterEl) {
      container.appendChild(indicator);
    } else {
      container.insertBefore(indicator, afterEl);
    }
  });

  container.addEventListener('dragleave', (e) => {
    // Only remove if truly leaving the container (not entering a child)
    if (!container.contains(e.relatedTarget)) {
      container.classList.remove('drop-zone-active');
      container.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    container.classList.remove('drop-zone-active');
    container.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    if (!dragState) return;

    const targetColId = Number(container.dataset.colId);

    // Compute new_position from DOM order of visible cards
    const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
    const afterEl = getDragAfterElement(container, e.clientY);
    let newPos = afterEl
      ? cards.indexOf(afterEl)
      : cards.length;
    if (newPos < 0) newPos = 0;

    const { taskId, sourceColId, sourcePos, snapshotTasks } = dragState;
    dragState = null; // clear before async

    // Skip no-op
    if (targetColId === sourceColId && newPos === sourcePos) return;

    // Optimistic DOM update: re-order boardState.tasks then re-render
    optimisticallyMove(taskId, sourceColId, targetColId, newPos);
    renderBoard();

    // API call
    const res = await apiFetch('PUT', `/api/tasks/${taskId}/reorder`, {
      target_column_id: targetColId,
      new_position:     newPos,
    });

    if (!res || !res.ok) {
      // Rollback
      boardState.tasks = snapshotTasks;
      renderBoard();
      alert('Failed to save task position. The board has been reverted.');
      return;
    }

    // Sync the updated task from server response
    const { task: updatedTask } = await res.json();
    const idx = boardState.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) boardState.tasks[idx] = updatedTask;
  });
}

/** Returns the element that the dragged item should be inserted before (or null → append). */
function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
  return cards.reduce((closest, card) => {
    const box    = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: card };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element ?? null;
}

/** Mutate boardState.tasks optimistically to reflect the drag result. */
function optimisticallyMove(taskId, srcColId, tgtColId, newPos) {
  const tasks = boardState.tasks;
  const task  = tasks.find(t => t.id === taskId);
  if (!task) return;

  const oldPos = task.position;

  if (srcColId === tgtColId) {
    // Shift siblings
    tasks.forEach(t => {
      if (t.id === taskId || t.column_id !== srcColId) return;
      if (newPos > oldPos && t.position > oldPos && t.position <= newPos) t.position--;
      if (newPos < oldPos && t.position >= newPos && t.position < oldPos) t.position++;
    });
  } else {
    // Shrink source
    tasks.forEach(t => {
      if (t.column_id === srcColId && t.position > oldPos) t.position--;
    });
    // Expand target
    tasks.forEach(t => {
      if (t.column_id === tgtColId && t.position >= newPos) t.position++;
    });
    task.column_id = tgtColId;
  }
  task.position  = newPos;
}

// ── Create task ───────────────────────────────────────────────
async function createTask(columnId, body) {
  const res = await apiFetch('POST', `/api/columns/${columnId}/tasks`, body);
  if (!res || !res.ok) return;
  const { task } = await res.json();
  boardState.tasks.push(task);
  renderBoard();
}

// ── Filter bar ────────────────────────────────────────────────
function applyFilters() {
  const kw       = filterKeyword.value.toLowerCase().trim();
  const priority = filterPriority.value;
  const assignee = filterAssignee.value;

  document.querySelectorAll('.task-card').forEach(card => {
    const matchKw = !kw       || card.dataset.titleLower.includes(kw);
    const matchPr = !priority || card.dataset.priority === priority;
    const matchAs = !assignee || card.dataset.assigneeId === assignee;
    card.classList.toggle('task-card--hidden', !(matchKw && matchPr && matchAs));
  });
}
filterKeyword.addEventListener('input',   applyFilters);
filterPriority.addEventListener('change', applyFilters);
filterAssignee.addEventListener('change', applyFilters);

// ── Task Modal ────────────────────────────────────────────────
function openTaskModal(taskId) {
  activeTaskId = taskId;
  loadTaskModal(taskId);
  taskModalBackdrop.hidden = false;
}
function closeTaskModal() {
  taskModalBackdrop.hidden = true;
  activeTaskId = null;
}

closeTaskModalBtn.addEventListener('click', closeTaskModal);
cancelTaskBtn.addEventListener('click',     closeTaskModal);
taskModalBackdrop.addEventListener('click', e => { if (e.target === taskModalBackdrop) closeTaskModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !taskModalBackdrop.hidden) closeTaskModal(); });

async function loadTaskModal(taskId) {
  modalTaskTitle.value        = '';
  modalTaskDesc.value         = '';
  commentsSection.innerHTML   = '<div class="text-muted">Loading…</div>';

  const res = await apiFetch('GET', `/api/tasks/${taskId}`);
  if (!res || !res.ok) return;
  const { task, comments } = await res.json();

  const idx = boardState.tasks.findIndex(t => t.id === taskId);
  if (idx !== -1) boardState.tasks[idx] = task;

  modalTaskTitle.value       = task.title;
  modalTaskDesc.value        = task.description || '';
  modalPriority.value        = task.priority;
  modalDueDate.value         = task.due_date || '';
  modalAssignee.value        = task.assignee_id ?? '';
  modalColumn.value          = task.column_id;
  modalCreatedBy.textContent = task.created_by_name || '—';
  modalCreatedAt.textContent = task.created_at
    ? new Date(task.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';

  renderComments(comments);
  autoResize(modalTaskTitle);
}

saveTaskBtn.addEventListener('click', async () => {
  if (!activeTaskId) return;
  const taskData = boardState.tasks.find(t => t.id === activeTaskId);
  const newColId = Number(modalColumn.value);

  saveTaskBtn.disabled    = true;
  saveTaskBtn.textContent = 'Saving…';
  try {
    const res = await apiFetch('PUT', `/api/tasks/${activeTaskId}`, {
      title:       modalTaskTitle.value.trim(),
      description: modalTaskDesc.value.trim(),
      priority:    modalPriority.value,
      due_date:    modalDueDate.value || null,
      assignee_id: modalAssignee.value ? Number(modalAssignee.value) : null,
    });
    if (!res || !res.ok) return;
    const { task: updated } = await res.json();

    if (newColId !== taskData.column_id) {
      const moveRes = await apiFetch('PUT', `/api/tasks/${activeTaskId}/reorder`, {
        target_column_id: newColId,
        new_position:     boardState.tasks.filter(t => t.column_id === newColId).length,
      });
      if (moveRes && moveRes.ok) {
        const { task: moved } = await moveRes.json();
        Object.assign(updated, moved);
      }
    }

    const idx = boardState.tasks.findIndex(t => t.id === activeTaskId);
    if (idx !== -1) boardState.tasks[idx] = updated;
    closeTaskModal();
    renderBoard();
  } finally {
    saveTaskBtn.disabled    = false;
    saveTaskBtn.textContent = 'Save changes';
  }
});

deleteTaskBtn.addEventListener('click', async () => {
  if (!activeTaskId) return;
  if (!confirm('Delete this task? This cannot be undone.')) return;
  const res = await apiFetch('DELETE', `/api/tasks/${activeTaskId}`);
  if (!res || !res.ok) return;
  boardState.tasks = boardState.tasks.filter(t => t.id !== activeTaskId);
  closeTaskModal();
  renderBoard();
});

// ── Comments ──────────────────────────────────────────────────
function renderComments(comments) {
  if (!comments.length) {
    commentsSection.innerHTML = '<div class="text-muted">No comments yet.</div>';
    return;
  }
  commentsSection.innerHTML = comments.map(c => {
    const isOwn = c.user_id === ME?.id;
    const ts    = new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    return `
      <div class="comment-item" data-comment-id="${c.id}">
        <div class="comment-item__header">
          <span class="comment-item__author">${escHtml(c.author_name)}</span>
          <div style="display:flex;gap:.5rem;align-items:center">
            <span class="comment-item__date">${ts}</span>
            ${isOwn ? `<button class="comment-delete-btn" data-comment-id="${c.id}" title="Delete">✕</button>` : ''}
          </div>
        </div>
        <div class="comment-item__body">${escHtml(c.content)}</div>
      </div>`;
  }).join('');

  commentsSection.querySelectorAll('.comment-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const res = await apiFetch('DELETE', `/api/comments/${btn.dataset.commentId}`);
      if (res && res.ok) {
        btn.closest('.comment-item').remove();
        if (!commentsSection.querySelector('.comment-item'))
          commentsSection.innerHTML = '<div class="text-muted">No comments yet.</div>';
      }
    });
  });
}

commentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = commentInput.value.trim();
  if (!content || !activeTaskId) return;
  const res = await apiFetch('POST', `/api/tasks/${activeTaskId}/comments`, { content });
  if (!res || !res.ok) return;
  commentInput.value = '';
  const taskRes = await apiFetch('GET', `/api/tasks/${activeTaskId}`);
  if (taskRes && taskRes.ok) {
    const { comments } = await taskRes.json();
    renderComments(comments);
  }
});

// ── Activity Drawer ───────────────────────────────────────────

/** Friendly label for each action code. */
function actionLabel(action, details) {
  switch (action) {
    case 'TASK_CREATED': return `created task <strong>${escHtml(details.title ?? '')}</strong>`;
    case 'TASK_UPDATED': return `updated task #${details.taskId ?? ''}`;
    case 'TASK_MOVED':   return `moved <strong>${escHtml(details.taskTitle ?? '')}</strong> from <em>${escHtml(details.from_column ?? '')}</em> to <em>${escHtml(details.to_column ?? '')}</em>`;
    case 'TASK_DELETED': return `deleted task <strong>${escHtml(details.title ?? '')}</strong>`;
    case 'COMMENT_ADDED': return `commented on task #${details.taskId ?? ''}`;
    default:             return escHtml(action.toLowerCase().replace(/_/g, ' '));
  }
}

function openActivityDrawer() {
  activityDrawer.classList.add('drawer--open');
  drawerOverlay.hidden = false;
  loadActivity();
}
function closeActivityDrawer() {
  activityDrawer.classList.remove('drawer--open');
  drawerOverlay.hidden = true;
}

activityBtn?.addEventListener('click',    openActivityDrawer);
closeDrawerBtn?.addEventListener('click', closeActivityDrawer);
drawerOverlay?.addEventListener('click',  closeActivityDrawer);

async function loadActivity() {
  activityList.innerHTML = '<div class="text-muted" style="padding:.5rem">Loading…</div>';
  const res = await apiFetch('GET', `/api/boards/${BOARD_ID}/activity`);
  if (!res || !res.ok) {
    activityList.innerHTML = '<div class="text-muted" style="padding:.5rem">Could not load activity.</div>';
    return;
  }
  const { activities } = await res.json();
  if (!activities.length) {
    activityList.innerHTML = '<div class="text-muted" style="padding:.5rem">No activity yet.</div>';
    return;
  }

  activityList.innerHTML = activities.map(a => `
    <div class="activity-item">
      <span class="avatar avatar--sm">${initials(a.user_name || '?')}</span>
      <div class="activity-item__body">
        <span class="activity-item__user">${escHtml(a.user_name || 'Someone')}</span>
        ${actionLabel(a.action, a.details)}
        <div class="activity-item__time">${timeAgo(a.created_at)}</div>
      </div>
    </div>`).join('');
}

// ── Util ──────────────────────────────────────────────────────
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}
modalTaskTitle.addEventListener('input', () => autoResize(modalTaskTitle));

// ── Init ──────────────────────────────────────────────────────
loadBoard();
