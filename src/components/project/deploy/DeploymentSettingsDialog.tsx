// DeploymentSettingsDialog Component
// One-Click Deploy feature (015-one-click-deploy)
// Extended with Multi Deploy Accounts (016-multi-deploy-accounts)
// Redesigned with improved UX - grouped sections, better visual hierarchy

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
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
import { GithubIcon, NetlifyIcon } from '../../ui/icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Select, type SelectOption } from '../../ui/Select';
import { cn } from '../../../lib/utils';

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

// Section component for grouping related settings
interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

function Section({
  icon,
  title,
  description,
  children,
  className,
  collapsible = false,
  defaultExpanded = true,
}: SectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn('space-y-3', className)}>
      <button
        type="button"
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
        disabled={!collapsible}
        className={cn(
          'flex items-center gap-2 w-full text-left',
          collapsible && 'cursor-pointer hover:opacity-80'
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {collapsible && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              !isExpanded && '-rotate-90'
            )}
          />
        )}
      </button>
      {(!collapsible || isExpanded) && (
        <div className="pl-9 space-y-3">{children}</div>
      )}
    </div>
  );
}

// Platform card component
interface PlatformCardProps {
  platform: PlatformType;
  isSelected: boolean;
  isConnected: boolean;
  onClick: () => void;
}

function PlatformCard({ platform, isSelected, isConnected, onClick }: PlatformCardProps) {
  const Icon = platform === 'github_pages' ? GithubIcon : NetlifyIcon;
  const name = platform === 'github_pages' ? 'GitHub Pages' : 'Netlify';
  const bgColor = platform === 'github_pages' ? 'bg-black' : 'bg-[#0e1e25]';
  const iconSize = platform === 'github_pages' ? 'h-5 w-5' : 'h-5 w-5';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all duration-200',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/40'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-lg',
          bgColor
        )}
      >
        <Icon className={cn(iconSize, platform === 'github_pages' && 'text-white')} />
      </span>
      <span className="font-medium text-sm">{name}</span>
      {!isConnected && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
          <AlertCircle className="h-3 w-3" />
        </span>
      )}
      {isSelected && isConnected && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <span className="h-2 w-2 rounded-full bg-current" />
        </span>
      )}
    </button>
  );
}

// Environment variable row component
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
    <div className="group flex items-center gap-2 rounded-lg border border-border bg-background/50 p-2 transition-colors hover:border-primary/30">
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
            ? 'bg-amber-500/10 text-amber-500'
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
  const [platform, setPlatform] = useState<PlatformType>('github_pages');
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [environment, setEnvironment] = useState<DeploymentEnvironment>('production');
  const [framework, setFramework] = useState<string>('');
  const [rootDirectory, setRootDirectory] = useState<string>('');
  const [buildCommand, setBuildCommand] = useState<string>('');
  const [outputDirectory, setOutputDirectory] = useState<string>('');
  const [envVariables, setEnvVariables] = useState<EnvVariable[]>([]);
  const [showSecrets, setShowSecrets] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

  // Get accounts from multi-account system
  const { accounts } = useDeployAccounts();

  // Initialize form from config
  useEffect(() => {
    if (initialConfig) {
      setPlatform(initialConfig.platform);
      setAccountId(initialConfig.accountId);
      setEnvironment(initialConfig.environment);
      setFramework(initialConfig.frameworkPreset ?? '');
      setRootDirectory(initialConfig.rootDirectory ?? '');
      setBuildCommand(initialConfig.buildCommand ?? '');
      setOutputDirectory(initialConfig.outputDirectory ?? '');
      setEnvVariables(initialConfig.envVariables);
    } else {
      // Reset to defaults
      setPlatform('github_pages');
      setAccountId(undefined);
      setEnvironment('production');
      setFramework(detectedFramework ?? '');
      setRootDirectory('');
      setBuildCommand('');
      setOutputDirectory('');
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
    setIsSaving(true);
    try {
      const config: DeploymentConfig = {
        projectId,
        platform,
        accountId,
        environment,
        frameworkPreset: framework || undefined,
        rootDirectory: rootDirectory || undefined,
        buildCommand: buildCommand || undefined,
        outputDirectory: outputDirectory || undefined,
        envVariables: envVariables.filter((v) => v.key.trim()),
      };
      await onSave(config);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlatformChange = (newPlatform: PlatformType) => {
    setPlatform(newPlatform);
    setAccountId(undefined);
  };

  // GitHub Pages doesn't require OAuth - it uses git credentials
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <span>Deployment Settings</span>
          </DialogTitle>
          <DialogClose onClick={onClose} />
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-6 py-2 pr-4 -mr-4">
          {/* Section 1: Deploy Target */}
          <Section
            icon={<Rocket className="h-4 w-4" />}
            title="Deploy Target"
            description="Choose where to deploy your project"
          >
            {/* Platform Selection */}
            <div className="grid grid-cols-2 gap-3">
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
            </div>

            {/* Warning if platform not connected */}
            {!isPlatformConnected(platform) && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Please connect your Netlify account first
                </span>
              </div>
            )}

            {/* Account Selector - only for Netlify */}
            {platform === 'netlify' && (
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Deploy Account</label>
                <AccountSelector
                  platform={platform}
                  selectedAccountId={accountId}
                  onAccountChange={setAccountId}
                />
              </div>
            )}

            {/* GitHub Pages info */}
            {platform === 'github_pages' && (
              <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                <p>GitHub Pages uses your existing git credentials.</p>
                <p className="text-xs mt-1">Make sure your project has a remote origin configured.</p>
              </div>
            )}
          </Section>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Section 2: Build Settings */}
          <Section
            icon={<FolderCode className="h-4 w-4" />}
            title="Build Configuration"
            description="Configure how your project is built"
          >
            {/* Environment */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Environment</label>
              <Select
                value={environment}
                onValueChange={(v) => setEnvironment(v as DeploymentEnvironment)}
                options={environmentOptions}
                aria-label="Deployment environment"
              />
            </div>

            {/* Framework */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Framework</label>
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

            {/* Build Command */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Build Command
                <span className="ml-1 text-muted-foreground/60">(optional)</span>
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
                  'flex h-9 w-full rounded-md border border-border',
                  'bg-background px-3 py-2 text-sm font-mono',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
              <p className="text-xs text-muted-foreground">
                Custom build script (e.g., <code className="bg-muted px-1 rounded">pnpm build</code>, <code className="bg-muted px-1 rounded">yarn build:prod</code>)
              </p>
            </div>

            {/* Output Directory */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Output Directory
                <span className="ml-1 text-muted-foreground/60">(optional)</span>
              </label>
              <input
                type="text"
                value={outputDirectory}
                onChange={(e) => setOutputDirectory(e.target.value)}
                placeholder={framework ? FRAMEWORK_PRESETS.find(p => p.key === framework)?.outputDirectory ?? 'dist' : 'dist'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className={cn(
                  'flex h-9 w-full rounded-md border border-border',
                  'bg-background px-3 py-2 text-sm font-mono',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
              <p className="text-xs text-muted-foreground">
                Directory containing built files (overrides framework default)
              </p>
            </div>

            {/* Root Directory */}
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">
                Root Directory
                <span className="ml-1 text-muted-foreground/60">(optional)</span>
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
                  'flex h-9 w-full rounded-md border border-border',
                  'bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              />
              <p className="text-xs text-muted-foreground">
                Specify the path if your project is in a subdirectory
              </p>
            </div>
          </Section>

          {/* Divider */}
          <div className="h-px bg-border" />

          {/* Section 3: Environment Variables */}
          <Section
            icon={<Variable className="h-4 w-4" />}
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
                    onUpdate={(field, value) => updateEnvVariable(index, field, value)}
                    onToggleSecret={() => toggleSecretVisibility(index)}
                    onRemove={() => removeEnvVariable(index)}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-6 text-center">
                <Server className="h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  No environment variables configured
                </p>
                <p className="text-xs text-muted-foreground/60">
                  Add variables that will be available during build and runtime
                </p>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEnvVariable}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Variable
            </Button>
          </Section>
        </div>

        {/* Footer */}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !isPlatformConnected(platform)}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
