import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  LayoutGrid,
  Users,
  Activity,
  ArrowRight,
  CheckCircle2,
  Zap,
  Sparkles,
  Layers,
  RotateCcw,
} from 'lucide-react';

const DEMO_COLUMNS = [
  { key: 'todo', name: 'To Do', dotClass: 'col-dot--todo' },
  { key: 'inprogress', altKey: 'in_progress', name: 'In Progress', dotClass: 'col-dot--inprogress' },
  { key: 'done', name: 'Done', dotClass: 'col-dot--done' },
];

const INITIAL_DEMO_CARDS = [
  {
    id: 1,
    title: 'Design user onboarding journey',
    col: 'todo',
    columnId: 'todo',
    priority: 'high',
    tag: 'Design',
    assignee: 'Alice M.',
  },
  {
    id: 2,
    title: 'Implement workspace slug routing',
    col: 'todo',
    columnId: 'todo',
    priority: 'medium',
    tag: 'Backend',
    assignee: 'Bob K.',
  },
  {
    id: 3,
    title: 'Vite + React 19 Frontend Migration',
    col: 'inprogress',
    columnId: 'in_progress',
    priority: 'high',
    tag: 'Frontend',
    assignee: 'Alice M.',
  },
  {
    id: 4,
    title: 'SQLite WAL mode database engine',
    col: 'done',
    columnId: 'done',
    priority: 'low',
    tag: 'Core',
    assignee: 'Aman D.',
  },
  {
    id: 5,
    title: 'JWT Auth & Role-Based Permissions',
    col: 'done',
    columnId: 'done',
    priority: 'medium',
    tag: 'Security',
    assignee: 'Alice M.',
  },
];

export default function LandingPage() {
  const { user, isAuthenticated } = useAuth();

  // Interactive Demo Sandbox State with HTML5 Drag & Drop & Fallback Select
  const [demoCards, setDemoCards] = useState(INITIAL_DEMO_CARDS);
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const resetDemo = () => {
    setDemoCards(INITIAL_DEMO_CARDS);
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  // TSK-8 Fallback move handler for mobile, touch, and accessible navigation
  const handleDemoMoveCard = (cardId, targetColumnId) => {
    const colKey = targetColumnId === 'in_progress' ? 'inprogress' : targetColumnId;
    setDemoCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              col: colKey,
              columnId: targetColumnId,
            }
          : card
      )
    );
  };

  const handleDragStart = (e, cardId) => {
    setDraggedCardId(cardId);
    e.dataTransfer.setData('text/plain', String(cardId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, colKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colKey) {
      setDragOverCol(colKey);
    }
  };

  const handleDragLeave = (e, colKey) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dragOverCol === colKey) {
      setDragOverCol(null);
    }
  };

  const handleDrop = (e, targetColKey) => {
    e.preventDefault();
    setDragOverCol(null);
    const cardIdStr = e.dataTransfer.getData('text/plain') || String(draggedCardId);
    const cardId = Number(cardIdStr);
    if (!cardId) return;

    const columnId = targetColKey === 'inprogress' ? 'in_progress' : targetColKey;
    setDemoCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, col: targetColKey, columnId } : card
      )
    );
    setDraggedCardId(null);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  return (
    <div className="landing-page">
      <Navbar />

      {/* ── Hero Section ── */}
      <section className="hero">
        <div className="hero__badge">
          <Sparkles size={15} />
          <span>Modern Agile Kanban Workspace</span>
        </div>

        <h1 className="hero__title">
          Manage Projects, Track Tasks, and{' '}
          <span className="hero__title-gradient">Collaborate Seamlessly.</span>
        </h1>

        <p className="hero__subtitle">
          A modern, agile Kanban workspace built for fast-moving teams. Keep
          everyone aligned with fluid drag-and-drop boards, isolated workspaces,
          and live audit trails.
        </p>

        {/* Dynamic CTA Buttons based on Auth State */}
        <div className="hero__actions">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" className="btn btn--primary btn--lg">
                <span>Go to Dashboard</span>
                <ArrowRight size={18} />
              </Link>
              <Link to="/workspaces" className="btn btn--secondary btn--lg">
                <Layers size={18} />
                <span>My Workspaces</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/register" className="btn btn--primary btn--lg">
                <span>Get Started Free</span>
                <ArrowRight size={18} />
              </Link>
              <Link to="/login" className="btn btn--secondary btn--lg">
                <span>Log In</span>
              </Link>
            </>
          )}
        </div>

        {isAuthenticated && user && (
          <div className="hero__auth-banner">
            <span className="status-dot status-dot--online"></span>
            <span>
              Signed in as <strong>{user.name}</strong> ({user.email})
            </span>
          </div>
        )}

        {/* Feature Badges */}
        <div className="hero__stats">
          <div className="hero__stat-item">
            <CheckCircle2 size={16} className="text-primary" />
            <span>Multi-Workspace Isolation</span>
          </div>
          <div className="hero__stat-item">
            <CheckCircle2 size={16} className="text-primary" />
            <span>Atomic Drag-and-Drop</span>
          </div>
          <div className="hero__stat-item">
            <CheckCircle2 size={16} className="text-primary" />
            <span>SQLite WAL Engine</span>
          </div>
          <div className="hero__stat-item">
            <CheckCircle2 size={16} className="text-primary" />
            <span>Zero Bloat &amp; Fast</span>
          </div>
        </div>

        {/* ── Interactive Hero Kanban Mockup with Drag & Drop & Accessible Move ── */}
        <div id="demo" className="hero-preview-container" style={{ width: '100%', maxWidth: '1024px', margin: '1rem auto 0', padding: '0 1rem', boxSizing: 'border-box' }}>
          <div className="hero-preview">
            <div className="hero-preview__bar">
              <div className="hero-preview__bar-header">
                <div className="hero-preview__dots">
                  <span className="hero-preview__dot hero-preview__dot--red"></span>
                  <span className="hero-preview__dot hero-preview__dot--yellow"></span>
                  <span className="hero-preview__dot hero-preview__dot--green"></span>
                </div>
                <div className="hero-preview__title">
                  Sprint 14: Core Features Roadmap
                </div>
              </div>
              <div className="hero-preview__bar-actions">
                <div className="hero-preview__hint">
                  Interactive Preview &bull; Try dragging cards or using the Move dropdown!
                </div>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm hero-preview__reset-btn"
                  onClick={resetDemo}
                  title="Reset demo preview to original state"
                >
                  <RotateCcw size={12} style={{ marginRight: '0.35rem' }} />
                  <span>Reset Demo</span>
                </button>
              </div>
            </div>

            <div className="hero-preview__kanban">
            {DEMO_COLUMNS.map((col) => {
              const columnCards = demoCards.filter(
                (c) =>
                  c.col === col.key ||
                  c.columnId === col.key ||
                  (col.key === 'inprogress' && (c.col === 'in_progress' || c.columnId === 'in_progress'))
              );
              const isOver = dragOverCol === col.key;
              return (
                <div
                  key={col.key}
                  className={`hero-preview__col ${isOver ? 'hero-preview__col--drag-over' : ''}`}
                  onDragOver={(e) => handleDragOver(e, col.key)}
                  onDragLeave={(e) => handleDragLeave(e, col.key)}
                  onDrop={(e) => handleDrop(e, col.key)}
                >
                  <div className="hero-preview__col-header">
                    <span className="hero-preview__col-name">
                      <span className={`col-dot ${col.dotClass}`}></span> {col.name}
                    </span>
                    <span className="hero-preview__badge">
                      {columnCards.length}
                    </span>
                  </div>

                  <div className="hero-preview__cards">
                    {columnCards.length === 0 ? (
                      <div className="hero-preview__empty-col">
                        Drop card here
                      </div>
                    ) : (
                      columnCards.map((card) => {
                        const isDragging = draggedCardId === card.id;
                        return (
                          <div
                            key={card.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, card.id)}
                            onDragEnd={handleDragEnd}
                            className={`hero-preview__card ${
                              card.col === 'inprogress' || card.col === 'in_progress'
                                ? 'hero-preview__card--active'
                                : ''
                            } ${card.col === 'done' ? 'hero-preview__card--done' : ''} ${
                              isDragging ? 'hero-preview__card--dragging' : ''
                            }`}
                            title="Drag card between columns or use the Move dropdown"
                          >
                            <div className="hero-preview__card-top">
                              <span className="hero-preview__tag">{card.tag}</span>
                              <span
                                className={`priority-pill priority-pill--${card.priority}`}
                              >
                                {card.priority}
                              </span>
                            </div>
                            <div className="hero-preview__card-title">
                              {card.title}
                            </div>
                            <div className="hero-preview__card-bottom">
                              <span className="hero-preview__assignee">
                                👤 {card.assignee}
                              </span>
                              <span className="hero-preview__drag-handle">
                                ⠿ Drag
                              </span>
                            </div>

                            {/* TSK-8 Fallback Move to Column Control Row */}
                            <div
                              className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="font-medium text-slate-400">Move:</span>
                              <select
                                value={card.columnId}
                                onChange={(e) => handleDemoMoveCard(card.id, e.target.value)}
                                className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="todo">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="done">Done</option>
                              </select>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>

      {/* ── Features Grid Section ── */}
      <section className="features-section" id="features">
        <div className="section-header">
          <div className="section-header__tag">Engineered for Team Clarity</div>
          <h2 className="section-header__title">
            Everything You Need to Ship High-Impact Projects
          </h2>
          <p className="section-header__subtitle">
            Purpose-built capabilities designed to eliminate clutter, enforce
            ownership, and maintain momentum from kickoff to deployment.
          </p>
        </div>

        <div className="features-grid">
          {/* Feature 1: Interactive Kanban */}
          <div className="feature-card">
            <div className="feature-card__icon">
              <LayoutGrid size={24} />
            </div>
            <h3 className="feature-card__title">
              Interactive Kanban with Drag-and-Drop
            </h3>
            <p className="feature-card__text">
              Organize workflows with seamless HTML5 drag-and-drop card movement.
              Every movement updates positions atomically via transaction-backed
              re-indexing, preventing card collisions and state desyncs.
            </p>
            <div className="feature-card__pills">
              <span className="feature-card__pill">Drag &amp; Drop</span>
              <span className="feature-card__pill">Atomic Order</span>
              <span className="feature-card__pill">Inline Priority</span>
              <span className="feature-card__pill">Custom Columns</span>
            </div>
          </div>

          {/* Feature 2: Multi-Workspace Organization */}
          <div className="feature-card">
            <div className="feature-card__icon">
              <Users size={24} />
            </div>
            <h3 className="feature-card__title">
              Multi-Workspace &amp; Team Isolation
            </h3>
            <p className="feature-card__text">
              Clean separation following the proven Trello/Jira model. Isolate
              different departments, client projects, or squads into dedicated
              workspaces with role-based member access and owner-only settings.
            </p>
            <div className="feature-card__pills">
              <span className="feature-card__pill">Team Isolation</span>
              <span className="feature-card__pill">Owner Controls</span>
              <span className="feature-card__pill">Teammate Invites</span>
              <span className="feature-card__pill">Live Tag Search</span>
            </div>
          </div>

          {/* Feature 3: Real-Time Activity & Discussion */}
          <div className="feature-card">
            <div className="feature-card__icon">
              <Activity size={24} />
            </div>
            <h3 className="feature-card__title">
              Live Activity Logging &amp; Member Tracking
            </h3>
            <p className="feature-card__text">
              Inspect who moved cards, created columns, or commented with an
              integrated slide-out audit drawer. Every event includes precise
              relative timestamps and actor avatars to maintain full accountability.
            </p>
            <div className="feature-card__pills">
              <span className="feature-card__pill">Audit Drawer</span>
              <span className="feature-card__pill">Relative Timestamps</span>
              <span className="feature-card__pill">Threaded Comments</span>
              <span className="feature-card__pill">Member Assignees</span>
            </div>
          </div>

          {/* Feature 4: High Performance Engine */}
          <div className="feature-card">
            <div className="feature-card__icon">
              <Zap size={24} />
            </div>
            <h3 className="feature-card__title">
              Blazing Fast SQLite WAL Engine
            </h3>
            <p className="feature-card__text">
              Built on SQLite in WAL (Write-Ahead Logging) mode, offering zero
              latency, sub-millisecond query execution, and high concurrency
              without the memory bloat of heavyweight external databases.
            </p>
            <div className="feature-card__pills">
              <span className="feature-card__pill">SQLite WAL</span>
              <span className="feature-card__pill">Sub-ms Queries</span>
              <span className="feature-card__pill">JWT Security</span>
              <span className="feature-card__pill">React 19 SPA</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3-Step Workflow Section ── */}
      <section className="workflow-section">
        <div className="section-header">
          <div className="section-header__tag">How It Works</div>
          <h2 className="section-header__title">Three Steps to Seamless Delivery</h2>
        </div>

        <div className="workflow-grid">
          <div className="workflow-step">
            <div className="workflow-step__num">1</div>
            <h4 className="workflow-step__title">Create Your Workspace</h4>
            <p className="workflow-step__text">
              Set up dedicated workspaces for your team or organization and invite
              collaborators with interactive chip search.
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step__num">2</div>
            <h4 className="workflow-step__title">Configure Kanban Boards</h4>
            <p className="workflow-step__text">
              Map out your stages, set custom column priorities, assign due dates,
              and delegate cards to board members.
            </p>
          </div>

          <div className="workflow-step">
            <div className="workflow-step__num">3</div>
            <h4 className="workflow-step__title">Ship with Velocity</h4>
            <p className="workflow-step__text">
              Move tasks across stages with intuitive drag-and-drop, inspect
              activity audit logs, and keep all stakeholders aligned.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom Call To Action Banner ── */}
      <section className="cta-banner">
        <h2 className="cta-banner__title">
          Ready to streamline your team's workflow?
        </h2>
        <p className="cta-banner__subtitle">
          Create your workspace in seconds and experience the clean agility of
          TaskBoard today.
        </p>
        <div className="cta-banner__actions">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn btn--primary btn--lg cta-btn">
              <span>Go to Your Dashboard</span>
              <ArrowRight size={18} />
            </Link>
          ) : (
            <>
              <Link to="/register" className="btn btn--primary btn--lg cta-btn">
                <span>Start Free &ndash; Sign Up</span>
                <ArrowRight size={18} />
              </Link>
              <Link
                to="/login"
                className="btn btn--ghost btn--lg"
                style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <span>Sign In to Workspace</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ── Public Footer ── */}
      <Footer />
    </div>
  );
}
