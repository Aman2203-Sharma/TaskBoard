import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useWorkspace } from '../context/WorkspaceContext';
import MemberTagInput from './MemberTagInput';

export default function CreateBoardModal({ isOpen, onClose, onBoardCreated }) {
  const { activeWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [autoAddTeam, setAutoAddTeam] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState([]);
  const [boardMembers, setBoardMembers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setName('');
    setDescription('');
    setBoardMembers([]);
    setAutoAddTeam(false);
    setError('');
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setBoardMembers([]);
      setAutoAddTeam(false);
      setError('');
      if (activeWorkspace?.id) {
        api.get(`/api/workspaces/${activeWorkspace.id}/members`)
          .then((res) => setWorkspaceMembers(res.data?.members || []))
          .catch((err) => console.error('[CreateBoardModal] fetch workspace members error:', err));
      }
    }
  }, [isOpen, activeWorkspace?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Board name is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const selectedMemberIds = boardMembers.map((m) => m.id || m.email);
      const res = await api.post('/api/boards', {
        name: trimmed,
        description: description.trim() || null,
        workspace_id: activeWorkspace?.id || undefined,
        auto_add_team: autoAddTeam,
        members: selectedMemberIds,
        initial_members: selectedMemberIds,
      });
      setName('');
      setDescription('');
      setBoardMembers([]);
      setAutoAddTeam(false);
      onBoardCreated?.(res.data.board);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create board.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Create a new board</h2>
            <p className="modal__subtitle">Give your board a name and assign initial collaborators</p>
          </div>
          <button type="button" className="modal__close" onClick={handleClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__body" style={{ position: 'relative' }}>
            {error && <div className="modal-alert">{error}</div>}

            <div className="form-group">
              <label className="form-label">Workspace</label>
              <div
                style={{
                  padding: '0.45rem 0.75rem',
                  background: '#f1f5f9',
                  borderRadius: '6px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: '#334155',
                }}
              >
                💼 {activeWorkspace?.name || 'Default Workspace'}
              </div>
            </div>

            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label" htmlFor="boardNameInput">
                  Board name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <span className={`char-counter ${name.length >= 50 ? 'char-counter--limit' : ''}`}>
                  {name.length} / 50
                </span>
              </div>
              <input
                id="boardNameInput"
                type="text"
                className="form-input"
                placeholder="e.g. Product Launch Q4"
                maxLength={50}
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Board Description (optional)</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of this board's goals, sprints, or deliverables..."
                className="form-textarea"
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>
                Initial Board Members (optional)
              </label>
              <MemberTagInput
                value={boardMembers}
                onChange={setBoardMembers}
                availableUsers={workspaceMembers}
                placeholder="Search workspace teammates…"
                disabled={submitting}
              />
              <p className="form-help-text" style={{ marginTop: '0.4rem' }}>
                Pre-filtered to members of {activeWorkspace?.name || 'this workspace'}.
              </p>
            </div>

            <div className="form-checkbox-row" style={{ marginTop: '0.75rem' }}>
              <input
                type="checkbox"
                id="modalAutoAddTeam"
                checked={autoAddTeam}
                onChange={(e) => setAutoAddTeam(e.target.checked)}
              />
              <label htmlFor="modalAutoAddTeam" className="form-checkbox-label">
                👥 Automatically add all members of {activeWorkspace?.name || 'this workspace'}
              </label>
            </div>
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
