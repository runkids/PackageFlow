/**
 * Terminal Selector Component
 * A dropdown to select and open different terminal applications
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, Check, ChevronDown } from 'lucide-react';
import { Dropdown, DropdownItem } from '../ui/Dropdown';
import { terminalAPI, TerminalDefinition } from '../../lib/tauri-api';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

interface TerminalSelectorProps {
  path: string;
  onOpenBuiltinTerminal?: () => void;
  className?: string;
  disabled?: boolean;
}

export const TerminalSelector: React.FC<TerminalSelectorProps> = ({
  path,
  onOpenBuiltinTerminal,
  className,
  disabled = false,
}) => {
  const [terminals, setTerminals] = useState<TerminalDefinition[]>([]);
  const [defaultTerminal, setDefaultTerminal] = useState<string>('builtin');
  const [isLoading, setIsLoading] = useState(true);

  // Load available terminals
  useEffect(() => {
    const loadTerminals = async () => {
      try {
        const response = await terminalAPI.getAvailableTerminals();
        if (response.success && response.terminals) {
          setTerminals(response.terminals);
          if (response.defaultTerminal) {
            setDefaultTerminal(response.defaultTerminal);
          }
        }
      } catch (error) {
        console.error('Failed to load terminals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTerminals();
  }, []);

  const handleOpenTerminal = useCallback(async (terminal: TerminalDefinition) => {
    if (terminal.isBuiltin) {
      // Use built-in terminal
      onOpenBuiltinTerminal?.();
      // Update default terminal preference
      await terminalAPI.setPreferredTerminal(terminal.id);
      setDefaultTerminal(terminal.id);
      return;
    }

    // Open external terminal
    try {
      const response = await terminalAPI.openInTerminal(path, terminal.id);
      if (response.success) {
        setDefaultTerminal(terminal.id);
      } else if (response.error) {
        console.error('Failed to open terminal:', response.error);
      }
    } catch (error) {
      console.error('Failed to open terminal:', error);
    }
  }, [path, onOpenBuiltinTerminal]);

  // Only show available terminals
  const availableTerminals = terminals.filter(t => t.isAvailable);

  const trigger = (
    <Button
      variant="ghost"
      size="sm"
      className={cn('gap-1 px-2', className)}
      title="Open Terminal"
      disabled={disabled || isLoading}
    >
      <Terminal className="w-4 h-4 text-muted-foreground" />
      <ChevronDown className="w-3 h-3 text-muted-foreground" />
    </Button>
  );

  if (isLoading) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-auto', className)}
        title="Loading terminals..."
        disabled
      >
        <Terminal className="w-4 h-4 text-muted-foreground animate-pulse" />
      </Button>
    );
  }

  return (
    <Dropdown trigger={trigger} align="right">
      {availableTerminals.map((terminal) => (
        <DropdownItem
          key={terminal.id}
          onClick={() => handleOpenTerminal(terminal)}
          icon={terminal.id === defaultTerminal ? <Check className="w-4 h-4" /> : <div className="w-4" />}
        >
          <span className="flex items-center gap-2">
            {terminal.name}
            {terminal.isBuiltin && (
              <span className="text-xs text-muted-foreground">(Built-in)</span>
            )}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
};

export default TerminalSelector;
