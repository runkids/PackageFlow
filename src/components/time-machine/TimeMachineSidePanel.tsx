// Time Machine Side Panel
// Slide-over panel for viewing and comparing execution snapshots

import { useEffect, useId, useRef } from 'react';
import { X, Clock } from 'lucide-react';
import { Button } from '../ui/Button';
import { TimeMachinePanel } from './TimeMachinePanel';
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';
import { cn } from '../../lib/utils';

interface TimeMachineSidePanelProps {
  /** Project path - required for project-level snapshots (Feature 025 redesign) */
  projectPath: string;
  /** Display name for the panel header */
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TimeMachineSidePanel({
  projectPath,
  displayName,
  isOpen,
  onClose,
}: TimeMachineSidePanelProps) {
  const modalId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Register/unregister modal
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key with modal stack
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="time-machine-panel-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          'relative w-[480px] h-full bg-background',
          'border-l border-cyan-500/30',
          'flex flex-col',
          'animate-in slide-in-from-right duration-200',
          'shadow-2xl shadow-black/50'
        )}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-5 py-4',
            'border-b border-border',
            'bg-gradient-to-r',
            'dark:from-cyan-500/15 dark:via-cyan-600/5 dark:to-transparent',
            'from-cyan-500/10 via-cyan-600/5 to-transparent'
          )}
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-4 top-4 h-auto w-auto p-2"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-4 pr-10">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border border-cyan-500/20',
                'bg-cyan-500/10',
                'shadow-lg'
              )}
            >
              <Clock className="w-6 h-6 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="time-machine-panel-title"
                className="text-lg font-semibold text-foreground leading-tight"
              >
                Time Machine
              </h2>
              <p className="mt-1 text-sm text-muted-foreground truncate" title={displayName}>
                {displayName}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <TimeMachinePanel
            projectPath={projectPath}
            showHeader={false}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}
