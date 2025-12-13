/**
 * Worktree Sessions type definitions
 * @see specs/001-worktree-sessions/data-model.md
 */

export type WorktreeSessionStatus = 'active' | 'archived' | 'broken';

export interface SessionChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export type ResumeActionType =
  | 'openEditor'
  | 'switchWorkingDirectory'
  | 'runScript'
  | 'runWorkflow'
  | (string & {});

export interface ResumeAction {
  id: string;
  type: ResumeActionType;
  label: string | null;
  enabled: boolean;

  // openEditor
  editorId?: string | null;
  // runScript
  scriptName?: string;
  // runWorkflow
  workflowId?: string;
  workflowName?: string;
  waitForCompletion?: boolean;
}

export interface WorktreeSession {
  id: string;
  projectId: string;
  worktreePath: string;
  branchSnapshot: string | null;
  title: string;
  goal: string | null;
  notes: string;
  tags: string[];
  checklist: SessionChecklistItem[];
  resumeActions: ResumeAction[];
  status: WorktreeSessionStatus;
  brokenReason: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastResumedAt: string | null;
}

export type ResumeActionResultStatus = 'completed' | 'failed' | 'skipped';

export interface ResumeActionResult {
  actionId: string;
  type: ResumeActionType;
  status: ResumeActionResultStatus;
  message: string;
}

export type ResumeSessionStatus = 'success' | 'partial_failure' | 'failure';

export interface ResumeSessionResult {
  runId: string;
  sessionId: string;
  status: ResumeSessionStatus;
  results: ResumeActionResult[];
}

