/**
 * public/js/main.js
 * ─────────────────────────────────────────────────────────────
 * Step 1 bootstrap:
 *   • Pings GET /api/health and updates the navbar status dot.
 *   • Stub board renderer (will be replaced in later steps once
 *     full API endpoints exist).
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// ── DOM refs ─────────────────────────────────────────────────
const healthDot   = document.querySelector('.status-dot');
const healthLabel = document.getElementById('healthLabel');
const boardEl     = document.getElementById('board');

// ── Health check ─────────────────────────────────────────────
async function checkHealth() {
  try {
    const res  = await fetch('/api/health');
    const data = await res.json();

    if (data.status === 'ok') {
      healthDot.className  = 'status-dot status-dot--ok';
      healthLabel.textContent = `API online · ${new Date(data.timestamp).toLocaleTimeString()}`;
    } else {
      throw new Error(data.message || 'Unknown error');
    }
  } catch (err) {
    healthDot.className     = 'status-dot status-dot--error';
    healthLabel.textContent = 'API unreachable';
    console.error('[health]', err);
  }
}

// ── Stub board render ─────────────────────────────────────────
/**
 * Renders placeholder columns so the layout is visible even
 * before real API endpoints are wired up.
 * Replace this with a real fetch('/api/boards/:id') call in Step 2.
 */
function renderStubBoard() {
  const columns = [
    { name: 'To Do',        cls: 'todo',        tasks: [] },
    { name: 'In Progress',  cls: 'inprogress',  tasks: [] },
    { name: 'Done',         cls: 'done',        tasks: [] },
  ];

  boardEl.innerHTML = columns.map((col) => `
    <section class="column column--${col.cls}" aria-label="${col.name}">
      <div class="column__header">
        <span class="column__name">${col.name}</span>
        <span class="column__count">${col.tasks.length}</span>
      </div>
      <div class="column__cards" data-column="${col.cls}">
        ${col.tasks.length === 0
          ? '<p style="font-size:.78rem;color:#94a3b8;text-align:center;padding:.5rem 0">No tasks yet</p>'
          : col.tasks.map(renderCard).join('')}
      </div>
    </section>
  `).join('');
}

/**
 * Render a single task card.
 * @param {{ title: string, description: string, priority: string, due_date: string }} task
 */
function renderCard(task) {
  const due = task.due_date
    ? `<span class="card__due">📅 ${task.due_date}</span>`
    : '';
  return `
    <article class="card" draggable="true">
      <p class="card__title">${escHtml(task.title)}</p>
      ${task.description ? `<p class="card__desc">${escHtml(task.description)}</p>` : ''}
      <div class="card__meta">
        <span class="badge badge--${task.priority}">${task.priority}</span>
        ${due}
      </div>
    </article>
  `;
}

/** Minimal XSS guard for text interpolation. */
function escHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────
(function init() {
  checkHealth();
  renderStubBoard();

  // Re-check health every 30 seconds.
  setInterval(checkHealth, 30_000);
})();
