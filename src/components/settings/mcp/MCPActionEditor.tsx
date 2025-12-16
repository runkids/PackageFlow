/**
 * MCPActionEditor Component
 * Dialog for creating and editing MCP actions (scripts, webhooks, workflows)
 * @see specs/021-mcp-actions/spec.md
 */

import React, { useState, useCallback, useEffect, useId, useRef } from 'react';
import {
  Play,
  Globe,
  GitBranch,
  Save,
  Loader2,
  AlertCircle,
  Zap,
  HelpCircle,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Toggle } from '../../ui/Toggle';
import { Select } from '../../ui/Select';
import { workflowAPI, settingsAPI, type AvailableWorkflowInfo } from '../../../lib/tauri-api';
import type { Workflow } from '../../../types';
import { generateWebhookUrl } from '../../../types/incoming-webhook';
import type {
  MCPAction,
  MCPActionType,
  ScriptConfig,
  MCPWebhookConfig,
  WorkflowActionConfig,
} from '../../../types/mcp-action';

// ============================================================================
// Types
// ============================================================================

interface MCPActionEditorProps {
  /** Action to edit (null for create mode) */
  action: MCPAction | null;
  /** Whether dialog is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Save handler */
  onSave: (action: Partial<MCPAction>) => Promise<void>;
}

interface FormData {
  name: string;
  description: string;
  actionType: MCPActionType;
  isEnabled: boolean;
  // Script config
  scriptCommand: string;
  scriptWorkingDir: string;
  scriptTimeout: number;
  // Webhook config
  webhookUrl: string;
  webhookMethod: string;
  webhookHeaders: string;
  webhookBody: string;
  // Workflow config
  workflowId: string;
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPES: {
  value: MCPActionType;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}[] = [
  {
    value: 'script',
    label: 'Script',
    icon: <Play className="w-4 h-4" />,
    description: 'Execute shell commands or scripts',
    color: 'emerald',
  },
  {
    value: 'webhook',
    label: 'Webhook',
    icon: <Globe className="w-4 h-4" />,
    description: 'Trigger HTTP requests to external services',
    color: 'blue',
  },
  {
    value: 'workflow',
    label: 'Workflow',
    icon: <GitBranch className="w-4 h-4" />,
    description: 'Execute PackageFlow workflows',
    color: 'purple',
  },
];

const HTTP_METHOD_OPTIONS = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'PATCH', label: 'PATCH' },
  { value: 'DELETE', label: 'DELETE' },
];

// ============================================================================
// Form Field Components
// ============================================================================

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  description?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  error,
  description,
  children,
  htmlFor,
}) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-foreground"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    </div>
    {description && (
      <p className="text-xs text-muted-foreground">{description}</p>
    )}
    {children}
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1.5">
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
        {error}
      </p>
    )}
  </div>
);

interface TextAreaFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  'aria-describedby'?: string;
}

const TextAreaField: React.FC<TextAreaFieldProps> = ({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  'aria-describedby': ariaDescribedby,
}) => (
  <textarea
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    disabled={disabled}
    aria-describedby={ariaDescribedby}
    className={cn(
      'flex w-full rounded-md border border-input bg-transparent px-3 py-2',
      'text-sm font-mono shadow-sm transition-colors resize-none',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50'
    )}
  />
);

// ============================================================================
// Main Component
// ============================================================================

export const MCPActionEditor: React.FC<MCPActionEditorProps> = ({
  action,
  isOpen,
  onClose,
  onSave,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const isEditMode = action !== null;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    actionType: 'script',
    isEnabled: true,
    scriptCommand: '',
    scriptWorkingDir: '',
    scriptTimeout: 30,
    webhookUrl: '',
    webhookMethod: 'POST',
    webhookHeaders: '{}',
    webhookBody: '',
    workflowId: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Workflow list for dropdown (workflow action type)
  const [workflows, setWorkflows] = useState<AvailableWorkflowInfo[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);

  // Workflows with incoming webhooks enabled (webhook action type)
  const [webhookWorkflows, setWebhookWorkflows] = useState<Workflow[]>([]);
  const [isLoadingWebhookWorkflows, setIsLoadingWebhookWorkflows] = useState(false);
  const [selectedWebhookWorkflowId, setSelectedWebhookWorkflowId] = useState<string>('');

  // Track previous open state to only initialize form when dialog opens
  const prevIsOpenRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Initialize form data only when dialog opens (transitions from closed to open)
  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    // Only initialize when dialog just opened
    if (!justOpened) {
      // Reset initialization flag when dialog closes
      if (!isOpen) {
        hasInitializedRef.current = false;
      }
      return;
    }

    // Prevent double initialization
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    if (action) {
      // Type-safe config extraction based on action type
      const config = action.config;
      let scriptCommand = '';
      let scriptWorkingDir = '';
      let scriptTimeout = 30;
      let webhookUrl = '';
      let webhookMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'POST';
      let webhookHeaders = '{}';
      let webhookBody = '';
      let workflowId = '';

      if (action.actionType === 'script' && config) {
        const scriptConfig = config as ScriptConfig;
        scriptCommand = scriptConfig.command || '';
        scriptWorkingDir = scriptConfig.cwd || '';
        scriptTimeout = scriptConfig.timeoutMs
          ? Math.floor(scriptConfig.timeoutMs / 1000)
          : 30;
      } else if (action.actionType === 'webhook' && config) {
        const webhookConfig = config as MCPWebhookConfig;
        webhookUrl = webhookConfig.url || '';
        webhookMethod =
          (webhookConfig.method as typeof webhookMethod) || 'POST';
        webhookHeaders = webhookConfig.headers
          ? JSON.stringify(webhookConfig.headers, null, 2)
          : '{}';
        webhookBody = webhookConfig.payloadTemplate || '';
      } else if (action.actionType === 'workflow' && config) {
        const workflowConfig = config as WorkflowActionConfig;
        workflowId = workflowConfig.workflowId || '';
      }

      setFormData({
        name: action.name,
        description: action.description || '',
        actionType: action.actionType,
        isEnabled: action.isEnabled,
        scriptCommand,
        scriptWorkingDir,
        scriptTimeout,
        webhookUrl,
        webhookMethod,
        webhookHeaders,
        webhookBody,
        workflowId,
      });
    } else {
      // Reset form for create mode
      setFormData({
        name: '',
        description: '',
        actionType: 'script',
        isEnabled: true,
        scriptCommand: '',
        scriptWorkingDir: '',
        scriptTimeout: 30,
        webhookUrl: '',
        webhookMethod: 'POST',
        webhookHeaders: '{}',
        webhookBody: '',
        workflowId: '',
      });
    }
    setErrors({});
  }, [action, isOpen]);

  // Fetch workflows when action type changes (only when dialog is open)
  const prevActionTypeRef = useRef<MCPActionType | null>(null);
  useEffect(() => {
    // Only fetch if dialog is open and action type just changed
    if (!isOpen) {
      prevActionTypeRef.current = null;
      return;
    }

    const actionTypeChanged = formData.actionType !== prevActionTypeRef.current;
    prevActionTypeRef.current = formData.actionType;

    if (actionTypeChanged && formData.actionType === 'workflow') {
      // Fetch available workflows for workflow action type
      setIsLoadingWorkflows(true);
      workflowAPI
        .getAvailableWorkflows('')
        .then((data) => setWorkflows(data))
        .catch((err) => console.error('Failed to fetch workflows:', err))
        .finally(() => setIsLoadingWorkflows(false));
    }

    if (actionTypeChanged && formData.actionType === 'webhook') {
      // Fetch workflows with incoming webhooks enabled for webhook action type
      setIsLoadingWebhookWorkflows(true);
      setSelectedWebhookWorkflowId('');
      settingsAPI
        .loadWorkflows()
        .then((data) => {
          // Filter workflows that have incoming webhook enabled
          const withWebhooks = data.filter(
            (w) => w.incomingWebhook?.enabled && w.incomingWebhook?.token
          );
          setWebhookWorkflows(withWebhooks);
        })
        .catch((err) => console.error('Failed to fetch webhook workflows:', err))
        .finally(() => setIsLoadingWebhookWorkflows(false));
    }
  }, [isOpen, formData.actionType]);

  // Handle webhook workflow selection - auto-populate URL
  const handleWebhookWorkflowSelect = useCallback(
    (workflowId: string) => {
      setSelectedWebhookWorkflowId(workflowId);
      if (workflowId) {
        const workflow = webhookWorkflows.find((w) => w.id === workflowId);
        if (workflow?.incomingWebhook) {
          const url = generateWebhookUrl(
            workflow.incomingWebhook.port,
            workflow.incomingWebhook.token
          );
          updateField('webhookUrl', url);
          updateField('webhookMethod', 'POST');
          // Set default headers for JSON
          updateField('webhookHeaders', JSON.stringify({ 'Content-Type': 'application/json' }, null, 2));
        }
      }
    },
    [webhookWorkflows]
  );

  // Validate form
  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (formData.actionType === 'script') {
      if (!formData.scriptCommand.trim()) {
        newErrors.scriptCommand = 'Command is required';
      }
    } else if (formData.actionType === 'webhook') {
      if (!formData.webhookUrl.trim()) {
        newErrors.webhookUrl = 'URL is required';
      } else if (
        !formData.webhookUrl.startsWith('http://') &&
        !formData.webhookUrl.startsWith('https://')
      ) {
        newErrors.webhookUrl = 'URL must start with http:// or https://';
      }
      try {
        JSON.parse(formData.webhookHeaders);
      } catch {
        newErrors.webhookHeaders = 'Invalid JSON format';
      }
    } else if (formData.actionType === 'workflow') {
      if (!formData.workflowId.trim()) {
        newErrors.workflowId = 'Workflow ID is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      let config: ScriptConfig | MCPWebhookConfig | WorkflowActionConfig;

      if (formData.actionType === 'script') {
        config = {
          command: formData.scriptCommand,
          cwd: formData.scriptWorkingDir || undefined,
          timeoutMs: formData.scriptTimeout * 1000,
        };
      } else if (formData.actionType === 'webhook') {
        config = {
          url: formData.webhookUrl,
          method: formData.webhookMethod,
          headers: JSON.parse(formData.webhookHeaders),
          payloadTemplate: formData.webhookBody || undefined,
        };
      } else {
        config = {
          workflowId: formData.workflowId,
        };
      }

      await onSave({
        id: action?.id,
        name: formData.name,
        description: formData.description || undefined,
        actionType: formData.actionType,
        isEnabled: formData.isEnabled,
        config,
      });

      onClose();
    } catch (err) {
      console.error('Failed to save action:', err);
      setErrors({ name: 'Failed to save action. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }, [formData, action, validate, onSave, onClose]);

  // Update form field
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  // Get current action type config
  const currentActionType = ACTION_TYPES.find(
    (t) => t.value === formData.actionType
  );

  // Stable onOpenChange handler
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-xl max-h-[90vh] p-0 flex flex-col overflow-hidden"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {/* Header with gradient */}
        <div
          className={cn(
            'relative px-6 py-5 border-b border-border',
            'bg-gradient-to-r',
            'dark:from-amber-500/15 dark:via-amber-600/5 dark:to-transparent',
            'from-amber-500/10 via-amber-600/5 to-transparent'
          )}
        >
          {/* Help button - positioned before close button */}
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className={cn(
              'absolute right-12 top-4 p-1.5 rounded-md',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-muted/50 transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              showHelp && 'bg-muted/50 text-foreground'
            )}
            title="Help"
            aria-label="Show help"
            aria-expanded={showHelp}
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          <DialogClose onClick={onClose} disabled={isSaving} />

          <div className="flex items-center gap-4 pr-16">
            {/* Icon badge */}
            <div
              className={cn(
                'flex-shrink-0 w-12 h-12 rounded-xl',
                'flex items-center justify-center',
                'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
                'border border-amber-500/20',
                'bg-amber-500/10',
                'shadow-lg'
              )}
            >
              <Zap className="w-6 h-6 text-amber-400" />
            </div>

            <div className="flex-1 min-w-0">
              <DialogHeader className="p-0 m-0 border-0 space-y-0">
                <DialogTitle id={titleId} className="text-lg font-semibold">
                  {isEditMode ? 'Edit Action' : 'Create Action'}
                </DialogTitle>
              </DialogHeader>
              <p
                id={descriptionId}
                className="mt-1 text-sm text-muted-foreground"
              >
                {isEditMode
                  ? 'Modify the action configuration'
                  : 'Configure a new action for AI to execute'}
              </p>
            </div>
          </div>
        </div>

        {/* Help Panel */}
        {showHelp && (
          <div className="border-b border-border bg-muted/30">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-primary" />
                  Action Types Guide
                </h4>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Script */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Play className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Script</p>
                    <p className="text-muted-foreground mt-0.5">
                      Execute shell commands or scripts. Supports working directory and timeout settings.
                      Example: <code className="px-1 py-0.5 bg-muted rounded text-[11px]">npm run build</code>
                    </p>
                  </div>
                </div>

                {/* Webhook */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Webhook</p>
                    <p className="text-muted-foreground mt-0.5">
                      Send HTTP requests to external services or trigger workflows with incoming webhooks enabled.
                      Select a workflow to auto-fill URL, or enter a custom endpoint.
                    </p>
                  </div>
                </div>

                {/* Workflow */}
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <GitBranch className="w-4 h-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Workflow</p>
                    <p className="text-muted-foreground mt-0.5">
                      Trigger a PackageFlow workflow by its UUID. The workflow will execute with its configured steps.
                    </p>
                  </div>
                </div>

                {/* Tips */}
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="font-medium text-foreground mb-1.5">Tips</p>
                  <ul className="text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Actions require permission before AI can execute them</li>
                    <li>Disable an action to temporarily prevent execution</li>
                    <li>Use descriptive names to help AI understand the action's purpose</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Action Type Selector */}
          <FormField label="Action Type">
            <div className="grid grid-cols-3 gap-2">
              {ACTION_TYPES.map((type) => {
                const isSelected = formData.actionType === type.value;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => updateField('actionType', type.value)}
                    disabled={isEditMode}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-lg border',
                      'transition-all duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50 hover:bg-accent/50',
                      isEditMode && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span
                      className={cn(
                        'p-2 rounded-md',
                        type.color === 'emerald' &&
                          'bg-emerald-500/10 text-emerald-500',
                        type.color === 'blue' && 'bg-blue-500/10 text-blue-500',
                        type.color === 'purple' &&
                          'bg-purple-500/10 text-purple-500'
                      )}
                    >
                      {type.icon}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {type.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {currentActionType && (
              <p className="text-xs text-muted-foreground mt-2">
                {currentActionType.description}
              </p>
            )}
          </FormField>

          {/* Basic Info */}
          <FormField label="Name" required error={errors.name} htmlFor="action-name">
            <Input
              id="action-name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Deploy to Staging"
              aria-invalid={!!errors.name}
            />
          </FormField>

          <FormField label="Description" htmlFor="action-description">
            <Input
              id="action-description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Brief description of what this action does"
            />
          </FormField>

          {/* Script Config */}
          {formData.actionType === 'script' && (
            <>
              <FormField
                label="Command"
                required
                error={errors.scriptCommand}
                htmlFor="script-command"
                description="The shell command or script to execute"
              >
                <TextAreaField
                  id="script-command"
                  value={formData.scriptCommand}
                  onChange={(v) => updateField('scriptCommand', v)}
                  placeholder="e.g., ./deploy.sh --env staging"
                  rows={2}
                />
              </FormField>

              <FormField
                label="Working Directory"
                htmlFor="script-cwd"
                description="Leave empty to use project root"
              >
                <Input
                  id="script-cwd"
                  value={formData.scriptWorkingDir}
                  onChange={(e) => updateField('scriptWorkingDir', e.target.value)}
                  placeholder="/path/to/directory"
                />
              </FormField>

              <FormField
                label="Timeout (seconds)"
                htmlFor="script-timeout"
                description="Maximum execution time before the script is terminated"
              >
                <Input
                  id="script-timeout"
                  type="number"
                  value={formData.scriptTimeout}
                  onChange={(e) =>
                    updateField('scriptTimeout', parseInt(e.target.value, 10) || 30)
                  }
                  min={1}
                  max={3600}
                />
              </FormField>
            </>
          )}

          {/* Webhook Config */}
          {formData.actionType === 'webhook' && (
            <>
              {/* Workflow binding option */}
              <FormField
                label="Bind to Workflow"
                htmlFor="webhook-workflow"
                description="Select a workflow with incoming webhook enabled to auto-fill URL"
              >
                {isLoadingWebhookWorkflows ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading workflows...
                  </div>
                ) : webhookWorkflows.length > 0 ? (
                  <Select
                    id="webhook-workflow"
                    value={selectedWebhookWorkflowId}
                    onValueChange={handleWebhookWorkflowSelect}
                    options={[
                      { value: '', label: 'Custom URL (no binding)' },
                      ...webhookWorkflows.map((w) => ({
                        value: w.id,
                        label: `${w.name} (port ${w.incomingWebhook?.port})`,
                      })),
                    ]}
                    placeholder="Select a workflow or use custom URL..."
                    size="default"
                  />
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No workflows with incoming webhooks enabled. You can enter a custom URL below.
                  </p>
                )}
              </FormField>

              <FormField
                label="URL"
                required
                error={errors.webhookUrl}
                htmlFor="webhook-url"
                description={selectedWebhookWorkflowId ? 'Auto-filled from selected workflow' : undefined}
              >
                <Input
                  id="webhook-url"
                  value={formData.webhookUrl}
                  onChange={(e) => {
                    updateField('webhookUrl', e.target.value);
                    // Clear workflow selection if URL is manually changed
                    if (selectedWebhookWorkflowId) {
                      setSelectedWebhookWorkflowId('');
                    }
                  }}
                  placeholder="https://api.example.com/webhook"
                  aria-invalid={!!errors.webhookUrl}
                />
              </FormField>

              <FormField label="HTTP Method" htmlFor="webhook-method">
                <Select
                  id="webhook-method"
                  value={formData.webhookMethod}
                  onValueChange={(v) => updateField('webhookMethod', v)}
                  options={HTTP_METHOD_OPTIONS}
                  size="default"
                />
              </FormField>

              <FormField
                label="Headers (JSON)"
                error={errors.webhookHeaders}
                htmlFor="webhook-headers"
                description="HTTP headers to include in the request"
              >
                <TextAreaField
                  id="webhook-headers"
                  value={formData.webhookHeaders}
                  onChange={(v) => updateField('webhookHeaders', v)}
                  placeholder='{"Content-Type": "application/json"}'
                  rows={3}
                />
              </FormField>

              <FormField
                label="Body Template"
                htmlFor="webhook-body"
                description="Request body template. Use {{variable}} for dynamic values."
              >
                <TextAreaField
                  id="webhook-body"
                  value={formData.webhookBody}
                  onChange={(v) => updateField('webhookBody', v)}
                  placeholder='{"message": "{{message}}"}'
                  rows={3}
                />
              </FormField>
            </>
          )}

          {/* Workflow Config */}
          {formData.actionType === 'workflow' && (
            <FormField
              label="Workflow"
              required
              error={errors.workflowId}
              htmlFor="workflow-id"
              description="Select a PackageFlow workflow to execute"
            >
              {isLoadingWorkflows ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading workflows...
                </div>
              ) : workflows.length > 0 ? (
                <Select
                  id="workflow-id"
                  value={formData.workflowId}
                  onValueChange={(v) => updateField('workflowId', v)}
                  options={workflows.map((w) => ({
                    value: w.id,
                    label: w.name,
                  }))}
                  placeholder="Select a workflow..."
                  size="default"
                />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    No workflows found. You can enter a workflow UUID manually:
                  </p>
                  <Input
                    id="workflow-id"
                    value={formData.workflowId}
                    onChange={(e) => updateField('workflowId', e.target.value)}
                    placeholder="Enter workflow UUID"
                    aria-invalid={!!errors.workflowId}
                  />
                </div>
              )}
            </FormField>
          )}

          {/* Enabled Toggle */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 border border-border">
            <div className="space-y-0.5">
              <label
                htmlFor="action-enabled"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Enabled
              </label>
              <p className="text-xs text-muted-foreground">
                Allow AI to execute this action
              </p>
            </div>
            <Toggle
              checked={formData.isEnabled}
              onChange={(checked) => updateField('isEnabled', checked)}
              aria-label="Enable action"
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-card/50">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditMode ? 'Save Changes' : 'Create Action'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MCPActionEditor;
