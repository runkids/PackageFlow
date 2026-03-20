import { useState } from 'react';
import { Command, Ellipsis } from 'lucide-react';
import { quickActionCommands, commandIconMap } from './skillshareCommands';

interface QuickActionsProps {
  onExecute: (command: string) => void;
  onOpenPalette: () => void;
}

export default function QuickActions({ onExecute, onOpenPalette }: QuickActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 relative">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="flex items-center p-1 text-pencil-light hover:text-pencil hover:bg-muted/30 rounded-[var(--radius-sm)] transition-colors"
          title="Quick actions"
        >
          <Ellipsis size={14} />
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              role="presentation"
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-paper border border-muted rounded-[var(--radius-md)] shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
              {quickActionCommands.map((cmd) => {
                const Icon = commandIconMap[cmd.icon];
                return (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => {
                      onExecute(cmd.command);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-pencil-light hover:text-pencil hover:bg-muted/30 transition-colors text-left"
                    title={cmd.description}
                  >
                    {Icon && <Icon size={12} />}
                    <span>{cmd.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <div className="w-px h-4 bg-muted/50 mx-1" />
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-pencil-light hover:text-pencil hover:bg-muted/30 rounded-[var(--radius-sm)] transition-colors"
        title="Command Palette (Cmd+K)"
      >
        <Command size={12} />
        <span className="text-[10px] opacity-60">K</span>
      </button>
    </div>
  );
}
