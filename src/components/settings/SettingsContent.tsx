/**
 * Settings Content Router
 * Renders the appropriate settings panel based on active section
 */

import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';
import type { SettingsSection } from '../../types/settings';

// Lazy load panel components for better performance
const StorageSettingsPanel = lazy(() =>
  import('./panels/StorageSettingsPanel').then((m) => ({ default: m.StorageSettingsPanel }))
);
const DeployAccountsPanel = lazy(() =>
  import('./panels/DeployAccountsPanel').then((m) => ({ default: m.DeployAccountsPanel }))
);
const AppearanceSettingsPanel = lazy(() =>
  import('./panels/AppearanceSettingsPanel').then((m) => ({ default: m.AppearanceSettingsPanel }))
);
const ShortcutsSettingsPanel = lazy(() =>
  import('./panels/ShortcutsSettingsPanel').then((m) => ({ default: m.ShortcutsSettingsPanel }))
);
const AIProviderSettingsPanel = lazy(() =>
  import('./panels/AIProviderSettingsPanel').then((m) => ({ default: m.AIProviderSettingsPanel }))
);
const PromptTemplatePanel = lazy(() =>
  import('./panels/PromptTemplatePanel').then((m) => ({ default: m.PromptTemplatePanel }))
);
const McpSettingsFullPanel = lazy(() =>
  import('./panels/McpSettingsFullPanel').then((m) => ({ default: m.McpSettingsFullPanel }))
);
const ToolchainPreferencesPanel = lazy(() =>
  import('./panels/ToolchainPreferencesPanel').then((m) => ({ default: m.ToolchainPreferencesPanel }))
);
const DataSettingsPanel = lazy(() =>
  import('./panels/DataSettingsPanel').then((m) => ({ default: m.DataSettingsPanel }))
);

interface SettingsContentProps {
  section: SettingsSection;
  onExport?: () => void;
  onImport?: () => void;
}

// Loading fallback
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
);

export const SettingsContent: React.FC<SettingsContentProps> = ({
  section,
  onExport,
  onImport,
}) => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      {section === 'storage' && <StorageSettingsPanel />}
      {section === 'deploy-accounts' && <DeployAccountsPanel />}
      {section === 'appearance' && <AppearanceSettingsPanel />}
      {section === 'shortcuts' && <ShortcutsSettingsPanel />}
      {section === 'ai-providers' && <AIProviderSettingsPanel />}
      {section === 'prompts' && <PromptTemplatePanel />}
      {section === 'mcp' && <McpSettingsFullPanel />}
      {section === 'toolchain' && <ToolchainPreferencesPanel />}
      {section === 'data' && <DataSettingsPanel onExport={onExport} onImport={onImport} />}
    </Suspense>
  );
};
