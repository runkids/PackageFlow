/**
 * AI Service Settings Dialog
 * @see specs/020-ai-cli-integration/tasks.md - T034-T039
 *
 * Allows users to manage AI service configurations:
 * - Add/Edit/Delete AI services (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
 * - Test connections
 * - Set default service
 * - List available models (for local services)
 */

import { useState, useCallback, useEffect, useId } from 'react';
import {
  Bot,
  Plus,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Star,
  Edit2,
  RefreshCw,
  Eye,
  EyeOff,
  Shield,
  Cloud,
  Server,
} from 'lucide-react';
import { useAIService } from '../../hooks/useAIService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogFooter,
} from '../ui/Dialog';
import { DeleteConfirmDialog } from '../ui/ConfirmDialog';
import type {
  AIProvider,
  AIServiceConfig,
  AddServiceRequest,
  TestConnectionResult,
  ModelInfo,
} from '../../types/ai';
import { AI_PROVIDERS, getProviderInfo, providerRequiresApiKey } from '../../types/ai';
import { cn } from '../../lib/utils';

interface AIServiceSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIServiceSettingsDialog({ isOpen, onClose }: AIServiceSettingsDialogProps) {
  const {
    services,
    isLoadingServices,
    servicesError,
    loadServices,
    addService,
    updateService,
    deleteService,
    setDefaultService,
    testConnection,
    listModels,
  } = useAIService({ autoLoad: isOpen });

  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingService, setEditingService] = useState<AIServiceConfig | null>(null);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestConnectionResult>>({});
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, ModelInfo[]>>({});

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<AIServiceConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AddServiceRequest>({
    name: '',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    apiKey: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowAddForm(false);
      setEditingService(null);
      setFormError(null);
      setTestResult({});
      setDeleteTarget(null);
    }
  }, [isOpen]);

  // Handle provider change - update defaults
  const handleProviderChange = useCallback((provider: AIProvider) => {
    const info = getProviderInfo(provider);
    if (info) {
      setFormData((prev) => ({
        ...prev,
        provider,
        endpoint: info.defaultEndpoint,
        model: info.defaultModel,
        apiKey: '',
      }));
    }
  }, []);

  // Start adding new service
  const handleStartAdd = useCallback(() => {
    setShowAddForm(true);
    setEditingService(null);
    setFormError(null);
    const defaultProvider = AI_PROVIDERS[3]; // Ollama - local first for privacy
    setFormData({
      name: '',
      provider: defaultProvider.id,
      endpoint: defaultProvider.defaultEndpoint,
      model: defaultProvider.defaultModel,
      apiKey: '',
    });
  }, []);

  // Start editing service
  const handleStartEdit = useCallback((service: AIServiceConfig) => {
    setEditingService(service);
    setShowAddForm(false);
    setFormError(null);
    setFormData({
      name: service.name,
      provider: service.provider,
      endpoint: service.endpoint,
      model: service.model,
      apiKey: '', // Don't show existing key
    });
  }, []);

  // Cancel form
  const handleCancelForm = useCallback(() => {
    setShowAddForm(false);
    setEditingService(null);
    setFormError(null);
  }, []);

  // Submit form (add or update)
  const handleSubmit = useCallback(async () => {
    if (!formData.name.trim()) {
      setFormError('Please enter a service name');
      return;
    }
    if (!formData.endpoint.trim()) {
      setFormError('Please enter an API endpoint');
      return;
    }
    if (!formData.model.trim()) {
      setFormError('Please enter a model name');
      return;
    }
    if (providerRequiresApiKey(formData.provider) && !editingService && !formData.apiKey?.trim()) {
      setFormError('Please enter an API key');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingService) {
        // Update existing service
        const result = await updateService({
          id: editingService.id,
          name: formData.name,
          endpoint: formData.endpoint,
          model: formData.model,
          apiKey: formData.apiKey || undefined,
        });
        if (result) {
          setEditingService(null);
        }
      } else {
        // Add new service
        const result = await addService(formData);
        if (result) {
          setShowAddForm(false);
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingService, addService, updateService]);

  // Delete service with confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteService(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteService]);

  // Test connection
  const handleTestConnection = useCallback(async (id: string) => {
    setTestingServiceId(id);
    // Clear previous result for this service
    setTestResult((prev) => {
      const newResults = { ...prev };
      delete newResults[id];
      return newResults;
    });
    try {
      const result = await testConnection(id);
      if (result) {
        setTestResult((prev) => ({ ...prev, [id]: result }));
      }
    } finally {
      setTestingServiceId(null);
    }
  }, [testConnection]);

  // Load available models (for Ollama/LM Studio)
  const handleLoadModels = useCallback(async (serviceId: string) => {
    setLoadingModels(serviceId);
    try {
      const models = await listModels(serviceId);
      setAvailableModels((prev) => ({ ...prev, [serviceId]: models }));
    } finally {
      setLoadingModels(null);
    }
  }, [listModels]);

  // Set as default
  const handleSetDefault = useCallback(async (id: string) => {
    await setDefaultService(id);
  }, [setDefaultService]);

  // Group services by type (cloud vs local)
  const cloudServices = services.filter(s => providerRequiresApiKey(s.provider));
  const localServices = services.filter(s => !providerRequiresApiKey(s.provider));

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span>AI Service Settings</span>
            </DialogTitle>
            <DialogClose onClick={onClose} />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 py-2 pr-2 -mr-2 space-y-6">
            {/* Error display */}
            {servicesError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{servicesError}</p>
                <button
                  onClick={loadServices}
                  className="ml-auto p-1 hover:bg-red-500/20 rounded transition-colors"
                  aria-label="Retry loading services"
                >
                  <RefreshCw className="w-4 h-4 text-red-400" />
                </button>
              </div>
            )}

            {/* Loading state */}
            {isLoadingServices && services.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            )}

            {/* Service list */}
            {!showAddForm && !editingService && (
              <>
                {/* Local Services Section */}
                {localServices.length > 0 && (
                  <ServiceSection
                    title="Local Services"
                    description="Privacy-first AI running on your machine"
                    icon={<Server className="w-4 h-4" />}
                  >
                    {localServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        testResult={testResult[service.id]}
                        isTesting={testingServiceId === service.id}
                        isLoadingModels={loadingModels === service.id}
                        availableModels={availableModels[service.id]}
                        onEdit={() => handleStartEdit(service)}
                        onDelete={() => setDeleteTarget(service)}
                        onTest={() => handleTestConnection(service.id)}
                        onLoadModels={() => handleLoadModels(service.id)}
                        onSetDefault={() => handleSetDefault(service.id)}
                      />
                    ))}
                  </ServiceSection>
                )}

                {/* Cloud Services Section */}
                {cloudServices.length > 0 && (
                  <ServiceSection
                    title="Cloud Services"
                    description="API-based services with your own keys"
                    icon={<Cloud className="w-4 h-4" />}
                  >
                    {cloudServices.map((service) => (
                      <ServiceCard
                        key={service.id}
                        service={service}
                        testResult={testResult[service.id]}
                        isTesting={testingServiceId === service.id}
                        isLoadingModels={false}
                        availableModels={undefined}
                        onEdit={() => handleStartEdit(service)}
                        onDelete={() => setDeleteTarget(service)}
                        onTest={() => handleTestConnection(service.id)}
                        onLoadModels={() => {}}
                        onSetDefault={() => handleSetDefault(service.id)}
                      />
                    ))}
                  </ServiceSection>
                )}

                {/* Empty state */}
                {services.length === 0 && !isLoadingServices && (
                  <div className="text-center py-8">
                    <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No AI services configured yet
                    </p>
                    <button
                      onClick={handleStartAdd}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Your First Service
                    </button>
                  </div>
                )}

                {/* Add button */}
                {services.length > 0 && (
                  <button
                    onClick={handleStartAdd}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-muted rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add AI Service</span>
                  </button>
                )}
              </>
            )}

            {/* Add/Edit form */}
            {(showAddForm || editingService) && (
              <ServiceForm
                formData={formData}
                setFormData={setFormData}
                formError={formError}
                isSubmitting={isSubmitting}
                isEditing={!!editingService}
                onProviderChange={handleProviderChange}
                onSubmit={handleSubmit}
                onCancel={handleCancelForm}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        itemType="AI service"
        itemName={deleteTarget?.name || ''}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
      />
    </>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface ServiceSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function ServiceSection({ title, description, icon, children }: ServiceSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-2 pl-6 border-l-2 border-muted">
        {children}
      </div>
    </div>
  );
}

interface ServiceCardProps {
  service: AIServiceConfig;
  testResult?: TestConnectionResult;
  isTesting: boolean;
  isLoadingModels: boolean;
  availableModels?: ModelInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onLoadModels: () => void;
  onSetDefault: () => void;
}

function ServiceCard({
  service,
  testResult,
  isTesting,
  isLoadingModels,
  availableModels,
  onEdit,
  onDelete,
  onTest,
  onLoadModels,
  onSetDefault,
}: ServiceCardProps) {
  const providerInfo = getProviderInfo(service.provider);
  const isLocalProvider = service.provider === 'ollama' || service.provider === 'lm_studio';

  // Connection status indicator
  const getConnectionStatus = () => {
    if (isTesting) return 'testing';
    if (testResult?.success) return 'connected';
    if (testResult && !testResult.success) return 'failed';
    return 'unknown';
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div
      className={cn(
        'bg-card border rounded-lg p-4 space-y-3',
        service.isDefault ? 'border-yellow-500/50 ring-1 ring-yellow-500/20' : 'border-border'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Status indicator dot */}
          <div className="relative">
            <div className={cn(
              'p-2 rounded-lg',
              service.isEnabled ? 'bg-primary/10' : 'bg-muted'
            )}>
              <Bot className={cn(
                'w-5 h-5',
                service.isEnabled ? 'text-primary' : 'text-muted-foreground'
              )} />
            </div>
            {/* Connection status dot */}
            <div className={cn(
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card',
              connectionStatus === 'connected' && 'bg-green-500',
              connectionStatus === 'failed' && 'bg-red-500',
              connectionStatus === 'testing' && 'bg-yellow-500 animate-pulse',
              connectionStatus === 'unknown' && 'bg-muted-foreground/50'
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{service.name}</span>
              {service.isDefault && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded text-xs font-medium">
                  <Star className="w-3 h-3" />
                  Default
                </span>
              )}
              {!service.isEnabled && (
                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                  Disabled
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {providerInfo?.name} - <code className="text-xs">{service.model}</code>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onTest}
            disabled={isTesting}
            className="p-2 hover:bg-accent rounded transition-colors disabled:opacity-50"
            title="Test Connection"
            aria-label={`Test connection for ${service.name}`}
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : connectionStatus === 'connected' ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : connectionStatus === 'failed' ? (
              <WifiOff className="w-4 h-4 text-red-500" />
            ) : (
              <Wifi className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-accent rounded transition-colors"
            title="Edit"
            aria-label={`Edit ${service.name}`}
          >
            <Edit2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-accent rounded transition-colors"
            title="Delete"
            aria-label={`Delete ${service.name}`}
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          'p-2 rounded text-sm flex items-center gap-2',
          testResult.success
            ? 'bg-green-500/10 text-green-400'
            : 'bg-red-500/10 text-red-400'
        )}>
          {testResult.success ? (
            <>
              <Check className="w-4 h-4 shrink-0" />
              <span>Connection successful ({testResult.latencyMs}ms)</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{testResult.error || 'Connection failed'}</span>
            </>
          )}
        </div>
      )}

      {/* Load models button (for local providers) */}
      {isLocalProvider && (
        <div className="space-y-2">
          <button
            onClick={onLoadModels}
            disabled={isLoadingModels}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="Load available models"
          >
            {isLoadingModels ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>Load Available Models</span>
          </button>

          {availableModels && availableModels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {availableModels.map((model) => (
                <span
                  key={model.name}
                  className={cn(
                    'px-2 py-1 rounded text-xs',
                    model.name === service.model
                      ? 'bg-primary/20 text-primary font-medium'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {model.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Set as default */}
      {!service.isDefault && service.isEnabled && (
        <button
          onClick={onSetDefault}
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <Star className="w-3 h-3" />
          Set as Default
        </button>
      )}
    </div>
  );
}

interface ServiceFormProps {
  formData: AddServiceRequest;
  setFormData: React.Dispatch<React.SetStateAction<AddServiceRequest>>;
  formError: string | null;
  isSubmitting: boolean;
  isEditing: boolean;
  onProviderChange: (provider: AIProvider) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function ServiceForm({
  formData,
  setFormData,
  formError,
  isSubmitting,
  isEditing,
  onProviderChange,
  onSubmit,
  onCancel,
}: ServiceFormProps) {
  const needsApiKey = providerRequiresApiKey(formData.provider);
  const [showApiKey, setShowApiKey] = useState(false);

  // Generate unique IDs for form fields
  const nameId = useId();
  const endpointId = useId();
  const modelId = useId();
  const apiKeyId = useId();

  // Group providers by type
  const cloudProviders = AI_PROVIDERS.filter(p => p.requiresApiKey);
  const localProviders = AI_PROVIDERS.filter(p => !p.requiresApiKey);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h3 className="font-medium text-lg">{isEditing ? 'Edit AI Service' : 'Add AI Service'}</h3>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{formError}</p>
        </div>
      )}

      {/* Provider selection */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Service Provider</label>

        {/* Local providers */}
        <div className="mb-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Server className="w-3 h-3" />
            Local (Privacy-First)
          </span>
          <div className="grid grid-cols-2 gap-2">
            {localProviders.map((provider) => (
              <ProviderButton
                key={provider.id}
                provider={provider}
                selected={formData.provider === provider.id}
                disabled={isEditing}
                onClick={() => !isEditing && onProviderChange(provider.id)}
              />
            ))}
          </div>
        </div>

        {/* Cloud providers */}
        <div>
          <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Cloud className="w-3 h-3" />
            Cloud (Requires API Key)
          </span>
          <div className="grid grid-cols-3 gap-2">
            {cloudProviders.map((provider) => (
              <ProviderButton
                key={provider.id}
                provider={provider}
                selected={formData.provider === provider.id}
                disabled={isEditing}
                onClick={() => !isEditing && onProviderChange(provider.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-foreground mb-1">
          Service Name
        </label>
        <input
          id={nameId}
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Local Ollama, Company OpenAI"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
          autoFocus={!isEditing}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          A friendly name to identify this service
        </p>
      </div>

      {/* Endpoint */}
      <div>
        <label htmlFor={endpointId} className="block text-sm font-medium text-foreground mb-1">
          API Endpoint
        </label>
        <input
          id={endpointId}
          type="url"
          value={formData.endpoint}
          onChange={(e) => setFormData((prev) => ({ ...prev, endpoint: e.target.value }))}
          placeholder="e.g., https://api.openai.com/v1"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
        />
      </div>

      {/* Model */}
      <div>
        <label htmlFor={modelId} className="block text-sm font-medium text-foreground mb-1">
          Model Name
        </label>
        <input
          id={modelId}
          type="text"
          value={formData.model}
          onChange={(e) => setFormData((prev) => ({ ...prev, model: e.target.value }))}
          placeholder="e.g., gpt-4o-mini, llama3.2"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The model identifier to use for AI generation
        </p>
      </div>

      {/* API Key (for cloud providers) */}
      {needsApiKey && (
        <div>
          <label htmlFor={apiKeyId} className="block text-sm font-medium text-foreground mb-1">
            API Key{' '}
            {isEditing && <span className="font-normal text-muted-foreground">(leave empty to keep unchanged)</span>}
          </label>
          <div className="relative">
            <input
              id={apiKeyId}
              type={showApiKey ? 'text' : 'password'}
              value={formData.apiKey || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
              placeholder={isEditing ? '••••••••••••••••' : 'Enter API key'}
              className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="mt-2 flex items-start gap-2 p-2 bg-muted/50 rounded-lg">
            <Shield className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              Your API key is encrypted and stored securely in the system keychain. It is never sent to any server except the configured AI provider.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <DialogFooter className="border-t-0 pt-2 mt-4">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {isEditing ? 'Save Changes' : 'Add Service'}
        </button>
      </DialogFooter>
    </div>
  );
}

interface ProviderButtonProps {
  provider: {
    id: AIProvider;
    name: string;
    description: string;
  };
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ProviderButton({ provider, selected, disabled, onClick }: ProviderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-3 rounded-lg border text-left transition-all',
        selected
          ? 'border-primary bg-primary/10 ring-1 ring-primary/50'
          : 'border-border hover:border-muted-foreground hover:bg-accent/50',
        disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
      )}
    >
      <div className="font-medium text-sm">{provider.name}</div>
      <div className="text-xs text-muted-foreground line-clamp-1">{provider.description}</div>
    </button>
  );
}
