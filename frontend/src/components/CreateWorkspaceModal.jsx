import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import MemberTagInput from './MemberTagInput';

export default function CreateWorkspaceModal({ isOpen, onClose, onSuccess }) {
  const { createWorkspace } = useWorkspace();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chips, setChips] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setChips([]);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Workspace name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createWorkspace({
        name: trimmedName,
        description: description.trim() || undefined,
        initial_members: chips.map((c) => c.id || c.email),
      });
      onSuccess?.(created);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create workspace.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Create a new workspace</h2>
            <p className="modal__subtitle">Collaborate with your team on shared roadmaps and sprint boards</p>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__body" style={{ position: 'relative' }}>
            {error && <div className="modal-alert">{error}</div>}

            <div className="form-group">
              <div className="form-label-row">
                <label className="form-label" htmlFor="wsModalName">
                  Workspace Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <span className={`char-counter ${name.length >= 50 ? 'char-counter--limit' : ''}`}>
                  {name.length} / 50
                </span>
              </div>
              <input
                id="wsModalName"
                type="text"
                className="form-input"
                placeholder="e.g. Acme Marketing, Engineering, Design Studio"
                maxLength={50}
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="wsModalDesc">
                Workspace Description (optional)
              </label>
              <textarea
                id="wsModalDesc"
                className="form-input form-textarea"
                placeholder="Our team's hub for engineering roadmaps, sprints, and client projects."
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Invite Teammates (optional)</label>
              <MemberTagInput
                value={chips}
                onChange={setChips}
                placeholder="Search name or enter email…"
                disabled={submitting}
              />
              <p className="form-help-text" style={{ marginTop: '0.4rem' }}>
                Type a teammate's name to search or enter email addresses. Teammates will be immediately invited to this workspace.
              </p>
            </div>
          </div>

          <div className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={submitting || !name.trim()}>
              {submitting ? 'Creating…' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
