/**
 * Worktree Sessions Hook
 * Lightweight session CRUD/persistence for Git worktrees
 * @see specs/001-worktree-sessions/spec.md
 */

import { useCallback, useMemo } from 'react';
import type { Project } from '../types/project';
import type { Worktree } from '../lib/tauri-api';
import type {
  ResumeAction,
  SessionChecklistItem,
  WorktreeSession,
  WorktreeSessionStatus,
} from '../types/worktree-sessions';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSessionChecklistItem(item: SessionChecklistItem): SessionChecklistItem {
  return {
    id: item.id,
    text: item.text ?? '',
    completed: !!item.completed,
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    completedAt: item.completedAt ?? null,
  };
}

function normalizeResumeAction(action: ResumeAction): ResumeAction {
  return {
    id: action.id,
    type: action.type ?? 'switchWorkingDirectory',
    label: action.label ?? null,
    enabled: action.enabled ?? true,
    ...(action.editorId !== undefined && { editorId: action.editorId }),
    ...(action.scriptName !== undefined && { scriptName: action.scriptName }),
  };
}

function normalizeSessionStatus(status: string | undefined): WorktreeSessionStatus {
  if (status === 'active' || status === 'archived' || status === 'broken') return status;
  return 'active';
}

function normalizeWorktreeSession(session: WorktreeSession): WorktreeSession {
  return {
    id: session.id,
    projectId: session.projectId,
    worktreePath: session.worktreePath,
    branchSnapshot: session.branchSnapshot ?? null,
    title: session.title ?? '',
    goal: session.goal ?? null,
    notes: session.notes ?? '',
    tags: session.tags ?? [],
    checklist: (session.checklist ?? []).map(normalizeSessionChecklistItem),
    resumeActions: (session.resumeActions ?? []).map(normalizeResumeAction),
    status: normalizeSessionStatus(session.status),
    brokenReason: session.brokenReason ?? null,
    createdAt: session.createdAt ?? new Date().toISOString(),
    updatedAt: session.updatedAt ?? new Date().toISOString(),
    archivedAt: session.archivedAt ?? null,
    lastResumedAt: session.lastResumedAt ?? null,
  };
}

export interface UseWorktreeSessionsParams {
  project: Project | null;
  onUpdateProject: (updater: (project: Project) => Project) => Promise<void>;
}

export interface CreateSessionParams {
  worktree: Worktree;
  title?: string;
}

export function useWorktreeSessions({ project, onUpdateProject }: UseWorktreeSessionsParams) {
  const sessions = useMemo(() => {
    if (!project) return [];
    return (project.worktreeSessions ?? []).map(normalizeWorktreeSession);
  }, [project?.worktreeSessions]);

  const sessionsByWorktreePath = useMemo(() => {
    return new Map(sessions.map((s) => [s.worktreePath, s]));
  }, [sessions]);

  const getSessionById = useCallback(
    (sessionId: string): WorktreeSession | null => {
      return sessions.find((s) => s.id === sessionId) ?? null;
    },
    [sessions]
  );

  const getSessionByWorktreePath = useCallback(
    (worktreePath: string): WorktreeSession | null => {
      return sessionsByWorktreePath.get(worktreePath) ?? null;
    },
    [sessionsByWorktreePath]
  );

  const saveSession = useCallback(
    async (session: WorktreeSession) => {
      const normalized = normalizeWorktreeSession(session);

      await onUpdateProject((prevProject) => {
        const prevSessions = (prevProject.worktreeSessions ?? []).map(normalizeWorktreeSession);
        const nextSessions = prevSessions.some((s) => s.id === normalized.id)
          ? prevSessions.map((s) => (s.id === normalized.id ? normalized : s))
          : [...prevSessions, normalized];

        return {
          ...prevProject,
          worktreeSessions: nextSessions,
        };
      });
    },
    [onUpdateProject]
  );

  const createSessionForWorktree = useCallback(
    async ({ worktree, title }: CreateSessionParams): Promise<WorktreeSession | null> => {
      if (!project) return null;
      const existing = getSessionByWorktreePath(worktree.path);
      if (existing) return existing;

      const now = new Date().toISOString();
      const next: WorktreeSession = normalizeWorktreeSession({
        id: createId('ws'),
        projectId: project.id,
        worktreePath: worktree.path,
        branchSnapshot: worktree.branch ?? null,
        title: title?.trim() || worktree.branch || 'Worktree Session',
        goal: null,
        notes: '',
        tags: [],
        checklist: [],
        resumeActions: [],
        status: 'active',
        brokenReason: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        lastResumedAt: null,
      });

      await saveSession(next);
      return next;
    },
    [getSessionByWorktreePath, project, saveSession]
  );

  const updateSession = useCallback(
    async (sessionId: string, updater: (session: WorktreeSession) => WorktreeSession) => {
      const existing = getSessionById(sessionId);
      if (!existing) return;
      const updated = normalizeWorktreeSession(updater(existing));
      await saveSession(updated);
    },
    [getSessionById, saveSession]
  );

  const archiveSession = useCallback(
    async (sessionId: string) => {
      const now = new Date().toISOString();
      await updateSession(sessionId, (s) => ({
        ...s,
        status: 'archived',
        archivedAt: now,
        brokenReason: null,
        updatedAt: now,
      }));
    },
    [updateSession]
  );

  const restoreSession = useCallback(
    async (sessionId: string) => {
      const now = new Date().toISOString();
      await updateSession(sessionId, (s) => ({
        ...s,
        status: 'active',
        archivedAt: null,
        brokenReason: null,
        updatedAt: now,
      }));
    },
    [updateSession]
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      await onUpdateProject((prevProject) => {
        const prevSessions = (prevProject.worktreeSessions ?? []).map(normalizeWorktreeSession);
        const nextSessions = prevSessions.filter((s) => s.id !== sessionId);
        return { ...prevProject, worktreeSessions: nextSessions };
      });
    },
    [onUpdateProject]
  );

  const relinkSession = useCallback(
    async (sessionId: string, worktree: Worktree) => {
      const conflict = sessions.find((s) => s.worktreePath === worktree.path && s.id !== sessionId);
      if (conflict) {
        throw new Error('A session already exists for this worktree');
      }

      const now = new Date().toISOString();
      await updateSession(sessionId, (s) => ({
        ...s,
        worktreePath: worktree.path,
        branchSnapshot: worktree.branch ?? null,
        status: 'active',
        brokenReason: null,
        archivedAt: null,
        updatedAt: now,
      }));
    },
    [sessions, updateSession]
  );

  const syncBrokenSessions = useCallback(
    async (worktrees: Worktree[]) => {
      const knownPaths = new Set(worktrees.map((w) => w.path));
      const now = new Date().toISOString();

      const shouldUpdate = sessions.some((s) => !knownPaths.has(s.worktreePath) && s.status !== 'broken');
      if (!shouldUpdate) return;

      await onUpdateProject((prevProject) => {
        const prevSessions = (prevProject.worktreeSessions ?? []).map(normalizeWorktreeSession);
        const nextSessions = prevSessions.map((s) => {
          if (knownPaths.has(s.worktreePath) || s.status === 'broken') return s;
          return normalizeWorktreeSession({
            ...s,
            status: 'broken',
            brokenReason: 'WORKTREE_NOT_FOUND',
            archivedAt: null,
            updatedAt: now,
          });
        });
        return { ...prevProject, worktreeSessions: nextSessions };
      });
    },
    [onUpdateProject, sessions]
  );

  return {
    sessions,
    getSessionById,
    getSessionByWorktreePath,
    createSessionForWorktree,
    saveSession,
    updateSession,
    archiveSession,
    restoreSession,
    deleteSession,
    relinkSession,
    syncBrokenSessions,
  };
}
