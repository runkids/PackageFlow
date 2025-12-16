// AI Assistant Components - Barrel Export
// Feature: AI Assistant Tab (022-ai-assistant-tab)
// Enhancement: Enhanced AI Chat Experience (023-enhanced-ai-chat)

// Phase 1 components (US1 - Basic Chat):
export { AIAssistantPage } from './AIAssistantPage';
export { ChatMessage } from './ChatMessage';
export { ChatInputArea } from './ChatInputArea';
export { StreamingIndicator } from './StreamingIndicator';
export { AIProviderNotConfiguredState } from './AIProviderNotConfiguredState';

// Phase 2 components (US2 - MCP Operations):
export { ActionConfirmationCard } from './ActionConfirmationCard';

// Phase 3 components (US3 - Quick Actions):
export { QuickActionChips, DEFAULT_QUICK_ACTIONS, GIT_QUICK_ACTIONS, PROJECT_QUICK_ACTIONS } from './QuickActionChips';

// Phase 4 components (US4 - History Management):
export { AIAssistantSidebar } from './AIAssistantSidebar';
export { ConversationHistoryItem } from './ConversationHistoryItem';

// Phase 5 components (US5 - Project Context):
export { ProjectContextCard, ProjectContextBadge } from './ProjectContextCard';

// Enhanced UI components (UI Redesign):
export { ConversationHeader } from './ConversationHeader';

// Feature 023: Enhanced AI Chat Experience
export { ResponseStatusIndicator, TimingBreakdown } from './ResponseStatusIndicator';
