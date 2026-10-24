import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function BoardMembersModal({
  board,
  members: propMembers,
  isOpen,
  onClose,
  onMembersUpdated,
  onMemberRemoved,
}) {
  const { user: currentUser } = useAuth();
  const [localMembers, setLocalMembers] = useState([]);
  const [removingId, setRemovingId] = useState(null);

  useEffect(() => {
    if (isOpen && board) {
      const list = Array.isArray(propMembers) && propMembers.length > 0
        ? propMembers
        : (board.members || []);
      setLocalMembers(list);
    }
  }, [isOpen, propMembers, board]);

  if (!isOpen || !board) return null;

  const isOwner = board.my_role === 'owner' || board.owner_id === currentUser?.id;
  const members = localMembers;

  const initials = (nameStr = '') =>
    nameStr
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const handleRemove = async (userId, memberName) => {
    if (removingId) return;
    if (!window.confirm(`Remove ${memberName} from this board?`)) return;

    setRemovingId(userId);

    // Optimistically update local state immediately
    setLocalMembers((prev) => prev.filter((m) => m.id !== userId));

    // Optimistically update parent state / board header immediately
    onMemberRemoved?.(userId);

    try {
      await api.delete(`/api/boards/${board.id}/members/${userId}`);
      onMembersUpdated?.();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to remove member from board.');
      onMembersUpdated?.(); // restore state on error
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Board Members</h2>
            <p className="modal__subtitle">Collaborators on {board.name}</p>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal__body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No members found.</div>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1, marginRight: '0.5rem' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#6366f1',
                        color: '#ffffff',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {initials(m.name)}
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name} {m.id === currentUser?.id && <span style={{ color: '#64748b', fontWeight: 400 }}>(you)</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`role-tag ${m.role === 'owner' ? 'role-tag--owner' : 'role-tag--member'}`}>
                      {m.role}
                    </span>
                    {isOwner && m.id !== currentUser?.id && m.role !== 'owner' && (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        style={{ fontSize: '0.75rem', height: '26px', padding: '0.1rem 0.45rem' }}
                        disabled={removingId === m.id}
                        onClick={() => handleRemove(m.id, m.name)}
                      >
                        {removingId === m.id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
