/**
 * AIActivityButton - Quick access button for AI Activity monitoring
 * Feature: AI Assistant Background Process Management
 *
 * Opens Settings at AI Activity section when clicked
 */

import React from 'react';
import { Activity } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

interface AIActivityButtonProps {
  /** Whether there are running activities */
  hasRunningActivities?: boolean;
  /** Handler to open settings at AI Activity section */
  onOpenSettings: () => void;
}

export const AIActivityButton: React.FC<AIActivityButtonProps> = ({
  hasRunningActivities = false,
  onOpenSettings,
}) => {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onOpenSettings}
      className="h-8 w-8 relative"
      aria-label="AI Activity"
      title="AI Activity"
    >
      <Activity
        className={cn(
          'w-4 h-4',
          hasRunningActivities ? 'text-purple-500' : 'text-muted-foreground'
        )}
      />
      {/* Running indicator */}
      {hasRunningActivities && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
      )}
    </Button>
  );
};

export default AIActivityButton;
