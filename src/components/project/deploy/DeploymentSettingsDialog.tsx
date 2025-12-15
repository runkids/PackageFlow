/**
 * DeploymentSettingsDialog Component
 * One-Click Deploy feature (015-one-click-deploy)
 * Extended with Multi Deploy Accounts (016-multi-deploy-accounts)
 * Redesigned with improved UX following AIReviewDialog patterns
 */

import { useState, useEffect, useCallback, useMemo, useId } from 'react';
import {
  Plus,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Rocket,
  Server,
  FolderCode,
  Lock,
  Variable,
  ChevronDown,
  X,
  Check,
  Info,
} from 'lucide-react';
import type {
  PlatformType,
  DeploymentConfig,
  DeploymentEnvironment,
  EnvVariable,
} from '../../../types/deploy';
import { FRAMEWORK_PRESETS } from '../../../types/deploy';
import { useDeployAccounts } from '../../../hooks/useDeployAccounts';
import { AccountSelector } from './AccountSelector';
import { GithubIcon, NetlifyIcon, CloudflareIcon } from '../../ui/icons';
import { Button } from '../../ui/Button';
import { Select, type SelectOption } from '../../ui/Select';
import { cn } from '../../../lib/utils';
import { registerModal, unregisterModal, isTopModal } from '../../ui/modalStack';

interface DeploymentSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectPath: string;
  initialConfig: DeploymentConfig | null;
  detectedFramework: string | null;
  onSave: (config: DeploymentConfig) => Promise<void>;
  onDetectFramework: (projectPath: string) => Promise<string | null>;
}

// ============================================================================
// Section Component - Improved with icon badge design
// ============================================================================

interface SectionProps {
  icon: React.ReactNode;
  iconBgClass?: string;
  iconColorClass?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

function Section({
  icon,
  iconBgClass = 'bg-primary/10',
  iconColorClass = 'text-primary',
  title,
  description,
  children,
  className,
  collapsible = false,
  defaultExpanded = true,
}: SectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn('space-y-4', className)}>
      <button
        type="button"
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
        disabled={!collapsible}
        className={cn(
          'flex items-center gap-3 w-full text-left group',
          collapsible && 'cursor-pointer'
        )}
      >
        {/* Icon badge */}
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg',
            'border border-border/50 shadow-sm',
            iconBgClass
          )}
        >
          <span className={iconColorClass}>{icon}</span>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>

        {collapsible && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              'group-hover:text-foreground',
              !isExpanded && '-rotate-90'
            )}
          />
        )}
      </button>

      {(!collapsible || isExpanded) && (
        <div className="ml-12 space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PlatformCard Component - Enhanced with better visual feedback
// ============================================================================

interface PlatformCardProps {
  platform: PlatformType;
  isSelected: boolean;
  isConnected: boolean;
  onClick: () => void;
}

function PlatformCard({
  platform,
  isSelected,
  isConnected,
  onClick,
}: PlatformCardProps) {
  const getPlatformConfig = () => {
    switch (platform) {
      case 'github_pages':
        return {
          Icon: GithubIcon,
          name: 'GitHub Pages',
          bgColor: 'bg-zinc-900 dark:bg-zinc-800',
          iconClass: 'text-white',
        };
      case 'netlify':
        return {
          Icon: NetlifyIcon,
          name: 'Netlify',
          bgColor: 'bg-[#0e1e25]',
          iconClass: 'text-[#00c7b7]',
        };
      case 'cloudflare_pages':
        return {
          Icon: CloudflareIcon,
          name: 'Cloudflare',
          bgColor: 'bg-[#f38020]',
          iconClass: 'text-white',
        };
      default:
        return {
          Icon: GithubIcon,
          name: 'Unknown',
          bgColor: 'bg-muted',
          iconClass: 'text-muted-foreground',
        };
    }
  };

  const { Icon, name, bgColor, iconClass } = getPlatformConfig();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-3',
        'rounded-xl border-2 p-4',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isSelected
          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
          : 'border-border hover:border-primary/40 hover:bg-accent/50'
      )}
    >
      {/* Platform icon with brand color */}
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          'shadow-lg',
          bgColor
        )}
      >
        <Icon className={cn('h-6 w-6', iconClass)} />
      </div>

      <span className="font-medium text-sm text-foreground">{name}</span>

      {/* Connection status indicator */}
      {!isConnected && (
        <div
          className={cn(
            'absolute -top-2 -right-2',
            'flex h-6 w-6 items-center justify-center',
            'rounded-full bg-destructive shadow-lg',
            'border-2 border-background'
          )}
        >
          <AlertCircle className="h-3.5 w-3.5 text-destructive-foreground" />
        </div>
      )}

      {isSelected && isConnected && (
        <div
          className={cn(
            'absolute -top-2 -right-2',
            'flex h-6 w-6 items-center justify-center',
            'rounded-full bg-primary shadow-lg',
            'border-2 border-background'
          )}
        >
          <Check className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      )}
    </button>
  );
}

// ============================================================================
// EnvVariableRow Component
// ============================================================================

interface EnvVariableRowProps {
  env: EnvVariable;
  showSecret: boolean;
  onUpdate: (field: keyof EnvVariable, value: string | boolean) => void;
  onToggleSecret: () => void;
  onRemove: () => void;
}

function EnvVariableRow({
  env,
  showSecret,
  onUpdate,
  onToggleSecret,
  onRemove,
}: EnvVariableRowProps) {
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border bg-card/50 p-2 transition-colors hover:border-primary/30">
      <input
        type="text"
        value={env.key}
        onChange={(e) => onUpdate('key', e.target.value)}
        placeholder="KEY"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className={cn(
          'w-32 shrink-0 rounded-md border-0 bg-transparent px-2 py-1.5 text-sm font-mono',
          'placeholder:text-muted-foreground/60',
          'focus:outline-none focus:ring-1 focus:ring-ring'
        )}
      />
      <span className="text-muted-foreground">=</span>
      <div className="relative flex-1">
        <input
          type={env.isSecret && !showSecret ? 'password' : 'text'}
          value={env.value}
          onChange={(e) => onUpdate('value', e.target.value)}
          placeholder="value"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            'w-full rounded-md border-0 bg-transparent px-2 py-1.5 text-sm font-mono',
            'placeholder:text-muted-foreground/60',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            env.isSecret && 'pr-8'
          )}
        />
        {env.isSecret && (
          <button
            type="button"
            onClick={onToggleSecret}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={showSecret ? 'Hide value' : 'Show value'}
          >
            {showSecret ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onUpdate('isSecret', !env.isSecret)}
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
          env.isSecret
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
        title={env.isSecret ? 'Secret (hidden in logs)' : 'Mark as secret'}
      >
        <Lock className="h-3 w-3" />
        <span className="hidden sm:inline">Secret</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Remove variable"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Main Dialog Component
// ============================================================================

export function DeploymentSettingsDialog({
  isOpen,
  onClose,
  projectId,
  projectPath,
  initialConfig,
  detectedFramework,
  onSave,
  onDetectFramework,
}: DeploymentSettingsDialogProps) {
  const modalId = useId();
  const [platform, setPlatform] = useState<PlatformType>('github_pages');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [environment, setEnvironment] =
    useState<DeploymentEnvironment>('production');
  const [framework, setFramework] = useState<string>('');
  const [rootDirectory, setRootDirectory] = useState<string>('');
  const [installCommand, setInstallCommand] = useState<string>('');
  const [buildCommand, setBuildCommand] = useState<string>('');
  const [outputDirectory, setOutputDirectory] = useState<string>('');
  const [netlifySiteName, setNetlifySiteName] = useState<string>('');
  const [cloudflareProjectName, setCloudflareProjectName] = useState<string>('');
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Modal stack management
  useEffect(() => {
    if (!isOpen) return;
    registerModal(modalId);
    return () => unregisterModal(modalId);
  }, [modalId, isOpen]);

  // Keyboard handler for Escape
  useEffect(() => {
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

  // Get accounts from multi-account system
  const {
    accounts,
    preferences,
    isLoadingAccounts,
    isLoadingPreferences,
    getAccountsByPlatform,
  } = useDeployAccounts();

  // Filter accounts by the selected platform
  const platformAccounts = useMemo(
    () => getAccountsByPlatform(platform),
    [getAccountsByPlatform, platform]
  );

  // Initialize form from config
  useEffect(() => {
    setValidationError(null);
    if (initialConfig) {
      setPlatform(initialConfig.platform);
      setAccountId(initialConfig.accountId);
      setEnvironment(initialConfig.environment);
      setFramework(initialConfig.frameworkPreset ?? '');
      setRootDirectory(initialConfig.rootDirectory ?? '');
      setInstallCommand(initialConfig.installCommand ?? '');
      setBuildCommand(initialConfig.buildCommand ?? '');
      setOutputDirectory(initialConfig.outputDirectory ?? '');
      setNetlifySiteName(initialConfig.netlifySiteName ?? '');
      setCloudflareProjectName(initialConfig.cloudflareProjectName ?? '');
      setEnvVariables(initialConfig.envVariables);
    } else {
      // Reset to defaults
      setPlatform('github_pages');
      setAccountId(undefined);
      setEnvironment('production');
      setFramework(detectedFramework ?? '');
      setRootDirectory('');
      setInstallCommand('');
      setBuildCommand('');
      setOutputDirectory('');
      setNetlifySiteName('');
      setCloudflareProjectName('');
      setEnvVariables([]);
    }
  }, [initialConfig, detectedFramework, isOpen]);

  // Auto-detect framework when dialog opens
  useEffect(() => {
    if (isOpen && !framework && projectPath) {
      handleDetectFramework();
    }
  }, [isOpen, projectPath]);

  const handleDetectFramework = async () => {
    setIsDetecting(true);
    try {
      const detected = await onDetectFramework(projectPath);
      if (detected) {
        setFramework(detected);
      }
    } finally {
      setIsDetecting(false);
    }
  };

  const addEnvVariable = useCallback(() => {
    setEnvVariables((prev) => [...prev, { key: '', value: '', isSecret: false }]);
  }, []);

  const removeEnvVariable = useCallback((index: number) => {
    setEnvVariables((prev) => prev.filter((_, i) => i !== index));
    setShowSecrets((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const updateEnvVariable = useCallback(
    (index: number, field: keyof EnvVariable, value: string | boolean) => {
      setEnvVariables((prev) =>
        prev.map((env, i) => (i === index ? { ...env, [field]: value } : env))
      );
    },
    []
  );

  const toggleSecretVisibility = useCallback((index: number) => {
    setShowSecrets((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const handleSave = async () => {
    setValidationError(null);
    if ((platform === 'netlify' || platform === 'cloudflare_pages') && !accountId) {
      setValidationError('Please select a deploy account.');
      return;
    }

    setIsSaving(true);
    try {
      const config: DeploymentConfig = {
        projectId,
        platform,
        accountId,
        environment,
        frameworkPreset: framework || undefined,
        rootDirectory: rootDirectory || undefined,
        installCommand: installCommand || undefined,
        buildCommand: buildCommand || undefined,
        outputDirectory: outputDirectory || undefined,
        netlifySiteName: netlifySiteName || undefined,
        cloudflareProjectName: cloudflareProjectName || undefined,
        envVariables: envVariables.filter((v) => v.key.trim()),
      };
      await onSave(config);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlatformChange = (newPlatform: PlatformType) => {
    setValidationError(null);
    setPlatform(newPlatform);
    setAccountId(undefined);
  };

  const handleAccountChange = (newAccountId: string | undefined) => {
    setValidationError(null);
    setAccountId(newAccountId);
  };

  // GitHub Pages doesn't require OAuth - it uses git credentials
  // Cloudflare Pages uses API token (token-based auth)
  const isPlatformConnected = (p: PlatformType) => {
    if (p === 'github_pages') return true;
    return accounts.some((account) => account.platform === p);
  };

  // Memoized options for selects
  const environmentOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'production', label: 'Production' },
      { value: 'preview', label: 'Preview' },
    ],
    []
  );

  const frameworkOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'Select Framework...' },
      ...FRAMEWORK_PRESETS.map((preset) => ({
        value: preset.key,
        label: preset.name,
      })),
    ],
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deploy-settings-dialog-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-xl max-h-[85vh]',
            'bg-background rounded-2xl',
            'border border-blue-500/30',
            'shadow-2xl shadow-black/50',
            'animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-bottom-4',
            'flex flex-col overflow-hidden'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with gradient */}
          <div
            className={cn(
              'relative px-6 py-5 border-b border-border',
              'bg-gradient-to-r',
              'dark:from-blue-500/20 dark:via-indigo-600/10 dark:to-transparent',
              'from-blue-500/10 via-indigo-600/5 to-transparent'
            )}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className={cn(
                'absolute right-4 top-4',
                'rounded-lg p-2',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-background/80',
                'transition-colors duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              )}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Title with icon badge */}
            <div className="flex items-start gap-4 pr-10">
              <div
                className={cn(
                  'flex-shrink-0',
                  'w-12 h-12 rounded-xl',
                  'flex items-center justify-center',
                  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                  'border bg-blue-500/10 border-blue-500/20',
                  'shadow-lg'
                )}
              >
                <Rocket className="w-6 h-6 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2
                  id="deploy-settings-dialog-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  Configure Deployment
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set up how your project is built and deployed
                </p>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6">
            {/* Section 1: Deploy Target */}
            <Section
              icon={<Rocket className="h-4 w-4" />}
              iconBgClass="bg-blue-500/10"
              iconColorClass="text-blue-500 dark:text-blue-400"
              title="Deploy Target"
              description="Choose where to deploy your project"
            >
              {/* Platform Selection */}
              <div className="grid grid-cols-3 gap-3">
                <PlatformCard
                  platform="github_pages"
                  isSelected={platform === 'github_pages'}
                  isConnected={isPlatformConnected('github_pages')}
                  onClick={() => handlePlatformChange('github_pages')}
                />
                <PlatformCard
                  platform="netlify"
                  isSelected={platform === 'netlify'}
                  isConnected={isPlatformConnected('netlify')}
                  onClick={() => handlePlatformChange('netlify')}
                />
                <PlatformCard
                  platform="cloudflare_pages"
                  isSelected={platform === 'cloudflare_pages'}
                  isConnected={isPlatformConnected('cloudflare_pages')}
                  onClick={() => handlePlatformChange('cloudflare_pages')}
                />
              </div>

              {/* Warning if platform not connected */}
              {!isPlatformConnected(platform) && (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-lg p-3',
                    'border border-destructive/30 bg-destructive/5'
                  )}
                >
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-sm text-destructive">
                    Please connect your{' '}
                    {platform === 'netlify' ? 'Netlify' : 'Cloudflare Pages'}{' '}
                    account first
                  </span>
                </div>
              )}

              {/* Account Selector - for Netlify and Cloudflare */}
              {(platform === 'netlify' || platform === 'cloudflare_pages') && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Deploy Account
                  </label>
                  <AccountSelector
                    platform={platform}
                    accounts={platformAccounts}
                    preferences={preferences}
                    isLoading={isLoadingAccounts || isLoadingPreferences}
                    selectedAccountId={accountId}
                    onAccountChange={handleAccountChange}
                  />
                </div>
              )}

              {/* Site Name - only for Netlify */}
              {platform === 'netlify' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Site Name
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={netlifySiteName}
                      onChange={(e) =>
                        setNetlifySiteName(
                          e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                        )
                      }
                      placeholder="my-awesome-app"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className={cn(
                        'flex h-9 flex-1 rounded-lg border border-border',
                        'bg-background px-3 py-2 text-sm font-mono',
                        'placeholder:text-muted-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      .netlify.app
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Custom subdomain for your site. Leave empty to auto-generate.
                  </p>
                </div>
              )}

              {/* Project Name - only for Cloudflare Pages */}
              {platform === 'cloudflare_pages' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Project Name
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={cloudflareProjectName}
                      onChange={(e) =>
                        setCloudflareProjectName(
                          e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                        )
                      }
                      placeholder="my-awesome-app"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className={cn(
                        'flex h-9 flex-1 rounded-lg border border-border',
                        'bg-background px-3 py-2 text-sm font-mono',
                        'placeholder:text-muted-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    />
                    <span className="text-sm text-muted-foreground">
                      .pages.dev
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Custom project name for your site. Leave empty to auto-generate.
                  </p>
                </div>
              )}

              {/* GitHub Pages info */}
              {platform === 'github_pages' && (
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-4',
                    'border border-border bg-muted/30'
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted flex-shrink-0">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="text-foreground font-medium">
                      GitHub Actions Workflow
                    </p>
                    <p className="text-muted-foreground text-xs">
                      PackageFlow will generate a workflow file. You can override
                      build settings below.
                    </p>
                  </div>
                </div>
              )}
            </Section>

            {/* Divider */}
            <div className="h-px bg-border" />

            {/* Section 2: Build Settings */}
            <Section
              icon={<FolderCode className="h-4 w-4" />}
              iconBgClass="bg-emerald-500/10"
              iconColorClass="text-emerald-500 dark:text-emerald-400"
              title={
                platform === 'github_pages'
                  ? 'Workflow Build Configuration'
                  : 'Build Configuration'
              }
              description={
                platform === 'github_pages'
                  ? 'Optional overrides for GitHub Actions workflow generation'
                  : 'Configure how your project is built'
              }
              collapsible={platform === 'github_pages'}
              defaultExpanded={platform !== 'github_pages'}
            >
              {/* Environment - Only for Netlify and Cloudflare */}
              {platform !== 'github_pages' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Environment
                  </label>
                  <Select
                    value={environment}
                    onValueChange={(v) =>
                      setEnvironment(v as DeploymentEnvironment)
                    }
                    options={environmentOptions}
                    aria-label="Deployment environment"
                  />
                </div>
              )}

              {/* Framework */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    Framework
                  </label>
                  <button
                    type="button"
                    onClick={handleDetectFramework}
                    disabled={isDetecting}
                    className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {isDetecting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Detecting...
                      </>
                    ) : (
                      'Auto Detect'
                    )}
                  </button>
                </div>
                <Select
                  value={framework}
                  onValueChange={setFramework}
                  options={frameworkOptions}
                  placeholder="Select Framework..."
                  aria-label="Framework"
                />
              </div>

              {/* Install Command - GitHub Pages workflow only */}
              {platform === 'github_pages' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Install Command
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="Auto-detect from lockfile (e.g., npm ci)"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={cn(
                      'flex h-9 w-full rounded-lg border border-border',
                      'bg-background px-3 py-2 text-sm font-mono',
                      'placeholder:text-muted-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the generated workflow. Leave empty to auto-detect
                    based on your lockfile.
                  </p>
                </div>
              )}

              {/* Build Command */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Build Command
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={buildCommand}
                  onChange={(e) => setBuildCommand(e.target.value)}
                  placeholder="npm run build"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={cn(
                    'flex h-9 w-full rounded-lg border border-border',
                    'bg-background px-3 py-2 text-sm font-mono',
                    'placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Custom build script (e.g.,{' '}
                  <code className="bg-muted px-1 rounded">pnpm build</code>,{' '}
                  <code className="bg-muted px-1 rounded">yarn build:prod</code>)
                </p>
              </div>

              {/* Output Directory */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Output Directory
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={outputDirectory}
                  onChange={(e) => setOutputDirectory(e.target.value)}
                  placeholder={
                    framework
                      ? FRAMEWORK_PRESETS.find((p) => p.key === framework)
                          ?.outputDirectory ?? 'dist'
                      : 'dist'
                  }
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className={cn(
                    'flex h-9 w-full rounded-lg border border-border',
                    'bg-background px-3 py-2 text-sm font-mono',
                    'placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Directory containing built files (overrides framework default)
                </p>
              </div>

              {/* Root Directory - Only for Netlify and Cloudflare */}
              {platform !== 'github_pages' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Root Directory
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    value={rootDirectory}
                    onChange={(e) => setRootDirectory(e.target.value)}
                    placeholder="e.g., packages/web"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className={cn(
                      'flex h-9 w-full rounded-lg border border-border',
                      'bg-background px-3 py-2 text-sm',
                      'placeholder:text-muted-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Specify the path if your project is in a subdirectory
                  </p>
                </div>
              )}
            </Section>

            {/* Section 3: Environment Variables - Only for Netlify and Cloudflare */}
            {platform !== 'github_pages' && (
              <>
                {/* Divider */}
                <div className="h-px bg-border" />

                <Section
                  icon={<Variable className="h-4 w-4" />}
                  iconBgClass="bg-amber-500/10"
                  iconColorClass="text-amber-500 dark:text-amber-400"
                  title="Environment Variables"
                  description="Set variables available during build and runtime"
                  collapsible
                  defaultExpanded={envVariables.length > 0}
                >
                  {envVariables.length > 0 ? (
                    <div className="space-y-2">
                      {envVariables.map((env, index) => (
                        <EnvVariableRow
                          key={index}
                          env={env}
                          showSecret={showSecrets[index] ?? false}
                          onUpdate={(field, value) =>
                            updateEnvVariable(index, field, value)
                          }
                          onToggleSecret={() => toggleSecretVisibility(index)}
                          onRemove={() => removeEnvVariable(index)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'flex flex-col items-center justify-center',
                        'rounded-lg border border-dashed border-border',
                        'py-8 text-center',
                        'bg-muted/20'
                      )}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                        <Server className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        No environment variables
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        Add variables for build and runtime
                      </p>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEnvVariable}
                    className="w-full border-dashed"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Variable
                  </Button>
                </Section>
              </>
            )}
          </div>

          {/* Footer */}
          <div
            className={cn(
              'px-6 py-4 border-t border-border',
              'bg-card/50 flex-shrink-0'
            )}
          >
            {/* Validation Error */}
            {validationError && (
              <div className="mb-4 flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {validationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !isPlatformConnected(platform)}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
