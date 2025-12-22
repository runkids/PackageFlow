/**
 * Lockfile Validation Settings Panel
 * Configures lockfile security validation rules
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Shield,
  AlertTriangle,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
  Globe,
  Package,
  FileText,
  Search,
  Info,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { snapshotAPI } from '../../../lib/tauri-api';
import { SettingSection } from '../ui/SettingSection';
import { SettingInfoBox } from '../ui/SettingInfoBox';
import { Skeleton } from '../../ui/Skeleton';
import { cn } from '../../../lib/utils';
import type {
  LockfileValidationConfig,
  ValidationStrictness,
  BlockedPackageEntry,
} from '../../../types/snapshot';

// Default registries (readonly display)
const DEFAULT_REGISTRIES = [
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'npm.pkg.github.com',
];

export const LockfileValidationPanel: React.FC = () => {
  const [config, setConfig] = useState<LockfileValidationConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New entry inputs
  const [newRegistry, setNewRegistry] = useState('');
  const [newBlockedName, setNewBlockedName] = useState('');
  const [newBlockedReason, setNewBlockedReason] = useState('');

  // Load config on mount
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedConfig = await snapshotAPI.getLockfileValidationConfig();
      setConfig(loadedConfig);
    } catch (e) {
      setError(`Failed to load config: ${e}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Save config
  const saveConfig = useCallback(
    async (newConfig: LockfileValidationConfig) => {
      try {
        setIsSaving(true);
        await snapshotAPI.saveLockfileValidationConfig(newConfig);
        setConfig(newConfig);
      } catch (e) {
        setError(`Failed to save config: ${e}`);
      } finally {
        setIsSaving(false);
      }
    },
    []
  );

  // Toggle enabled
  const handleToggleEnabled = useCallback(async () => {
    if (!config) return;
    const newConfig = { ...config, enabled: !config.enabled };
    await saveConfig(newConfig);
  }, [config, saveConfig]);

  // Update strictness
  const handleStrictnessChange = useCallback(
    async (strictness: ValidationStrictness) => {
      if (!config) return;
      const newConfig = { ...config, strictness };
      await saveConfig(newConfig);
    },
    [config, saveConfig]
  );

  // Toggle a rule
  const handleToggleRule = useCallback(
    async (ruleKey: keyof LockfileValidationConfig['rules']) => {
      if (!config) return;
      const newConfig = {
        ...config,
        rules: {
          ...config.rules,
          [ruleKey]: !config.rules[ruleKey],
        },
      };
      await saveConfig(newConfig);
    },
    [config, saveConfig]
  );

  // Add allowed registry
  const handleAddRegistry = useCallback(async () => {
    if (!config || !newRegistry.trim()) return;
    const registry = newRegistry.trim().toLowerCase();
    if (config.allowedRegistries.includes(registry)) {
      setError('Registry already in list');
      return;
    }
    try {
      await snapshotAPI.addAllowedRegistry(registry);
      setConfig({
        ...config,
        allowedRegistries: [...config.allowedRegistries, registry],
      });
      setNewRegistry('');
      setError(null);
    } catch (e) {
      setError(`Failed to add registry: ${e}`);
    }
  }, [config, newRegistry]);

  // Remove allowed registry
  const handleRemoveRegistry = useCallback(
    async (registry: string) => {
      if (!config) return;
      try {
        await snapshotAPI.removeAllowedRegistry(registry);
        setConfig({
          ...config,
          allowedRegistries: config.allowedRegistries.filter((r) => r !== registry),
        });
      } catch (e) {
        setError(`Failed to remove registry: ${e}`);
      }
    },
    [config]
  );

  // Add blocked package
  const handleAddBlockedPackage = useCallback(async () => {
    if (!config || !newBlockedName.trim() || !newBlockedReason.trim()) return;
    try {
      await snapshotAPI.addBlockedPackage(newBlockedName.trim(), newBlockedReason.trim());
      const newEntry: BlockedPackageEntry = {
        name: newBlockedName.trim(),
        reason: newBlockedReason.trim(),
        addedAt: new Date().toISOString(),
      };
      setConfig({
        ...config,
        blockedPackages: [...config.blockedPackages, newEntry],
      });
      setNewBlockedName('');
      setNewBlockedReason('');
      setError(null);
    } catch (e) {
      setError(`Failed to add blocked package: ${e}`);
    }
  }, [config, newBlockedName, newBlockedReason]);

  // Remove blocked package
  const handleRemoveBlockedPackage = useCallback(
    async (packageName: string) => {
      if (!config) return;
      try {
        await snapshotAPI.removeBlockedPackage(packageName);
        setConfig({
          ...config,
          blockedPackages: config.blockedPackages.filter((p) => p.name !== packageName),
        });
      } catch (e) {
        setError(`Failed to remove blocked package: ${e}`);
      }
    },
    [config]
  );

  // Reset to defaults
  const handleResetDefaults = useCallback(async () => {
    try {
      setIsSaving(true);
      const defaultConfig = await snapshotAPI.resetLockfileValidationConfig();
      setConfig(defaultConfig);
      setError(null);
    } catch (e) {
      setError(`Failed to reset config: ${e}`);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 pb-4 border-b border-border bg-background">
        <h2 className="text-xl font-semibold text-foreground flex items-center">
          <ShieldCheck className="w-5 h-5 mr-2" />
          Lockfile Validation
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure security rules for validating npm ecosystem lockfiles
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-6">
        {/* Error Display */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : config ? (
          <>
            {/* Enable/Disable Toggle */}
            <SettingSection
              title="Validation Status"
              description="Enable or disable lockfile validation during snapshot capture"
              icon={<Shield className="w-4 h-4" />}
            >
              <div
                className={cn(
                  'p-4 rounded-lg',
                  'bg-gradient-to-r',
                  config.enabled
                    ? 'from-green-500/5 via-transparent to-transparent border-green-500/20'
                    : 'from-muted/50 via-transparent to-transparent border-border',
                  'border'
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'p-2.5 rounded-lg',
                        config.enabled
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        Lockfile Validation
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {config.enabled
                          ? 'Validation runs automatically during snapshot capture'
                          : 'Validation is disabled'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant={config.enabled ? 'default' : 'outline'}
                    size="sm"
                    onClick={handleToggleEnabled}
                    disabled={isSaving}
                    className={cn(config.enabled && 'bg-green-500 hover:bg-green-600')}
                  >
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : config.enabled ? (
                      'Enabled'
                    ) : (
                      'Disabled'
                    )}
                  </Button>
                </div>
              </div>
            </SettingSection>

            {/* Strictness Level */}
            <SettingSection
              title="Strictness Level"
              description="Control how strictly validation rules are enforced"
              icon={<AlertTriangle className="w-4 h-4" />}
            >
              <div className="grid grid-cols-3 gap-3">
                {(['relaxed', 'standard', 'strict'] as ValidationStrictness[]).map(
                  (level) => (
                    <button
                      key={level}
                      onClick={() => handleStrictnessChange(level)}
                      disabled={isSaving || !config.enabled}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all',
                        config.strictness === level
                          ? level === 'relaxed'
                            ? 'border-blue-500 bg-blue-500/10'
                            : level === 'standard'
                              ? 'border-yellow-500 bg-yellow-500/10'
                              : 'border-red-500 bg-red-500/10'
                          : 'border-border bg-card hover:border-muted-foreground/50',
                        !config.enabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div className="text-sm font-medium text-foreground capitalize">
                        {level}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {level === 'relaxed' && 'Only critical issues'}
                        {level === 'standard' && 'Balanced security (default)'}
                        {level === 'strict' && 'All warnings as errors'}
                      </div>
                    </button>
                  )
                )}
              </div>
            </SettingSection>

            {/* Validation Rules */}
            <SettingSection
              title="Validation Rules"
              description="Enable or disable individual security checks"
              icon={<FileText className="w-4 h-4" />}
            >
              <div className="space-y-2">
                <RuleToggle
                  label="Require Integrity Hash"
                  description="Flag packages missing integrity hash"
                  enabled={config.rules.requireIntegrity}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('requireIntegrity')}
                  icon={<Lock className="w-4 h-4" />}
                />
                <RuleToggle
                  label="Require HTTPS"
                  description="Flag packages using insecure protocols (git://, http://)"
                  enabled={config.rules.requireHttpsResolved}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('requireHttpsResolved')}
                  icon={<Globe className="w-4 h-4" />}
                />
                <RuleToggle
                  label="Check Allowed Registries"
                  description="Flag packages from non-whitelisted registries"
                  enabled={config.rules.checkAllowedRegistries}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('checkAllowedRegistries')}
                  icon={<Globe className="w-4 h-4" />}
                />
                <RuleToggle
                  label="Check Blocked Packages"
                  description="Flag packages on your blocked list"
                  enabled={config.rules.checkBlockedPackages}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('checkBlockedPackages')}
                  icon={<Package className="w-4 h-4" />}
                />
                <RuleToggle
                  label="Check Manifest Consistency"
                  description="Flag mismatches between package.json and lockfile"
                  enabled={config.rules.checkManifestConsistency}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('checkManifestConsistency')}
                  icon={<FileText className="w-4 h-4" />}
                />
                <RuleToggle
                  label="Enhanced Typosquatting Detection"
                  description="Detect scope confusion and homoglyph attacks"
                  enabled={config.rules.enhancedTyposquatting}
                  disabled={isSaving || !config.enabled}
                  onChange={() => handleToggleRule('enhancedTyposquatting')}
                  icon={<Search className="w-4 h-4" />}
                />
              </div>
            </SettingSection>

            {/* Allowed Registries */}
            <SettingSection
              title="Allowed Registries"
              description="Packages from these registries are trusted"
              icon={<Globe className="w-4 h-4" />}
            >
              <div className="space-y-3">
                {/* Registry List */}
                <div className="space-y-2">
                  {config.allowedRegistries.map((registry) => (
                    <div
                      key={registry}
                      className="flex items-center justify-between p-2 rounded bg-muted/50"
                    >
                      <code className="text-sm text-foreground">{registry}</code>
                      {!DEFAULT_REGISTRIES.includes(registry) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRegistry(registry)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Registry */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRegistry}
                    onChange={(e) => setNewRegistry(e.target.value)}
                    placeholder="e.g., internal.company.com"
                    disabled={!config.enabled}
                    className="flex-1 px-3 py-2 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddRegistry}
                    disabled={!newRegistry.trim() || !config.enabled}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </SettingSection>

            {/* Blocked Packages */}
            <SettingSection
              title="Blocked Packages"
              description="Packages that should never be installed"
              icon={<Package className="w-4 h-4" />}
            >
              <div className="space-y-3">
                {/* Blocked List */}
                {config.blockedPackages.length > 0 ? (
                  <div className="space-y-2">
                    {config.blockedPackages.map((entry) => (
                      <div
                        key={entry.name}
                        className="flex items-start justify-between p-3 rounded bg-destructive/5 border border-destructive/20"
                      >
                        <div>
                          <code className="text-sm font-medium text-foreground">
                            {entry.name}
                          </code>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {entry.reason}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveBlockedPackage(entry.name)}
                          className="h-7 w-7 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground p-3 rounded bg-muted/50 text-center">
                    No blocked packages configured
                  </div>
                )}

                {/* Add Blocked Package */}
                <div className="space-y-2 p-3 rounded border border-border">
                  <input
                    type="text"
                    value={newBlockedName}
                    onChange={(e) => setNewBlockedName(e.target.value)}
                    placeholder="Package name"
                    disabled={!config.enabled}
                    className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={newBlockedReason}
                    onChange={(e) => setNewBlockedReason(e.target.value)}
                    placeholder="Reason for blocking"
                    disabled={!config.enabled}
                    className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddBlockedPackage}
                    disabled={!newBlockedName.trim() || !newBlockedReason.trim() || !config.enabled}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Blocked Package
                  </Button>
                </div>
              </div>
            </SettingSection>

            {/* Reset to Defaults */}
            <SettingSection
              title="Reset Configuration"
              description="Restore all settings to their default values"
              icon={<RotateCcw className="w-4 h-4" />}
            >
              <Button variant="outline" onClick={handleResetDefaults} disabled={isSaving}>
                {isSaving ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset to Defaults
              </Button>
            </SettingSection>

            {/* Info Box */}
            <SettingInfoBox title="How Lockfile Validation Works" variant="info">
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>Validation runs automatically during snapshot capture when enabled</span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>Failures are recorded as Security Insights in the Time Machine</span>
                </li>
                <li className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                  <span>No network calls are made - all validation happens locally</span>
                </li>
              </ul>
            </SettingInfoBox>
          </>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            Failed to load configuration
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Internal Components
// ============================================================================

interface RuleToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  disabled: boolean;
  onChange: () => void;
  icon: React.ReactNode;
}

const RuleToggle: React.FC<RuleToggleProps> = ({
  label,
  description,
  enabled,
  disabled,
  onChange,
  icon,
}) => (
  <button
    onClick={onChange}
    disabled={disabled}
    className={cn(
      'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
      enabled
        ? 'border-green-500/30 bg-green-500/5'
        : 'border-border bg-card hover:bg-muted/50',
      disabled && 'opacity-50 cursor-not-allowed'
    )}
  >
    <div
      className={cn(
        'p-2 rounded-lg',
        enabled ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
      )}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground truncate">{description}</div>
    </div>
    <div
      className={cn(
        'w-10 h-6 rounded-full transition-colors flex items-center',
        enabled ? 'bg-green-500' : 'bg-muted'
      )}
    >
      <div
        className={cn(
          'w-4 h-4 rounded-full bg-white shadow transition-transform mx-1',
          enabled && 'translate-x-4'
        )}
      />
    </div>
  </button>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="p-4 rounded-lg border border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="w-11 h-11 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="w-32 h-4" />
          <Skeleton className="w-48 h-3" />
        </div>
      </div>
    </div>
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="w-full h-16 rounded-lg" />
      ))}
    </div>
  </div>
);
