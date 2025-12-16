/**
 * Workflow Empty State Component
 * Displays a welcoming empty state when a workflow has no nodes
 */

import { Workflow, Plus, FileBox } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

interface WorkflowEmptyStateProps {
  onAddStep: () => void;
  onFromTemplate?: () => void;
}

/**
 * Empty state component for workflows with no nodes
 * Features:
 * - Gradient background icon with Workflow icon
 * - Clear title and description
 * - Primary "Add First Step" button
 * - Optional "Use Template" secondary button
 * - Keyboard shortcut hints
 * - Background dot pattern
 */
export function WorkflowEmptyState({ onAddStep, onFromTemplate }: WorkflowEmptyStateProps) {
  return (
    <EmptyState
      icon={Workflow}
      title="Start Your Workflow"
      description="Add your first step to begin automating tasks. You can run shell commands or trigger other workflows."
      variant="blue"
      showBackgroundPattern
      action={{
        label: 'Add First Step',
        icon: Plus,
        onClick: onAddStep,
      }}
      secondaryAction={
        onFromTemplate
          ? {
              label: 'Use Template',
              icon: FileBox,
              variant: 'outline',
              onClick: onFromTemplate,
            }
          : undefined
      }
      shortcuts={[
        { key: 'Cmd+N', label: 'Add step' },
        { key: 'Cmd+R', label: 'Run workflow' },
      ]}
    />
  );
}
