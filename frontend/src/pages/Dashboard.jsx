import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import Navbar from '../components/Navbar';
import CreateBoardModal from '../components/CreateBoardModal';
import WorkspaceMembersModal from '../components/WorkspaceMembersModal';
import EditBoardModal from '../components/EditBoardModal';
import DeleteBoardModal from '../components/DeleteBoardModal';

export default function Dashboard() {
  const { user } = useAuth();
  const {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    fetchWorkspaces,
    loading: isWorkspaceLoading,
  } = useWorkspace();
  const navigate = useNavigate();

  const [boards, setBoards] = useState([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Menus
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isWorkspaceMembersOpen, setIsWorkspaceMembersOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [deletingBoard, setDeletingBoard] = useState(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [activeMenuBoardId, setActiveMenuBoardId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Close context menus when clicking anywhere outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuBoardId(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const fetchBoards = useCallback(async (wsId) => {
    if (!wsId) {
      setBoards([]);
      setLoadingBoards(false);
      return;
    }
    setLoadingBoards(true);
    try {
      const res = await api.get(`/api/boards?workspace_id=${wsId}`);
      setBoards(res.data?.boards || []);
    } catch (err) {
      console.error('[Dashboard] fetchBoards error:', err);
      setBoards([]);
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  useEffect(() => {
    // Race-condition prevention: Do NOT fire GET /api/boards until activeWorkspace?.id is explicitly known
    if (isWorkspaceLoading || !activeWorkspace?.id) {
      setBoards([]);
      if (!isWorkspaceLoading && workspaces.length === 0) {
        setLoadingBoards(false);
      }
      return;
    }

    let isCurrent = true;
    setLoadingBoards(true);

    api
      .get(`/api/boards?workspace_id=${activeWorkspace.id}`)
      .then((res) => {
        if (isCurrent) {
          setBoards(res.data?.boards || []);
        }
      })
      .catch((err) => {
        if (isCurrent) {
          console.error('[Dashboard] fetchBoards error:', err);
          setBoards([]);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setLoadingBoards(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeWorkspace?.id, isWorkspaceLoading, workspaces.length]);

  const handleWorkspaceChange = (e) => {
    const wsId = Number(e.target.value);
    setActiveWorkspace(wsId);
  };

  const canManageBoard = (b) => {
    if (!b) return false;
    return (
      b.my_role === 'owner' ||
      b.owner_id === user?.id ||
      activeWorkspace?.owner_id === user?.id
    );
  };

  const handleBoardUpdated = (updatedBoard) => {
    setBoards((prev) =>
      prev.map((b) => (b.id === updatedBoard.id ? { ...b, ...updatedBoard } : b))
    );
    showToast(`Board "${updatedBoard.name || updatedBoard.title}" updated successfully.`);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBoard) return;
    setDeletingLoading(true);
    try {
      await api.delete(`/api/boards/${deletingBoard.id}`);
      setBoards((prev) => prev.filter((b) => b.id !== deletingBoard.id));
      showToast(`Board "${deletingBoard.name || deletingBoard.title}" deleted successfully.`);
      setDeletingBoard(null);
    } catch (err) {
      console.error('[Dashboard] delete error:', err);
      alert(err.response?.data?.error || 'Failed to delete board.');
    } finally {
      setDeletingLoading(false);
    }
  };

  const filteredBoards = boards.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.description && b.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="app-shell">
      <Navbar />

      <main className="dashboard-page">
        {/* Dashboard Header Bar */}
        <div className="dashboard__header">
          <div className="dashboard__header-left">
            <h1 className="dashboard__title">My Boards</h1>
          </div>

          {/* Right-aligned action group in exact order */}
          <div className="dashboard__header-actions">
            {/* 1. Workspace Selector Dropdown */}
            <div className="dashboard-workspace-switcher workspace-pill" title="Active Workspace">
              <span className="workspace-pill__icon">&#128188;</span>
              <select
                className="workspace-select"
                value={activeWorkspace?.id || ''}
                onChange={handleWorkspaceChange}
                disabled={isWorkspaceLoading || workspaces.length === 0}
                aria-label="Select active workspace"
              >
                {workspaces.length === 0 ? (
                  <option value="">{isWorkspaceLoading ? 'Loading workspaces…' : 'No workspace'}</option>
                ) : (
                  workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.member_count || 1} {w.member_count === 1 ? 'member' : 'members'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* 2. Workspace Members Button */}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setIsWorkspaceMembersOpen(true)}
              disabled={isWorkspaceLoading || !activeWorkspace}
              title="Manage workspace teammates"
            >
              👥 Workspace Members
            </button>

            {/* 3. + New Board Button */}
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setIsCreateBoardOpen(true)}
              disabled={isWorkspaceLoading || !activeWorkspace}
            >
              + New Board
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search boards by name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isWorkspaceLoading || loadingBoards}
              style={{ paddingLeft: '2.2rem', height: '36px', fontSize: '0.85rem' }}
            />
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.85rem' }}>
              🔍
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            {isWorkspaceLoading ? (
              <span>Resolving workspace…</span>
            ) : (
              <>
                {filteredBoards.length} {filteredBoards.length === 1 ? 'board' : 'boards'} in{' '}
                <strong>{activeWorkspace?.name || 'Workspace'}</strong>
              </>
            )}
          </div>
        </div>

        {/* Boards Grid or Skeleton */}
        {isWorkspaceLoading || loadingBoards ? (
          <div className="boards-loading-skeleton" style={{ padding: '1rem 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                color: '#64748b',
                padding: '2.5rem 1rem',
              }}
            >
              <div className="spinner" />
              <span style={{ fontSize: '0.92rem', fontWeight: 500 }}>
                {isWorkspaceLoading ? 'Resolving active workspace…' : 'Loading workspace boards…'}
              </span>
            </div>
            <div className="board-grid">
              {[1, 2, 3].map((n) => (
                <div key={n} className="board-card board-card--skeleton">
                  <div>
                    <div className="skeleton-bar" style={{ width: '60%', height: '18px', marginBottom: '0.75rem' }} />
                    <div className="skeleton-bar" style={{ width: '85%', height: '13px', marginBottom: '1.5rem' }} />
                  </div>
                  <div className="skeleton-bar" style={{ width: '40%', height: '13px' }} />
                </div>
              ))}
            </div>
          </div>
        ) : !activeWorkspace && workspaces.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 1.5rem',
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: '12px',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>💼</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
              No Workspaces Found
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Create a workspace to start organizing your team boards.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/workspaces')}
            >
              Go to Workspaces
            </button>
          </div>
        ) : filteredBoards.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3.5rem 1.5rem',
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              borderRadius: '12px',
              color: '#64748b',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
              {searchQuery ? 'No matching boards found' : 'No boards yet in this workspace'}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1.25rem' }}>
              {searchQuery
                ? `No boards match "${searchQuery}". Try a different keyword.`
                : `Create your first Kanban board in "${activeWorkspace?.name || 'this workspace'}" to start organizing tasks.`}
            </p>
            {!searchQuery && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setIsCreateBoardOpen(true)}
              >
                + Create Board
              </button>
            )}
          </div>
        ) : (
          <div className="board-grid">
            {filteredBoards.map((b) => {
              const isManager = canManageBoard(b);

              return (
                <div
                  key={b.id}
                  className="board-card"
                  onClick={() => navigate(`/board/${b.id}`)}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <h3 className="board-card__title">{b.name}</h3>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span className={`role-tag ${b.my_role === 'owner' ? 'role-tag--owner' : 'role-tag--member'}`}>
                          {b.my_role || 'member'}
                        </span>

                        {/* Subtle Three-Dot Context Menu (for Board / Workspace Owners) */}
                        {isManager && (
                          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="board-menu-trigger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuBoardId((prev) => (prev === b.id ? null : b.id));
                              }}
                              title="Board options"
                              aria-label="Board options"
                            >
                              &bull;&bull;&bull;
                            </button>

                            {activeMenuBoardId === b.id && (
                              <div className="board-context-menu" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="board-context-menu__item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuBoardId(null);
                                    setEditingBoard(b);
                                  }}
                                >
                                  <span>✏️</span>
                                  <span>Edit Board</span>
                                </button>
                                <button
                                  type="button"
                                  className="board-context-menu__item board-context-menu__item--danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuBoardId(null);
                                    setDeletingBoard(b);
                                  }}
                                >
                                  <span>🗑️</span>
                                  <span>Delete Board</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {b.description && <p className="board-card__desc">{b.description}</p>}
                  </div>

                  <div className="board-card__footer">
                    <div style={{ display: 'flex', gap: '0.85rem' }}>
                      <span>📊 {b.column_count || 3} cols</span>
                      <span>📝 {b.task_count || 0} tasks</span>
                    </div>
                    <span style={{ color: '#6366f1', fontWeight: 600 }}>Open &rarr;</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      <CreateBoardModal
        isOpen={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
        onBoardCreated={(newBoard) => {
          if (activeWorkspace?.id) {
            fetchBoards(activeWorkspace.id);
          }
          navigate(`/board/${newBoard.id}`);
        }}
      />

      <WorkspaceMembersModal
        workspace={activeWorkspace}
        isOpen={isWorkspaceMembersOpen}
        onClose={() => setIsWorkspaceMembersOpen(false)}
        onMembersUpdated={() => {
          fetchWorkspaces();
          if (activeWorkspace?.id) {
            fetchBoards(activeWorkspace.id);
          }
        }}
      />

      <EditBoardModal
        board={editingBoard}
        isOpen={!!editingBoard}
        onClose={() => setEditingBoard(null)}
        onBoardUpdated={handleBoardUpdated}
      />

      <DeleteBoardModal
        board={deletingBoard}
        isOpen={!!deletingBoard}
        onClose={() => setDeletingBoard(null)}
        onConfirm={handleConfirmDelete}
        loading={deletingLoading}
      />

      {/* Toast Notifications */}
      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <span>✓</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
