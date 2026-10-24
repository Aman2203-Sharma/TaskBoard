import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const res = await api.get('/api/workspaces');
      const list = res.data?.workspaces || [];
      setWorkspaces(list);

      // Determine active workspace from localStorage or fallback
      const savedId = Number(localStorage.getItem('taskboard_active_workspace'));
      const matching = list.find((w) => w.id === savedId);
      const chosen = matching || list[0] || null;

      setActiveWorkspaceState(chosen);
      if (chosen) {
        localStorage.setItem('taskboard_active_workspace', chosen.id);
      } else {
        localStorage.removeItem('taskboard_active_workspace');
      }
      return list;
    } catch (err) {
      console.error('[WorkspaceContext] fetchWorkspaces error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const setActiveWorkspace = (workspaceOrId) => {
    let ws = null;
    if (typeof workspaceOrId === 'object' && workspaceOrId !== null) {
      ws = workspaceOrId;
    } else {
      const id = Number(workspaceOrId);
      ws = workspaces.find((w) => w.id === id) || null;
    }

    setActiveWorkspaceState(ws);
    if (ws) {
      localStorage.setItem('taskboard_active_workspace', ws.id);
    } else {
      localStorage.removeItem('taskboard_active_workspace');
    }
  };

  const createWorkspace = async ({ name, description, initial_members }) => {
    const res = await api.post('/api/workspaces', {
      name,
      description: description || undefined,
      initial_members: initial_members && initial_members.length ? initial_members : undefined,
    });
    const created = res.data.workspace;
    await fetchWorkspaces();
    setActiveWorkspace(created);
    return created;
  };

  const renameWorkspace = async (id, name) => {
    const res = await api.patch(`/api/workspaces/${id}`, { name });
    const updated = res.data.workspace;
    await fetchWorkspaces();
    if (activeWorkspace?.id === id) {
      setActiveWorkspace(updated);
    }
    return updated;
  };

  const deleteWorkspace = async (id) => {
    const res = await api.delete(`/api/workspaces/${id}`);
    const remaining = workspaces.filter((w) => w.id !== id);
    setWorkspaces(remaining);

    if (activeWorkspace?.id === id) {
      const fallback = remaining[0] || null;
      setActiveWorkspace(fallback);
    }
    return res.data;
  };

  const value = {
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id || null,
    loading,
    setActiveWorkspace,
    fetchWorkspaces,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
