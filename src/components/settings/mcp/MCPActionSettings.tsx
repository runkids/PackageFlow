/**
 * MCPActionSettings Component
 * Manages MCP action permissions with granular control
 * @see specs/021-mcp-actions/spec.md
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  Play,
  Globe,
  GitBranch,
  ChevronDown,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { MCPActionEditor } from './MCPActionEditor';
import { cn } from '../../../lib/utils';
import { Collapsible } from '../../ui/Collapsible';
import { useMCPActions } from '../../../hooks/useMCPActions';
import type {
  MCPAction,
  MCPActionType,
  PermissionLevel,
} from '../../../types/mcp-action';

// ============================================================================
// Types
// ============================================================================

interface MCPActionSettingsProps {
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPE_CONFIG: Record<
  MCPActionType,
  { name: string; icon: React.ReactNode; colorClass: string; bgClass: string; description: string }
> = {
  script: {
    name: 'Script',
    icon: <Play className="w-3.5 h-3.5" />,
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-500/10',
    description: 'Execute shell commands and scripts',
  },
  webhook: {
    name: 'Webhook',
    icon: <Globe className="w-3.5 h-3.5" />,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-500/10',
    description: 'Trigger HTTP webhooks',
  },
  workflow: {
    name: 'Workflow',
    icon: <GitBranch className="w-3.5 h-3.5" />,
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-500/10',
    description: 'Execute PackageFlow workflows',
  },
};

const PERMISSION_LEVELS: { value: PermissionLevel; label: string; description: string; color: string }[] = [
  {
    value: 'require_confirm',
    label: 'Require Confirmation',
    description: 'User must approve each execution',
    color: 'text-amber-500',
  },
  {
    value: 'auto_approve',
    label: 'Auto Approve',
    description: 'Execute without confirmation',
    color: 'text-emerald-500',
  },
  {
    value: 'deny',
    label: 'Deny',
    description: 'Block all executions',
    color: 'text-red-500',
  },
];

// ============================================================================
// Permission Dropdown Component
// ============================================================================

interface PermissionDropdownProps {
  value: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const PermissionDropdown: React.FC<PermissionDropdownProps> = ({
  value,
  onChange,
  disabled = false,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const currentLevel = PERMISSION_LEVELS.find((l) => l.value === value) || PERMISSION_LEVELS[0];

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.right - 200, // Align right edge with button
      });
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 rounded-md border border-border',
          'bg-background hover:bg-muted/50 transition-colors',
          size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn('font-medium', currentLevel.color)}>{currentLevel.label}</span>
        <ChevronDown className={cn('w-3 h-3 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[9999] min-w-[200px] rounded-md border border-border shadow-lg"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left, backgroundColor: 'hsl(var(--card))' }}
          >
            {PERMISSION_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => {
                  onChange(level.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2 text-left',
                  'hover:bg-muted/50 transition-colors',
                  level.value === value && 'bg-muted/30'
                )}
              >
                <div>
                  <div className={cn('text-sm font-medium', level.color)}>{level.label}</div>
                  <div className="text-xs text-muted-foreground">{level.description}</div>
                </div>
                {level.value === value && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

// ============================================================================
// Action Row Component
// ============================================================================

interface ActionRowProps {
  action: MCPAction;
  permission: PermissionLevel;
  onPermissionChange: (actionId: string, level: PermissionLevel) => void;
  onEdit: (action: MCPAction) => void;
  onDelete: (action: MCPAction) => void;
  isLoading?: boolean;
}

const ActionRow: React.FC<ActionRowProps> = ({
  action,
  permission,
  onPermissionChange,
  onEdit,
  onDelete,
  isLoading,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md group',
        'transition-colors duration-150',
        'hover:bg-muted/50',
        !action.isEnabled && 'opacity-50'
      )}
    >
      {/* Action info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">{action.name}</span>
          {!action.isEnabled && (
            <span className="text-xs text-muted-foreground">(disabled)</span>
          )}
        </div>
        {action.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{action.description}</p>
        )}
      </div>

      {/* Action buttons - show on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(action)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(action)}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Permission dropdown */}
      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <PermissionDropdown
            value={permission}
            onChange={(level) => onPermissionChange(action.id, level)}
            disabled={!action.isEnabled}
            size="sm"
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Type Default Permission Row
// ============================================================================

interface TypeDefaultRowProps {
  actionType: MCPActionType;
  permission: PermissionLevel;
  onPermissionChange: (type: MCPActionType, level: PermissionLevel) => void;
  isLoading?: boolean;
}

const TypeDefaultRow: React.FC<TypeDefaultRowProps> = ({
  actionType,
  permission,
  onPermissionChange,
  isLoading,
}) => {
  const typeConfig = ACTION_TYPE_CONFIG[actionType];

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-md',
        'bg-muted/40 border border-dashed border-border/50'
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm text-foreground">Default Permission</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          Applied to new {typeConfig.name.toLowerCase()} actions
        </p>
      </div>

      <div className="flex items-center gap-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <PermissionDropdown
            value={permission}
            onChange={(level) => onPermissionChange(actionType, level)}
            size="sm"
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Category Group Component
// ============================================================================

interface CategoryGroupProps {
  actionType: MCPActionType;
  actions: MCPAction[];
  permissions: Map<string, PermissionLevel>;
  typeDefaultPermission: PermissionLevel;
  onActionPermissionChange: (actionId: string, level: PermissionLevel) => void;
  onTypeDefaultChange: (type: MCPActionType, level: PermissionLevel) => void;
  onEditAction: (action: MCPAction) => void;
  onDeleteAction: (action: MCPAction) => void;
  onCreateAction: (type: MCPActionType) => void;
  loadingActions: Set<string>;
  defaultOpen?: boolean;
}

const CategoryGroup: React.FC<CategoryGroupProps> = ({
  actionType,
  actions,
  permissions,
  typeDefaultPermission,
  onActionPermissionChange,
  onTypeDefaultChange,
  onEditAction,
  onDeleteAction,
  onCreateAction,
  loadingActions,
  defaultOpen = true,
}) => {
  const config = ACTION_TYPE_CONFIG[actionType];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Collapsible
        defaultOpen={defaultOpen}
        trigger={
          <div className="flex items-center gap-3 py-2.5 pr-3 w-full">
            <span className={cn('p-1.5 rounded-md', config.bgClass, config.colorClass)}>
              {config.icon}
            </span>
            <span className="flex-1 text-left">
              <span className="font-medium text-foreground">{config.name} Actions</span>
              <span className="ml-2 text-xs text-muted-foreground">({actions.length} configured)</span>
            </span>
          </div>
        }
        triggerClassName="pl-3 hover:bg-muted/30 transition-colors"
        contentClassName="border-t border-border bg-muted/20"
      >
        <div className="p-2 space-y-1">
          {/* Type default permission */}
          <TypeDefaultRow
            actionType={actionType}
            permission={typeDefaultPermission}
            onPermissionChange={onTypeDefaultChange}
            isLoading={loadingActions.has(`type:${actionType}`)}
          />

          {/* Individual actions */}
          {actions.length > 0 ? (
            actions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                permission={permissions.get(action.id) || typeDefaultPermission}
                onPermissionChange={onActionPermissionChange}
                onEdit={onEditAction}
                onDelete={onDeleteAction}
                isLoading={loadingActions.has(action.id)}
              />
            ))
          ) : (
            <div className="py-3 text-center text-sm text-muted-foreground">
              No {config.name.toLowerCase()} actions configured
            </div>
          )}

          {/* Add action button */}
          <button
            onClick={() => onCreateAction(actionType)}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md',
              'border border-dashed border-border/50',
              'text-xs text-muted-foreground hover:text-foreground',
              'hover:bg-muted/30 hover:border-border transition-colors'
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add {config.name} Action</span>
          </button>
        </div>
      </Collapsible>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const MCPActionSettings: React.FC<MCPActionSettingsProps> = ({ className }) => {
  const {
    actions,
    permissions,
    isActionsLoading,
    isPermissionsLoading,
    error,
    fetchActions,
    fetchPermissions,
    updatePermission,
    createAction,
    updateAction,
    deleteAction,
  } = useMCPActions({ autoFetch: true, pendingPollInterval: 0 }); // Disable polling on this page

  // Only show loading for actions and permissions, not pending requests
  const isLoading = isActionsLoading || isPermissionsLoading;

  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  // Editor dialog state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<MCPAction | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MCPAction | null>(null);

  // Group actions by type
  const groupedActions = useMemo(() => {
    const groups: Record<MCPActionType, MCPAction[]> = {
      script: [],
      webhook: [],
      workflow: [],
    };
    actions.forEach((action) => {
      groups[action.actionType].push(action);
    });
    return groups;
  }, [actions]);

  // Build permission maps
  const { actionPermissions, typeDefaultPermissions } = useMemo(() => {
    const actionPerms = new Map<string, PermissionLevel>();
    const typeDefaults: Record<MCPActionType, PermissionLevel> = {
      script: 'require_confirm',
      webhook: 'require_confirm',
      workflow: 'require_confirm',
    };

    permissions.forEach((perm) => {
      if (perm.actionId) {
        actionPerms.set(perm.actionId, perm.permissionLevel);
      } else if (perm.actionType) {
        typeDefaults[perm.actionType] = perm.permissionLevel;
      }
    });

    return { actionPermissions: actionPerms, typeDefaultPermissions: typeDefaults };
  }, [permissions]);

  // Handle action permission change
  const handleActionPermissionChange = useCallback(
    async (actionId: string, level: PermissionLevel) => {
      setLoadingActions((prev) => new Set(prev).add(actionId));
      try {
        const action = actions.find((a) => a.id === actionId);
        await updatePermission(actionId, action?.actionType || null, level);
      } catch (err) {
        console.error('Failed to update permission:', err);
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(actionId);
          return next;
        });
      }
    },
    [actions, updatePermission]
  );

  // Handle type default permission change
  const handleTypeDefaultChange = useCallback(
    async (actionType: MCPActionType, level: PermissionLevel) => {
      const key = `type:${actionType}`;
      setLoadingActions((prev) => new Set(prev).add(key));
      try {
        await updatePermission(null, actionType, level);
      } catch (err) {
        console.error('Failed to update type default permission:', err);
      } finally {
        setLoadingActions((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [updatePermission]
  );

  // Refresh handler
  const handleRefresh = useCallback(() => {
    fetchActions();
    fetchPermissions();
  }, [fetchActions, fetchPermissions]);

  // CRUD handlers
  const handleCloseEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const handleCreateAction = useCallback((_type: MCPActionType) => {
    setEditingAction(null);
    setIsEditorOpen(true);
  }, []);

  const handleEditAction = useCallback((action: MCPAction) => {
    setEditingAction(action);
    setIsEditorOpen(true);
  }, []);

  const handleDeleteAction = useCallback((action: MCPAction) => {
    setDeleteConfirm(action);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      await deleteAction(deleteConfirm.id);
    } catch (err) {
      console.error('Failed to delete action:', err);
    } finally {
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, deleteAction]);

  const handleSaveAction = useCallback(
    async (data: Partial<MCPAction>) => {
      // Convert config to Record<string, unknown>
      const configRecord = data.config
        ? (JSON.parse(JSON.stringify(data.config)) as Record<string, unknown>)
        : {};

      if (editingAction) {
        // Update existing action
        await updateAction(editingAction.id, {
          name: data.name,
          description: data.description,
          config: configRecord,
          isEnabled: data.isEnabled,
        });
      } else {
        // Create new action
        await createAction(
          data.actionType!,
          data.name!,
          data.description || null,
          configRecord
        );
      }
    },
    [editingAction, createAction, updateAction]
  );

  if (isLoading && actions.length === 0) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading action permissions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
        <button
          onClick={handleRefresh}
          className="text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Action Permissions</span>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4 text-muted-foreground', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground">
        Control how AI CLI tools can execute actions via MCP protocol.
        Set default permissions per type or configure individual actions.
      </p>

      {/* Category groups - scrollable */}
      <div className="space-y-2 max-h-[calc(100vh-400px)] min-h-[300px] overflow-y-auto pr-1">
        <CategoryGroup
          actionType="script"
          actions={groupedActions.script}
          permissions={actionPermissions}
          typeDefaultPermission={typeDefaultPermissions.script}
          onActionPermissionChange={handleActionPermissionChange}
          onTypeDefaultChange={handleTypeDefaultChange}
          onEditAction={handleEditAction}
          onDeleteAction={handleDeleteAction}
          onCreateAction={handleCreateAction}
          loadingActions={loadingActions}
        />
        <CategoryGroup
          actionType="webhook"
          actions={groupedActions.webhook}
          permissions={actionPermissions}
          typeDefaultPermission={typeDefaultPermissions.webhook}
          onActionPermissionChange={handleActionPermissionChange}
          onTypeDefaultChange={handleTypeDefaultChange}
          onEditAction={handleEditAction}
          onDeleteAction={handleDeleteAction}
          onCreateAction={handleCreateAction}
          loadingActions={loadingActions}
        />
        <CategoryGroup
          actionType="workflow"
          actions={groupedActions.workflow}
          permissions={actionPermissions}
          typeDefaultPermission={typeDefaultPermissions.workflow}
          onActionPermissionChange={handleActionPermissionChange}
          onTypeDefaultChange={handleTypeDefaultChange}
          onEditAction={handleEditAction}
          onDeleteAction={handleDeleteAction}
          onCreateAction={handleCreateAction}
          loadingActions={loadingActions}
        />
      </div>

      {/* Action Editor Dialog */}
      {isEditorOpen && (
        <MCPActionEditor
          action={editingAction}
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
          onSave={handleSaveAction}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998] bg-black/50"
              onClick={() => setDeleteConfirm(null)}
            />
            <div
              className="fixed z-[9999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] p-4 rounded-lg border border-border shadow-xl"
              style={{ backgroundColor: 'hsl(var(--card))' }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-full bg-destructive/10">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground">Delete Action</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Are you sure you want to delete "{deleteConfirm.name}"? This action cannot be
                    undone.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium',
                    'border border-border hover:bg-muted transition-colors'
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium',
                    'bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors'
                  )}
                >
                  Delete
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export default MCPActionSettings;
