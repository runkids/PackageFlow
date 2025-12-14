/**
 * Prompt Template Editor Component
 * @see specs/020-ai-cli-integration/tasks.md - T073-T076
 *
 * Allows users to manage AI prompt templates:
 * - List templates with preview
 * - Create/Edit templates with {diff} placeholder validation
 * - Set default template
 * - Preview sample output
 */

import { useState, useCallback, useEffect, useMemo, useId, useRef } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  Star,
  Edit2,
  RefreshCw,
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  Code,
  FileCode,
  BookOpen,
  GitCommit,
  GitPullRequest,
  Sparkles,
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
  PromptTemplate,
  TemplateCategory,
  AddTemplateRequest,
  UpdateTemplateRequest,
} from '../../types/ai';
import { TEMPLATE_CATEGORIES, getCategoryInfo } from '../../types/ai';
import { cn } from '../../lib/utils';

interface PromptTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

// Sample diff for preview
const SAMPLE_DIFF = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1234567..abcdef0 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -5,7 +5,12 @@ interface ButtonProps {
   children: React.ReactNode;
   onClick?: () => void;
   disabled?: boolean;
+  variant?: 'primary' | 'secondary' | 'danger';
+  size?: 'sm' | 'md' | 'lg';
 }

-export function Button({ children, onClick, disabled }: ButtonProps) {
+export function Button({
+  children,
+  onClick,
+  disabled,
+  variant = 'primary',
+  size = 'md'
+}: ButtonProps) {
   return (
-    <button onClick={onClick} disabled={disabled}>
+    <button
+      onClick={onClick}
+      disabled={disabled}
+      className={\`btn btn-\${variant} btn-\${size}\`}
+    >
       {children}
     </button>
   );
 }`;

// Category icons for visual hierarchy
const CATEGORY_ICONS: Record<TemplateCategory, React.ReactNode> = {
  git_commit: <GitCommit className="w-4 h-4" />,
  pull_request: <GitPullRequest className="w-4 h-4" />,
  code_review: <Code className="w-4 h-4" />,
  documentation: <BookOpen className="w-4 h-4" />,
  release_notes: <FileCode className="w-4 h-4" />,
  custom: <Sparkles className="w-4 h-4" />,
};

export function PromptTemplateEditor({ isOpen, onClose }: PromptTemplateEditorProps) {
  const {
    templates,
    isLoadingTemplates,
    templatesError,
    loadTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate,
  } = useAIService({ autoLoad: isOpen });

  // UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<AddTemplateRequest>({
    name: '',
    description: '',
    category: 'git_commit',
    template: '',
    outputFormat: 'conventional_commits',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setShowAddForm(false);
      setEditingTemplate(null);
      setPreviewTemplateId(null);
      setFormError(null);
      setDeleteTarget(null);
    }
  }, [isOpen]);

  // Validate template content - check if at least one variable is used
  const validateTemplate = useCallback((content: string, category: TemplateCategory): string | null => {
    const categoryInfo = getCategoryInfo(category);
    if (!categoryInfo) return null;

    const hasVariable = categoryInfo.variables.some((v) => content.includes(`{${v}}`));
    if (!hasVariable && categoryInfo.variables.length > 0) {
      return `Template must contain at least one of: ${categoryInfo.variables.map((v) => `{${v}}`).join(', ')}`;
    }
    return null;
  }, []);

  // Get preview content
  const getPreviewContent = useCallback((template: string): string => {
    return template.replace('{diff}', SAMPLE_DIFF);
  }, []);

  // Get default template content for a category
  const getDefaultTemplateContent = useCallback((category: TemplateCategory): string => {
    const outputInstructions = `
IMPORTANT: Output ONLY the requested content. No thinking process, no explanation, no XML tags, no markdown code blocks wrapping the output.`;

    switch (category) {
      case 'git_commit':
        return `Generate a Git commit message following Conventional Commits format.

Format: <type>(<scope>): <description>

Types: feat|fix|docs|style|refactor|test|chore

Changes:
{diff}
${outputInstructions} Just the plain commit message text.`;
      case 'pull_request':
        return `Generate a pull request description based on the following:

Branch: {branch}
Base branch: {base_branch}

Commits:
{commits}

Code changes:
{diff}

Create a PR description with:
1. A brief summary (1-2 sentences)
2. Key changes (bullet points)
3. Breaking changes if applicable

Use markdown formatting for the content.`;
      case 'code_review':
        return `Review the following code changes:

File: {file_path}

{diff}

Provide feedback on:
1. Code quality
2. Potential issues
3. Suggestions for improvement`;
      case 'documentation':
        return `Generate documentation for the following code:

File: {file_path}
Function: {function_name}

{code}

Create clear and concise documentation.`;
      case 'release_notes':
        return `Generate release notes for version {version} (previous: {previous_version}):

Commits:
{commits}

Create release notes with sections for:
- New Features
- Bug Fixes
- Improvements
- Breaking Changes`;
      default:
        return `Process the following input:

{input}
${outputInstructions}`;
    }
  }, []);

  // Start adding new template
  const handleStartAdd = useCallback(() => {
    setShowAddForm(true);
    setEditingTemplate(null);
    setFormError(null);
    const defaultCategory: TemplateCategory = 'git_commit';
    setFormData({
      name: '',
      description: '',
      category: defaultCategory,
      template: getDefaultTemplateContent(defaultCategory),
      outputFormat: 'conventional_commits',
    });
  }, [getDefaultTemplateContent]);

  // Start editing template
  const handleStartEdit = useCallback((template: PromptTemplate) => {
    if (template.isBuiltin) {
      // Can't edit builtin templates, but can copy
      setShowAddForm(true);
      setEditingTemplate(null);
      setFormError(null);
      setFormData({
        name: `${template.name} (Copy)`,
        description: template.description || '',
        category: template.category,
        template: template.template,
        outputFormat: template.outputFormat,
      });
    } else {
      setEditingTemplate(template);
      setShowAddForm(false);
      setFormError(null);
      setFormData({
        name: template.name,
        description: template.description || '',
        category: template.category,
        template: template.template,
        outputFormat: template.outputFormat,
      });
    }
  }, []);

  // Cancel form
  const handleCancelForm = useCallback(() => {
    setShowAddForm(false);
    setEditingTemplate(null);
    setFormError(null);
  }, []);

  // Submit form
  const handleSubmit = useCallback(async () => {
    if (!formData.name.trim()) {
      setFormError('Please enter a template name');
      return;
    }
    if (!formData.template.trim()) {
      setFormError('Please enter template content');
      return;
    }
    const templateError = validateTemplate(formData.template, formData.category);
    if (templateError) {
      setFormError(templateError);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingTemplate) {
        const updateData: UpdateTemplateRequest = {
          id: editingTemplate.id,
          name: formData.name,
          description: formData.description || undefined,
          template: formData.template,
        };
        const result = await updateTemplate(updateData);
        if (result) {
          setEditingTemplate(null);
        }
      } else {
        const result = await addTemplate(formData);
        if (result) {
          setShowAddForm(false);
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingTemplate, addTemplate, updateTemplate, validateTemplate]);

  // Delete template with confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteTemplate]);

  // Set as default
  const handleSetDefault = useCallback(async (id: string) => {
    await setDefaultTemplate(id);
  }, [setDefaultTemplate]);

  // Get preview template
  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) return null;
    return templates.find(t => t.id === previewTemplateId);
  }, [previewTemplateId, templates]);

  // Count templates per category
  const templateCounts = useMemo(() => {
    const counts: Record<TemplateCategory, number> = {
      git_commit: 0,
      pull_request: 0,
      code_review: 0,
      documentation: 0,
      release_notes: 0,
      custom: 0,
    };
    templates.forEach(t => {
      counts[t.category]++;
    });
    return counts;
  }, [templates]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span>Prompt Templates</span>
            </DialogTitle>
            <DialogClose onClick={onClose} />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 py-2 pr-2 -mr-2 space-y-4">
            {/* Error display */}
            {templatesError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{templatesError}</p>
                <button
                  onClick={loadTemplates}
                  className="ml-auto p-1 hover:bg-red-500/20 rounded transition-colors"
                  aria-label="Retry loading templates"
                >
                  <RefreshCw className="w-4 h-4 text-red-400" />
                </button>
              </div>
            )}

            {/* Loading state */}
            {isLoadingTemplates && templates.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            )}

            {/* Template list - grouped by category */}
            {!showAddForm && !editingTemplate && (
              <>
                <div className="space-y-6">
                  {TEMPLATE_CATEGORIES.map((category) => {
                    const categoryTemplates = templates.filter((t) => t.category === category.id);
                    if (categoryTemplates.length === 0) return null;

                    const defaultTemplate = categoryTemplates.find((t) => t.isDefault);

                    return (
                      <CategorySection
                        key={category.id}
                        category={category}
                        defaultTemplateName={defaultTemplate?.name}
                        count={templateCounts[category.id]}
                      >
                        {categoryTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onEdit={() => handleStartEdit(template)}
                            onDelete={() => setDeleteTarget(template)}
                            onSetDefault={() => handleSetDefault(template.id)}
                            onPreview={() => setPreviewTemplateId(template.id)}
                          />
                        ))}
                      </CategorySection>
                    );
                  })}
                </div>

                {/* Empty state */}
                {templates.length === 0 && !isLoadingTemplates && (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No templates yet. Create your first template to get started.
                    </p>
                    <button
                      onClick={handleStartAdd}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Create Template
                    </button>
                  </div>
                )}

                {/* Add button */}
                {templates.length > 0 && (
                  <button
                    onClick={handleStartAdd}
                    className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-muted rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add Template</span>
                  </button>
                )}
              </>
            )}

            {/* Add/Edit form */}
            {(showAddForm || editingTemplate) && (
              <TemplateForm
                formData={formData}
                setFormData={setFormData}
                formError={formError}
                isSubmitting={isSubmitting}
                isEditing={!!editingTemplate}
                onSubmit={handleSubmit}
                onCancel={handleCancelForm}
                getDefaultTemplateContent={getDefaultTemplateContent}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplateId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              <span>Preview: {previewTemplate?.name}</span>
            </DialogTitle>
            <DialogClose onClick={() => setPreviewTemplateId(null)} />
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 py-2 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-foreground">Template Content</h4>
                <span className="text-xs text-muted-foreground">
                  {previewTemplate?.template.length} characters
                </span>
              </div>
              <pre className="p-4 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-48 border border-border">
                {previewTemplate?.template}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-foreground">
                  Expanded Prompt
                </h4>
                <span className="text-xs text-muted-foreground bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">
                  with sample diff
                </span>
              </div>
              <pre className="p-4 bg-card border border-border rounded-lg text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-80">
                {previewTemplate && getPreviewContent(previewTemplate.template)}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setPreviewTemplateId(null)}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        itemType="template"
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

interface CategorySectionProps {
  category: {
    id: TemplateCategory;
    name: string;
    description: string;
  };
  defaultTemplateName?: string;
  count: number;
  children: React.ReactNode;
}

function CategorySection({ category, defaultTemplateName, count, children }: CategorySectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {CATEGORY_ICONS[category.id]}
          </span>
          <div>
            <h3 className="text-sm font-medium flex items-center gap-2">
              {category.name}
              <span className="text-xs text-muted-foreground font-normal">
                ({count})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">{category.description}</p>
          </div>
        </div>
        {defaultTemplateName && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="w-3 h-3 text-yellow-500" />
            Default: <span className="text-yellow-500 font-medium">{defaultTemplateName}</span>
          </span>
        )}
      </div>
      <div className="space-y-2 pl-6 border-l-2 border-muted">
        {children}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onPreview: () => void;
}

function TemplateCard({
  template,
  onEdit,
  onDelete,
  onSetDefault,
  onPreview,
}: TemplateCardProps) {
  return (
    <div className={cn(
      'bg-card border rounded-lg p-3 space-y-2',
      template.isDefault ? 'border-yellow-500/50 ring-1 ring-yellow-500/20' : 'border-border'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className={cn(
            'w-4 h-4 shrink-0',
            template.isDefault ? 'text-yellow-500' : 'text-muted-foreground'
          )} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{template.name}</span>
              {template.isDefault && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded text-xs font-medium shrink-0">
                  <Star className="w-3 h-3" />
                  Default
                </span>
              )}
              {template.isBuiltin && (
                <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs shrink-0">
                  Built-in
                </span>
              )}
            </div>
            {template.description && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {template.description}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onPreview}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Preview template"
            aria-label={`Preview ${template.name}`}
          >
            <Eye className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title={template.isBuiltin ? 'Copy template' : 'Edit template'}
            aria-label={template.isBuiltin ? `Copy ${template.name}` : `Edit ${template.name}`}
          >
            {template.isBuiltin ? (
              <Copy className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Edit2 className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          {!template.isBuiltin && (
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-accent rounded transition-colors"
              title="Delete template"
              aria-label={`Delete ${template.name}`}
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Template preview */}
      <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded truncate">
        {template.template.substring(0, 100)}...
      </div>

      {/* Set as default for this category */}
      {!template.isDefault && (
        <button
          onClick={onSetDefault}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Star className="w-3 h-3" />
          Set as Default for this category
        </button>
      )}
    </div>
  );
}

interface TemplateFormProps {
  formData: AddTemplateRequest;
  setFormData: React.Dispatch<React.SetStateAction<AddTemplateRequest>>;
  formError: string | null;
  isSubmitting: boolean;
  isEditing: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  getDefaultTemplateContent: (category: TemplateCategory) => string;
}

function TemplateForm({
  formData,
  setFormData,
  formError,
  isSubmitting,
  isEditing,
  onSubmit,
  onCancel,
  getDefaultTemplateContent,
}: TemplateFormProps) {
  const categoryInfo = getCategoryInfo(formData.category);
  const availableVars = categoryInfo?.variables || [];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Generate unique IDs for form fields
  const nameId = useId();
  const descriptionId = useId();
  const templateId = useId();

  // Check if at least one variable is used
  const hasRequiredVariable = availableVars.some((v) => formData.template.includes(`{${v}}`));

  // Insert variable at cursor position
  const insertVariable = useCallback((variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // Fallback: append to end
      setFormData((prev) => ({ ...prev, template: prev.template + `{${variable}}` }));
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.template;
    const newText = text.substring(0, start) + `{${variable}}` + text.substring(end);

    setFormData((prev) => ({ ...prev, template: newText }));

    // Restore cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + variable.length + 2; // +2 for { and }
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  }, [formData.template, setFormData]);

  // Handle category change - update template content with default
  const handleCategoryChange = useCallback((category: TemplateCategory) => {
    if (isEditing) return;
    setFormData((prev) => ({
      ...prev,
      category,
      template: getDefaultTemplateContent(category),
    }));
  }, [isEditing, getDefaultTemplateContent, setFormData]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h3 className="font-medium text-lg">{isEditing ? 'Edit Template' : 'Add Template'}</h3>

      {/* Error */}
      {formError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{formError}</p>
        </div>
      )}

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Category</label>
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              disabled={isEditing}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                formData.category === cat.id
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/50'
                  : 'border-border hover:border-muted-foreground hover:bg-accent/50',
                isEditing && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  formData.category === cat.id ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {CATEGORY_ICONS[cat.id]}
                </span>
                <span className="font-medium text-sm">{cat.name}</span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">{cat.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-foreground mb-1">
          Template Name
        </label>
        <input
          id={nameId}
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., My Conventional Commits"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
          autoFocus={!isEditing}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor={descriptionId} className="block text-sm font-medium text-foreground mb-1">
          Description
          <span className="font-normal text-muted-foreground ml-1">(Optional)</span>
        </label>
        <input
          id={descriptionId}
          type="text"
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Brief description of this template"
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors"
        />
      </div>

      {/* Template content */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor={templateId} className="block text-sm font-medium text-foreground">
            Template Content
          </label>
          <span className={cn(
            'flex items-center gap-1 text-xs',
            hasRequiredVariable ? 'text-green-500' : 'text-red-500'
          )}>
            {hasRequiredVariable ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Has required variable
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                Missing required variable
              </>
            )}
          </span>
        </div>
        <textarea
          id={templateId}
          ref={textareaRef}
          value={formData.template}
          onChange={(e) => setFormData((prev) => ({ ...prev, template: e.target.value }))}
          placeholder="Enter prompt template..."
          rows={12}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-y transition-colors"
        />

        {/* Variable buttons */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Insert variable:</span>
          {availableVars.map((v) => {
            const isUsed = formData.template.includes(`{${v}}`);
            return (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-mono transition-colors',
                  isUsed
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                title={isUsed ? `{${v}} is used in template` : `Click to insert {${v}}`}
              >
                {`{${v}}`}
                {isUsed && <Check className="w-3 h-3 inline ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

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
          disabled={isSubmitting || !hasRequiredVariable}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {isEditing ? 'Save Changes' : 'Add Template'}
        </button>
      </DialogFooter>
    </div>
  );
}
