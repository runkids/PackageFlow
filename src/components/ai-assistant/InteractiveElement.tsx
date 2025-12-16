/**
 * InteractiveElement - Renders interactive elements in AI responses
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 * User Story 3: Interactive Response Elements
 *
 * Renders three types of interactive elements:
 * - NavigationButton: Triggers navigation event
 * - ActionChip: Triggers a prompt/action in the chat
 * - EntityLink: Opens entity details (project, workflow, etc.)
 */

import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '../../lib/utils';
import { ExternalLink, Play, FolderOpen, Workflow } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

/** Interactive element type from backend */
export type InteractiveElementType = 'Navigation' | 'Action' | 'Entity';

/** Interactive element from backend parsing */
export interface InteractiveElementData {
  id: string;
  type: InteractiveElementType;
  label: string;
  payload: string;
  requiresConfirm: boolean;
  startIndex: number;
  endIndex: number;
}

interface InteractiveElementProps {
  /** Element data from backend */
  element: InteractiveElementData;
  /** Handler for action type elements */
  onAction?: (prompt: string) => void;
  /** Handler for navigation (tab name) */
  onNavigate?: (route: string) => void;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Renders an interactive element based on its type
 */
export function InteractiveElement({
  element,
  onAction,
  onNavigate,
  className,
}: InteractiveElementProps) {
  switch (element.type) {
    case 'Navigation':
      return <NavigationButton element={element} onNavigate={onNavigate} className={className} />;
    case 'Action':
      return <ActionChip element={element} onAction={onAction} className={className} />;
    case 'Entity':
      return <EntityLink element={element} onNavigate={onNavigate} className={className} />;
    default:
      // Fallback: render as plain text
      return <span className={className}>{element.label}</span>;
  }
}

// ============================================================================
// Subcomponents (T074-T076)
// ============================================================================

/**
 * NavigationButton - Triggers navigation event (T074)
 */
function NavigationButton({
  element,
  onNavigate,
  className,
}: {
  element: InteractiveElementData;
  onNavigate?: (route: string) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    // Payload contains the route path
    if (onNavigate) {
      onNavigate(element.payload);
    }
  }, [onNavigate, element.payload]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-sm font-medium',
        'bg-primary/10 text-primary rounded-md',
        'hover:bg-primary/20 transition-colors',
        'border border-primary/20',
        className
      )}
      aria-label={`Navigate to ${element.label}`}
    >
      <ExternalLink className="w-3.5 h-3.5" />
      <span>{element.label}</span>
    </button>
  );
}

/**
 * ActionChip - Triggers a prompt/action in the chat (T075)
 */
function ActionChip({
  element,
  onAction,
  className,
}: {
  element: InteractiveElementData;
  onAction?: (prompt: string) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    // Payload contains the prompt to send
    if (onAction) {
      onAction(element.payload);
    }
  }, [onAction, element.payload]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-sm font-medium',
        'bg-accent text-accent-foreground rounded-md',
        'hover:bg-accent/80 transition-colors',
        'border border-border',
        className
      )}
      aria-label={`Action: ${element.label}`}
    >
      <Play className="w-3.5 h-3.5" />
      <span>{element.label}</span>
    </button>
  );
}

/**
 * EntityLink - Opens entity details (T076)
 * Payload format: "type:id" (e.g., "project:abc123", "workflow:xyz789")
 */
function EntityLink({
  element,
  onNavigate,
  className,
}: {
  element: InteractiveElementData;
  onNavigate?: (route: string) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    // Parse payload: "type:id"
    const [entityType, entityId] = element.payload.split(':');

    // Navigate based on entity type
    if (onNavigate) {
      switch (entityType) {
        case 'project':
          onNavigate(`project-manager?id=${entityId}`);
          break;
        case 'workflow':
          onNavigate(`workflow?id=${entityId}`);
          break;
        default:
          // Emit event for unknown entity types
          invoke('ai_assistant_execute_lazy_action', {
            action: {
              actionType: 'Navigate',
              payload: element.payload,
            },
          }).catch(console.error);
      }
    }
  }, [onNavigate, element.payload]);

  // Get icon based on entity type
  const [entityType] = element.payload.split(':');
  const Icon = entityType === 'workflow' ? Workflow : FolderOpen;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-sm font-medium',
        'bg-muted text-foreground rounded-md',
        'hover:bg-muted/80 transition-colors',
        'border border-border',
        'underline decoration-dotted underline-offset-2',
        className
      )}
      aria-label={`View ${element.label}`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{element.label}</span>
    </button>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse interactive elements from backend response
 */
export async function parseInteractiveElements(
  content: string
): Promise<{ elements: InteractiveElementData[]; cleanContent: string }> {
  try {
    const response = await invoke<{
      elements: InteractiveElementData[];
      cleanContent: string;
    }>('ai_assistant_parse_interactive', { content });
    return response;
  } catch (error) {
    console.error('Failed to parse interactive elements:', error);
    return { elements: [], cleanContent: content };
  }
}

/**
 * Render content with interactive elements replaced
 * Returns an array of React nodes (strings and InteractiveElement components)
 */
export function renderContentWithElements(
  content: string,
  elements: InteractiveElementData[],
  onAction?: (prompt: string) => void,
  onNavigate?: (route: string) => void
): React.ReactNode[] {
  if (elements.length === 0) {
    return [content];
  }

  const result: React.ReactNode[] = [];
  let lastIndex = 0;

  // Sort elements by start index
  const sortedElements = [...elements].sort((a, b) => a.startIndex - b.startIndex);

  for (const element of sortedElements) {
    // Add text before this element
    if (element.startIndex > lastIndex) {
      result.push(content.slice(lastIndex, element.startIndex));
    }

    // Add the interactive element
    result.push(
      <InteractiveElement
        key={element.id}
        element={element}
        onAction={onAction}
        onNavigate={onNavigate}
      />
    );

    lastIndex = element.endIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex));
  }

  return result;
}
