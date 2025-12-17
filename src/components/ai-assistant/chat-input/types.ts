/**
 * Types for Chat Input components
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 */

export interface Attachment {
  id: string;
  name: string;
  type: 'file' | 'code' | 'image';
  content?: string;
  size?: number;
}

export interface ChatInputContainerProps {
  /** Current input value */
  value: string;
  /** Handler for input changes */
  onChange: (value: string) => void;
  /** Handler for send action */
  onSend: () => void;
  /** Handler for stop action */
  onStop?: () => void;
  /** Whether AI is currently generating */
  isGenerating?: boolean;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
  /** Optional attachments */
  attachments?: Attachment[];
  /** Handler for adding attachments */
  onAddAttachment?: (type: 'file' | 'code') => void;
  /** Handler for removing attachments */
  onRemoveAttachment?: (id: string) => void;
  /** Maximum character count (optional) */
  maxLength?: number;
  /** Show character count */
  showCharCount?: boolean;
  /** Show quick commands hint */
  showQuickCommands?: boolean;
  /** Handler for quick command trigger (e.g., @, /) */
  onQuickCommand?: (command: string) => void;
  /** Additional class name */
  className?: string;
}
