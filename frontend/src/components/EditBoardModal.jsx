import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function EditBoardModal({ board, isOpen, onClose, onBoardUpdated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (board && isOpen) {
      setTitle(board.name || board.title || '');
      setDescription(board.description || '');
      setError('');
    }
  }, [board, isOpen]);

  if (!isOpen || !board) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError('Board title is required.');
      return;
    }
    if (trimmedTitle.length > 100) {
      setError('Board title must be 100 characters or fewer.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.patch(`/api/boards/${board.id}`, {
        title: trimmedTitle,
        description: description.trim() || null,
      });

      const updated = res.data?.board || res.data;
      onBoardUpdated(updated);
      onClose();
    } catch (err) {
      console.error('[EditBoardModal] update error:', err);
      setError(err.response?.data?.error || 'Failed to update board.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">Edit Board Details</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__body">
            {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="editBoardTitle">
                Board Title <span style={{ color: 'var(--clr-danger)' }}>*</span>
              </label>
              <input
                id="editBoardTitle"
                type="text"
                className="form-input"
                placeholder="e.g. Q4 Sprint Roadmap"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="editBoardDesc">
                Description <span className="text-muted">(Optional)</span>
              </label>
              <textarea
                id="editBoardDesc"
                className="form-input"
                rows={3}
                placeholder="Briefly describe what this board is used for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="modal__footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={loading || !title.trim()}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
