import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import MemberTagInput from './MemberTagInput';

export default function InviteBoardModal({
  board,
  members = [],
  isOpen,
  onClose,
  onMemberAdded,
}) {
  const [selectedChips, setSelectedChips] = useState([]);
  const [workspaceUsers, setWorkspaceUsers] = useState([]);
  const [boardMembersList, setBoardMembersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState({ text: '', type: 'error' });

  // Fetch workspace teammates and fresh board members list
  const fetchEligibleTeammates = useCallback(async () => {
    if (!board?.id) return;
    setLoading(true);
    try {
      // 1. Fetch fresh board members to guarantee exclusion
      try {
        const bMemRes = await api.get(`/api/boards/${board.id}/members`);
        const freshBoardMembers = Array.isArray(bMemRes.data)
          ? bMemRes.data
          : bMemRes.data?.members || [];
        setBoardMembersList(freshBoardMembers);
      } catch {
        setBoardMembersList(members || board?.members || []);
      }

      // 2. Fetch workspace teammates
      if (board.workspace_id) {
        const wsRes = await api.get(`/api/workspaces/${board.workspace_id}/members`);
        setWorkspaceUsers(wsRes.data?.members || []);
      } else {
        const availRes = await api.get(`/api/boards/${board.id}/available-members`);
        setWorkspaceUsers(availRes.data?.users || []);
      }
    } catch (err) {
      console.error('[InviteBoardModal] fetchEligibleTeammates error:', err);
      try {
        const availRes = await api.get(`/api/boards/${board.id}/available-members`);
        setWorkspaceUsers(availRes.data?.users || []);
      } catch {}
    } finally {
      setLoading(false);
    }
  }, [board?.id, board?.workspace_id, members, board?.members]);

  useEffect(() => {
    if (isOpen && board?.id) {
      setSelectedChips([]);
      setAlert({ text: '', type: 'error' });
      fetchEligibleTeammates();
    }
  }, [isOpen, board?.id, fetchEligibleTeammates]);

  if (!isOpen || !board) return null;

  // Calculate excludeIds: current board members list
  const activeBoardMembers = boardMembersList.length > 0 ? boardMembersList : (members || board?.members || []);
  const excludeIds = activeBoardMembers.map((m) => m.id);

  const handleAddSelectedMembers = async () => {
    if (selectedChips.length === 0) return;

    setSubmitting(true);
    setAlert({ text: '', type: 'error' });

    try {
      await api.post(`/api/boards/${board.id}/members`, {
        members: selectedChips,
        member_ids: selectedChips.map((c) => c.id).filter(Boolean),
        emails: selectedChips.map((c) => c.email).filter(Boolean),
      });

      setAlert({
        text: `✓ Added ${selectedChips.length} teammate${selectedChips.length === 1 ? '' : 's'} to board!`,
        type: 'success',
      });
      setSelectedChips([]);
      onMemberAdded?.();
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setAlert({
        text: err.response?.data?.error || 'Failed to add members to board.',
        type: 'error',
      });
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h2 className="modal__title">Add Member to Board</h2>
            <p className="modal__subtitle">Invite teammates to collaborate on {board.name}</p>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal__body" style={{ position: 'relative' }}>
          {alert.text && (
            <div className={`modal-alert ${alert.type === 'success' ? 'modal-alert--success' : ''}`}>
              {alert.text}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ marginBottom: '0.45rem', display: 'block' }}>
              Select Workspace Teammates
            </label>
            <MemberTagInput
              value={selectedChips}
              onChange={setSelectedChips}
              availableUsers={workspaceUsers}
              excludeIds={excludeIds}
              placeholder={
                loading
                  ? 'Loading teammates…'
                  : 'Search teammate name or email…'
              }
              disabled={loading || submitting}
              autoFocus
            />
            <span className="form-help-text" style={{ marginTop: '0.4rem', display: 'block' }}>
              Only teammates belonging to this board's workspace can be added. Existing board members are automatically excluded.
            </span>
          </div>
        </div>

        <div className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={submitting || selectedChips.length === 0}
            onClick={handleAddSelectedMembers}
          >
            {submitting ? 'Adding…' : `Add to Board ${selectedChips.length > 0 ? `(${selectedChips.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
