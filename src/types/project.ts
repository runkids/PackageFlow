/**
 * Project management type definitions
 * @see specs/002-frontend-project-manager/data-model.md
 */

import type { WorktreeSession } from './worktree-sessions';

export type MonorepoTool = 'nx' | 'turbo' | 'lerna' | 'workspaces' | null;

export type ProjectFramework =
  | 'expo'
  | 'react-native'
  | 'next'
  | 'remix'
  | 'tanstack-start'
  | 'vite'
  | 'cra'
  | 'nuxt'
  | 'vue-cli'
  | 'angular'
  | 'electron'
  | 'tauri'
  | null;

export type UIFramework =
  | 'react'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'preact'
  | 'lit'
  | 'qwik'
  | null;

export interface Project {
  id: string;
  path: string;
  name: string;
  version: string;
  description?: string;
  isMonorepo: boolean;
  monorepoTool?: MonorepoTool;
  framework?: ProjectFramework;
  uiFramework?: UIFramework;
  packageManager: PackageManager;
  scripts: Record<string, string>;
  worktreeSessions?: WorktreeSession[];
  createdAt: string;
  lastOpenedAt: string;
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';

export interface WorkspacePackage {
  name: string;
  relativePath: string;
  absolutePath: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: string[];
  uiFramework?: UIFramework;
}

export type ScriptCategory = 'development' | 'build' | 'test' | 'lint' | 'other';

export interface CategorizedScript {
  name: string;
  command: string;
  category: ScriptCategory;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  isBare?: boolean;
  isDetached?: boolean;
}

export interface ScanProjectResponse {
  success: boolean;
  project?: Project;
  workspaces?: WorkspacePackage[];
  error?: 'INVALID_PATH' | 'NO_PACKAGE_JSON' | 'INVALID_PACKAGE_JSON' | 'ALREADY_EXISTS';
}

export interface LoadProjectsResponse {
  projects: Project[];
}

export interface SaveProjectResponse {
  success: boolean;
  project?: Project;
  error?: string;
}

export interface RemoveProjectResponse {
  success: boolean;
  error?: string;
}

export interface RefreshProjectResponse {
  success: boolean;
  project?: Project;
  workspaces?: WorkspacePackage[];
  error?: 'PROJECT_NOT_FOUND' | 'PATH_NOT_EXISTS' | 'INVALID_PACKAGE_JSON';
}

export interface ExecuteScriptParams {
  projectPath: string;
  scriptName: string;
  packageManager: PackageManager;
  cwd?: string;
}

export interface ExecuteCommandParams {
  projectPath: string;
  command: string;
  cwd?: string;
}

export interface ExecuteCommandResponse {
  success: boolean;
  executionId?: string;
  error?: 'EXECUTION_ERROR';
}

export interface ExecuteScriptResponse {
  success: boolean;
  executionId?: string;
  error?: 'INVALID_PATH' | 'SCRIPT_NOT_FOUND';
}

export interface ScriptOutputEvent {
  executionId: string;
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: string;
}

export interface ScriptCompletedEvent {
  executionId: string;
  exitCode: number;
  timestamp: string;
}

export interface CancelScriptResponse {
  success: boolean;
  error?: string;
}

export interface ListWorktreesResponse {
  success: boolean;
  worktrees?: Worktree[];
  error?: 'NOT_GIT_REPO' | 'GIT_ERROR';
}

export interface AddWorktreeParams {
  projectPath: string;
  worktreePath: string;
  branch: string;
  createBranch?: boolean;
}

export interface AddWorktreeResponse {
  success: boolean;
  worktree?: Worktree;
  error?: 'PATH_EXISTS' | 'BRANCH_NOT_FOUND' | 'BRANCH_EXISTS' | 'GIT_ERROR';
}

export interface RemoveWorktreeParams {
  projectPath: string;
  worktreePath: string;
  force?: boolean;
}

export interface RemoveWorktreeResponse {
  success: boolean;
  error?: 'WORKTREE_NOT_FOUND' | 'HAS_UNCOMMITTED_CHANGES' | 'CANNOT_REMOVE_MAIN' | 'GIT_ERROR';
}

export interface IsGitRepoResponse {
  success: boolean;
  isGitRepo: boolean;
}

export interface ListBranchesResponse {
  success: boolean;
  branches?: string[];
  error?: 'NOT_GIT_REPO' | 'GIT_ERROR';
}

export interface OpenTerminalWindowResponse {
  success: boolean;
  windowId?: number;
  error?: string;
}
