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
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/Dialog';
import { cn } from '../../lib/utils';
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
    return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  }
  return <CheckCircle2 className="w-4 h-4 text-green-400" />;
};

interface InfoRowProps {
  label: string;
  value: string | undefined;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, mono = false }) => (
  <div className="flex items-start justify-between gap-2 py-1.5">
    <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
    <span
      className={cn(
        'text-sm text-foreground text-right break-all',
        mono && 'font-mono text-xs'
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
  <div className="space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
      {icon}
      {title}
    </div>
    <div className="pl-6 space-y-0.5">{children}</div>
  </div>
);

export const ToolchainDiagnostics: React.FC<ToolchainDiagnosticsProps> = ({
  isOpen,
  onClose,
  diagnostics,
  isLoading = false,
}) => {
  if (!diagnostics && !isLoading) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogClose onClick={onClose} />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            環境診斷報告
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            <span className="ml-2 text-sm text-muted-foreground">
              正在分析環境...
            </span>
          </div>
        ) : diagnostics ? (
          <div className="space-y-6">
            {/* Volta Section */}
            <Section
              title="Volta"
              icon={<StatusIcon available={diagnostics.volta.available} />}
            >
              <InfoRow label="狀態" value={diagnostics.volta.available ? '已安裝' : '未安裝'} />
              {diagnostics.volta.available && (
                <>
                  <InfoRow label="版本" value={diagnostics.volta.version} />
                  <InfoRow label="路徑" value={diagnostics.volta.path} mono />
                  <InfoRow label="Shim 路徑" value={diagnostics.volta.shim_path} mono />
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
              <InfoRow label="狀態" value={diagnostics.corepack.available ? '已安裝' : '未安裝'} />
              {diagnostics.corepack.available && (
                <>
                  <InfoRow label="已啟用" value={diagnostics.corepack.enabled ? '是' : '否'} />
                  <InfoRow label="版本" value={diagnostics.corepack.version} />
                  <InfoRow label="路徑" value={diagnostics.corepack.path} mono />
                </>
              )}
            </Section>

            {/* System Node Section */}
            <Section
              title="系統 Node.js"
              icon={
                <StatusIcon available={!!diagnostics.system_node.version} />
              }
            >
              <InfoRow label="版本" value={diagnostics.system_node.version} />
              <InfoRow label="路徑" value={diagnostics.system_node.path} mono />
            </Section>

            {/* Package Managers Section */}
            <Section
              title="Package Managers"
              icon={<FolderOpen className="w-4 h-4 text-muted-foreground" />}
            >
              {diagnostics.package_managers.npm ? (
                <InfoRow
                  label="npm"
                  value={`${diagnostics.package_managers.npm.version} (${diagnostics.package_managers.npm.path})`}
                />
              ) : (
                <InfoRow label="npm" value="未安裝" />
              )}
              {diagnostics.package_managers.pnpm ? (
                <InfoRow
                  label="pnpm"
                  value={`${diagnostics.package_managers.pnpm.version} (${diagnostics.package_managers.pnpm.path})`}
                />
              ) : (
                <InfoRow label="pnpm" value="未安裝" />
              )}
              {diagnostics.package_managers.yarn ? (
                <InfoRow
                  label="yarn"
                  value={`${diagnostics.package_managers.yarn.version} (${diagnostics.package_managers.yarn.path})`}
                />
              ) : (
                <InfoRow label="yarn" value="未安裝" />
              )}
            </Section>

            {/* PATH Analysis Section */}
            <Section
              title="PATH 順序分析"
              icon={<Info className="w-4 h-4 text-muted-foreground" />}
            >
              {diagnostics.path_analysis.volta_first && diagnostics.path_analysis.corepack_first && (
                <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-200">
                      Volta 和 Corepack 的 shim 在 PATH 中的順序可能導致行為不一致
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <InfoRow
                  label="Volta 優先"
                  value={diagnostics.path_analysis.volta_first ? '是' : '否'}
                />
                <InfoRow
                  label="Corepack 優先"
                  value={diagnostics.path_analysis.corepack_first ? '是' : '否'}
                />
              </div>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1">PATH 順序 (前 10 項)：</p>
                <div className="p-2 rounded bg-muted/50 max-h-32 overflow-y-auto">
                  <ol className="text-xs font-mono text-muted-foreground space-y-0.5">
                    {diagnostics.path_analysis.order.map((entry, idx) => (
                      <li
                        key={idx}
                        className={cn(
                          'truncate',
                          entry.includes('.volta') && 'text-blue-400',
                          (entry.includes('corepack') || entry.includes('.nvm')) && 'text-green-400'
                        )}
                      >
                        {idx + 1}. {entry}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </Section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

export default ToolchainDiagnostics;
