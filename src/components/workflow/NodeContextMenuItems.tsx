/**
 * Shared context menu items for workflow nodes
 * Used by ScriptNode, TriggerWorkflowNode, etc.
 */

import React from 'react';
import { Copy, Pencil, Download, Star, Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { ContextMenuItem, ContextMenuSeparator } from '../ui/ContextMenu';

/**
 * Custom icon for "Insert Before" action
 */
export const InsertBeforeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <div className={className}>
    <ChevronUp className="w-3 h-3 absolute top-0 left-0.5" />
    <Plus className="w-3 h-3 absolute bottom-0 left-0.5" />
  </div>
);

/**
 * Custom icon for "Insert After" action
 */
export const InsertAfterIcon: React.FC<{ className?: string }> = ({ className }) => (
  <div className={className}>
    <Plus className="w-3 h-3 absolute top-0 left-0.5" />
    <ChevronDown className="w-3 h-3 absolute bottom-0 left-0.5" />
  </div>
);

export interface NodeContextMenuItemsProps {
  onInsertBefore?: () => void;
  onInsertAfter?: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
  onExport?: () => void;
  onSaveAsTemplate?: () => void;
  onDelete?: () => void;
}

/**
 * Shared context menu items for workflow nodes
 * Renders consistent menu items across all node types
 */
export const NodeContextMenuItems: React.FC<NodeContextMenuItemsProps> = ({
  onInsertBefore,
  onInsertAfter,
  onDuplicate,
  onEdit,
  onExport,
  onSaveAsTemplate,
  onDelete,
}) => {
  const hasInsertActions = onInsertBefore || onInsertAfter;
  const hasEditActions = onDuplicate || onEdit;
  const hasExportActions = onExport || onSaveAsTemplate;

  return (
    <>
      {/* Insert section */}
      {hasInsertActions && (
        <>
          {onInsertBefore && (
            <ContextMenuItem
              onClick={onInsertBefore}
              icon={
                <div className="relative w-4 h-4">
                  <ChevronUp className="w-3 h-3 absolute top-0 left-0.5" />
                  <Plus className="w-3 h-3 absolute bottom-0 left-0.5" />
                </div>
              }
            >
              Insert Before
            </ContextMenuItem>
          )}
          {onInsertAfter && (
            <ContextMenuItem
              onClick={onInsertAfter}
              icon={
                <div className="relative w-4 h-4">
                  <Plus className="w-3 h-3 absolute top-0 left-0.5" />
                  <ChevronDown className="w-3 h-3 absolute bottom-0 left-0.5" />
                </div>
              }
            >
              Insert After
            </ContextMenuItem>
          )}
          {(hasEditActions || hasExportActions || onDelete) && <ContextMenuSeparator />}
        </>
      )}

      {/* Edit section */}
      {hasEditActions && (
        <>
          {onDuplicate && (
            <ContextMenuItem onClick={onDuplicate} icon={<Copy className="w-4 h-4" />}>
              Duplicate
            </ContextMenuItem>
          )}
          {onEdit && (
            <ContextMenuItem onClick={onEdit} icon={<Pencil className="w-4 h-4" />}>
              Edit
            </ContextMenuItem>
          )}
          {(hasExportActions || onDelete) && <ContextMenuSeparator />}
        </>
      )}

      {/* Export section */}
      {hasExportActions && (
        <>
          {onExport && (
            <ContextMenuItem onClick={onExport} icon={<Download className="w-4 h-4" />}>
              Export Step
            </ContextMenuItem>
          )}
          {onSaveAsTemplate && (
            <ContextMenuItem
              onClick={onSaveAsTemplate}
              icon={<Star className="w-4 h-4" />}
              warning
            >
              Save as Template
            </ContextMenuItem>
          )}
          {onDelete && <ContextMenuSeparator />}
        </>
      )}

      {/* Delete section */}
      {onDelete && (
        <ContextMenuItem onClick={onDelete} icon={<Trash2 className="w-4 h-4" />} destructive>
          Delete
        </ContextMenuItem>
      )}
    </>
  );
};
