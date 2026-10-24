import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const normalizePriority = (p) => {
  if (!p) return 'Medium';
  const s = String(p).trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

export default function TaskDetailModal({ taskId, board, columns = [], members: propMembers, isOpen, onClose, onTaskUpdated, onTaskDeleted }) {
  const { user: currentUser } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [currentColId, setCurrentColId] = useState('');
  const [movingCol, setMovingCol] = useState(false);

  // Editable task fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // Comments
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && taskId) {
      setErrorMessage(null);
      fetchTask();
    } else {
      setErrorMessage(null);
    }
  }, [isOpen, taskId]);

  const fetchComments = async () => {
    if (!taskId) return;
    try {
      const res = await api.get(`/api/tasks/${taskId}/comments`);
      const list = Array.isArray(res.data) ? res.data : (res.data?.comments || []);
      setComments(list);
    } catch (err) {
      console.error('[TaskDetailModal] fetchComments error:', err);
    }
  };

  const fetchTask = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get(`/api/tasks/${taskId}`);
      const t = res.data.task;
      setTask(t);
      setCurrentColId(t.column_id || '');
      setTitle(t.title || '');
      setDescription(t.description || '');
      setPriority(normalizePriority(t.priority));
      setDueDate(t.due_date ? String(t.due_date).slice(0, 10) : '');
      setAssigneeId(t.assignee_id ? String(t.assignee_id) : '');

      try {
        const commentsRes = await api.get(`/api/tasks/${taskId}/comments`);
        const list = Array.isArray(commentsRes.data) ? commentsRes.data : (commentsRes.data?.comments || []);
        setComments(list);
      } catch {
        setComments(t.comments || []);
      }
    } catch (err) {
      console.error('[TaskDetailModal] fetch error:', err);
      setErrorMessage(err.response?.data?.error || 'Failed to load task details.');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToColumn = async (e) => {
    const newColId = Number(e.target.value);
    if (!newColId || newColId === currentColId) return;

    setMovingCol(true);
    setErrorMessage(null);
    try {
      await api.patch(`/api/tasks/${taskId}/move`, { column_id: newColId });
      setCurrentColId(newColId);
      setTask((prev) => (prev ? { ...prev, column_id: newColId } : prev));
      onTaskUpdated?.();
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to move task.');
    } finally {
      setMovingCol(false);
    }
  };

  if (!isOpen || !taskId) return null;

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Task title cannot be empty.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    // 1. Title: non-empty trimmed string
    const cleanTitle = trimmedTitle;

    // 2. Description: trimmed string or null
    const cleanDescription = description && description.trim() ? description.trim() : null;

    // 3. Priority: "Low", "Medium", or "High"
    const cleanPriority = normalizePriority(priority);

    // 4. Due date: YYYY-MM-DD or null
    let cleanDueDate = null;
    if (dueDate && typeof dueDate === 'string' && dueDate.trim()) {
      const trimmed = dueDate.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !isNaN(Date.parse(trimmed))) {
        cleanDueDate = trimmed;
      }
    }

    // 5. Assignee: null if unassigned ("" or null)
    const cleanAssigneeId = assigneeId && !isNaN(Number(assigneeId)) && Number(assigneeId) > 0
      ? Number(assigneeId)
      : null;

    const payload = {
      title: cleanTitle,
      description: cleanDescription,
      priority: cleanPriority,
      due_date: cleanDueDate,
      assignee_id: cleanAssigneeId,
    };

    try {
      const res = await api.patch(`/api/tasks/${taskId}`, payload);
      const updatedTask = res.data?.task || res.data;
      onTaskUpdated?.(updatedTask);
      onClose();
    } catch (err) {
      console.error('[TaskDetailModal] save error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to save task.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    setErrorMessage(null);
    try {
      await api.delete(`/api/tasks/${taskId}`);
      onTaskDeleted?.(taskId);
      onClose();
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to delete task.');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    const text = newComment.trim();
    if (!text) return;

    setCommentSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.post(`/api/tasks/${taskId}/comments`, { text, content: text });
      const addedComment = res.data?.comment || res.data;
      setComments((prev) => [...prev, addedComment]);
      setNewComment('');
    } catch (err) {
      setErrorMessage(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    setErrorMessage(null);
    try {
      await api.delete(`/api/tasks/${taskId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      try {
        await api.delete(`/api/comments/${commentId}`);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err2) {
        setErrorMessage(err2.response?.data?.error || err.response?.data?.error || 'Failed to delete comment.');
      }
    }
  };

  const boardMembers = Array.isArray(propMembers) && propMembers.length > 0 ? propMembers : (board?.members || []);
  const isBoardOrWsOwner = currentUser && (
    board?.owner_id === currentUser.id ||
    board?.role === 'owner' ||
    board?.userRole === 'owner' ||
    board?.workspace_role === 'owner'
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div style={{ flex: 1, marginRight: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase' }}>
              {task?.column_name || 'Card'}
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errorMessage && e.target.value.trim()) setErrorMessage(null);
              }}
              className="form-input"
              style={{ fontSize: '1.15rem', fontWeight: 700, padding: '0.35rem 0.5rem', marginTop: '0.2rem' }}
              placeholder="Task title"
            />
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal__body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {errorMessage && (
            <div
              className="modal-alert modal-alert--error"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '0.55rem 0.85rem',
                borderRadius: '6px',
                fontSize: '0.84rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#b91c1c',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  lineHeight: 1,
                  padding: '0 0.2rem',
                }}
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading task details…</div>
          ) : (
            <>
              {/* Meta Grid */}
              <div
                className="task-detail-meta-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
                  gap: '0.65rem',
                  padding: '0.75rem',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                }}
              >
                {/* Priority */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>
                    Priority
                  </label>
                  <select
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', marginTop: '0.2rem' }}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                {/* Due Date */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>
                    Due Date
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', marginTop: '0.2rem' }}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                {/* Assignee: Scoped strictly to board members */}
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>
                    Assignee
                  </label>
                  <select
                    className="form-input"
                    style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', marginTop: '0.2rem' }}
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {boardMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Move to Column (Fallback Dropdown) */}
                {columns && columns.length > 0 && (
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>
                      Column (Move to)
                    </label>
                    <select
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', marginTop: '0.2rem' }}
                      value={currentColId}
                      onChange={handleMoveToColumn}
                      disabled={movingCol}
                    >
                      {columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Add detailed task notes or specifications…"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Comments Section */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <span className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Comments ({comments.length})
                </span>

                <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Write a comment…"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                  />
                  <button type="submit" className="btn btn--primary btn--sm" disabled={commentSubmitting || !newComment.trim()}>
                    Post
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {comments.length === 0 ? (
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No comments yet.</div>
                  ) : (
                    comments.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          padding: '0.6rem 0.75rem',
                          background: '#f8fafc',
                          borderRadius: '6px',
                          border: '1px solid #f1f5f9',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem' }}>
                              {c.user_name || c.author_name || 'Team member'}
                            </span>
                            {c.created_at && (
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                          {currentUser && (c.user_id === currentUser.id || c.author_id === currentUser.id || isBoardOrWsOwner) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(c.id)}
                              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Delete comment"
                            >
                              &times;
                            </button>
                          )}
                        </div>
                        <div style={{ color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {c.text || c.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal__footer modal__footer--space-between" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button type="button" className="btn btn--danger btn--sm" onClick={handleDelete}>
            Delete Task
          </button>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
