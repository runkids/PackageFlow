/**
 * ToolchainDiagnostics Component
 * Feature: 017-toolchain-conflict-detection
 *
 * Displays environment diagnostics for Node.js toolchain
 */

import * as React from 'react';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FolderOpen,
  Info,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { isTopModal, registerModal, unregisterModal } from '../ui/modalStack';
import { Button } from '../ui/Button';
import type { EnvironmentDiagnostics } from '../../types/toolchain';

interface ToolchainDiagnosticsProps {
  isOpen: boolean;
  onClose: () => void;
  diagnostics: EnvironmentDiagnostics | null;
  isLoading?: boolean;
}

interface StatusIconProps {
  available: boolean;
  enabled?: boolean;
}

const StatusIcon: React.FC<StatusIconProps> = ({ available, enabled }) => {
  if (!available) {
    return <XCircle className="w-4 h-4 text-red-400" />;
  }
  if (enabled === false) {
    return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  }
  return <CheckCircle2 className="w-4 h-4 text-green-400" />;
};

interface InfoRowProps {
  label: string;
  value: string | undefined;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
    <span
      className={cn(
        'text-sm text-foreground text-right break-all',
        mono && 'font-mono text-xs bg-muted/50 px-2 py-0.5 rounded'
      )}
    >
      {value || '-'}
    </span>
  </div>
);

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
  <div className="rounded-lg border border-border bg-card/30 overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 bg-muted/80 dark:bg-muted/50 border-b border-border backdrop-blur-sm">
      {icon}
      <span className="text-sm font-medium text-foreground">{title}</span>
    </div>
    <div className="px-4 py-2 divide-y divide-border/50">{children}</div>
  </div>
);

export const ToolchainDiagnostics: React.FC<ToolchainDiagnosticsProps> = ({
  isOpen,
  onClose,
  diagnostics,
  isLoading = false,
}) => {
  const modalId = React.useId();
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Register/unregister modal
  React.useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Handle ESC key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isTopModal(modalId)) return;
      e.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalId, isOpen, onClose]);

  // Focus content area when opened
  React.useEffect(() => {
    if (isOpen && contentRef.current) {
      const timer = setTimeout(() => {
        contentRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={cn('fixed inset-0 z-50', 'animate-in fade-in-0 duration-200')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="toolchain-diagnostics-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-2xl max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-cyan-500/30',
            'shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95 duration-200',
            'slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5',
              'border-b border-border',
              'bg-gradient-to-r',
              'dark:from-cyan-500/15 dark:via-cyan-600/5 dark:to-transparent',
              'from-cyan-500/10 via-cyan-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute right-4 top-4"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </Button>

            {/* Title area with icon badge */}
            <div className="flex items-start gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border border-cyan-500/20',
                  'bg-cyan-500/10',
                  'shadow-lg'
                )}
              >
                <Terminal className="w-6 h-6 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2
                  id="toolchain-diagnostics-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  Environment Diagnostics
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Node.js toolchain environment analysis
                </p>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto min-h-0 p-6 focus:outline-none"
            tabIndex={-1}
          >
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Analyzing environment...
                </span>
              </div>
            ) : diagnostics ? (
              <div className="space-y-4">
                {/* Volta Section */}
                <Section
                  title="Volta"
                  icon={<StatusIcon available={diagnostics.volta.available} />}
                >
                  <InfoRow
                    label="Status"
                    value={
                      diagnostics.volta.available ? 'Installed' : 'Not Installed'
                    }
                  />
                  {diagnostics.volta.available && (
                    <>
                      <InfoRow label="Version" value={diagnostics.volta.version} />
                      <InfoRow label="Path" value={diagnostics.volta.path} mono />
                      <InfoRow
                        label="Shim Path"
                        value={diagnostics.volta.shim_path}
                        mono
                      />
                    </>
                  )}
                </Section>

                {/* Corepack Section */}
                <Section
                  title="Corepack"
                  icon={
                    <StatusIcon
                      available={diagnostics.corepack.available}
                      enabled={diagnostics.corepack.enabled}
                    />
                  }
                >
                  <InfoRow
                    label="Status"
                    value={
                      diagnostics.corepack.available
                        ? 'Installed'
                        : 'Not Installed'
                    }
                  />
                  {diagnostics.corepack.available && (
                    <>
                      <InfoRow
                        label="Enabled"
                        value={diagnostics.corepack.enabled ? 'Yes' : 'No'}
                      />
                      <InfoRow
                        label="Version"
                        value={diagnostics.corepack.version}
                      />
                      <InfoRow
                        label="Path"
                        value={diagnostics.corepack.path}
                        mono
                      />
                    </>
                  )}
                </Section>

                {/* System Node Section */}
                <Section
                  title="System Node.js"
                  icon={
                    <StatusIcon available={!!diagnostics.system_node.version} />
                  }
                >
                  <InfoRow
                    label="Version"
                    value={diagnostics.system_node.version}
                  />
                  <InfoRow
                    label="Path"
                    value={diagnostics.system_node.path}
                    mono
                  />
                </Section>

                {/* Package Managers Section */}
                <Section
                  title="Package Managers"
                  icon={<FolderOpen className="w-4 h-4 text-cyan-400" />}
                >
                  <InfoRow
                    label="npm"
                    value={
                      diagnostics.package_managers.npm
                        ? `${diagnostics.package_managers.npm.version}`
                        : 'Not Installed'
                    }
                  />
                  {diagnostics.package_managers.npm?.path && (
                    <InfoRow
                      label="npm Path"
                      value={diagnostics.package_managers.npm.path}
                      mono
                    />
                  )}
                  <InfoRow
                    label="pnpm"
                    value={
                      diagnostics.package_managers.pnpm
                        ? `${diagnostics.package_managers.pnpm.version}`
                        : 'Not Installed'
                    }
                  />
                  {diagnostics.package_managers.pnpm?.path && (
                    <InfoRow
                      label="pnpm Path"
                      value={diagnostics.package_managers.pnpm.path}
                      mono
                    />
                  )}
                  <InfoRow
                    label="yarn"
                    value={
                      diagnostics.package_managers.yarn
                        ? `${diagnostics.package_managers.yarn.version}`
                        : 'Not Installed'
                    }
                  />
                  {diagnostics.package_managers.yarn?.path && (
                    <InfoRow
                      label="yarn Path"
                      value={diagnostics.package_managers.yarn.path}
                      mono
                    />
                  )}
                </Section>

                {/* PATH Analysis Section */}
                <Section
                  title="PATH Order Analysis"
                  icon={<Info className="w-4 h-4 text-cyan-400" />}
                >
                  {diagnostics.path_analysis.volta_first &&
                    diagnostics.path_analysis.corepack_first && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 my-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 dark:text-amber-200 leading-relaxed">
                            Volta and Corepack shim order in PATH may cause
                            inconsistent behavior
                          </p>
                        </div>
                      </div>
                    )}
                  <InfoRow
                    label="Volta First"
                    value={diagnostics.path_analysis.volta_first ? 'Yes' : 'No'}
                  />
                  <InfoRow
                    label="Corepack First"
                    value={
                      diagnostics.path_analysis.corepack_first ? 'Yes' : 'No'
                    }
                  />
                  <div className="py-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      PATH Order (first 10):
                    </p>
                    <div className="p-3 rounded-lg bg-muted/30 border border-border max-h-40 overflow-auto">
                      <ol className="text-xs font-mono text-muted-foreground space-y-1 min-w-max">
                        {diagnostics.path_analysis.order.map((entry, idx) => (
                          <li
                            key={idx}
                            className={cn(
                              'whitespace-nowrap px-2 py-1 rounded',
                              entry.includes('.volta') &&
                                'text-blue-400 bg-blue-500/10',
                              (entry.includes('corepack') ||
                                entry.includes('.nvm')) &&
                                'text-green-400 bg-green-500/10'
                            )}
                          >
                            <span className="text-muted-foreground/50 mr-2">
                              {idx + 1}.
                            </span>
                            {entry}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </Section>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                  <Info className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No diagnostics data available
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4',
              'border-t border-border',
              'bg-card/50',
              'flex items-center justify-end',
              'flex-shrink-0'
            )}
          >
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolchainDiagnostics;
