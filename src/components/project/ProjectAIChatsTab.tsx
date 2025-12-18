/**
 * ProjectAIChatsTab - Display AI conversations for a specific project
 * Allows navigation to AI Assistant page with selected conversation
 */

import { useMemo, useState, useCallback } from 'react';
import { MessageSquare, Bot, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { DeleteConfirmDialog } from '../ui/ConfirmDialog';
import { ConversationHistoryItem } from '../ai-assistant/ConversationHistoryItem';
import { useConversations } from '../../hooks/useConversations';
import type { ConversationSummary } from '../../types/ai-assistant';

interface ProjectAIChatsTabProps {
  /** Project path to filter conversations */
  projectPath: string;
  /** Handler to open a conversation in AI Assistant page */
  onOpenConversation: (conversationId: string, projectPath: string) => void;
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
 * Project AI Chats Tab component
 */
export function ProjectAIChatsTab({
  projectPath,
  onOpenConversation,
}: ProjectAIChatsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<ConversationSummary | null>(
    null
  );

  // Fetch conversations for this project
  const {
    conversations,
    isLoading,
    hasMore,
    loadMore,
    renameConversation,
    deleteConversation,
    refresh,
  } = useConversations({
    projectPath,
    autoFetch: true,
    initialLimit: 20,
  });

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

  // Handle conversation click - navigate to AI Assistant
  const handleSelect = useCallback(
    (conversationId: string) => {
      onOpenConversation(conversationId, projectPath);
    },
    [onOpenConversation, projectPath]
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
  const handleDeleteConfirm = useCallback(async () => {
    if (conversationToDelete) {
      await deleteConversation(conversationToDelete.id);
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
      refresh();
    }
  }, [conversationToDelete, deleteConversation, refresh]);

  // Handle delete cancel
  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false);
    setConversationToDelete(null);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-8 h-8 rounded-lg',
              'bg-gradient-to-br from-purple-500/20 to-blue-500/10',
              'border border-purple-500/20',
              'flex items-center justify-center'
            )}
          >
            <MessageSquare className="w-4 h-4 text-purple-500 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Conversations</h3>
            <p className="text-xs text-muted-foreground">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} for this
              project
            </p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border">
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
          <div className="p-4">
            <ConversationListSkeleton />
          </div>
        ) : filteredConversations.length === 0 ? (
          searchQuery ? (
            <NoSearchResults query={searchQuery} onClear={() => setSearchQuery('')} />
          ) : (
            <EmptyState />
          )
        ) : (
          // Grouped conversation items
          <div className="py-2">
            {Array.from(groupedConversations.entries()).map(([group, convs]) => (
              <div key={group}>
                {/* Date group header */}
                <div
                  className={cn(
                    'sticky top-0 z-10',
                    'px-4 py-1.5',
                    'bg-card/95 backdrop-blur-sm',
                    'border-b border-border/50'
                  )}
                >
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group}
                  </span>
                </div>

                {/* Conversations in this group */}
                <div className="p-2 space-y-1">
                  {convs.map((conversation) => (
                    <ConversationHistoryItem
                      key={conversation.id}
                      conversation={conversation}
                      isSelected={false}
                      onSelect={handleSelect}
                      onRename={renameConversation}
                      onDelete={handleDeleteClick}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more button */}
            {hasMore && (
              <div className="p-4">
                <button
                  onClick={loadMore}
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

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteCancel}
        itemType="conversation"
        itemName={conversationToDelete?.title || 'New Chat'}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

/**
 * Loading skeleton for conversation list
 */
function ConversationListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg">
          <Skeleton className="w-6 h-6 rounded-md flex-shrink-0" />
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
 * Empty state when no conversations exist for this project
 */
function EmptyState() {
  return (
    <div
      className="relative flex flex-col items-center justify-center py-16 px-4 text-center h-full min-h-[300px]"
      style={{
        backgroundImage:
          'radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <div
        className={cn(
          'w-16 h-16 rounded-2xl',
          'bg-gradient-to-br from-purple-500/15 to-blue-500/10',
          'border border-purple-500/20',
          'flex items-center justify-center',
          'mb-4'
        )}
      >
        <Bot className="w-8 h-8 text-purple-500/70" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
      <p className="text-xs text-muted-foreground">
        Start chatting with AI Assistant about this project
      </p>
    </div>
  );
}

/**
 * No search results state
 */
function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className={cn(
          'w-14 h-14 rounded-xl',
          'bg-muted/50',
          'flex items-center justify-center',
          'mb-3'
        )}
      >
        <Search className="w-7 h-7 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">No results found</p>
      <p className="text-xs text-muted-foreground mb-3">No conversations match "{query}"</p>
      <Button variant="outline" size="sm" onClick={onClear} className="text-xs">
        Clear search
      </Button>
    </div>
  );
}
