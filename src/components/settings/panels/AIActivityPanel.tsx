/**
 * AI Activity Panel
 * Standalone panel for viewing AI assistant and MCP tool execution history
 */

import React from 'react';
import { UnifiedActivityLog } from '../mcp/UnifiedActivityLog';

interface AIActivityPanelProps {
  onExport?: () => void;
  onImport?: () => void;
}

export const AIActivityPanel: React.FC<AIActivityPanelProps> = () => {
  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0">
        <h2 className="text-xl font-semibold text-foreground">AI Activity</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor AI assistant interactions and MCP tool executions
        </p>
      </div>

      {/* Activity Timeline - full height without maxHeight restriction */}
      <div className="flex-1 min-h-0">
        <UnifiedActivityLog className="h-full" maxHeight="calc(100vh - 280px)" />
      </div>
    </div>
  );
};

export default AIActivityPanel;
