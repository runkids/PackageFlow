/**
 * ResponseStatusIndicator - Real-time status display for AI responses
 * Feature: Enhanced AI Chat Experience (023-enhanced-ai-chat)
 * User Story 4: Real-time Response Status Display
 *
 * Shows the current phase of AI response generation:
 * - Thinking: Processing request, no output yet (pulse animation)
 * - Generating: Streaming tokens (typing dots animation)
 * - Tool: Executing a tool call (bounce animation)
 * - Complete: Response finished (fade-out)
 * - Error: Something went wrong
 */

import { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Brain, Wrench, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import type { ResponseStatus, ResponsePhase } from '../../types/ai-assistant';

interface ResponseStatusIndicatorProps {
  /** Current response status */
  status: ResponseStatus | null;
  /** Additional class names */
  className?: string;
  /** Whether to show detailed timing on hover */
  showTiming?: boolean;
}

/**
 * Typing dots animation for generating state (T090)
 */
function TypingDots() {
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            'bg-current',
            'animate-[typing_1.4s_ease-in-out_infinite]'
          )}
          style={{
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-3px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Visual indicator showing the current phase of AI response generation
 */
export function ResponseStatusIndicator({
  status,
  className,
  showTiming = true,
}: ResponseStatusIndicatorProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  // Auto-hide complete status after delay
  useEffect(() => {
    if (status?.phase === 'complete') {
      setFadeOut(false);
      const fadeTimer = setTimeout(() => setFadeOut(true), 800);
      const hideTimer = setTimeout(() => setIsVisible(false), 1200);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    } else if (status?.phase === 'idle') {
      setIsVisible(false);
    } else {
      setIsVisible(true);
      setFadeOut(false);
    }
  }, [status?.phase]);

  // Don't render if no status or not visible
  if (!status || !isVisible || status.phase === 'idle') {
    return null;
  }

  const phaseConfig = getPhaseConfig(status.phase, status.toolName);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-3.5 py-2',
        'rounded-xl',
        'text-sm',
        'transition-all duration-300',
        // Phase-specific backgrounds
        status.phase === 'thinking' && 'bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400',
        status.phase === 'generating' && 'bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400',
        status.phase === 'tool' && 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400',
        status.phase === 'complete' && 'bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400',
        status.phase === 'error' && 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400',
        fadeOut && 'opacity-0 translate-y-1',
        className
      )}
      role="status"
      aria-live="polite"
    >
      {/* Animated icon with glow effect */}
      <div className={cn(
        'flex-shrink-0 p-1 rounded-lg',
        status.phase === 'thinking' && 'bg-purple-500/20',
        status.phase === 'generating' && 'bg-blue-500/20',
        status.phase === 'tool' && 'bg-amber-500/20',
        status.phase === 'complete' && 'bg-green-500/20',
        status.phase === 'error' && 'bg-red-500/20',
      )}>
        {phaseConfig.icon}
      </div>

      {/* Status text */}
      <span className="font-medium">{phaseConfig.label}</span>

      {/* Model badge during generating (T097) */}
      {status.phase === 'generating' && status.model && (
        <span className="flex items-center gap-1.5 text-xs opacity-70 ml-1 px-2 py-0.5 bg-background/50 rounded-full">
          <Sparkles className="w-3 h-3" />
          <span className="truncate max-w-[100px]">{status.model}</span>
        </span>
      )}

      {/* Timing display on complete */}
      {showTiming && status.timing && status.phase === 'complete' && (
        <TimingTooltip timing={status.timing} model={status.model} />
      )}
    </div>
  );
}

/**
 * Get configuration for each phase (T089-T092)
 */
function getPhaseConfig(phase: ResponsePhase, toolName?: string) {
  switch (phase) {
    case 'thinking':
      // T089: Pulse animation for thinking
      return {
        icon: <Brain className="w-4 h-4 animate-pulse" />,
        label: 'Thinking...',
        iconClass: 'text-purple-500',
      };
    case 'generating':
      // T090: Typing dots animation for generating
      return {
        icon: <TypingDots />,
        label: 'Generating',
        iconClass: 'text-blue-500',
      };
    case 'tool':
      // T091: Bounce animation for tool
      return {
        icon: <Wrench className="w-4 h-4 animate-bounce" />,
        label: toolName ? `Using ${toolName}...` : 'Using tool...',
        iconClass: 'text-amber-500',
      };
    case 'complete':
      // T092: Check mark (fade-out handled by parent)
      return {
        icon: <CheckCircle2 className="w-4 h-4" />,
        label: 'Complete',
        iconClass: 'text-green-500',
      };
    case 'error':
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        label: 'Error',
        iconClass: 'text-red-500',
      };
    default:
      return {
        icon: null,
        label: '',
        iconClass: '',
      };
  }
}

/**
 * Timing tooltip showing detailed breakdown (T093-T096)
 */
interface TimingTooltipProps {
  timing: NonNullable<ResponseStatus['timing']>;
  model?: string;
}

function TimingTooltip({ timing, model }: TimingTooltipProps) {
  const [showDetails, setShowDetails] = useState(false);

  const formatMs = (ms?: number) => {
    if (ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className="relative ml-1"
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
    >
      {/* Total time display */}
      <span className="text-xs text-muted-foreground/60 cursor-help">
        ({formatMs(timing.totalMs)})
      </span>

      {/* Detailed tooltip on hover */}
      {showDetails && (
        <div
          className={cn(
            'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
            'px-3 py-2 rounded-lg',
            'bg-popover border border-border shadow-lg',
            'text-xs text-foreground',
            'whitespace-nowrap z-50',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
        >
          {/* T096: Model name */}
          {model && (
            <div className="flex items-center justify-between gap-4 mb-1.5 pb-1.5 border-b border-border/50">
              <span className="text-muted-foreground">Model:</span>
              <span className="font-medium">{model}</span>
            </div>
          )}
          {/* T094: Thinking duration */}
          {timing.thinkingMs !== undefined && timing.thinkingMs > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Thinking:</span>
              <span className="font-mono">{formatMs(timing.thinkingMs)}</span>
            </div>
          )}
          {/* T095: Generating duration */}
          {timing.generatingMs !== undefined && timing.generatingMs > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Generating:</span>
              <span className="font-mono">{formatMs(timing.generatingMs)}</span>
            </div>
          )}
          {/* Tool duration */}
          {timing.toolMs !== undefined && timing.toolMs > 0 && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Tool:</span>
              <span className="font-mono">{formatMs(timing.toolMs)}</span>
            </div>
          )}
          {/* T096: Total duration */}
          {timing.totalMs !== undefined && (
            <div className="flex items-center justify-between gap-4 mt-1.5 pt-1.5 border-t border-border/50">
              <span className="text-muted-foreground font-medium">Total:</span>
              <span className="font-mono font-medium">{formatMs(timing.totalMs)}</span>
            </div>
          )}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-popover" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Detailed timing breakdown for expanded view or tooltip
 */
interface TimingBreakdownProps {
  timing: NonNullable<ResponseStatus['timing']>;
  model?: string;
  className?: string;
}

export function TimingBreakdown({ timing, model, className }: TimingBreakdownProps) {
  const formatMs = (ms?: number) => {
    if (ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-1 text-xs text-muted-foreground',
        className
      )}
    >
      {model && (
        <div className="flex items-center justify-between gap-4">
          <span>Model:</span>
          <span className="font-medium">{model}</span>
        </div>
      )}
      {timing.thinkingMs !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <span>Thinking:</span>
          <span className="font-mono">{formatMs(timing.thinkingMs)}</span>
        </div>
      )}
      {timing.generatingMs !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <span>Generating:</span>
          <span className="font-mono">{formatMs(timing.generatingMs)}</span>
        </div>
      )}
      {timing.toolMs !== undefined && (
        <div className="flex items-center justify-between gap-4">
          <span>Tool execution:</span>
          <span className="font-mono">{formatMs(timing.toolMs)}</span>
        </div>
      )}
      {timing.totalMs !== undefined && (
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-border/50">
          <span className="font-medium">Total:</span>
          <span className="font-mono font-medium">{formatMs(timing.totalMs)}</span>
        </div>
      )}
    </div>
  );
}
