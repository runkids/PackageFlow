/**
 * Worktree Quick Switcher Component
 * Quick navigation between worktrees with keyboard
 * @see specs/001-worktree-enhancements/tasks.md - T043-T044
 */

import { useMemo } from 'react';
import { GitBranch, Code2, Play, FolderOpen } from 'lucide-react';
import { QuickSwitcher, type QuickSwitcherItem } from '../ui/QuickSwitcher';
import type { Worktree, EditorDefinition } from '../../lib/tauri-api';
import type { CategorizedScript } from '../../types';
import { useSettings } from '../../contexts/SettingsContext';

interface WorktreeQuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  worktrees: Worktree[];
  availableEditors: EditorDefinition[];
  scripts: CategorizedScript[];
  onOpenInEditor: (worktreePath: string, editorId?: string) => void;
  onRunScript: (worktreePath: string, scriptName: string) => void;
  onSwitchDirectory?: (worktreePath: string) => void;
}

export function WorktreeQuickSwitcher({
  isOpen,
  onClose,
  worktrees,
  availableEditors,
  scripts,
  onOpenInEditor,
  onRunScript,
  onSwitchDirectory,
}: WorktreeQuickSwitcherProps) {
  // Settings for path display format
  const { formatPath } = useSettings();

  // Build quick switcher items
  const items = useMemo((): QuickSwitcherItem[] => {
    const result: QuickSwitcherItem[] = [];

    for (const worktree of worktrees) {
      const worktreeName = worktree.branch || worktree.path.split('/').pop() || 'worktree';
      const isMain = worktree.isMain;

      // Open in Editor actions
      for (const editor of availableEditors) {
        result.push({
          id: `${worktree.path}-editor-${editor.id}`,
          title: `Open ${worktreeName} in ${editor.name}`,
          subtitle: formatPath(worktree.path),
          icon: <Code2 className="w-4 h-4" />,
          category: 'Open in Editor',
          keywords: [worktreeName, editor.name, worktree.branch || '', 'open', 'editor', 'ide'],
          onSelect: () => onOpenInEditor(worktree.path, editor.id),
        });
      }

      // Run Script actions (only show common scripts)
      const commonScripts = scripts.filter(s =>
        ['dev', 'start', 'build', 'test', 'lint'].includes(s.name.toLowerCase())
      );

      for (const script of commonScripts) {
        result.push({
          id: `${worktree.path}-script-${script.name}`,
          title: `Run ${script.name} in ${worktreeName}`,
          subtitle: script.command,
          icon: <Play className="w-4 h-4" />,
          category: 'Run Script',
          keywords: [worktreeName, script.name, worktree.branch || '', 'run', 'script', script.category],
          onSelect: () => onRunScript(worktree.path, script.name),
        });
      }

      // Switch Directory action (only for non-main worktrees)
      if (!isMain && onSwitchDirectory) {
        result.push({
          id: `${worktree.path}-switch`,
          title: `Switch to ${worktreeName}`,
          subtitle: formatPath(worktree.path),
          icon: <FolderOpen className="w-4 h-4" />,
          category: 'Switch Directory',
          keywords: [worktreeName, worktree.branch || '', 'switch', 'directory', 'folder'],
          onSelect: () => onSwitchDirectory(worktree.path),
        });
      }

      // Quick access to worktree (shows all actions)
      result.push({
        id: worktree.path,
        title: worktreeName,
        subtitle: `${formatPath(worktree.path)} • ${worktree.head?.substring(0, 7) || ''}`,
        icon: <GitBranch className={`w-4 h-4 ${isMain ? 'text-blue-400' : ''}`} />,
        category: 'Worktrees',
        keywords: [worktreeName, worktree.branch || '', worktree.head?.substring(0, 7) || ''],
        onSelect: () => {
          // Default action: open in first available editor
          if (availableEditors.length > 0) {
            onOpenInEditor(worktree.path, availableEditors[0].id);
          } else if (onSwitchDirectory && !isMain) {
            onSwitchDirectory(worktree.path);
          }
        },
      });
    }

    return result;
  }, [worktrees, availableEditors, scripts, onOpenInEditor, onRunScript, onSwitchDirectory, formatPath]);

  return (
    <QuickSwitcher
      isOpen={isOpen}
      onClose={onClose}
      items={items}
      title="Quick Switcher"
      placeholder="Search worktrees, actions..."
      emptyMessage="No matching worktrees or actions"
    />
  );
}
