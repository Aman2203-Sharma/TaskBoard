import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import Navbar from '../components/Navbar';
import BoardMembersModal from '../components/BoardMembersModal';
import InviteBoardModal from '../components/InviteBoardModal';
import TaskDetailModal from '../components/TaskDetailModal';
import ActivityDrawer from '../components/ActivityDrawer';
import EditBoardModal from '../components/EditBoardModal';
import DeleteBoardModal from '../components/DeleteBoardModal';

export default function Board() {
  const { id: boardId } = useParams();
  const { user: currentUser } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();

  const [boardData, setBoardData] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals & Drawers
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const handleOutsideClick = () => setIsSettingsOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // New Column input
  const [newColumnName, setNewColumnName] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);

  // Upgraded task creation form state per column:
  // { [colId]: { isExpanded, title, priority, dueDate, assigneeId, isSubmitting, error } }
  const [taskFormState, setTaskFormState] = useState({});
  const taskTitleInputRefs = useRef({});

  // Inline board rename
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [boardTitle, setBoardTitle] = useState('');

  // Search & Filter state
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [myTasksOnly, setMyTasksOnly] = useState(false);

  // Column inline rename state
  const [editingColId, setEditingColId] = useState(null);
  const [editingColName, setEditingColName] = useState('');

  // Dragging state (Tasks & Columns)
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverColId, setDragOverColId] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null); // 'top' | 'bottom'
  const [draggedColId, setDraggedColId] = useState(null);
  const [dragOverColumnTargetId, setDragOverColumnTargetId] = useState(null);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getInitials = (nameStr = '') =>
    nameStr
      .split(' ')
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await api.get(`/api/boards/${boardId}`);
      setBoardData(res.data);
      setBoardTitle(res.data?.board?.name || '');

      let membersList = Array.isArray(res.data?.members) ? res.data.members : [];
      try {
        const memRes = await api.get(`/api/boards/${boardId}/members`);
        const fetchedMembers = Array.isArray(memRes.data)
          ? memRes.data
          : (memRes.data?.members || []);
        if (fetchedMembers.length > 0) {
          membersList = fetchedMembers;
        }
      } catch (memErr) {
        // Fallback to res.data.members if /members fails
      }
      setMembers(membersList);
    } catch (err) {
      console.error('[Board] fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load board.');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  if (loading) {
    return (
      <div className="app-shell">
        <Navbar />
        <div style={{ textAlign: 'center', padding: '5rem 1rem', color: '#64748b' }}>
          Loading Kanban board…
        </div>
      </div>
    );
  }

  if (error || !boardData?.board) {
    return (
      <div className="app-shell">
        <Navbar />
        <div style={{ textAlign: 'center', padding: '5rem 1rem', color: '#ef4444' }}>
          <h3>{error || 'Board not found'}</h3>
          <Link to="/dashboard" className="btn btn--primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
            &larr; Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { board, columns = [], tasks = [], members: rawBoardMembers = [] } = boardData;
  const sortedColumns = [...columns].sort((a, b) => (a.position || 0) - (b.position || 0));

  const memberMap = new Map();
  (members || []).forEach((m) => { if (m?.id) memberMap.set(m.id, m); });
  (rawBoardMembers || []).forEach((m) => { if (m?.id && !memberMap.has(m.id)) memberMap.set(m.id, m); });
  (boardData?.board?.members || []).forEach((m) => { if (m?.id && !memberMap.has(m.id)) memberMap.set(m.id, m); });
  const currentMembers = Array.from(memberMap.values());
  const isOwner =
    board.my_role === 'owner' ||
    board.owner_id === currentUser?.id ||
    activeWorkspace?.owner_id === currentUser?.id;

  // Filter tasks based on Search, Priority, and Assignee
  const filteredTasks = tasks.filter((t) => {
    if (taskSearchQuery.trim()) {
      const q = taskSearchQuery.toLowerCase();
      const matchTitle = t.title && t.title.toLowerCase().includes(q);
      const matchDesc = t.description && t.description.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    if (priorityFilter !== 'ALL') {
      const p = (t.priority || 'Medium').toLowerCase();
      if (p !== priorityFilter.toLowerCase()) return false;
    }
    if (myTasksOnly) {
      if (t.assignee_id !== currentUser?.id) return false;
    }
    return true;
  });

  // Group filtered tasks by column_id
  const tasksByColumn = {};
  sortedColumns.forEach((col) => {
    tasksByColumn[col.id] = [];
  });
  filteredTasks.forEach((t) => {
    if (tasksByColumn[t.column_id]) {
      tasksByColumn[t.column_id].push(t);
    }
  });

  // Sort each column's tasks by position
  Object.keys(tasksByColumn).forEach((colId) => {
    tasksByColumn[colId].sort((a, b) => (a.position || 0) - (b.position || 0));
  });

  // Handle board rename
  const handleRenameBoard = async () => {
    if (!boardTitle.trim() || boardTitle === board.name) {
      setBoardTitle(board.name);
      setIsEditingTitle(false);
      return;
    }

    try {
      await api.patch(`/api/boards/${board.id}`, { title: boardTitle.trim() });
      setIsEditingTitle(false);
      fetchBoard();
      showToast('Board renamed successfully.');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename board.');
      setBoardTitle(board.name);
      setIsEditingTitle(false);
    }
  };

  const handleBoardUpdated = (updatedBoard) => {
    setBoardData((prev) => (prev ? { ...prev, board: { ...prev.board, ...updatedBoard } } : prev));
    setBoardTitle(updatedBoard.name || updatedBoard.title || '');
    showToast('Board details updated successfully.');
  };

  const handleMemberRemoved = (userId) => {
    setMembers((prev) => prev.filter((m) => m.id !== userId));
    setBoardData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        members: (prev.members || []).filter((m) => m.id !== userId),
      };
    });
  };

  const handleConfirmDelete = async () => {
    setDeletingLoading(true);
    try {
      await api.delete(`/api/boards/${board.id}`);
      navigate('/dashboard');
    } catch (err) {
      console.error('[Board] delete error:', err);
      alert(err.response?.data?.error || 'Failed to delete board.');
      setDeletingLoading(false);
    }
  };

  // Add column
  const handleAddColumn = async (e) => {
    e.preventDefault();
    if (!newColumnName.trim()) return;

    setAddingColumn(true);
    try {
      await api.post(`/api/boards/${board.id}/columns`, { name: newColumnName.trim() });
      setNewColumnName('');
      fetchBoard();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add column.');
    } finally {
      setAddingColumn(false);
    }
  };

  // Delete column
  const handleDeleteColumn = async (colId, colName) => {
    if (!window.confirm(`Delete column "${colName}" and all tasks inside it?`)) return;

    try {
      await api.delete(`/api/columns/${colId}`);
      fetchBoard();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete column.');
    }
  };

  // Move column left or right (Mobile arrows)
  const handleMoveColumn = async (colIndex, direction) => {
    const targetIndex = direction === 'left' ? colIndex - 1 : colIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedColumns.length) return;

    const reordered = [...sortedColumns];
    const [movedCol] = reordered.splice(colIndex, 1);
    reordered.splice(targetIndex, 0, movedCol);

    const updatedColumns = reordered.map((col, idx) => ({
      ...col,
      position: idx,
    }));

    setBoardData((prev) => (prev ? { ...prev, columns: updatedColumns } : prev));

    try {
      const changedCols = updatedColumns.filter((col) => {
        const orig = sortedColumns.find((c) => c.id === col.id);
        return !orig || orig.position !== col.position;
      });

      await Promise.all(
        changedCols.map((col) =>
          api.put(`/api/columns/${col.id}`, { position: col.position })
        )
      );
      fetchBoard();
    } catch (err) {
      console.error('[Board] reorder column error:', err);
      fetchBoard();
    }
  };

  // Inline column rename
  const handleStartRenameColumn = (col) => {
    setEditingColId(col.id);
    setEditingColName(col.name);
  };

  const handleSaveRenameColumn = async (colId) => {
    const trimmed = editingColName.trim();
    if (!trimmed) {
      setEditingColId(null);
      return;
    }
    const currentObj = columns.find((c) => c.id === colId);
    if (currentObj && currentObj.name === trimmed) {
      setEditingColId(null);
      return;
    }

    setBoardData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map((c) => (c.id === colId ? { ...c, name: trimmed } : c)),
      };
    });
    setEditingColId(null);

    try {
      await api.put(`/api/columns/${colId}`, { name: trimmed });
      showToast(`Column renamed to "${trimmed}".`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rename column.');
      fetchBoard();
    }
  };

  // Upgraded task creation handlers per column
  const getColumnForm = (colId) => {
    return taskFormState[colId] || {
      isExpanded: false,
      title: '',
      priority: 'Medium',
      dueDate: '',
      assigneeId: '',
      isSubmitting: false,
      error: null,
    };
  };

  const handleExpandTaskForm = (colId) => {
    setTaskFormState((prev) => ({
      ...prev,
      [colId]: {
        ...(prev[colId] || {
          title: '',
          priority: 'Medium',
          dueDate: '',
          assigneeId: '',
          isSubmitting: false,
        }),
        isExpanded: true,
        error: null,
      },
    }));
    setTimeout(() => {
      taskTitleInputRefs.current[colId]?.focus();
    }, 50);
  };

  const handleCollapseTaskForm = (colId) => {
    setTaskFormState((prev) => ({
      ...prev,
      [colId]: {
        isExpanded: false,
        title: '',
        priority: 'Medium',
        dueDate: '',
        assigneeId: '',
        isSubmitting: false,
        error: null,
      },
    }));
  };

  const handleTaskFormChange = (colId, field, val) => {
    setTaskFormState((prev) => {
      const current = prev[colId] || {
        isExpanded: true,
        title: '',
        priority: 'Medium',
        dueDate: '',
        assigneeId: '',
        isSubmitting: false,
        error: null,
      };
      return {
        ...prev,
        [colId]: {
          ...current,
          [field]: val,
          error: field === 'title' && String(val).trim() ? null : current.error,
        },
      };
    });
  };

  const handleSubmitTask = async (colId, e) => {
    if (e) e.preventDefault();
    const form = getColumnForm(colId);
    const trimmedTitle = form.title.trim();

    // 1. Task Title validation (Required)
    if (!trimmedTitle) {
      setTaskFormState((prev) => ({
        ...prev,
        [colId]: {
          ...form,
          error: 'Task title is required.',
        },
      }));
      taskTitleInputRefs.current[colId]?.focus();
      return;
    }

    // 2. Priority: Capitalized ("Low", "Medium", "High")
    const priority = form.priority
      ? (form.priority.charAt(0).toUpperCase() + form.priority.slice(1).toLowerCase())
      : 'Medium';

    // 3. Due Date: YYYY-MM-DD or null
    let dueDate = null;
    if (form.dueDate && typeof form.dueDate === 'string' && form.dueDate.trim()) {
      const trimmedDate = form.dueDate.trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate) && !isNaN(Date.parse(trimmedDate))) {
        dueDate = trimmedDate;
      }
    }

    // 4. Assignee: integer user ID or null
    const assigneeId = form.assigneeId && !isNaN(Number(form.assigneeId)) && Number(form.assigneeId) > 0
      ? Number(form.assigneeId)
      : null;

    setTaskFormState((prev) => ({
      ...prev,
      [colId]: { ...form, isSubmitting: true, error: null },
    }));

    const payload = {
      column_id: colId,
      board_id: Number(boardId),
      title: trimmedTitle,
      priority,
      due_date: dueDate,
      assignee_id: assigneeId,
    };

    try {
      const res = await api.post('/api/tasks', payload);
      const createdTask = res.data?.task || res.data;

      // Immediate UI & State update: append directly to column's list without full page reload
      setBoardData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: [...(prev.tasks || []), createdTask],
        };
      });

      // Reset creation form fields and keep focus ready for next task
      setTaskFormState((prev) => ({
        ...prev,
        [colId]: {
          isExpanded: true,
          title: '',
          priority: 'Medium',
          dueDate: '',
          assigneeId: '',
          isSubmitting: false,
          error: null,
        },
      }));

      showToast(`Task "${createdTask.title}" created successfully.`);

      // Keep focus ready for the next task
      setTimeout(() => {
        taskTitleInputRefs.current[colId]?.focus();
      }, 50);
    } catch (err) {
      console.error('[Board] create task error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to create task.';
      setTaskFormState((prev) => ({
        ...prev,
        [colId]: {
          ...form,
          isSubmitting: false,
          error: msg,
        },
      }));
    }
  };

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e, taskId) => {
    e.stopPropagation();
    setDraggedTaskId(taskId);
    setDraggedColId(null);
    e.dataTransfer.setData('application/taskboard-task', String(taskId));
    e.dataTransfer.setData('text/plain', String(taskId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragStart = (e, colId) => {
    if (!isDesktop) {
      e.preventDefault();
      return;
    }
    const targetTag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (
      ['input', 'textarea', 'button', 'select', 'a'].includes(targetTag) ||
      e.target.closest('button, input, select, textarea, .task-card')
    ) {
      return;
    }
    setDraggedColId(colId);
    setDraggedTaskId(null);
    e.dataTransfer.setData('application/taskboard-column', String(colId));
    e.dataTransfer.setData('text/plain', String(colId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleColumnDragEnd = () => {
    setDraggedColId(null);
    setDragOverColumnTargetId(null);
  };

  const handleDragOverColumn = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedColId || e.dataTransfer.types.includes('application/taskboard-column')) {
      if (dragOverColumnTargetId !== colId) {
        setDragOverColumnTargetId(colId);
      }
    } else {
      if (dragOverColId !== colId) {
        setDragOverColId(colId);
      }
    }
  };

  const handleDragLeaveColumn = (e, colId) => {
    if (draggedColId || e.dataTransfer.types.includes('application/taskboard-column')) {
      if (dragOverColumnTargetId === colId) {
        setDragOverColumnTargetId(null);
      }
    } else {
      if (dragOverColId === colId) {
        setDragOverColId(null);
      }
    }
  };

  const handleCardDragOver = (e, targetTaskId, targetColId) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTaskId === targetTaskId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? 'top' : 'bottom';

    if (dragOverTaskId !== targetTaskId || dragOverPosition !== pos) {
      setDragOverTaskId(targetTaskId);
      setDragOverPosition(pos);
    }
    if (dragOverColId !== targetColId) {
      setDragOverColId(targetColId);
    }
  };

  const handleCardDragLeave = (e, targetTaskId) => {
    if (dragOverTaskId === targetTaskId) {
      setDragOverTaskId(null);
      setDragOverPosition(null);
    }
  };

  const handleCardDrop = async (e, targetTaskId, targetColId) => {
    e.preventDefault();
    e.stopPropagation();
    const taskIdStr =
      e.dataTransfer.getData('application/taskboard-task') ||
      e.dataTransfer.getData('text/plain') ||
      String(draggedTaskId);
    const taskId = Number(taskIdStr);
    const dropPos = dragOverPosition || 'bottom';

    setDragOverTaskId(null);
    setDragOverPosition(null);
    setDragOverColId(null);
    setDraggedTaskId(null);

    if (!taskId || taskId === targetTaskId) return;

    const colTasks = tasksByColumn[targetColId] || [];
    const targetIdx = colTasks.findIndex((t) => t.id === targetTaskId);
    if (targetIdx === -1) return;

    let newPos = dropPos === 'top' ? targetIdx : targetIdx + 1;

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (draggedTask && draggedTask.column_id === targetColId) {
      const oldIdx = colTasks.findIndex((t) => t.id === taskId);
      if (oldIdx !== -1 && oldIdx < targetIdx) {
        newPos = Math.max(0, newPos - 1);
      }
    }

    try {
      await api.put(`/api/tasks/${taskId}/reorder`, {
        target_column_id: targetColId,
        new_position: Math.max(0, newPos),
      });
      fetchBoard();
    } catch (err) {
      console.error('[Board] reorder error:', err);
      fetchBoard();
    }
  };

  const handleColumnDrop = async (e, targetColId) => {
    e.preventDefault();

    const isColDrag = Boolean(
      draggedColId ||
      e.dataTransfer.types.includes('application/taskboard-column') ||
      e.dataTransfer.getData('application/taskboard-column')
    );

    if (isColDrag) {
      const sourceColIdStr =
        e.dataTransfer.getData('application/taskboard-column') || String(draggedColId);
      const sourceColId = Number(sourceColIdStr);

      setDraggedColId(null);
      setDragOverColumnTargetId(null);

      if (!sourceColId || sourceColId === targetColId) return;

      const sourceIndex = sortedColumns.findIndex((c) => c.id === sourceColId);
      const targetIndex = sortedColumns.findIndex((c) => c.id === targetColId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const reordered = [...sortedColumns];
      const [movedCol] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, movedCol);

      const updatedColumns = reordered.map((col, idx) => ({
        ...col,
        position: idx,
      }));

      setBoardData((prev) => (prev ? { ...prev, columns: updatedColumns } : prev));
      showToast('Column reordered.');

      try {
        const changedCols = updatedColumns.filter((col) => {
          const orig = sortedColumns.find((c) => c.id === col.id);
          return !orig || orig.position !== col.position;
        });

        await Promise.all(
          changedCols.map((col) =>
            api.put(`/api/columns/${col.id}`, { position: col.position })
          )
        );
        fetchBoard();
      } catch (err) {
        console.error('[Board] persist column reorder error:', err);
        fetchBoard();
      }
      return;
    }

    const taskIdStr =
      e.dataTransfer.getData('application/taskboard-task') ||
      e.dataTransfer.getData('text/plain') ||
      String(draggedTaskId);
    const taskId = Number(taskIdStr);

    setDragOverTaskId(null);
    setDragOverPosition(null);
    setDragOverColId(null);
    setDraggedTaskId(null);

    if (!taskId) return;

    const draggedTask = tasks.find((t) => t.id === taskId);
    if (!draggedTask) return;

    const colTasks = tasksByColumn[targetColId] || [];
    const targetPosition =
      draggedTask.column_id === targetColId
        ? Math.max(0, colTasks.length - 1)
        : colTasks.length;

    try {
      await api.put(`/api/tasks/${taskId}/reorder`, {
        target_column_id: targetColId,
        new_position: targetPosition,
      });
      fetchBoard();
    } catch (err) {
      console.error('[Board] column drop error:', err);
      fetchBoard();
    }
  };

  const handleQuickMoveTask = async (taskId, targetColId) => {
    if (!taskId || !targetColId) return;
    try {
      await api.patch(`/api/tasks/${taskId}/move`, { column_id: Number(targetColId) });
      showToast('Task moved successfully.');
      fetchBoard();
    } catch (err) {
      console.error('[Board] quick move error:', err);
      alert(err.response?.data?.error || 'Failed to move task.');
    }
  };

  return (
    <div className="board-page">
      <Navbar />

      {/* Board Header Bar */}
      <div className="board-header">
        <div className="board-header__left">
          <div className="board-breadcrumb">
            <Link to="/workspaces" style={{ color: '#64748b' }}>
              Workspaces
            </Link>
            <span>/</span>
            <Link to="/dashboard" style={{ color: '#64748b' }}>
              {activeWorkspace?.name || 'Workspace'}
            </Link>
            <span>/</span>
          </div>

          {isOwner && isEditingTitle ? (
            <input
              type="text"
              className="form-input"
              style={{ fontSize: '1.25rem', fontWeight: 700, padding: '0.2rem 0.5rem', width: 'auto' }}
              value={boardTitle}
              autoFocus
              onChange={(e) => setBoardTitle(e.target.value)}
              onBlur={handleRenameBoard}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameBoard()}
            />
          ) : (
            <h1
              className="board-header__title"
              style={{ cursor: isOwner ? 'pointer' : 'default' }}
              onClick={() => isOwner && setIsEditingTitle(true)}
              title={isOwner ? 'Click to rename board' : undefined}
            >
              {board.name} {isOwner && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>✎</span>}
            </h1>
          )}
        </div>

        <div className="board-header__actions">
          {/* BRD-5 Member Facepile + Members Count Pill */}
          <div
            style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setIsMembersModalOpen(true)}
            title="View board members roster"
          >
            <div style={{ display: 'flex', alignItems: 'center', marginRight: '0.4rem' }}>
              {currentMembers.slice(0, 4).map((member, idx) => (
                <div
                  key={member.id}
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#6366f1',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    border: '2px solid #ffffff',
                    marginLeft: idx === 0 ? 0 : '-6px',
                    zIndex: 10 - idx,
                    textTransform: 'uppercase',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                  title={member.name || member.email}
                >
                  {getInitials(member.name || member.email)}
                </div>
              ))}
              {currentMembers.length > 4 && (
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    border: '2px solid #ffffff',
                    marginLeft: '-6px',
                    zIndex: 5,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  }}
                  title={`${currentMembers.length - 4} more member${currentMembers.length - 4 > 1 ? 's' : ''}`}
                >
                  +{currentMembers.length - 4}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{ paddingLeft: '0.35rem', paddingRight: '0.5rem' }}
              title="View board members roster"
            >
              👥 {currentMembers.length} {currentMembers.length === 1 ? 'member' : 'members'}
            </button>
          </div>

          {/* Owner-only Invite Button */}
          {isOwner && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => setIsInviteModalOpen(true)}
              title="Add team member to this board"
            >
              + Invite
            </button>
          )}

          {/* Activity Drawer Button */}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setIsActivityOpen(true)}
            title="View board activity logs"
          >
            📋 Activity
          </button>

          {/* Owner Settings Dropdown */}
          {isOwner && (
            <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSettingsOpen((prev) => !prev);
                }}
                title="Board settings & actions"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                ⚙️ Settings
              </button>

              {isSettingsOpen && (
                <div className="board-context-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="board-context-menu__item"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsEditModalOpen(true);
                    }}
                  >
                    <span>✏️</span>
                    <span>Edit Details</span>
                  </button>
                  <button
                    type="button"
                    className="board-context-menu__item board-context-menu__item--danger"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    <span>🗑️</span>
                    <span>Delete Board</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SRC-1 & SRC-2: Search & Filter Toolbar */}
      <div className="board-filter-bar">
        <div className="board-filter-bar__left">
          {/* Live keyword search input */}
          <div className="board-filter-search">
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Filter tasks by title or desc…"
              value={taskSearchQuery}
              onChange={(e) => setTaskSearchQuery(e.target.value)}
              style={{
                width: '100%',
                fontSize: '0.82rem',
                padding: '0.35rem 1.8rem 0.35rem 0.65rem',
                borderRadius: '6px',
              }}
            />
            {taskSearchQuery && (
              <button
                type="button"
                onClick={() => setTaskSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: 0,
                }}
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>

          {/* Priority filter pills */}
          <div className="board-filter-pills">
            <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Priority:</span>
            {['ALL', 'High', 'Medium', 'Low'].map((p) => {
              const isActive = priorityFilter === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  style={{
                    padding: '0.2rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: isActive ? '1px solid #6366f1' : '1px solid #e2e8f0',
                    background: isActive ? '#6366f1' : '#ffffff',
                    color: isActive ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {p === 'ALL' ? 'All' : p}
                </button>
              );
            })}
          </div>

          {/* "My Tasks" filter pill */}
          <button
            type="button"
            onClick={() => setMyTasksOnly((prev) => !prev)}
            style={{
              padding: '0.2rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '9999px',
              border: myTasksOnly ? '1px solid #059669' : '1px solid #e2e8f0',
              background: myTasksOnly ? '#ecfdf5' : '#ffffff',
              color: myTasksOnly ? '#059669' : '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>👤</span>
            <span>My Tasks Only</span>
          </button>
        </div>

        {/* Active filter count & reset */}
        <div className="board-filter-bar__meta">
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Showing <strong>{filteredTasks.length}</strong> of {tasks.length} tasks
          </span>
          {(taskSearchQuery || priorityFilter !== 'ALL' || myTasksOnly) && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setTaskSearchQuery('');
                setPriorityFilter('ALL');
                setMyTasksOnly(false);
              }}
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', color: '#ef4444' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Kanban Canvas Columns */}
      <div className="board-canvas">
        {sortedColumns.map((col, colIndex) => {
          const colTasks = tasksByColumn[col.id] || [];
          const form = getColumnForm(col.id);
          const isOver = dragOverColId === col.id;
          const isLastColumn = colIndex === sortedColumns.length - 1 || col.name.trim().toLowerCase() === 'done';

          return (
            <div
              key={col.id}
              className={`kanban-column ${draggedColId === col.id ? 'is-column-dragging' : ''} ${dragOverColumnTargetId === col.id ? 'kanban-column--drag-over-column' : ''}`}
              draggable={isDesktop}
              onDragStart={(e) => handleColumnDragStart(e, col.id)}
              onDragEnd={handleColumnDragEnd}
              style={{
                background: isOver ? '#e0e7ff' : '#f1f5f9',
                borderColor: isOver ? '#818cf8' : '#e2e8f0',
                transition: 'background-color 0.15s, border-color 0.15s, opacity 0.15s, transform 0.15s',
              }}
              onDragOver={(e) => handleDragOverColumn(e, col.id)}
              onDragLeave={(e) => handleDragLeaveColumn(e, col.id)}
              onDrop={(e) => handleColumnDrop(e, col.id)}
            >
              {/* COL-2 & COL-4: Column Header with Rename and Reorder */}
              <div className="kanban-column__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                  {isDesktop && (
                    <span
                      className="column-drag-grip"
                      title="Drag column to reorder"
                      aria-label="Drag column"
                    >
                      ⋮⋮
                    </span>
                  )}
                  {editingColId === col.id ? (
                    <input
                      type="text"
                      className="form-input"
                      value={editingColName}
                      autoFocus
                      onChange={(e) => setEditingColName(e.target.value)}
                      onBlur={() => handleSaveRenameColumn(col.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRenameColumn(col.id);
                        if (e.key === 'Escape') setEditingColId(null);
                      }}
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        flex: 1,
                      }}
                    />
                  ) : (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: 0, cursor: 'pointer' }}
                      onDoubleClick={() => handleStartRenameColumn(col)}
                      title="Double-click to rename column"
                    >
                      <span className="kanban-column__title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {col.name}
                      </span>
                      <span className="kanban-column__count">{colTasks.length}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRenameColumn(col);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: '0 2px',
                          fontSize: '0.78rem',
                        }}
                        title="Rename column"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  {/* COL-4 Reorder Left / Right buttons: Visible on mobile, hidden on desktop */}
                  <div className="column-reorder-arrows">
                    <button
                      type="button"
                      onClick={() => handleMoveColumn(colIndex, 'left')}
                      disabled={colIndex === 0}
                      className="column-shift-btn"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colIndex === 0 ? '#cbd5e1' : '#64748b',
                        cursor: colIndex === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem',
                        padding: '2px 4px',
                        lineHeight: 1,
                      }}
                      title={colIndex === 0 ? 'First column' : 'Move column left'}
                    >
                      &larr;
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveColumn(colIndex, 'right')}
                      disabled={colIndex === sortedColumns.length - 1}
                      className="column-shift-btn"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colIndex === sortedColumns.length - 1 ? '#cbd5e1' : '#64748b',
                        cursor: colIndex === sortedColumns.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem',
                        padding: '2px 4px',
                        lineHeight: 1,
                      }}
                      title={colIndex === sortedColumns.length - 1 ? 'Last column' : 'Move column right'}
                    >
                      &rarr;
                    </button>
                  </div>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleDeleteColumn(col.id, col.name)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        marginLeft: '0.25rem',
                        lineHeight: 1,
                      }}
                      title="Delete column"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* Cards Container */}
              <div className="kanban-column__cards">
                {colTasks.map((task) => {
                  const isOverdue =
                    Boolean(task.due_date) &&
                    !isLastColumn &&
                    new Date(String(task.due_date).slice(0, 10) + 'T23:59:59') < new Date();

                  const isDragOverThisCard = dragOverTaskId === task.id;
                  const dragOverClass = isDragOverThisCard
                    ? dragOverPosition === 'top'
                      ? 'task-card--drag-over-top'
                      : 'task-card--drag-over-bottom'
                    : '';

                  return (
                    <div
                      key={task.id}
                      className={`task-card ${draggedTaskId === task.id ? 'is-dragging' : ''} ${dragOverClass}`}
                      style={{
                        borderLeft: isOverdue ? '4px solid #ef4444' : undefined,
                      }}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragOver={(e) => handleCardDragOver(e, task.id, col.id)}
                      onDragLeave={(e) => handleCardDragLeave(e, task.id)}
                      onDrop={(e) => handleCardDrop(e, task.id, col.id)}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDragOverTaskId(null);
                        setDragOverPosition(null);
                        setDragOverColId(null);
                      }}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className="task-card__title">{task.title}</div>
                      <div className="task-card__footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.45rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span className={`priority-tag priority-tag--${task.priority || 'Medium'}`}>
                            {task.priority || 'Medium'}
                          </span>
                          {task.due_date && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '0.72rem',
                                fontWeight: 500,
                                color: isOverdue ? '#dc2626' : '#64748b',
                                background: isOverdue ? '#fef2f2' : '#f8fafc',
                                border: isOverdue ? '1px solid #fecaca' : '1px solid #e2e8f0',
                                borderRadius: '9999px',
                                padding: '0.12rem 0.45rem',
                              }}
                              title={`Due: ${String(task.due_date).slice(0, 10)}${isOverdue ? ' (Overdue)' : ''}`}
                            >
                              <span>{isOverdue ? '⚠️' : '📅'}</span>
                              <span>
                                {isOverdue && 'Overdue: '}
                                {new Date(String(task.due_date).includes('T') ? task.due_date : `${String(task.due_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </span>
                          )}
                        </div>
                        {task.assignee_name && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              color: '#334155',
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              borderRadius: '9999px',
                              padding: '0.12rem 0.45rem',
                            }}
                            title={`Assigned to ${task.assignee_name}`}
                          >
                            <span
                              style={{
                                width: '15px',
                                height: '15px',
                                borderRadius: '50%',
                                background: '#6366f1',
                                color: '#ffffff',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.55rem',
                                fontWeight: 700,
                                lineHeight: 1,
                                textTransform: 'uppercase',
                              }}
                            >
                              {task.assignee_name.charAt(0)}
                            </span>
                            <span style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {task.assignee_name}
                            </span>
                          </span>
                        )}
                      </div>

                      {/* TSK-8 Accessible Move to Column fallback */}
                      <div
                        style={{
                          marginTop: '0.45rem',
                          paddingTop: '0.35rem',
                          borderTop: '1px dashed #f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>
                          Move:
                        </label>
                        <select
                          value={col.id}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleQuickMoveTask(task.id, Number(e.target.value));
                          }}
                          style={{
                            fontSize: '0.72rem',
                            padding: '0.15rem 0.35rem',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#475569',
                            cursor: 'pointer',
                            maxWidth: '130px',
                          }}
                          title="Move task to another column"
                        >
                          {sortedColumns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Upgraded Task Creation UI (Inline Form) */}
              <div style={{ padding: '0.4rem 0.75rem 0.75rem' }}>
                {!form.isExpanded ? (
                  <button
                    type="button"
                    onClick={() => handleExpandTaskForm(col.id)}
                    onFocus={() => handleExpandTaskForm(col.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      width: '100%',
                      padding: '0.45rem 0.65rem',
                      background: 'transparent',
                      border: '1px dashed #cbd5e1',
                      borderRadius: '8px',
                      color: '#64748b',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.borderColor = '#818cf8';
                      e.currentTarget.style.color = '#4f46e5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.color = '#64748b';
                    }}
                    aria-label={`Add a task to ${col.name}`}
                  >
                    <span style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1 }}>+</span>
                    <span>Add a task...</span>
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => handleSubmitTask(col.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        handleCollapseTaskForm(col.id);
                      }
                    }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #c7d2fe',
                      borderRadius: '10px',
                      boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)',
                      padding: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                    }}
                  >
                    {/* 1. Task Title (Required) */}
                    <div>
                      <input
                        ref={(el) => (taskTitleInputRefs.current[col.id] = el)}
                        type="text"
                        className="form-input"
                        placeholder="What needs to be done?"
                        value={form.title}
                        onChange={(e) => handleTaskFormChange(col.id, 'title', e.target.value)}
                        style={{
                          width: '100%',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          padding: '0.42rem 0.6rem',
                          borderRadius: '6px',
                          border: form.error ? '1px solid #ef4444' : '1px solid #cbd5e1',
                        }}
                      />
                      {form.error && (
                        <div style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '0.2rem', fontWeight: 500 }}>
                          {form.error}
                        </div>
                      )}
                    </div>

                    {/* 2 & 3. Priority and Due Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: '0.2rem' }}>
                          Priority *
                        </label>
                        <select
                          className="form-input"
                          value={form.priority}
                          onChange={(e) => handleTaskFormChange(col.id, 'priority', e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '0.8rem',
                            padding: '0.35rem 0.45rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                          }}
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: '0.2rem' }}>
                          Due Date
                        </label>
                        <input
                          type="date"
                          className="form-input"
                          value={form.dueDate}
                          onChange={(e) => handleTaskFormChange(col.id, 'dueDate', e.target.value)}
                          style={{
                            width: '100%',
                            fontSize: '0.8rem',
                            padding: '0.32rem 0.45rem',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                          }}
                        />
                      </div>
                    </div>

                    {/* 4. Assignee (Workspace Teammates) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: '#475569', marginBottom: '0.2rem' }}>
                        Assignee
                      </label>
                      <select
                        className="form-input"
                        value={form.assigneeId}
                        onChange={(e) => handleTaskFormChange(col.id, 'assigneeId', e.target.value)}
                        style={{
                          width: '100%',
                          fontSize: '0.8rem',
                          padding: '0.35rem 0.45rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                        }}
                      >
                        <option value="">Select Assignee (Unassigned)</option>
                        {currentMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name ? `${m.name} (${m.email})` : m.email}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 5. Action Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => handleCollapseTaskForm(col.id)}
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn--primary btn--sm"
                        disabled={form.isSubmitting || !form.title.trim()}
                        style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                      >
                        {form.isSubmitting ? 'Adding…' : 'Add Task'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          );
        })}

        {/* Add Column Button / Box */}
        <div className="kanban-add-column-box">
          <form
            onSubmit={handleAddColumn}
            style={{
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '12px',
              padding: '0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="+ New Column Name…"
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.6rem' }}
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
            />
            {newColumnName.trim() && (
              <button type="submit" className="btn btn--primary btn--sm" disabled={addingColumn}>
                {addingColumn ? 'Adding…' : 'Add Column'}
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Modals & Drawers */}
      <BoardMembersModal
        board={boardData.board}
        members={currentMembers}
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        onMembersUpdated={fetchBoard}
        onMemberRemoved={handleMemberRemoved}
      />

      <InviteBoardModal
        board={boardData.board}
        members={currentMembers}
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onMemberAdded={fetchBoard}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        board={boardData.board}
        columns={sortedColumns}
        members={currentMembers}
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onTaskUpdated={fetchBoard}
        onTaskDeleted={() => fetchBoard()}
      />

      <ActivityDrawer
        boardId={board.id}
        isOpen={isActivityOpen}
        onClose={() => setIsActivityOpen(false)}
      />

      <EditBoardModal
        board={boardData.board}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onBoardUpdated={handleBoardUpdated}
      />

      <DeleteBoardModal
        board={boardData.board}
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        loading={deletingLoading}
      />

      {toastMessage && (
        <div className="toast-container">
          <div className="toast">
            <span>✓</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
