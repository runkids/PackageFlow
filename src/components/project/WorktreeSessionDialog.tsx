/**
 * WorktreeSessionDialog
 * View/edit a worktree session (context, checklist, resume actions)
 * Enhanced UI with gradient header, icon badge, and improved styling
 * @see specs/001-worktree-sessions/spec.md
 */

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Info,
  Link2,
  ListChecks,
  Loader2,
  MinusCircle,
  Play,
  Plus,
  Trash2,
  XCircle,
  Zap,
  X,
  FolderGit2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Select, type SelectOption } from '../ui/Select';
import { useSettings } from '../../contexts/SettingsContext';
import { useWorktreeSessions } from '../../hooks/useWorktreeSessions';
import type { Project } from '../../types/project';
import { worktreeAPI, workflowAPI, save, writeTextFile, type EditorDefinition, type Worktree } from '../../lib/tauri-api';
import type { ResumeAction, ResumeActionResult, ResumeSessionResult, SessionChecklistItem, WorktreeSession } from '../../types/worktree-sessions';
import type { Workflow } from '../../types/workflow';
import { cn } from '../../lib/utils';
import { listen } from '@tauri-apps/api/event';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';

interface WorktreeSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  worktrees: Worktree[];
  availableEditors: EditorDefinition[];
  workflows: Workflow[];
  sessionId?: string | null;
  worktreePath?: string | null;
  onUpdateProject: (updater: (project: Project) => Project) => Promise<void>;
  onExecuteScript?: (scriptName: string, cwd?: string) => void;
  onSwitchWorkingDirectory?: (path: string) => void;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sessionStatusLabel(status: WorktreeSession['status']): string {
  if (status === 'archived') return 'Archived';
  if (status === 'broken') return 'Broken';
  return 'Active';
}

function sessionStatusConfig(status: WorktreeSession['status']): { className: string; icon: typeof CheckCircle2 } {
  if (status === 'archived') {
    return {
      className: 'bg-muted/80 text-muted-foreground border-muted-foreground/20',
      icon: Archive,
    };
  }
  if (status === 'broken') {
    return {
      className: 'bg-red-500/15 text-red-500 dark:text-red-400 border-red-500/30',
      icon: XCircle,
    };
  }
  return {
    className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    icon: CheckCircle2,
  };
}

export function WorktreeSessionDialog({
  isOpen,
  onClose,
  project,
  worktrees,
  availableEditors,
  workflows,
  sessionId,
  worktreePath,
  onUpdateProject,
  onExecuteScript,
  onSwitchWorkingDirectory,
}: WorktreeSessionDialogProps) {
  const modalId = React.useId();
  const { formatPath } = useSettings();

  const {
    getSessionById,
    getSessionByWorktreePath,
    saveSession,
    updateSession,
    archiveSession,
    restoreSession,
    deleteSession,
    relinkSession,
  } = useWorktreeSessions({ project, onUpdateProject });

  const session = useMemo(() => {
    if (sessionId) return getSessionById(sessionId);
    if (worktreePath) return getSessionByWorktreePath(worktreePath);
    return null;
  }, [getSessionById, getSessionByWorktreePath, sessionId, worktreePath]);

  const resolvedWorktreePath = session?.worktreePath ?? worktreePath ?? null;

  const worktree = useMemo(() => {
    if (!resolvedWorktreePath) return null;
    return worktrees.find((w) => w.path === resolvedWorktreePath) ?? null;
  }, [resolvedWorktreePath, worktrees]);

  const scripts = project.scripts ?? {};
  const scriptOptions = useMemo<SelectOption[]>(
    () =>
      Object.keys(scripts)
        .sort()
        .map((name) => ({ value: name, label: name })),
    [scripts]
  );

  const editorOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'System Default' },
      ...availableEditors.map((e) => ({ value: e.id, label: e.name })),
    ],
    [availableEditors]
  );

  const workflowOptions = useMemo<SelectOption[]>(() => {
    // Show all workflows, prioritize current project's workflows
    const currentProjectWorkflows = workflows.filter((w) => w.projectId === project.id);
    const otherWorkflows = workflows.filter((w) => w.projectId !== project.id);

    return [
      ...currentProjectWorkflows.map((w) => ({ value: w.id, label: w.name })),
      ...otherWorkflows.map((w) => ({ value: w.id, label: `${w.name} ⬡` })), // ⬡ indicates other project
    ];
  }, [project.id, workflows]);

  const occupiedWorktreePaths = useMemo(() => {
    const used = new Set((project.worktreeSessions ?? []).map((s) => s.worktreePath));
    if (session) {
      used.delete(session.worktreePath);
    }
    return used;
  }, [project.worktreeSessions, session]);

  const worktreeOptions = useMemo<SelectOption[]>(
    () =>
      worktrees
        .filter((w) => !occupiedWorktreePaths.has(w.path))
        .slice()
        .sort((a, b) => (a.branch || a.path).localeCompare(b.branch || b.path))
        .map((w) => ({
          value: w.path,
          label: w.branch ? `${w.branch} — ${formatPath(w.path)}` : formatPath(w.path),
        })),
    [formatPath, occupiedWorktreePaths, worktrees]
  );

  const [draft, setDraft] = useState<WorktreeSession | null>(null);
  const [tagsInput, setTagsInput] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [relinkTargetPath, setRelinkTargetPath] = useState('');
  const [lastResumeResult, setLastResumeResult] = useState<ResumeSessionResult | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'checklist' | 'actions'>('notes');

  // Ref for workflow picker click outside
  const workflowPickerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Register/unregister modal for ESC handling
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      handleClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen]);

  // Focus trap
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close workflow picker on click outside
  useEffect(() => {
    if (!showWorkflowPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (workflowPickerRef.current && !workflowPickerRef.current.contains(e.target as Node)) {
        setShowWorkflowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showWorkflowPicker]);

  // Track unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft) return false;
    if (!session) {
      // New session - has changes if any field is filled
      return draft.title.trim() !== (worktree?.branch || 'Worktree Session') ||
        draft.goal?.trim() ||
        draft.notes.trim() ||
        tagsInput.trim() ||
        draft.checklist.length > 0 ||
        draft.resumeActions.length > 0;
    }
    // Existing session - compare with original
    const currentTags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean).join(',');
    const originalTags = session.tags.join(',');
    return (
      draft.title !== session.title ||
      draft.goal !== session.goal ||
      draft.notes !== session.notes ||
      currentTags !== originalTags ||
      JSON.stringify(draft.checklist) !== JSON.stringify(session.checklist) ||
      JSON.stringify(draft.resumeActions) !== JSON.stringify(session.resumeActions)
    );
  }, [draft, session, tagsInput, worktree?.branch]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLastResumeResult(null);
    setIsHelpOpen(false);

    if (session) {
      setDraft(session);
      setTagsInput(session.tags.join(', '));
      setRelinkTargetPath('');
      return;
    }

    if (!worktree) {
      setDraft(null);
      setTagsInput('');
      setRelinkTargetPath('');
      return;
    }

    const now = new Date().toISOString();
    const initial: WorktreeSession = {
      id: createId('ws'),
      projectId: project.id,
      worktreePath: worktree.path,
      branchSnapshot: worktree.branch ?? null,
      title: worktree.branch || 'Worktree Session',
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
    };

    setDraft(initial);
    setTagsInput('');
    setRelinkTargetPath('');
  }, [isOpen, project.id, session, worktree]);

  const hasRunnableActions = useMemo(() => {
    if (!session) return false;
    return session.resumeActions.some((a) => a.enabled);
  }, [session]);

  const canResume = useMemo(() => {
    return !!session && session.status === 'active' && !!resolvedWorktreePath && hasRunnableActions;
  }, [hasRunnableActions, resolvedWorktreePath, session]);

  const handleSave = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) {
      setError('Title is required');
      return;
    }

    const invalidEnabledAction = draft.resumeActions.find((a) => {
      if (!a.enabled) return false;
      if (a.type === 'runScript') return !a.scriptName?.trim();
      return false;
    });
    if (invalidEnabledAction) {
      setError('Enabled "Run Script" actions must have a script selected');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    const now = new Date().toISOString();
    const next: WorktreeSession = {
      ...draft,
      title,
      tags,
      updatedAt: now,
      branchSnapshot: worktree?.branch ?? draft.branchSnapshot ?? null,
    };

    await saveSession(next);
    setError(null);
  };

  const handleAddChecklistItem = () => {
    if (!draft) return;
    const text = newChecklistText.trim();
    if (!text) return;

    const now = new Date().toISOString();
    const item: SessionChecklistItem = {
      id: createId('c'),
      text,
      completed: false,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    setDraft({
      ...draft,
      checklist: [...draft.checklist, item],
      updatedAt: now,
    });
    setNewChecklistText('');
  };

  const handleToggleChecklistItem = (itemId: string, completed: boolean) => {
    if (!draft) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      checklist: draft.checklist.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          completed,
          completedAt: completed ? now : null,
          updatedAt: now,
        };
      }),
      updatedAt: now,
    });
  };

  const handleRemoveChecklistItem = (itemId: string) => {
    if (!draft) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      checklist: draft.checklist.filter((item) => item.id !== itemId),
      updatedAt: now,
    });
  };

  const handleArchiveRestore = async () => {
    if (!session) return;
    if (session.status === 'archived') {
      await restoreSession(session.id);
    } else {
      await archiveSession(session.id);
    }
  };

  const handleDelete = async () => {
    if (!session) return;
    await deleteSession(session.id);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleExport = async () => {
    const dataToExport = draft || session;
    if (!dataToExport) return;

    const filename = `session-${dataToExport.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'untitled'}.json`;
    const filePath = await save({
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!filePath) return;

    try {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        session: dataToExport,
      };
      await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    } catch (err) {
      console.error('Failed to export session:', err);
      setError('Failed to export session');
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  };

  const handleDiscardAndClose = () => {
    setShowUnsavedConfirm(false);
    onClose();
  };

  const handleResume = async () => {
    if (!draft) return;
    if (!session) {
      setError('Save the session before resuming');
      return;
    }
    if (!canResume) return;

    const targetPath = resolvedWorktreePath!;
    const enabledActions = session.resumeActions.filter((a) => a.enabled);

    const results: ResumeActionResult[] = [];
    for (const action of enabledActions) {
      try {
        if (action.type === 'openEditor') {
          const editorId = action.editorId || undefined;
          const res = await worktreeAPI.openInEditor(targetPath, editorId);
          if (res.success) {
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'completed',
              message: `Opened in ${res.editor || 'default editor'}`,
            });
          } else {
            const errorMessages: Record<string, string> = {
              PATH_NOT_FOUND: 'Worktree path not found',
              EDITOR_NOT_FOUND: `${res.editor || 'Editor'} is not installed`,
              UNKNOWN_EDITOR: 'Unknown editor',
            };
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'failed',
              message: errorMessages[res.error || ''] || res.error || 'Failed to open editor',
            });
          }
          continue;
        }

        if (action.type === 'switchWorkingDirectory') {
          if (!onSwitchWorkingDirectory) {
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'skipped',
              message: 'Switch working directory is not available here',
            });
          } else {
            onSwitchWorkingDirectory(targetPath);
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'completed',
              message: 'Switched working directory',
            });
          }
          continue;
        }

        if (action.type === 'runScript') {
          if (!action.scriptName?.trim()) {
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'failed',
              message: 'Script name is required',
            });
          } else if (!onExecuteScript) {
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'skipped',
              message: 'Script execution is not available here',
            });
          } else {
            onExecuteScript(action.scriptName, targetPath);
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'completed',
              message: `Started script "${action.scriptName}"`,
            });
          }
          continue;
        }

        if (action.type === 'runWorkflow') {
          if (!action.workflowId) {
            results.push({
              actionId: action.id,
              type: action.type,
              status: 'failed',
              message: 'Workflow not selected',
            });
          } else {
            try {
              setRunningWorkflowId(action.workflowId);
              const executionId = await workflowAPI.executeWorkflow(action.workflowId);

              if (action.waitForCompletion) {
                // Wait for workflow completion
                const waitResult = await new Promise<{ success: boolean; message: string }>((resolve) => {
                  const unlistenPromise = listen<{ executionId: string; status: string; workflowId: string }>(
                    'execution_completed',
                    (event) => {
                      if (event.payload.executionId === executionId) {
                        unlistenPromise.then((unlisten) => unlisten());
                        if (event.payload.status === 'completed') {
                          resolve({ success: true, message: `Workflow "${action.workflowName}" completed` });
                        } else {
                          resolve({ success: false, message: `Workflow "${action.workflowName}" ${event.payload.status}` });
                        }
                      }
                    }
                  );

                  // Timeout after 5 minutes
                  setTimeout(() => {
                    unlistenPromise.then((unlisten) => unlisten());
                    resolve({ success: false, message: `Workflow "${action.workflowName}" timed out` });
                  }, 5 * 60 * 1000);
                });

                setRunningWorkflowId(null);
                results.push({
                  actionId: action.id,
                  type: action.type,
                  status: waitResult.success ? 'completed' : 'failed',
                  message: waitResult.message,
                });
              } else {
                // Fire and forget
                setRunningWorkflowId(null);
                results.push({
                  actionId: action.id,
                  type: action.type,
                  status: 'completed',
                  message: `Started workflow "${action.workflowName}"`,
                });
              }
            } catch (err) {
              setRunningWorkflowId(null);
              results.push({
                actionId: action.id,
                type: action.type,
                status: 'failed',
                message: err instanceof Error ? err.message : 'Failed to execute workflow',
              });
            }
          }
          continue;
        }

        results.push({
          actionId: action.id,
          type: action.type,
          status: 'skipped',
          message: `Unknown action type: ${action.type}`,
        });
      } catch (err) {
        results.push({
          actionId: action.id,
          type: action.type,
          status: 'failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const failedCount = results.filter((r) => r.status === 'failed').length;
    const completedCount = results.filter((r) => r.status === 'completed').length;
    const runStatus: ResumeSessionResult['status'] =
      failedCount === 0 ? 'success' : completedCount > 0 ? 'partial_failure' : 'failure';

    const runId = createId('run');
    setLastResumeResult({
      runId,
      sessionId: session.id,
      status: runStatus,
      results,
    });

    const now = new Date().toISOString();
    await updateSession(session.id, (s) => ({
      ...s,
      lastResumedAt: now,
      updatedAt: now,
    }));
  };

  const handleRelink = async () => {
    if (!session || session.status !== 'broken') return;
    if (!relinkTargetPath) return;
    const target = worktrees.find((w) => w.path === relinkTargetPath);
    if (!target) return;
    try {
      await relinkSession(session.id, target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to relink session');
    }
  };

  const handleAddResumeAction = (type: ResumeAction['type'], workflowId?: string) => {
    if (!draft) return;
    const now = new Date().toISOString();
    const workflow = workflowId ? workflows.find((w) => w.id === workflowId) : null;
    const action: ResumeAction = {
      id: createId('a'),
      type,
      label: null,
      enabled: true,
      ...(type === 'openEditor' ? { editorId: '' } : {}),
      ...(type === 'runScript' ? { scriptName: '' } : {}),
      ...(type === 'runWorkflow' && workflow
        ? { workflowId: workflow.id, workflowName: workflow.name, waitForCompletion: true }
        : {}),
    };
    setDraft({
      ...draft,
      resumeActions: [...draft.resumeActions, action],
      updatedAt: now,
    });
    setShowWorkflowPicker(false);
  };

  const handleUpdateResumeAction = (actionId: string, updater: (a: ResumeAction) => ResumeAction) => {
    if (!draft) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      resumeActions: draft.resumeActions.map((a) => (a.id === actionId ? updater(a) : a)),
      updatedAt: now,
    });
  };

  const handleRemoveResumeAction = (actionId: string) => {
    if (!draft) return;
    const now = new Date().toISOString();
    setDraft({
      ...draft,
      resumeActions: draft.resumeActions.filter((a) => a.id !== actionId),
      updatedAt: now,
    });
  };

  const handleMoveResumeAction = (actionId: string, direction: -1 | 1) => {
    if (!draft) return;
    const idx = draft.resumeActions.findIndex((a) => a.id === actionId);
    if (idx === -1) return;

    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= draft.resumeActions.length) return;

    const now = new Date().toISOString();
    const nextActions = [...draft.resumeActions];
    [nextActions[idx], nextActions[nextIdx]] = [nextActions[nextIdx], nextActions[idx]];
    setDraft({
      ...draft,
      resumeActions: nextActions,
      updatedAt: now,
    });
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  const statusConfig = session ? sessionStatusConfig(session.status) : null;
  const StatusIcon = statusConfig?.icon;

  return (
    <>
      <div
        className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worktree-session-dialog-title"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />

        {/* Dialog container */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <div
            className={cn(
              'relative w-full max-w-3xl max-h-[85vh]',
              'bg-background rounded-2xl',
              'border border-teal-500/30',
              'shadow-2xl shadow-black/60',
              'animate-in fade-in-0 zoom-in-95 duration-200',
              'slide-in-from-bottom-4',
              'flex flex-col overflow-hidden'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div
              className={cn(
                'relative px-6 py-5',
                'border-b border-border',
                'bg-gradient-to-r',
                'from-teal-500/10 via-cyan-600/5 to-transparent',
                'dark:from-teal-500/20 dark:via-cyan-600/10 dark:to-transparent'
              )}
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className={cn(
                  'absolute right-4 top-4',
                  'p-2 rounded-lg',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50',
                  'transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Help button */}
              <button
                onClick={() => setIsHelpOpen(true)}
                className={cn(
                  'absolute right-12 top-4',
                  'p-2 rounded-lg',
                  'text-muted-foreground hover:text-foreground',
                  'hover:bg-accent/50',
                  'transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
                title="Usage guide / scenarios"
                aria-label="Usage help"
              >
                <Info className={cn('w-4 h-4', isHelpOpen ? 'text-teal-400' : '')} />
              </button>

              {/* Title area with icon badge */}
              <div className="flex items-start gap-4 pr-20">
                <div
                  className={cn(
                    'flex-shrink-0',
                    'w-12 h-12 rounded-xl',
                    'flex items-center justify-center',
                    'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                    'border border-teal-500/20',
                    'bg-teal-500/10',
                    'shadow-lg'
                  )}
                >
                  <Bookmark className="w-6 h-6 text-teal-500 dark:text-teal-400" />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <h2
                    id="worktree-session-dialog-title"
                    className="text-lg font-semibold text-foreground leading-tight flex items-center gap-2"
                  >
                    Worktree Session
                    {session && statusConfig && StatusIcon && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          'px-2 py-1 text-xs font-medium rounded-md',
                          'border',
                          statusConfig.className
                        )}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {sessionStatusLabel(session.status)}
                      </span>
                    )}
                    {hasUnsavedChanges && (
                      <span className="ml-1 text-xs text-orange-500">Unsaved</span>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session ? 'Edit session details and quick actions' : 'Create a new session for this worktree'}
                  </p>
                </div>
              </div>
            </div>

            {/* Content area */}
            <div
              ref={contentRef}
              className="flex-1 overflow-y-auto min-h-0 focus:outline-none"
              tabIndex={-1}
            >
              <div className="p-6 space-y-4">
                {/* Status Banners */}
                {session?.status === 'broken' && (
                  <div
                    className={cn(
                      'rounded-xl p-4',
                      'bg-red-500/10 border-2 border-red-500/50',
                      'dark:bg-red-500/15'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                          Session Broken
                        </div>
                        <div className="text-xs text-red-600/80 dark:text-red-300/80 mb-3">
                          {session.brokenReason || 'The linked worktree could not be found.'}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={relinkTargetPath}
                            onValueChange={setRelinkTargetPath}
                            options={worktreeOptions}
                            placeholder="Select worktree to relink..."
                            aria-label="Relink session"
                            className="flex-1"
                          />
                          <Button
                            onClick={handleRelink}
                            disabled={!relinkTargetPath}
                            className="bg-red-600 hover:bg-red-500 text-white"
                          >
                            <Link2 className="w-4 h-4 mr-2" />
                            Relink
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {session?.status === 'archived' && (
                  <div
                    className={cn(
                      'rounded-xl p-3',
                      'bg-muted/50 border border-muted-foreground/20'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm text-muted-foreground">
                        This session is archived. Restore it to make changes.
                      </div>
                    </div>
                  </div>
                )}

                {/* Context */}
                {session?.status !== 'broken' && (
                  <div
                    className={cn(
                      'rounded-xl p-4',
                      'bg-card/50 dark:bg-card/30',
                      'border border-border/80'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <FolderGit2 className="w-5 h-5 text-teal-500 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">
                          {worktree?.branch || session?.branchSnapshot || '(detached HEAD)'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={resolvedWorktreePath || ''}>
                          {resolvedWorktreePath ? formatPath(resolvedWorktreePath) : 'No worktree selected'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab Navigation */}
                <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
                      'transition-all duration-150',
                      activeTab === 'notes'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    Notes
                  </button>
                  <button
                    onClick={() => setActiveTab('checklist')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
                      'transition-all duration-150',
                      activeTab === 'checklist'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                  >
                    <ListChecks className="w-4 h-4" />
                    Checklist
                    {(draft?.checklist?.length ?? 0) > 0 && (
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded-md',
                          'bg-muted/80 text-muted-foreground'
                        )}
                      >
                        {(draft?.checklist ?? []).filter((i) => i.completed).length}/{draft?.checklist?.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('actions')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
                      'transition-all duration-150',
                      activeTab === 'actions'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                    )}
                  >
                    <Zap className="w-4 h-4" />
                    Quick Actions
                    {(draft?.resumeActions?.length ?? 0) > 0 && (
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded-md',
                          'bg-muted/80 text-muted-foreground'
                        )}
                      >
                        {draft?.resumeActions?.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[280px]">
                  {/* Notes Tab */}
                  {activeTab === 'notes' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                            Title
                          </label>
                          <Input
                            value={draft?.title ?? ''}
                            onChange={(e) => draft && setDraft({ ...draft, title: e.target.value })}
                            placeholder="What are you working on?"
                            className="bg-background/50 border-border focus:border-teal-500/50"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                            Goal
                          </label>
                          <Input
                            value={draft?.goal ?? ''}
                            onChange={(e) => draft && setDraft({ ...draft, goal: e.target.value || null })}
                            placeholder="Optional"
                            className="bg-background/50 border-border focus:border-teal-500/50"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                            Tags (comma-separated)
                          </label>
                          <Input
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="mvp, bugfix, refactor"
                            className="bg-background/50 border-border focus:border-teal-500/50"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          Notes
                        </label>
                        <textarea
                          value={draft?.notes ?? ''}
                          onChange={(e) => draft && setDraft({ ...draft, notes: e.target.value })}
                          placeholder="Context, links, TODOs..."
                          className={cn(
                            'w-full min-h-[180px] rounded-lg',
                            'border border-border bg-background/50',
                            'px-3 py-2 text-sm',
                            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/50 focus-visible:border-teal-500/50',
                            'resize-none'
                          )}
                        />
                      </div>
                    </div>
                  )}

                  {/* Checklist Tab */}
                  {activeTab === 'checklist' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Input
                          value={newChecklistText}
                          onChange={(e) => setNewChecklistText(e.target.value)}
                          placeholder="Add a task..."
                          className="bg-background/50 border-border focus:border-teal-500/50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddChecklistItem();
                            }
                          }}
                        />
                        <Button
                          onClick={handleAddChecklistItem}
                          disabled={!newChecklistText.trim()}
                          className="bg-teal-600 hover:bg-teal-500 text-white"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {(draft?.checklist ?? []).length === 0 ? (
                          <div className="text-center py-8">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                            <div className="text-sm font-medium text-muted-foreground mb-1">No tasks yet</div>
                            <div className="text-xs text-muted-foreground/70">Add tasks above to track your progress</div>
                          </div>
                        ) : (
                          (draft?.checklist ?? []).map((item) => (
                            <div
                              key={item.id}
                              className={cn(
                                'flex items-center gap-2 rounded-xl',
                                'bg-card/50 dark:bg-card/30',
                                'border border-border/80',
                                'px-4 py-3',
                                'hover:bg-accent/30',
                                'transition-colors duration-150'
                              )}
                            >
                              <Checkbox
                                checked={item.completed}
                                onCheckedChange={(checked) => handleToggleChecklistItem(item.id, checked)}
                                label={
                                  <span className={cn(item.completed && 'line-through text-muted-foreground')}>
                                    {item.text}
                                  </span>
                                }
                              />
                              <button
                                onClick={() => handleRemoveChecklistItem(item.id)}
                                className={cn(
                                  'ml-auto p-1.5 rounded-lg',
                                  'hover:bg-red-500/20',
                                  'transition-colors duration-150'
                                )}
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Quick Actions Tab */}
                  {activeTab === 'actions' && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          onClick={() => handleAddResumeAction('switchWorkingDirectory')}
                          className="text-muted-foreground text-xs hover:bg-accent/50"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Switch Dir
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => handleAddResumeAction('openEditor')}
                          className="text-muted-foreground text-xs hover:bg-accent/50"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Editor
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => handleAddResumeAction('runScript')}
                          className="text-muted-foreground text-xs hover:bg-accent/50"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Script
                        </Button>
                        <div className="relative" ref={workflowPickerRef}>
                          <Button
                            variant="ghost"
                            onClick={() => setShowWorkflowPicker(!showWorkflowPicker)}
                            className="text-teal-500 dark:text-teal-400 text-xs hover:bg-accent/50"
                            disabled={workflowOptions.length === 0}
                            title={workflowOptions.length === 0 ? 'No workflows available' : 'Add workflow action'}
                          >
                            <Play className="w-3 h-3 mr-1" />
                            Workflow
                          </Button>
                          {showWorkflowPicker && workflowOptions.length > 0 && (
                            <div
                              className={cn(
                                'absolute right-0 top-full mt-1 z-[100]',
                                'w-56 rounded-xl',
                                'border border-border',
                                'bg-card shadow-lg',
                                'p-1'
                              )}
                            >
                              <div className="text-xs text-muted-foreground px-2 py-1.5">Select Workflow</div>
                              {workflowOptions.map((opt) => (
                                <button
                                  key={opt.value}
                                  onClick={() => handleAddResumeAction('runWorkflow', opt.value)}
                                  className={cn(
                                    'w-full text-left px-2 py-1.5 text-sm rounded-lg',
                                    'hover:bg-accent/50 truncate',
                                    'transition-colors duration-150'
                                  )}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {(draft?.resumeActions ?? []).length === 0 ? (
                        <div className="text-center py-8">
                          <Play className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
                          <div className="text-sm font-medium text-muted-foreground mb-1">No Quick Actions configured</div>
                          <div className="text-xs text-muted-foreground/70">
                            Add actions above to quickly resume your work context
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(draft?.resumeActions ?? []).map((action, index) => (
                            <div
                              key={action.id}
                              className={cn(
                                'rounded-xl',
                                'bg-card/50 dark:bg-card/30',
                                'border border-border/80',
                                'p-4',
                                'hover:bg-accent/30',
                                'transition-colors duration-150'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <Checkbox
                                  checked={action.enabled}
                                  onCheckedChange={(checked) =>
                                    handleUpdateResumeAction(action.id, (a) => ({ ...a, enabled: checked }))
                                  }
                                  label={
                                    <span className="text-sm text-foreground flex items-center gap-2">
                                      {action.type === 'openEditor'
                                        ? 'Open Editor'
                                        : action.type === 'switchWorkingDirectory'
                                        ? 'Switch Working Directory'
                                        : action.type === 'runScript'
                                        ? 'Run Script'
                                        : action.type === 'runWorkflow'
                                        ? (
                                          <>
                                            <Play className="w-3 h-3 text-teal-500 dark:text-teal-400" />
                                            Run Workflow
                                            {action.workflowName && (
                                              <span className="text-muted-foreground text-xs">
                                                ({action.workflowName})
                                              </span>
                                            )}
                                          </>
                                        )
                                        : action.type}
                                    </span>
                                  }
                                />

                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleMoveResumeAction(action.id, -1)}
                                    disabled={index === 0}
                                    className={cn(
                                      'p-1.5 rounded-lg',
                                      'hover:bg-accent/50',
                                      'disabled:opacity-50',
                                      'transition-colors duration-150'
                                    )}
                                    title="Move up"
                                  >
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveResumeAction(action.id, 1)}
                                    disabled={index === (draft?.resumeActions.length ?? 1) - 1}
                                    className={cn(
                                      'p-1.5 rounded-lg',
                                      'hover:bg-accent/50',
                                      'disabled:opacity-50',
                                      'transition-colors duration-150'
                                    )}
                                    title="Move down"
                                  >
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveResumeAction(action.id)}
                                    className={cn(
                                      'p-1.5 rounded-lg',
                                      'hover:bg-red-500/20',
                                      'transition-colors duration-150'
                                    )}
                                    title="Remove action"
                                  >
                                    <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                                  </button>
                                </div>
                              </div>

                              {action.type === 'openEditor' && (
                                <div className="mt-3 ml-6">
                                  <label className="block text-xs text-muted-foreground mb-1.5">
                                    Editor
                                  </label>
                                  <Select
                                    value={action.editorId ?? ''}
                                    onValueChange={(value) =>
                                      handleUpdateResumeAction(action.id, (a) => ({ ...a, editorId: value }))
                                    }
                                    options={editorOptions}
                                    placeholder="Select editor..."
                                    aria-label="Select editor"
                                  />
                                </div>
                              )}

                              {action.type === 'runScript' && (
                                <div className="mt-3 ml-6">
                                  <label className="block text-xs text-muted-foreground mb-1.5">
                                    Script
                                  </label>
                                  {scriptOptions.length > 0 ? (
                                    <Select
                                      value={action.scriptName ?? ''}
                                      onValueChange={(value) =>
                                        handleUpdateResumeAction(action.id, (a) => ({ ...a, scriptName: value }))
                                      }
                                      options={scriptOptions}
                                      placeholder="Select script..."
                                      aria-label="Select script"
                                    />
                                  ) : (
                                    <Input
                                      value={action.scriptName ?? ''}
                                      onChange={(e) =>
                                        handleUpdateResumeAction(action.id, (a) => ({ ...a, scriptName: e.target.value }))
                                      }
                                      placeholder="Script name (e.g., dev)"
                                      className="bg-background/50 border-border"
                                    />
                                  )}
                                </div>
                              )}

                              {action.type === 'runWorkflow' && (
                                <div className="mt-3 ml-6 space-y-3">
                                  <div>
                                    <label className="block text-xs text-muted-foreground mb-1.5">
                                      Workflow
                                    </label>
                                    <Select
                                      value={action.workflowId ?? ''}
                                      onValueChange={(value) => {
                                        const wf = workflows.find((w) => w.id === value);
                                        handleUpdateResumeAction(action.id, (a) => ({
                                          ...a,
                                          workflowId: value,
                                          workflowName: wf?.name ?? '',
                                        }));
                                      }}
                                      options={workflowOptions}
                                      placeholder="Select workflow..."
                                      aria-label="Select workflow"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={action.waitForCompletion ?? true}
                                      onCheckedChange={(checked) =>
                                        handleUpdateResumeAction(action.id, (a) => ({ ...a, waitForCompletion: checked }))
                                      }
                                      label={
                                        <span className="text-xs text-muted-foreground">
                                          Wait for completion
                                        </span>
                                      }
                                    />
                                  </div>
                                  {runningWorkflowId === action.workflowId && (
                                    <div className="flex items-center gap-2 text-xs text-teal-500 dark:text-teal-400">
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                      Running...
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Resume Results */}
                      {lastResumeResult && (
                        <div
                          className={cn(
                            'rounded-xl p-4 mt-4',
                            'bg-card/50 dark:bg-card/30',
                            'border border-border/80'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="text-sm font-medium text-foreground">Last Resume</div>
                            <div
                              className={cn(
                                'text-xs px-2 py-1 rounded-md',
                                lastResumeResult.status === 'success'
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : lastResumeResult.status === 'partial_failure'
                                    ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                    : 'bg-red-500/15 text-red-500 dark:text-red-400'
                              )}
                            >
                              {lastResumeResult.status === 'success'
                                ? 'Success'
                                : lastResumeResult.status === 'partial_failure'
                                  ? 'Partial Failure'
                                  : 'Failure'}
                            </div>
                          </div>

                          <div className="space-y-2">
                            {lastResumeResult.results.map((r) => (
                              <div key={r.actionId} className="flex items-start gap-2">
                                {r.status === 'completed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                                ) : r.status === 'failed' ? (
                                  <XCircle className="w-4 h-4 text-red-500 dark:text-red-400 mt-0.5" />
                                ) : (
                                  <MinusCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs text-muted-foreground">
                                    {r.type}
                                  </div>
                                  <div className="text-sm text-foreground break-words">
                                    {r.message}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div
                    className={cn(
                      'text-sm p-3 rounded-lg',
                      'bg-red-500/10 border border-red-500/30',
                      'text-red-500 dark:text-red-400'
                    )}
                  >
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Footer with actions */}
            <div
              className={cn(
                'px-6 py-4',
                'border-t border-border',
                'bg-card/50',
                'flex-shrink-0'
              )}
            >
              <div className="flex items-center justify-between gap-4">
                {/* Left side - secondary actions */}
                <div className="flex items-center gap-2">
                  {(session || draft) && (
                    <Button
                      variant="ghost"
                      onClick={handleExport}
                      className="text-muted-foreground hover:bg-accent/50"
                      title="Export session as JSON"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  )}
                  {session && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={handleArchiveRestore}
                        className="text-muted-foreground hover:bg-accent/50"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        {session.status === 'archived' ? 'Restore' : 'Archive'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-red-500 dark:text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>

                {/* Right side - primary actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClose}
                    className={cn(
                      'px-4 py-2 rounded-lg',
                      'text-sm font-medium',
                      'text-muted-foreground hover:text-foreground',
                      'hover:bg-accent/50',
                      'border border-transparent hover:border-border',
                      'transition-all duration-150',
                      'focus:outline-none focus:ring-2 focus:ring-ring'
                    )}
                  >
                    Cancel
                  </button>
                  <Button
                    onClick={handleSave}
                    disabled={!draft}
                    className="bg-teal-600 hover:bg-teal-500 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  <Button
                    onClick={handleResume}
                    disabled={!canResume}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    title={!canResume ? 'Save a session with enabled actions to resume' : 'Resume'}
                  >
                    Resume
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Dialog */}
      {isHelpOpen && (
        <div
          className={cn('fixed inset-0 z-[60]', 'animate-in fade-in-0 duration-200')}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsHelpOpen(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div
              className={cn(
                'relative w-full max-w-xl max-h-[80vh]',
                'bg-background rounded-2xl',
                'border border-teal-500/30',
                'shadow-2xl shadow-black/60',
                'flex flex-col overflow-hidden'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={cn(
                  'px-5 py-4 border-b border-border',
                  'bg-gradient-to-r',
                  'from-teal-500/10 via-cyan-600/5 to-transparent',
                  'dark:from-teal-500/20 dark:via-cyan-600/10 dark:to-transparent',
                  'flex items-center justify-between'
                )}
              >
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-teal-500 dark:text-teal-400" />
                  <h2 className="text-sm font-medium text-foreground">Worktree Session Help</h2>
                </div>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className={cn(
                    'p-2 rounded-lg',
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-accent/50',
                    'transition-colors duration-150'
                  )}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div>
                  <div className="text-sm font-medium text-foreground mb-2">What is a Session?</div>
                  <p className="text-sm text-muted-foreground">
                    A session saves your work context for a worktree: notes, checklist, and quick actions to resume where you left off.
                  </p>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground mb-2">Tabs</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li><strong>Notes</strong> — Title, goal, free-form notes, and tags for organizing.</li>
                    <li><strong>Checklist</strong> — Track progress with checkable tasks.</li>
                    <li><strong>Quick Actions</strong> — Configure actions to run when resuming work.</li>
                  </ul>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground mb-2">Quick Actions</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li><strong>Open Editor</strong> — Launch the worktree in your preferred editor.</li>
                    <li><strong>Switch Directory</strong> — Change PackageFlow&apos;s working directory to this worktree.</li>
                    <li><strong>Run Script</strong> — Execute a project script (e.g., dev, build, test).</li>
                    <li><strong>Run Workflow</strong> — Trigger a workflow; optionally wait for completion before continuing.</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    Enable/disable actions with checkboxes. Drag to reorder. Click &quot;Resume&quot; to run all enabled actions.
                  </p>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground mb-2">Common Scenarios</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li>Working on multiple features: each worktree has its own session with separate notes and TODOs.</li>
                    <li>Quick start after restart: open editor + switch directory + run dev server in one click.</li>
                    <li>Automate setup: use Run Workflow to install dependencies, generate files, etc.</li>
                  </ul>
                </div>

                <div>
                  <div className="text-sm font-medium text-foreground mb-2">Tips</div>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    <li>Orange &quot;Unsaved&quot; label in title means unsaved changes.</li>
                    <li>Broken sessions can be relinked to a different worktree.</li>
                    <li>Archived sessions are read-only; restore to edit.</li>
                    <li>Deleting a session does not delete the worktree.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        variant="destructive"
        title="Delete Session"
        description="Delete this session? This cannot be undone."
        itemName={session?.title || session?.branchSnapshot || undefined}
        confirmText="Delete"
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={showUnsavedConfirm}
        onOpenChange={setShowUnsavedConfirm}
        title="Unsaved Changes"
        description="You have unsaved changes. Do you want to discard them?"
        confirmText="Discard"
        onConfirm={handleDiscardAndClose}
      />
    </>
  );
}
