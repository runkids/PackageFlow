/**
 * QuickSetupSection Component
 * AI client setup instructions section
 */

import React, { useState, useCallback } from 'react';
import { Terminal, Settings2, Copy, Check, ChevronDown, ExternalLink, Bot } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { openUrl } from '../../../lib/tauri-api';

interface QuickSetupSectionProps {
  /** Server binary path */
  binaryPath: string;
  /** JSON configuration for clients */
  configJson: string;
  /** TOML configuration for clients */
  configToml: string;
  /** Whether the section is disabled */
  disabled?: boolean;
  /** Additional class name */
  className?: string;
}

type CopyState = 'idle' | 'copied';

interface ClientConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  command?: string;
  configFormat: 'json' | 'toml';
  steps: string[];
  docsUrl?: string;
}

const CLIENT_CONFIGS: ClientConfig[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    icon: <Bot className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Run the command below in your terminal',
      'Restart Claude Code to apply changes',
    ],
    docsUrl: 'https://docs.anthropic.com/claude-code',
  },
  {
    id: 'vscode',
    name: 'VS Code (Continue / Cline)',
    icon: <Settings2 className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Open your MCP extension settings',
      'Find the MCP servers configuration',
      'Paste the JSON configuration below',
      'Reload the window',
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    icon: <Terminal className="w-4 h-4" />,
    configFormat: 'toml',
    steps: [
      'Run the command below in your terminal',
      'Or manually add to ~/.codex/config.toml',
      'Restart Codex to apply changes',
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    icon: <Terminal className="w-4 h-4" />,
    configFormat: 'json',
    steps: [
      'Run the command below in your terminal',
      'Or manually add to ~/.gemini/settings.json',
      'Restart Gemini CLI to apply changes',
    ],
  },
];

/** Copy button component */
const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label = 'Copy' }) => {
  const [state, setState] = useState<CopyState>('idle');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text]);

  return (
    <Button
      variant="ghost"
      onClick={handleCopy}
      className={cn(
        'h-auto px-2.5 py-1.5 text-xs',
        state === 'copied'
          ? 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20'
          : 'bg-primary/10 text-primary hover:bg-primary/20'
      )}
    >
      {state === 'copied' ? (
        <>
          <Check className="w-3.5 h-3.5" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
};

/** Command line display */
const CommandLine: React.FC<{ command: string }> = ({ command }) => (
  <div className="flex items-center gap-2 p-2.5 bg-muted/50 border border-border rounded-lg">
    <code className="flex-1 text-xs font-mono text-foreground truncate">$ {command}</code>
    <CopyButton text={command} label="Copy" />
  </div>
);

/** Code block display */
const CodeBlock: React.FC<{ code: string; label: string }> = ({ code, label }) => (
  <div className="relative group">
    <pre className="text-xs font-mono p-3 rounded-lg overflow-x-auto bg-muted/50 border border-border max-h-32">
      <code className="text-foreground whitespace-pre">{code}</code>
    </pre>
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <CopyButton text={code} label={label} />
    </div>
  </div>
);

/** Single client setup card */
const ClientSetupCard: React.FC<{
  client: ClientConfig;
  binaryPath: string;
  configJson: string;
  configToml: string;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ client, binaryPath, configJson, configToml, isExpanded, onToggle }) => {
  // Generate command based on client type
  const getCommand = (): string | undefined => {
    switch (client.id) {
      case 'claude-code':
        return `claude mcp add packageflow ${binaryPath}`;
      case 'codex':
        return `codex mcp add packageflow ${binaryPath}`;
      case 'gemini':
        return `gemini mcp add packageflow ${binaryPath}`;
      default:
        return undefined;
    }
  };

  const command = getCommand();
  const config = client.configFormat === 'json' ? configJson : configToml;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 p-3',
          'hover:bg-muted/50 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
        )}
      >
        <span className="text-muted-foreground">{client.icon}</span>
        <span className="flex-1 text-left font-medium text-foreground">{client.name}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-border bg-muted/20">
          {/* Steps */}
          <ol className="space-y-1.5 text-xs text-muted-foreground pt-3">
            {client.steps.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="w-4 h-4 shrink-0 flex items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {/* Command (if available) */}
          {command && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Quick Command</label>
              <CommandLine command={command} />
            </div>
          )}

          {/* Configuration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              {client.configFormat === 'json' ? 'JSON Configuration' : 'TOML Configuration'}
            </label>
            <CodeBlock
              code={config}
              label={`Copy ${client.configFormat.toUpperCase()}`}
            />
          </div>

          {/* Docs link */}
          {client.docsUrl && (
            <button
              onClick={() => openUrl(client.docsUrl!)}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs text-primary hover:underline'
              )}
            >
              <ExternalLink className="w-3 h-3" />
              <span>View documentation</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const QuickSetupSection: React.FC<QuickSetupSectionProps> = ({
  binaryPath,
  configJson,
  configToml,
  disabled = false,
  className,
}) => {
  const [expandedClient, setExpandedClient] = useState<string | null>('claude-code');

  return (
    <div className={cn('space-y-3', disabled && 'opacity-50 pointer-events-none', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Choose your AI assistant</span>
        <span className="text-xs text-muted-foreground">
          ({CLIENT_CONFIGS.length} clients)
        </span>
      </div>

      {/* Client Setup Cards */}
      <div className="space-y-2">
        {CLIENT_CONFIGS.map((client) => (
          <ClientSetupCard
            key={client.id}
            client={client}
            binaryPath={binaryPath}
            configJson={configJson}
            configToml={configToml}
            isExpanded={expandedClient === client.id}
            onToggle={() =>
              setExpandedClient(expandedClient === client.id ? null : client.id)
            }
          />
        ))}
      </div>
    </div>
  );
};

export default QuickSetupSection;
