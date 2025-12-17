/**
 * AIAssistantSidebar - Collapsible sidebar for conversation history management
 * Feature: AI Assistant Tab (022-ai-assistant-tab)
 *
 * Enhanced design:
 * - Collapsible mode (240px expanded / 56px collapsed with icons)
 * - Search functionality
 * - Date-grouped conversations
 * - Improved visual design with gradient header
 * - Hover preview in collapsed mode
 */

import { useState, useCallback, useMemo } from 'react';
import { Plus, MessageSquare, Bot, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { DeleteConfirmDialog } from '../ui/ConfirmDialog';
import { ConversationHistoryItem } from './ConversationHistoryItem';
import type { ConversationSummary } from '../../types/ai-assistant';

interface AIAssistantSidebarProps {
  /** List of conversations */
  conversations: ConversationSummary[];
  /** Currently selected conversation ID */
  selectedId: string | null;
  /** Whether conversations are loading */
  isLoading: boolean;
  /** Whether there are more conversations to load */
  hasMore: boolean;
  /** Handler for creating a new conversation */
  onNewChat: () => void;
  /** Handler for selecting a conversation */
  onSelect: (conversationId: string) => void;
  /** Handler for renaming a conversation */
  onRename: (conversationId: string, title: string) => void;
  /** Handler for deleting a conversation */
  onDelete: (conversationId: string) => void;
  /** Handler for loading more conversations */
  onLoadMore: () => void;
  /** Whether the sidebar is collapsed */
  isCollapsed: boolean;
  /** Handler for toggling collapse state */
  onToggleCollapse: () => void;
  /** Optional class name */
  className?: string;
}

/** Group conversations by date */
function groupConversationsByDate(
  conversations: ConversationSummary[]
): Map<string, ConversationSummary[]> {
  const groups = new Map<string, ConversationSummary[]>();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    const convDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    let group: string;
    if (convDay.getTime() >= today.getTime()) {
      group = 'Today';
    } else if (convDay.getTime() >= yesterday.getTime()) {
      group = 'Yesterday';
    } else if (convDay.getTime() >= weekAgo.getTime()) {
      group = 'This Week';
    } else {
      group = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(conv);
  }

  return groups;
}

/**
 * Sidebar component for AI Assistant conversations
 */
export function AIAssistantSidebar({
  conversations,
  selectedId,
  isLoading,
  hasMore,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onLoadMore,
  isCollapsed,
  onToggleCollapse,
  className,
}: AIAssistantSidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (conv) =>
        conv.title?.toLowerCase().includes(query) ||
        conv.lastMessagePreview?.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Group filtered conversations by date
  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  // Handle delete button click
  const handleDeleteClick = useCallback(
    (conversationId: string) => {
      const conversation = conversations.find((c) => c.id === conversationId);
      if (conversation) {
        setConversationToDelete(conversation);
        setDeleteDialogOpen(true);
      }
    },
    [conversations]
  );

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    if (conversationToDelete) {
      const wasSelected = conversationToDelete.id === selectedId;
      onDelete(conversationToDelete.id);
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      // If the deleted conversation was selected, create a new chat
      if (wasSelected) {
        onNewChat();
      }
    }
  }, [conversationToDelete, onDelete, selectedId, onNewChat]);

  // Handle delete cancel
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  }, []);

  // Get hovered conversation for preview
  const hoveredConv = useMemo(
    () => conversations.find((c) => c.id === hoveredConvId),
    [conversations, hoveredConvId]
  );

  // Collapsed view
  if (isCollapsed) {
    return (
      <>
        <aside
          className={cn(
            'flex flex-col h-full',
            'bg-card/50 border-r border-border',
            'w-14 min-w-14',
            'transition-all duration-200',
            className
          )}
          role="complementary"
          aria-label="Conversation history (collapsed)"
        >
          {/* Header - Collapsed */}
          <div className="flex flex-col items-center gap-2 py-3 border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleCollapse}
              className="h-8 w-8"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={onNewChat}
              className="h-8 w-8"
              aria-label="New chat"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Conversation icons */}
          <div className="flex-1 overflow-y-auto py-2 space-y-1">
            {conversations.slice(0, 10).map((conv) => (
              <div
                key={conv.id}
                className="relative px-2"
                onMouseEnter={() => setHoveredConvId(conv.id)}
                onMouseLeave={() => setHoveredConvId(null)}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className={cn(
                    'w-10 h-10 rounded-lg',
                    'flex items-center justify-center',
                    'transition-colors duration-150',
                    conv.id === selectedId
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground border border-transparent'
                  )}
                  aria-label={conv.title || 'New Chat'}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>

                {/* Hover preview tooltip */}
                {hoveredConvId === conv.id && hoveredConv && (
                  <div
                    className={cn(
                      'absolute left-full top-0 ml-2 z-50',
                      'w-48 p-2 rounded-lg',
                      'bg-popover border border-border shadow-lg',
                      'animate-in fade-in-0 slide-in-from-left-2 duration-150'
                    )}
                  >
                    <p className="text-sm font-medium text-foreground truncate">
                      {hoveredConv.title || 'New Chat'}
                    </p>
                    {hoveredConv.lastMessagePreview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {hoveredConv.lastMessagePreview}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Delete confirmation dialog */}
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={handleDeleteCancel}
          itemType="conversation"
          itemName={conversationToDelete?.title || 'New Chat'}
          onConfirm={handleDeleteConfirm}
        />
      </>
    );
  }

  // Expanded view
  return (
    <>
      <aside
        className={cn(
          'flex flex-col h-full',
          'bg-card/50 border-r border-border',
          'w-60 min-w-60',
          'transition-all duration-200',
          className
        )}
        role="complementary"
        aria-label="Conversation history"
      >
        {/* Header - Enhanced with gradient */}
        <div
          className={cn(
            'relative px-3 py-3 border-b border-border',
            'bg-gradient-to-r from-purple-500/10 via-blue-500/5 to-transparent',
            'dark:from-purple-500/15 dark:via-blue-500/10 dark:to-transparent'
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-7 h-7 rounded-lg',
                  'bg-gradient-to-br from-purple-500/20 to-blue-500/10',
                  'border border-purple-500/20',
                  'flex items-center justify-center'
                )}
              >
                <Bot className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              </div>
              <span className="text-sm font-semibold text-foreground">AI Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewChat}
                className="h-7 w-7"
                aria-label="New chat"
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="h-7 w-7"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-2 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className={cn(
                'w-full h-8 pl-8 pr-8 text-xs',
                'bg-background border border-border rounded-lg',
                'placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
                'transition-colors'
              )}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && conversations.length === 0 ? (
            <div className="p-2">
              <ConversationListSkeleton />
            </div>
          ) : filteredConversations.length === 0 ? (
            searchQuery ? (
              <NoSearchResults query={searchQuery} onClear={() => setSearchQuery('')} />
            ) : (
              <EmptyState onNewChat={onNewChat} />
            )
          ) : (
            // Grouped conversation items
            <div className="py-1">
              {Array.from(groupedConversations.entries()).map(([group, convs]) => (
                <div key={group}>
                  {/* Date group header */}
                  <div
                    className={cn(
                      'sticky top-0 z-10',
                      'px-3 py-1.5',
                      'bg-card/95 backdrop-blur-sm',
                      'border-b border-border/50'
                    )}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group}
                    </span>
                  </div>

                  {/* Conversations in this group */}
                  <div className="p-1 space-y-0.5">
                    {convs.map((conversation) => (
                      <ConversationHistoryItem
                        key={conversation.id}
                        conversation={conversation}
                        isSelected={conversation.id === selectedId}
                        onSelect={onSelect}
                        onRename={onRename}
                        onDelete={handleDeleteClick}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Load more button */}
              {hasMore && (
                <div className="p-2">
                  <button
                    onClick={onLoadMore}
                    disabled={isLoading}
                    className={cn(
                      'w-full py-2 px-3',
                      'text-xs text-muted-foreground font-medium',
                      'hover:text-foreground hover:bg-accent',
                      'rounded-lg transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    {isLoading ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteCancel}
        itemType="conversation"
        itemName={conversationToDelete?.title || 'New Chat'}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}

/**
 * Loading skeleton for conversation list
 */
function ConversationListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-2 px-2 py-2 rounded-lg">
          <Skeleton className="w-7 h-7 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state when no conversations exist
 */
function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div
        className={cn(
          'w-14 h-14 rounded-2xl',
          'bg-gradient-to-br from-purple-500/15 to-blue-500/10',
          'border border-purple-500/20',
          'flex items-center justify-center',
          'mb-4'
        )}
      >
        <Bot className="w-7 h-7 text-purple-500/70" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
      <p className="text-xs text-muted-foreground mb-4">Start chatting with AI Assistant</p>
      <Button variant="default" size="sm" onClick={onNewChat} className="text-xs">
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        New Chat
      </Button>
    </div>
  );
}

/**
 * No search results state
 */
function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div
        className={cn(
          'w-12 h-12 rounded-xl',
          'bg-muted/50',
          'flex items-center justify-center',
          'mb-3'
        )}
      >
        <Search className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No results found</p>
      <p className="text-xs text-muted-foreground mb-3">No conversations match "{query}"</p>
      <Button variant="outline" size="sm" onClick={onClear} className="text-xs">
        Clear search
      </Button>
    </div>
  );
}
