/**
 * Git Commit Form - Commit message input and submit
 * @see specs/009-git-integration/tasks.md - T025
 * @see specs/020-ai-cli-integration/tasks.md - T023-T026
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, Loader2, ChevronDown, Sparkles, AlertCircle, X, Settings } from 'lucide-react';
import { useAICommitMessage, useAIService } from '../../../hooks/useAIService';

interface GitCommitFormProps {
  /** Whether there are staged changes */
  hasStagedChanges: boolean;
  /** Commit handler */
  onCommit: (message: string) => Promise<boolean>;
  /** Pre-filled commit message (for amend) */
  defaultMessage?: string;
  /** Loading state */
  isCommitting?: boolean;
  /** Project path for AI commit message generation */
  projectPath?: string;
  /** Callback to open AI settings */
  onOpenAISettings?: () => void;
}

// Conventional Commits templates
const COMMIT_TEMPLATES = [
  { id: 'feat', label: 'Feature', prefix: 'feat: ', description: 'A new feature' },
  { id: 'fix', label: 'Bug Fix', prefix: 'fix: ', description: 'A bug fix' },
  { id: 'docs', label: 'Documentation', prefix: 'docs: ', description: 'Documentation changes' },
  { id: 'style', label: 'Style', prefix: 'style: ', description: 'Code style changes' },
  { id: 'refactor', label: 'Refactor', prefix: 'refactor: ', description: 'Code refactoring' },
  { id: 'test', label: 'Test', prefix: 'test: ', description: 'Adding tests' },
  { id: 'chore', label: 'Chore', prefix: 'chore: ', description: 'Build/tooling changes' },
  { id: 'perf', label: 'Performance', prefix: 'perf: ', description: 'Performance improvement' },
];

export function GitCommitForm({
  hasStagedChanges,
  onCommit,
  defaultMessage = '',
  isCommitting = false,
  projectPath = '',
  onOpenAISettings,
}: GitCommitFormProps) {
  const [message, setMessage] = useState(defaultMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // AI commit message generation
  const aiCommit = useAICommitMessage({ projectPath });

  // Check if AI service is configured
  const { defaultService, isLoadingServices, loadServices } = useAIService({ autoLoad: true });

  // Handle AI commit message generation
  const handleAIGenerate = useCallback(async () => {
    if (!hasStagedChanges) return;

    const generatedMessage = await aiCommit.generate();
    if (generatedMessage) {
      setMessage(generatedMessage);
      setSelectedTemplate(null);
      // Focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [hasStagedChanges, aiCommit]);

  // Handle commit submission
  const handleSubmit = useCallback(async () => {
    if (!message.trim() || !hasStagedChanges || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const success = await onCommit(message.trim());
      if (success) {
        setMessage('');
        setSelectedTemplate(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [message, hasStagedChanges, isSubmitting, onCommit]);

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd+Enter or Ctrl+Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle template selection
  const handleSelectTemplate = (template: typeof COMMIT_TEMPLATES[0]) => {
    setSelectedTemplate(template.id);
    setMessage(template.prefix);
    setShowTemplates(false);
    // Focus textarea and move cursor to end
    setTimeout(() => {
      textareaRef.current?.focus();
      const length = template.prefix.length;
      textareaRef.current?.setSelectionRange(length, length);
    }, 0);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    };

    if (showTemplates) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTemplates]);

  const isDisabled = !hasStagedChanges || !message.trim() || isSubmitting || isCommitting;
  const currentTemplate = COMMIT_TEMPLATES.find((t) => t.id === selectedTemplate);

  return (
    <div className="bg-card rounded-lg p-4 space-y-3">
      {/* AI Error Alert */}
      {aiCommit.error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400">{aiCommit.error}</p>
          </div>
          <button
            onClick={aiCommit.clearError}
            className="flex-shrink-0 p-0.5 hover:bg-red-500/20 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      )}

      {/* Template Selector + AI Generate Button */}
      <div className="flex items-center gap-2">
        {/* Template Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-accent rounded text-sm transition-colors"
          >
            <span className="text-muted-foreground">
              {currentTemplate ? currentTemplate.label : 'Template'}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {/* Dropdown Menu */}
          {showTemplates && (
            <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-card border border-border rounded-lg shadow-xl z-10">
              {COMMIT_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelectTemplate(template)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent transition-colors ${
                    selectedTemplate === template.id ? 'bg-accent' : ''
                  }`}
                >
                  <div>
                    <div className="text-sm text-foreground">{template.label}</div>
                    <div className="text-xs text-muted-foreground">{template.description}</div>
                  </div>
                  <code className="text-xs text-muted-foreground font-mono">{template.prefix}</code>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AI Generate Button */}
        {projectPath && (
          <>
            {!isLoadingServices && !defaultService ? (
              // No default AI service configured - show setup prompt
              <button
                onClick={onOpenAISettings}
                title="Configure AI service to enable AI commit message generation"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent rounded text-sm transition-colors border border-border"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Setup AI</span>
              </button>
            ) : (
              // AI service configured - show generate button
              <button
                onClick={handleAIGenerate}
                disabled={!hasStagedChanges || aiCommit.isGenerating || isLoadingServices}
                title={!hasStagedChanges ? 'Stage files first' : 'Generate commit message with AI'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors border border-purple-500/30"
              >
                {aiCommit.isGenerating ? (
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-purple-400" />
                )}
                <span className="text-purple-400">
                  {aiCommit.isGenerating ? 'Generating...' : 'AI Generate'}
                </span>
              </button>
            )}
          </>
        )}

        {/* Tokens used indicator */}
        {aiCommit.tokensUsed !== null && (
          <span className="text-xs text-muted-foreground">
            {aiCommit.tokensUsed} tokens
          </span>
        )}
      </div>

      {/* Commit Message Input */}
      <div>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            hasStagedChanges
              ? 'Describe your changes (Cmd+Enter to commit)...'
              : 'Stage changes to commit...'
          }
          disabled={!hasStagedChanges || isCommitting}
          className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        {/* Character count */}
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-muted-foreground">
            {message.length > 0 && `${message.length} characters`}
          </span>
          {message.length > 50 && message.split('\n')[0].length > 50 && (
            <span className="text-xs text-yellow-500">
              Consider keeping the first line under 50 characters
            </span>
          )}
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {hasStagedChanges ? 'Ready to commit' : 'No staged changes'}
        </span>
        <button
          onClick={handleSubmit}
          disabled={isDisabled}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
        >
          {isSubmitting || isCommitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Commit
          <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 bg-green-700 rounded text-xs">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+↵
          </kbd>
        </button>
      </div>
    </div>
  );
}
