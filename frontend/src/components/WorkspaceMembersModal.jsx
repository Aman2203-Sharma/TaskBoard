import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import MemberTagInput from './MemberTagInput';

export default function WorkspaceMembersModal({ workspace, isOpen, onClose, onMembersUpdated }) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chips, setChips] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [alert, setAlert] = useState({ text: '', type: 'error' });

  const isOwner = workspace?.my_role === 'owner' || workspace?.role === 'owner' || workspace?.owner_id === currentUser?.id;

  const fetchMembers = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/workspaces/${workspace.id}/members`);
      setMembers(res.data?.members || []);
    } catch (err) {
      console.error('[WorkspaceMembersModal] fetch error:', err);
      setAlert({ text: 'Failed to load workspace members.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    if (isOpen) {
      setChips([]);
      setAlert({ text: '', type: 'error' });
      fetchMembers();
    }
  }, [isOpen, fetchMembers]);

  if (!isOpen || !workspace) return null;

  const activeMemberIds = members.map((m) => m.id);

  const initials = (nameStr = '') =>
    nameStr
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const handleInviteChips = async () => {
    if (chips.length === 0) return;

    setInviting(true);
    setAlert({ text: '', type: 'error' });

    try {
      await api.post(`/api/workspaces/${workspace.id}/members`, {
        members: chips,
        member_ids: chips.map((c) => c.id).filter(Boolean),
        emails: chips.map((c) => c.email).filter(Boolean),
      });

      setAlert({
        text: `✓ Invited ${chips.length} teammate${chips.length === 1 ? '' : 's'} to workspace!`,
        type: 'success',
      });
      setChips([]);
      await fetchMembers();
      onMembersUpdated?.();
    } catch (err) {
      setAlert({
        text: err.response?.data?.error || 'Failed to add members to workspace.',
        type: 'error',
      });
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (userId, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) return;

    try {
      await api.delete(`/api/workspaces/${workspace.id}/members/${userId}`);
      setAlert({ text: `Removed ${memberName} from workspace.`, type: 'success' });
      await fetchMembers();
      onMembersUpdated?.();
    } catch (err) {
      setAlert({
        text: err.response?.data?.error || 'Failed to remove member.',
        type: 'error',
      });
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Workspace Teammates</h2>
            <p className="modal__subtitle">Manage members who have access to {workspace.name}</p>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal__body" style={{ overflow: 'visible', position: 'relative' }}>
          {alert.text && (
            <div className={`modal-alert ${alert.type === 'success' ? 'modal-alert--success' : ''}`}>
              {alert.text}
            </div>
          )}

          {/* Owner-only Invite Form */}
          {isOwner && (
            <div style={{ paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1rem' }}>
              <span className="form-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
                Invite Teammates to Workspace
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <MemberTagInput
                  value={chips}
                  onChange={setChips}
                  excludeIds={activeMemberIds}
                  placeholder="Search name or enter email…"
                  disabled={inviting}
                />
                <p className="form-help-text" style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.1rem 0 0' }}>
                  Type a teammate's name to search or enter email addresses.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={inviting || chips.length === 0}
                    onClick={handleInviteChips}
                  >
                    {inviting ? 'Inviting…' : `Invite ${chips.length > 0 ? `(${chips.length})` : ''}`}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
              Active Members ({members.length})
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '280px', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                Loading members…
              </div>
            ) : members.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                No members found.
              </div>
            ) : (
              members.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.65rem',
                    background: '#ffffff',
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
                        onClick={() => handleRemove(m.id, m.name)}
                      >
                        Remove
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
