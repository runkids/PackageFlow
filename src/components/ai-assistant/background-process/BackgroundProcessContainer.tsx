/**
 * BackgroundProcessContainer - Integrated container for background process management
 * Feature: AI Assistant Background Process Management
 *
 * Combines BackgroundProcessPanel and BackgroundProcessOutputDialog
 * to provide a complete background process management experience
 */

import { useState, useCallback } from 'react';
import { BackgroundProcessPanel } from './BackgroundProcessPanel';
import { BackgroundProcessOutputDialog } from './BackgroundProcessOutputDialog';
import type { UseBackgroundProcessesReturn } from '../../../types/background-process';

interface BackgroundProcessContainerProps {
  /** Background processes hook return value */
  processManager: UseBackgroundProcessesReturn;
  /** Optional className for the panel */
  className?: string;
}

/**
 * Integrated container for background process UI
 * Use with useBackgroundProcesses hook:
 *
 * ```tsx
 * const processManager = useBackgroundProcesses();
 *
 * return (
 *   <div className="flex flex-col h-full">
 *     <ChatArea />
 *     <BackgroundProcessContainer processManager={processManager} />
 *   </div>
 * );
 * ```
 */
export function BackgroundProcessContainer({
  processManager,
  className,
}: BackgroundProcessContainerProps) {
  const {
    processes,
    selectedProcessId,
    panelState,
    setPanelState,
    selectProcess,
    stopProcess,
    stopAllProcesses,
    removeProcess,
    clearCompletedProcesses,
    getProcessById,
  } = processManager;

  // Output dialog state
  const [outputDialogProcessId, setOutputDialogProcessId] = useState<string | null>(null);

  // Open output dialog
  const handleViewFullOutput = useCallback((processId: string) => {
    setOutputDialogProcessId(processId);
  }, []);

  // Close output dialog
  const handleCloseOutputDialog = useCallback(() => {
    setOutputDialogProcessId(null);
  }, []);

  // Get process for output dialog
  const outputDialogProcess = outputDialogProcessId
    ? getProcessById(outputDialogProcessId)
    : null;

  // Handle stop from dialog
  const handleStopFromDialog = useCallback(
    async (processId: string): Promise<void> => {
      await stopProcess(processId);
    },
    [stopProcess]
  );

  return (
    <>
      {/* Process Panel */}
      <BackgroundProcessPanel
        processes={processes}
        selectedProcessId={selectedProcessId}
        panelState={panelState}
        onPanelStateChange={setPanelState}
        onSelectProcess={selectProcess}
        onStopProcess={stopProcess}
        onStopAllProcesses={stopAllProcesses}
        onRemoveProcess={removeProcess}
        onClearCompleted={clearCompletedProcesses}
        onViewFullOutput={handleViewFullOutput}
        className={className}
      />

      {/* Output Dialog */}
      {outputDialogProcess && (
        <BackgroundProcessOutputDialog
          process={outputDialogProcess}
          onClose={handleCloseOutputDialog}
          onStop={handleStopFromDialog}
        />
      )}
    </>
  );
}
