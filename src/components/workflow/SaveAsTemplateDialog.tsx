/**
 * Save As Template Dialog
 * Dialog for saving a workflow node as a reusable template
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Star, Terminal, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { WorkflowNode } from '../../types/workflow';
import { isScriptNodeConfig } from '../../types/workflow';

interface SaveAsTemplateDialogProps {
  isOpen: boolean;
  node: WorkflowNode | null;
  onClose: () => void;
  onSave: (name: string) => void;
}

/**
 * Save As Template Dialog Component
 */
export function SaveAsTemplateDialog({
  isOpen,
  node,
  onClose,
  onSave,
}: SaveAsTemplateDialogProps) {
  const [name, setName] = useState('');

  // Reset form when dialog opens with a new node
  useEffect(() => {
    if (isOpen && node) {
      setName(node.name);
    }
  }, [isOpen, node]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  // Only allow script nodes to be saved as templates
  if (!node || !isScriptNodeConfig(node.config)) return null;

  const scriptConfig = node.config;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        'bg-background border-yellow-500/30 max-w-md p-0 overflow-hidden',
        'shadow-2xl shadow-black/60'
      )}>
        {/* Header with gradient background and icon badge */}
        <div className={cn(
          'relative px-6 py-5',
          'border-b border-border',
          'bg-gradient-to-r',
          'dark:from-yellow-500/15 dark:via-yellow-600/5 dark:to-transparent',
          'from-yellow-500/10 via-yellow-600/5 to-transparent'
        )}>
          <div className="flex items-center gap-4">
            {/* Icon badge */}
            <div className={cn(
              'flex-shrink-0',
              'w-12 h-12 rounded-xl',
              'flex items-center justify-center',
              'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
              'border',
              'bg-yellow-500/10 border-yellow-500/20',
              'shadow-lg'
            )}>
              <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-foreground leading-tight">
                Save as Template
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Save this step as a reusable template for future workflows
              </p>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="px-6 py-4 space-y-4" onKeyDown={handleKeyDown}>
          {/* Template Name */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Star className="w-4 h-4" />
              Template Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Custom Build"
              autoFocus
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Command Preview (read-only) */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Terminal className="w-4 h-4" />
              Command
            </label>
            <div className="bg-muted rounded-lg p-3 font-mono text-xs text-muted-foreground break-all">
              {scriptConfig.command}
            </div>
          </div>

          {/* Working Directory Preview (if present) */}
          {scriptConfig.cwd && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderOpen className="w-4 h-4" />
                Working Directory
              </label>
              <div className="bg-muted rounded-lg p-3 font-mono text-xs text-muted-foreground">
                {scriptConfig.cwd}
              </div>
            </div>
          )}
        </div>

        {/* Footer with actions */}
        <div className={cn(
          'px-6 py-4',
          'border-t border-border',
          'bg-card/50',
          'flex justify-end gap-3'
        )}>
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-yellow-600 hover:bg-yellow-500 text-white"
          >
            <Star className="w-4 h-4 mr-1.5" />
            Save Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
