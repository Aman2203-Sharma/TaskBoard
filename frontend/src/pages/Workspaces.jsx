import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import Navbar from '../components/Navbar';
import CreateWorkspaceModal from '../components/CreateWorkspaceModal';
import WorkspaceMembersModal from '../components/WorkspaceMembersModal';

export default function Workspaces() {
  const { user: currentUser } = useAuth();
  const { workspaces, loading, setActiveWorkspace, fetchWorkspaces, renameWorkspace, deleteWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedWorkspaceForMembers, setSelectedWorkspaceForMembers] = useState(null);

  // Rename Modal State
  const [editingWorkspace, setEditingWorkspace] = useState(null);
  const [editName, setEditName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [editError, setEditError] = useState('');

  const formatDate = (isoStr) => {
    if (!isoStr) return 'Recently';
    try {
      return new Date(isoStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  const handleOpenEdit = (ws) => {
    setEditingWorkspace(ws);
    setEditName(ws.name);
    setEditError('');
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!editName.trim() || !editingWorkspace) return;

    setRenaming(true);
    setEditError('');

    try {
      await renameWorkspace(editingWorkspace.id, editName.trim());
      setEditingWorkspace(null);
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to rename workspace.');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (ws) => {
    if (workspaces.length <= 1) {
      alert('Cannot delete your only workspace. You must have at least one active workspace.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${ws.name}"?\n\n⚠️ Warning: All boards, tasks, and data inside this workspace will be deleted.`
    );
    if (!confirmed) return;

    try {
      await deleteWorkspace(ws.id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete workspace.');
    }
  };

  const handleGoToBoards = (ws) => {
    setActiveWorkspace(ws);
    navigate('/dashboard');
  };

  return (
    <div className="app-shell">
      <Navbar />

      <main className="workspaces-page">
        <div className="workspaces-header">
          <div>
            <h1 className="workspaces-header__title">Your Workspaces</h1>
            <p className="workspaces-header__subtitle">
              Manage your organizations, departments, and cross-functional teams
            </p>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setIsCreateOpen(true)}
          >
            + Create Workspace
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#64748b' }}>
            Loading your workspaces…
          </div>
        ) : workspaces.length === 0 ? (
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
              No workspaces found
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Create a workspace to start collaborating with your team.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setIsCreateOpen(true)}
            >
              + Create Workspace
            </button>
          </div>
        ) : (
          <div className="workspaces-grid">
            {workspaces.map((ws) => {
              const isOwner = ws.my_role === 'owner' || ws.role === 'owner' || ws.owner_id === currentUser?.id;

              return (
                <div key={ws.id} className="ws-card">
                  <div>
                    <div className="ws-card__top">
                      <div>
                        <h3 className="ws-card__title">{ws.name}</h3>
                        <span className="ws-card__slug">/{ws.slug}</span>
                      </div>
                      <span className={`role-tag ${isOwner ? 'role-tag--owner' : 'role-tag--member'}`}>
                        {isOwner ? 'Owner' : 'Member'}
                      </span>
                    </div>

                    {ws.description && <p className="ws-card__desc">{ws.description}</p>}

                    <div className="ws-card__meta">
                      <div>
                        👥 <span className="ws-card__meta-value">{ws.member_count || 1}</span> members
                      </div>
                      <div>
                        📋 <span className="ws-card__meta-value">{ws.board_count || 0}</span> boards
                      </div>
                      <div>
                        📅 Created {formatDate(ws.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="ws-card__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => handleGoToBoards(ws)}
                    >
                      Go to Boards
                    </button>

                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setSelectedWorkspaceForMembers(ws)}
                    >
                      Teammates
                    </button>

                    {isOwner && (
                      <>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => handleOpenEdit(ws)}
                        >
                          Rename
                        </button>

                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          style={{ marginLeft: 'auto' }}
                          onClick={() => handleDelete(ws)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => fetchWorkspaces()}
      />

      {/* Workspace Members Modal */}
      <WorkspaceMembersModal
        workspace={selectedWorkspaceForMembers}
        isOpen={!!selectedWorkspaceForMembers}
        onClose={() => setSelectedWorkspaceForMembers(null)}
        onMembersUpdated={() => fetchWorkspaces()}
      />

      {/* Rename Workspace Modal */}
      {editingWorkspace && (
        <div className="modal-backdrop" onClick={() => setEditingWorkspace(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <h2 className="modal__title">Rename Workspace</h2>
                <p className="modal__subtitle">Update the display name of this workspace</p>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={() => setEditingWorkspace(null)}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRenameSubmit}>
              <div className="modal__body">
                {editError && <div className="modal-alert">{editError}</div>}

                <div className="form-group">
                  <div className="form-label-row">
                    <label className="form-label" htmlFor="renameWsInput">
                      Workspace Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <span className={`char-counter ${editName.length >= 50 ? 'char-counter--limit' : ''}`}>
                      {editName.length} / 50
                    </span>
                  </div>
                  <input
                    id="renameWsInput"
                    type="text"
                    className="form-input"
                    maxLength={50}
                    required
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal__footer">
                <button type="button" className="btn btn--ghost" onClick={() => setEditingWorkspace(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={renaming || !editName.trim()}>
                  {renaming ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
