import React, { useState, useEffect } from 'react';
import api from '../api/client';

export default function ActivityDrawer({ boardId, isOpen, onClose }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchActivity = async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/boards/${boardId}/activity`);
      const items = Array.isArray(res.data)
        ? res.data
        : (res.data?.activity || res.data?.activities || []);
      setActivities(items);
    } catch (err) {
      console.error('[ActivityDrawer] fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Run on mount
  useEffect(() => {
    if (boardId) {
      fetchActivity();
    }
  }, [boardId]);

  // Run on open
  useEffect(() => {
    if (isOpen && boardId) {
      fetchActivity();
    }
  }, [isOpen, boardId]);

  if (!isOpen) return null;

  const initials = (nameStr = '') => {
    if (!nameStr) return 'U';
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameStr.slice(0, 2).toUpperCase();
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return 'just now';
    const normalized = (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+'))
      ? dateStr.replace(' ', 'T') + 'Z'
      : dateStr;
    const date = new Date(normalized);
    const seconds = Math.floor((new Date() - date) / 1000);
    if (isNaN(seconds) || seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatActivityText = (act) => {
    // If details is a string, use it directly
    if (typeof act.details === 'string' && act.details.trim()) {
      return act.details;
    }
    // If details is an object
    if (act.details && typeof act.details === 'object') {
      if (act.details.message) return act.details.message;
      if (act.action === 'moved_task' || act.action === 'TASK_MOVED') {
        const title = act.details.taskTitle || act.details.title || 'a task';
        const toCol = act.details.to_column || act.details.target_column || '';
        return toCol ? `Moved "${title}" to ${toCol}` : `Moved "${title}"`;
      }
      if (act.action === 'TASK_CREATED' || act.action === 'task_created') {
        return `Created task "${act.details.title || ''}"`;
      }
      if (act.action === 'TASK_UPDATED' || act.action === 'task_updated') {
        return 'Updated task';
      }
      if (act.action === 'COMMENT_ADDED' || act.action === 'comment_added') {
        return `Commented on "${act.details.taskTitle || 'a task'}"`;
      }
      if (act.action === 'BOARD_UPDATED' || act.action === 'board_updated') {
        return 'Updated board details';
      }
    }
    if (act.description) return act.description;
    if (act.action === 'board_created') return 'Board created';
    if (act.action === 'moved_task') return 'Moved task';
    if (act.action) return act.action.replace(/_/g, ' ').toLowerCase();
    return 'performed an action';
  };

  return (
    <>
      <div className="activity-drawer-overlay" onClick={onClose} />
      <div className="activity-drawer">
        <div className="activity-drawer__header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📋</span>
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>
              Board Activity ({activities.length})
            </span>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close activity drawer"
          >
            &times;
          </button>
        </div>

        <div className="activity-drawer__body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.85rem' }}>
              Loading activity logs…
            </div>
          ) : activities.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.85rem' }}>
              No recorded activity yet.
            </div>
          ) : (
            activities.map((act) => (
              <div key={act.id} className="activity-item">
                <span className="activity-item__avatar">
                  {initials(act.user_name || act.actor_name || act.user_email)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#1e293b', lineHeight: 1.4 }}>
                    <strong>{act.user_name || act.actor_name || act.user_email || 'Member'}</strong>{' '}
                    <span>{formatActivityText(act)}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    {timeAgo(act.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
