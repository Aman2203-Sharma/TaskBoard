import React from 'react';

export default function DeleteBoardModal({ board, isOpen, onClose, onConfirm, loading }) {
  if (!isOpen || !board) return null;

  const boardTitle = board.name || board.title || 'Untitled Board';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <div className="modal__header">
          <h2 className="modal__title" style={{ color: 'var(--clr-danger)' }}>
            Delete Board
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal__body">
          <p style={{ color: '#334155', lineHeight: 1.6, fontSize: '0.95rem' }}>
            Are you sure you want to delete <strong>'{boardTitle}'</strong>? All columns, tasks, and history inside this board will be permanently erased.
          </p>
          <p
            style={{
              marginTop: '0.85rem',
              fontSize: '0.825rem',
              color: '#b91c1c',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '0.55rem 0.75rem',
              borderRadius: '6px',
            }}
          >
            ⚠️ This action is permanent and cannot be undone.
          </p>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={loading}
            style={{ background: '#ef4444', color: '#ffffff', borderColor: '#ef4444' }}
          >
            {loading ? 'Deleting...' : 'Delete Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
