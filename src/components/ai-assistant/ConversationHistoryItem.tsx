/**
 * ConversationHistoryItem - List item for conversation history
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 */

import { useState, useCallback } from 'react';
import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Dropdown, DropdownItem, DropdownSection } from '../ui/Dropdown';
import type { ConversationSummary } from '../../types/ai-assistant';

interface ConversationHistoryItemProps {
  /** Conversation data */
  conversation: ConversationSummary;
  /** Whether this conversation is selected */
  isSelected: boolean;
  /** Handler for selecting this conversation */
  onSelect: (id: string) => void;
  /** Handler for renaming the conversation */
  onRename: (id: string, newTitle: string) => void;
  /** Handler for deleting the conversation */
  onDelete: (id: string) => void;
  /** Whether actions are disabled */
  disabled?: boolean;
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Conversation history item component
 */
export function ConversationHistoryItem({
  conversation,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  disabled = false,
}: ConversationHistoryItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title || '');

  // Handle click to select conversation
  const handleClick = useCallback(() => {
    if (!disabled && !isEditing) {
      onSelect(conversation.id);
    }
  }, [conversation.id, disabled, isEditing, onSelect]);

  // Handle double-click to edit title
  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      setEditTitle(conversation.title || 'New Chat');
      setIsEditing(true);
    }
  }, [conversation.title, disabled]);

  // Handle title edit submission
  const handleEditSubmit = useCallback(() => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== conversation.title) {
      onRename(conversation.id, trimmedTitle);
    }
    setIsEditing(false);
  }, [conversation.id, conversation.title, editTitle, onRename]);

  // Handle keyboard events in edit mode
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, [handleEditSubmit]);

  // Handle rename from menu
  const handleRenameClick = useCallback(() => {
    setEditTitle(conversation.title || 'New Chat');
    setIsEditing(true);
  }, [conversation.title]);

  // Handle delete from menu
  const handleDeleteClick = useCallback(() => {
    onDelete(conversation.id);
  }, [conversation.id, onDelete]);

  const displayTitle = conversation.title || 'New Chat';
  const formattedDate = formatDate(conversation.updatedAt);

  return (
    <div
      className={cn(
        'group relative px-3 py-2 rounded-lg cursor-pointer',
        'transition-all duration-150',
        isSelected
          ? 'bg-primary/10 border border-primary/20'
          : 'hover:bg-accent border border-transparent',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-selected={isSelected}
      aria-label={`Conversation: ${displayTitle}`}
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 w-6 h-6 rounded-md',
            'flex items-center justify-center mt-0.5',
            isSelected ? 'bg-primary/20' : 'bg-muted/50'
          )}
        >
          <MessageSquare
            className={cn(
              'w-3.5 h-3.5',
              isSelected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={handleEditKeyDown}
              className={cn(
                'w-full px-1.5 py-0.5 -mx-1.5 -my-0.5',
                'text-sm font-medium',
                'bg-background border border-primary/40 rounded',
                'focus:outline-none focus:ring-1 focus:ring-primary'
              )}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <p className="text-sm font-medium text-foreground truncate">
              {displayTitle}
            </p>
          )}

          {/* Preview and date */}
          <div className="flex items-center gap-1 mt-0.5">
            {conversation.lastMessagePreview && (
              <p className="text-xs text-muted-foreground truncate flex-1">
                {conversation.lastMessagePreview}
              </p>
            )}
            <span className="text-xs text-muted-foreground/60 flex-shrink-0">
              {formattedDate}
            </span>
          </div>
        </div>

        {/* Action menu */}
        <div
          className={cn(
            'flex-shrink-0 opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150',
            isSelected && 'opacity-100'
          )}
        >
          <Dropdown
            trigger={
              <button
                className={cn(
                  'p-1 rounded hover:bg-background/80',
                  'text-muted-foreground hover:text-foreground',
                  'transition-colors duration-150',
                  'focus:outline-none focus:ring-1 focus:ring-ring'
                )}
                onClick={(e) => e.stopPropagation()}
                aria-label="Conversation options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
            align="right"
          >
            <DropdownSection>
              <DropdownItem
                icon={<Pencil className="w-4 h-4" />}
                onClick={handleRenameClick}
              >
                Rename
              </DropdownItem>
              <DropdownItem
                icon={<Trash2 className="w-4 h-4" />}
                onClick={handleDeleteClick}
                destructive
              >
                Delete
              </DropdownItem>
            </DropdownSection>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
