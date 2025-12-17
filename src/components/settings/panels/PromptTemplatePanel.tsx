/**
 * Prompt Template Settings Panel
 * Redesigned with tabbed navigation matching AI Service Settings style
 * Features: Status card, tabbed content (Overview/Templates/Add Template)
 */

import React, { useState, useCallback, useMemo, useId, useRef } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Star,
  Edit2,
  Copy,
  Eye,
  CheckCircle2,
  XCircle,
  Check,
  Code,
  FileCode,
  BookOpen,
  GitCommit,
  GitPullRequest,
  Sparkles,
  Settings2,
  Layers,
  ShieldAlert,
} from 'lucide-react';
import { useAIService } from '../../../hooks/useAIService';
import { Button } from '../../ui/Button';
import { DeleteConfirmDialog } from '../../ui/ConfirmDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/Tabs';
import { Skeleton } from '../../ui/Skeleton';
import { TemplatePreviewDialog } from '../TemplatePreviewDialog';
import type {
  PromptTemplate,
  TemplateCategory,
  AddTemplateRequest,
  UpdateTemplateRequest,
} from '../../../types/ai';
import { TEMPLATE_CATEGORIES, getCategoryInfo } from '../../../types/ai';
import { cn } from '../../../lib/utils';

// ============================================================================
// Constants & Helpers
// ============================================================================

// Category color schemes for visual distinction
const CATEGORY_COLOR_SCHEMES: Record<TemplateCategory, {
  bg: string;
  border: string;
  text: string;
  iconBg: string;
  badge: string;
}> = {
  git_commit: {
    bg: 'bg-orange-500/5',
    border: 'border-orange-500/20',
    text: 'text-orange-600 dark:text-orange-400',
    iconBg: 'bg-orange-500/10',
    badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  pull_request: {
    bg: 'bg-purple-500/5',
    border: 'border-purple-500/20',
    text: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-500/10',
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  code_review: {
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-500/10',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  documentation: {
    bg: 'bg-green-500/5',
    border: 'border-green-500/20',
    text: 'text-green-600 dark:text-green-400',
    iconBg: 'bg-green-500/10',
    badge: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  release_notes: {
    bg: 'bg-cyan-500/5',
    border: 'border-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
    iconBg: 'bg-cyan-500/10',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  security_advisory: {
    bg: 'bg-amber-500/5',
    border: 'border-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-500/10',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  custom: {
    bg: 'bg-pink-500/5',
    border: 'border-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
    iconBg: 'bg-pink-500/10',
    badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
  },
};

// Category icons for visual hierarchy
const CATEGORY_ICONS: Record<TemplateCategory, React.ReactNode> = {
  git_commit: <GitCommit className="w-4 h-4" />,
  pull_request: <GitPullRequest className="w-4 h-4" />,
  code_review: <Code className="w-4 h-4" />,
  documentation: <BookOpen className="w-4 h-4" />,
  release_notes: <FileCode className="w-4 h-4" />,
  security_advisory: <ShieldAlert className="w-4 h-4" />,
  custom: <Sparkles className="w-4 h-4" />,
};

// Get color scheme for a category
function getCategoryColorScheme(category: TemplateCategory) {
  return CATEGORY_COLOR_SCHEMES[category] || CATEGORY_COLOR_SCHEMES.custom;
}

// Get default template content for a category (extracted for initial state usage)
function getDefaultTemplateContentForCategory(category: TemplateCategory): string {
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
    case 'security_advisory':
      return `Analyze the following security vulnerability and provide a comprehensive assessment:

Project Context:
{project_context}

Vulnerability Details:
{vulnerability_json}

Severity Summary:
{severity_summary}

Provide analysis including:
1. Risk Assessment - Impact on the project
2. Remediation Steps - How to fix this issue
3. Priority Level - Urgency of the fix
4. Dependencies - Any affected dependencies`;
    default:
      return `Process the following input:

{input}
${outputInstructions}`;
  }
}

// ============================================================================
// Loading & Error States
// ============================================================================

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <Skeleton className="w-full h-20 rounded-xl" />
    <Skeleton className="w-full h-10 rounded-lg" />
    <Skeleton className="w-full h-64 rounded-lg" />
  </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <AlertCircle className="w-12 h-12 text-destructive mb-4" />
    <p className="text-sm text-muted-foreground mb-4">{message}</p>
    <Button onClick={onRetry}>
      Retry
    </Button>
  </div>
);

// ============================================================================
// Template Status Card Component
// ============================================================================

interface TemplateStatusCardProps {
  totalTemplates: number;
  builtinCount: number;
  customCount: number;
  defaultTemplates: Record<TemplateCategory, string | undefined>;
  className?: string;
}

const TemplateStatusCard: React.FC<TemplateStatusCardProps> = ({
  totalTemplates,
  builtinCount,
  customCount,
  defaultTemplates,
  className,
}) => {
  const hasTemplates = totalTemplates > 0;
  const defaultCount = Object.values(defaultTemplates).filter(Boolean).length;

  return (
    <div className={cn('relative', className)}>
      {/* Gradient border wrapper - purple → blue → cyan theme (AI theme) */}
      <div
        className={cn(
          'absolute inset-0 rounded-xl',
          'bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500',
          'transition-opacity duration-300',
          hasTemplates ? 'opacity-100' : 'opacity-30'
        )}
      />

      {/* Inner content with background */}
      <div
        className={cn(
          'relative flex items-center gap-4 p-4 rounded-[11px] m-[1px]',
          'bg-card/95 dark:bg-card/90 backdrop-blur-sm',
          'transition-all duration-300'
        )}
      >
        {/* Icon with gradient background */}
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
            'transition-all duration-300',
            hasTemplates
              ? 'bg-gradient-to-br from-purple-500/20 via-blue-500/15 to-cyan-500/10'
              : 'bg-muted'
          )}
        >
          {hasTemplates ? (
            <svg
              className="w-6 h-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="url(#template-gradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <defs>
                <linearGradient id="template-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
          ) : (
            <FileText className="w-6 h-6 text-muted-foreground" />
          )}
        </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Prompt Templates</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
            {totalTemplates} total
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {defaultCount} categories with default templates configured
        </p>
      </div>

      {/* Status & Stats */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Stats badges */}
        <div className="hidden sm:flex items-center gap-2">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            )}
          >
            <Layers className="w-3 h-3" />
            <span>{builtinCount} Built-in</span>
          </div>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              'bg-pink-500/10 text-pink-600 dark:text-pink-400'
            )}
          >
            <Sparkles className="w-3 h-3" />
            <span>{customCount} Custom</span>
          </div>
        </div>

        {/* Status badge */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            'transition-all duration-300',
            hasTemplates
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {hasTemplates ? (
            <>
              <CheckCircle2 className="w-3 h-3" />
              <span>Ready</span>
            </>
          ) : (
            <>
              <XCircle className="w-3 h-3" />
              <span>No Templates</span>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

// ============================================================================
// Category Selector Component
// ============================================================================

interface CategorySelectorProps {
  value: TemplateCategory;
  onChange: (category: TemplateCategory) => void;
  disabled?: boolean;
  className?: string;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className,
}) => {
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {TEMPLATE_CATEGORIES.map((category) => {
        const isSelected = value === category.id;
        const colorScheme = getCategoryColorScheme(category.id);

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-2 p-3 rounded-xl',
              'border-2 transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isSelected
                ? `${colorScheme.border} ${colorScheme.bg} ${colorScheme.text}`
                : 'border-border bg-card/50 text-muted-foreground',
              !isSelected && !disabled && 'hover:border-muted-foreground hover:bg-accent/50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {/* Icon */}
            <span
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                'transition-colors duration-200',
                isSelected ? colorScheme.iconBg : 'bg-muted text-muted-foreground'
              )}
            >
              {CATEGORY_ICONS[category.id]}
            </span>

            {/* Label */}
            <span className="text-sm font-medium">{category.name}</span>

            {/* Description - hidden on mobile */}
            <span
              className={cn(
                'text-[10px] text-center leading-tight hidden sm:block',
                isSelected ? 'opacity-80' : 'text-muted-foreground'
              )}
            >
              {category.description}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// Template Card Component
// ============================================================================

interface TemplateCardProps {
  template: PromptTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onPreview: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onEdit,
  onDelete,
  onSetDefault,
  onPreview,
}) => {
  const categoryInfo = getCategoryInfo(template.category);
  const colorScheme = getCategoryColorScheme(template.category);

  return (
    <div
      className={cn(
        'p-4 rounded-xl border-2 transition-all duration-200',
        'hover:shadow-sm',
        template.isDefault
          ? `${colorScheme.border} ${colorScheme.bg}`
          : 'border-border bg-card/50'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Icon with category branding */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
              'transition-colors',
              colorScheme.iconBg,
              colorScheme.text
            )}
          >
            {CATEGORY_ICONS[template.category]}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">{template.name}</span>
              {template.isDefault && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded text-xs font-medium">
                  <Star className="w-3 h-3" />
                  Default
                </span>
              )}
              {template.isBuiltin && (
                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded text-xs font-medium">
                  Built-in
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span className={cn('font-medium', colorScheme.text)}>{categoryInfo?.name}</span>
              {template.description && (
                <>
                  <span className="text-muted-foreground/50">|</span>
                  <span className="truncate max-w-[200px]">{template.description}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPreview}
            className="h-auto p-2"
            title="Preview template"
          >
            <Eye className="w-4 h-4" />
          </Button>
          {!template.isDefault && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onSetDefault}
              className="h-auto p-2 hover:text-amber-600 dark:hover:text-amber-400"
              title="Set as default"
            >
              <Star className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="h-auto p-2"
            title={template.isBuiltin ? 'Copy template' : 'Edit template'}
          >
            {template.isBuiltin ? <Copy className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
          </Button>
          {!template.isBuiltin && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="h-auto p-2 hover:text-red-600 dark:hover:text-red-400"
              title="Delete template"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Template preview */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <div className="text-xs font-mono text-muted-foreground bg-muted/50 p-2 rounded-lg line-clamp-2">
          {template.template.substring(0, 150)}
          {template.template.length > 150 && '...'}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Overview Tab Content
// ============================================================================

interface OverviewTabProps {
  templates: PromptTemplate[];
  templateCounts: Record<TemplateCategory, number>;
  defaultTemplates: Record<TemplateCategory, PromptTemplate | undefined>;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  templates,
  templateCounts,
  defaultTemplates,
}) => {
  return (
    <div className="space-y-4 pb-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {TEMPLATE_CATEGORIES.slice(0, 3).map((category) => {
          const colorScheme = getCategoryColorScheme(category.id);
          const defaultTemplate = defaultTemplates[category.id];

          return (
            <div
              key={category.id}
              className={cn('p-3 rounded-lg', colorScheme.bg, colorScheme.border, 'border')}
            >
              <div className={cn('flex items-center gap-2 mb-1', colorScheme.text)}>
                {CATEGORY_ICONS[category.id]}
                <span className="text-xs font-medium">{category.name}</span>
              </div>
              <span className="text-lg font-semibold text-foreground">
                {templateCounts[category.id]}
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {defaultTemplate ? `Default: ${defaultTemplate.name}` : 'No default set'}
              </p>
            </div>
          );
        })}
      </div>

      {/* More Categories */}
      <div className="grid grid-cols-3 gap-3">
        {TEMPLATE_CATEGORIES.slice(3).map((category) => {
          const colorScheme = getCategoryColorScheme(category.id);
          const defaultTemplate = defaultTemplates[category.id];

          return (
            <div
              key={category.id}
              className={cn('p-3 rounded-lg', colorScheme.bg, colorScheme.border, 'border')}
            >
              <div className={cn('flex items-center gap-2 mb-1', colorScheme.text)}>
                {CATEGORY_ICONS[category.id]}
                <span className="text-xs font-medium">{category.name}</span>
              </div>
              <span className="text-lg font-semibold text-foreground">
                {templateCounts[category.id]}
              </span>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {defaultTemplate ? `Default: ${defaultTemplate.name}` : 'No default set'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Usage Info Card */}
      <div className="p-4 rounded-lg border border-border bg-card/50">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-foreground">About Prompt Templates</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Prompt templates customize how AI generates content for different tasks.
              Each category has its own set of variables like {'{diff}'}, {'{commits}'}, or {'{code}'}.
              Set a default template for each category to streamline your workflow.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {templates.length === 0 && (
        <div className="p-6 border border-dashed border-border rounded-lg bg-muted/20 text-center">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <h4 className="text-sm font-medium text-foreground mb-1">No Templates Configured</h4>
          <p className="text-xs text-muted-foreground mb-4">
            Add a prompt template to customize AI-generated content. Start with a Git Commit
            template for better commit messages.
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Templates Tab Content
// ============================================================================

interface TemplatesTabProps {
  templatesByCategory: Record<TemplateCategory, PromptTemplate[]>;
  templateCounts: Record<TemplateCategory, number>;
  onEdit: (template: PromptTemplate) => void;
  onDelete: (template: PromptTemplate) => void;
  onSetDefault: (templateId: string) => void;
  onPreview: (template: PromptTemplate) => void;
}

const TemplatesTab: React.FC<TemplatesTabProps> = ({
  templatesByCategory,
  templateCounts,
  onEdit,
  onDelete,
  onSetDefault,
  onPreview,
}) => {
  const hasAnyTemplates = Object.values(templateCounts).some((count) => count > 0);

  if (!hasAnyTemplates) {
    return (
      <div className="p-8 border border-dashed border-border rounded-lg bg-muted/20 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h4 className="text-sm font-medium text-foreground mb-1">No Templates Yet</h4>
        <p className="text-xs text-muted-foreground">
          Go to the "Add Template" tab to create your first prompt template.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {TEMPLATE_CATEGORIES.map((category) => {
        const templates = templatesByCategory[category.id];
        if (!templates || templates.length === 0) return null;

        const colorScheme = getCategoryColorScheme(category.id);

        return (
          <div key={category.id} className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <div
                className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center',
                  colorScheme.iconBg,
                  colorScheme.text
                )}
              >
                {CATEGORY_ICONS[category.id]}
              </div>
              <span className="text-sm font-medium text-foreground">{category.name}</span>
              <span className="text-xs text-muted-foreground">({templates.length})</span>
            </div>
            <div className="space-y-2">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onEdit={() => onEdit(template)}
                  onDelete={() => onDelete(template)}
                  onSetDefault={() => onSetDefault(template.id)}
                  onPreview={() => onPreview(template)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// Add/Edit Template Tab Content
// ============================================================================

interface AddTemplateTabProps {
  editingTemplate: PromptTemplate | null;
  formData: AddTemplateRequest;
  formError: string | null;
  isSubmitting: boolean;
  formId: string;
  onFormDataChange: (data: Partial<AddTemplateRequest>) => void;
  onCategoryChange: (category: TemplateCategory) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const AddTemplateTab: React.FC<AddTemplateTabProps> = ({
  editingTemplate,
  formData,
  formError,
  isSubmitting,
  formId,
  onFormDataChange,
  onCategoryChange,
  onSubmit,
  onCancel,
}) => {
  const categoryInfo = getCategoryInfo(formData.category);
  const availableVars = categoryInfo?.variables || [];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if at least one variable is used
  const hasRequiredVariable = availableVars.some((v) => formData.template.includes(`{${v}}`));

  // Insert variable at cursor position
  const insertVariable = useCallback(
    (variable: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onFormDataChange({ template: formData.template + `{${variable}}` });
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData.template;
      const newText = text.substring(0, start) + `{${variable}}` + text.substring(end);

      onFormDataChange({ template: newText });

      setTimeout(() => {
        textarea.focus();
        const newPosition = start + variable.length + 2;
        textarea.setSelectionRange(newPosition, newPosition);
      }, 0);
    },
    [formData.template, onFormDataChange]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable Form Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1 pb-10">
        {/* Form Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {editingTemplate ? 'Edit Template' : 'Add New Template'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {editingTemplate
                ? 'Update the template configuration below'
                : 'Configure a new prompt template'}
            </p>
          </div>
          {editingTemplate && (
            <Button
              variant="link"
              onClick={onCancel}
              className="h-auto p-0 text-xs"
            >
              Cancel editing
            </Button>
          )}
        </div>

        {/* Error */}
        {formError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* Category Selection */}
        {!editingTemplate && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Template Category
            </label>
            <CategorySelector
              value={formData.category}
              onChange={onCategoryChange}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Template Details Form */}
        <div className="p-4 border border-border rounded-xl bg-card/50 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Template Configuration</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label
                htmlFor={`${formId}-name`}
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                Template Name
              </label>
              <input
                id={`${formId}-name`}
                type="text"
                value={formData.name}
                onChange={(e) => onFormDataChange({ name: e.target.value })}
                placeholder={`My ${categoryInfo?.name || 'Custom'} Template`}
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-background border border-border',
                  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                  'placeholder:text-muted-foreground/50'
                )}
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor={`${formId}-description`}
                className="block text-xs font-medium text-muted-foreground mb-1.5"
              >
                Description
                <span className="font-normal text-muted-foreground/70 ml-1">(Optional)</span>
              </label>
              <input
                id={`${formId}-description`}
                type="text"
                value={formData.description || ''}
                onChange={(e) => onFormDataChange({ description: e.target.value })}
                placeholder="Brief description"
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-sm',
                  'bg-background border border-border',
                  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                  'placeholder:text-muted-foreground/50'
                )}
              />
            </div>

            {/* Template Content */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor={`${formId}-template`}
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Template Content
                </label>
                <span
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    hasRequiredVariable ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
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
                id={`${formId}-template`}
                ref={textareaRef}
                value={formData.template}
                onChange={(e) => onFormDataChange({ template: e.target.value })}
                placeholder="Enter prompt template..."
                rows={16}
                className={cn(
                  'w-full px-3 py-2 rounded-lg text-sm font-mono',
                  'bg-background border border-border',
                  'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                  'placeholder:text-muted-foreground/50',
                  'resize-y'
                )}
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
                          ? 'bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/30'
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
          </div>
        </div>
      </div>

      {/* Submit Button - Fixed at bottom */}
      <div className="shrink-0 pt-4 mt-4 border-t border-border bg-background sticky bottom-0">
        <div className="flex justify-end gap-2">
          {editingTemplate && (
            <Button
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={onSubmit}
            disabled={isSubmitting || !hasRequiredVariable}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {editingTemplate ? 'Update Template' : 'Add Template'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export function PromptTemplatePanel() {
  const {
    templates,
    isLoadingTemplates,
    templatesError,
    loadTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate,
  } = useAIService({ autoLoad: true });

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('overview');

  // UI state
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<PromptTemplate | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state - initialize with default template content for git_commit
  const [formData, setFormData] = useState<AddTemplateRequest>(() => ({
    name: '',
    description: '',
    category: 'git_commit',
    template: getDefaultTemplateContentForCategory('git_commit'),
    outputFormat: 'conventional_commits',
  }));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formId = useId();

  // Computed values
  const templatesByCategory = useMemo(() => {
    const grouped: Record<TemplateCategory, PromptTemplate[]> = {
      git_commit: [],
      pull_request: [],
      code_review: [],
      documentation: [],
      release_notes: [],
      security_advisory: [],
      custom: [],
    };
    templates.forEach((t) => {
      grouped[t.category].push(t);
    });
    return grouped;
  }, [templates]);

  const templateCounts = useMemo(() => {
    const counts: Record<TemplateCategory, number> = {
      git_commit: 0,
      pull_request: 0,
      code_review: 0,
      documentation: 0,
      release_notes: 0,
      security_advisory: 0,
      custom: 0,
    };
    templates.forEach((t) => {
      counts[t.category]++;
    });
    return counts;
  }, [templates]);

  const defaultTemplates = useMemo(() => {
    const defaults: Record<TemplateCategory, PromptTemplate | undefined> = {
      git_commit: undefined,
      pull_request: undefined,
      code_review: undefined,
      documentation: undefined,
      release_notes: undefined,
      security_advisory: undefined,
      custom: undefined,
    };
    templates.forEach((t) => {
      if (t.isDefault) {
        defaults[t.category] = t;
      }
    });
    return defaults;
  }, [templates]);

  const defaultTemplateNames = useMemo(() => {
    const names: Record<TemplateCategory, string | undefined> = {
      git_commit: undefined,
      pull_request: undefined,
      code_review: undefined,
      documentation: undefined,
      release_notes: undefined,
      security_advisory: undefined,
      custom: undefined,
    };
    Object.entries(defaultTemplates).forEach(([key, template]) => {
      if (template) {
        names[key as TemplateCategory] = template.name;
      }
    });
    return names;
  }, [defaultTemplates]);

  const builtinCount = useMemo(() => templates.filter((t) => t.isBuiltin).length, [templates]);
  const customCount = useMemo(() => templates.filter((t) => !t.isBuiltin).length, [templates]);

  // Get default template content for a category (wrapper for the extracted function)
  const getDefaultTemplateContent = useCallback((category: TemplateCategory): string => {
    return getDefaultTemplateContentForCategory(category);
  }, []);

  // Handle category change - update template content with default
  const handleCategoryChange = useCallback(
    (category: TemplateCategory) => {
      if (editingTemplate) return;
      setFormData((prev) => ({
        ...prev,
        category,
        template: getDefaultTemplateContent(category),
      }));
    },
    [editingTemplate, getDefaultTemplateContent]
  );

  // Handle form data change
  const handleFormDataChange = useCallback((data: Partial<AddTemplateRequest>) => {
    setFormData((prev) => ({ ...prev, ...data }));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    const defaultCategory: TemplateCategory = 'git_commit';
    setFormData({
      name: '',
      description: '',
      category: defaultCategory,
      template: getDefaultTemplateContent(defaultCategory),
      outputFormat: 'conventional_commits',
    });
    setEditingTemplate(null);
    setFormError(null);
  }, [getDefaultTemplateContent]);

  // Start editing template
  const handleStartEdit = useCallback((template: PromptTemplate) => {
    if (template.isBuiltin) {
      // Can't edit builtin templates, but can copy
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
      setFormError(null);
      setFormData({
        name: template.name,
        description: template.description || '',
        category: template.category,
        template: template.template,
        outputFormat: template.outputFormat,
      });
    }
    setActiveTab('add');
  }, []);

  // Cancel form
  const handleCancelForm = useCallback(() => {
    resetForm();
    setActiveTab('templates');
  }, [resetForm]);

  // Validate template content
  const validateTemplate = useCallback((content: string, category: TemplateCategory): string | null => {
    const categoryInfo = getCategoryInfo(category);
    if (!categoryInfo) return null;

    const hasVariable = categoryInfo.variables.some((v) => content.includes(`{${v}}`));
    if (!hasVariable && categoryInfo.variables.length > 0) {
      return `Template must contain at least one of: ${categoryInfo.variables.map((v) => `{${v}}`).join(', ')}`;
    }
    return null;
  }, []);

  // Submit form (add or update)
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
          resetForm();
          setActiveTab('templates');
        }
      } else {
        const result = await addTemplate(formData);
        if (result) {
          resetForm();
          setActiveTab('templates');
        }
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, editingTemplate, addTemplate, updateTemplate, validateTemplate, resetForm]);

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

  // Render header component for reuse
  const renderHeader = () => (
    <div>
      <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <FileText className="w-5 h-5" />
        Prompt Templates
      </h2>
      <p className="text-sm text-muted-foreground mt-1">
        Customize prompts for AI-powered features
      </p>
    </div>
  );

  // Render
  if (isLoadingTemplates && templates.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 pb-4">
          {renderHeader()}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  if (templatesError) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 pb-4">
          {renderHeader()}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <ErrorState message={templatesError} onRetry={loadTemplates} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header - Fixed */}
      <div className="shrink-0 pb-4">
        {renderHeader()}
      </div>

      {/* Status Card - Fixed */}
      <div className="shrink-0 pb-4">
        <TemplateStatusCard
          totalTemplates={templates.length}
          builtinCount={builtinCount}
          customCount={customCount}
          defaultTemplates={defaultTemplateNames}
        />
      </div>

      {/* Tabs - Fixed header, scrollable content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="w-full grid grid-cols-3 shrink-0 mb-4">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Templates</span>
            {templates.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-muted rounded-full">
                {templates.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="add" className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>{editingTemplate ? 'Edit' : 'Add'}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <TabsContent value="overview" className="mt-0">
            <OverviewTab
              templates={templates}
              templateCounts={templateCounts}
              defaultTemplates={defaultTemplates}
            />
          </TabsContent>

          <TabsContent value="templates" className="mt-0">
            <TemplatesTab
              templatesByCategory={templatesByCategory}
              templateCounts={templateCounts}
              onEdit={handleStartEdit}
              onDelete={setDeleteTarget}
              onSetDefault={setDefaultTemplate}
              onPreview={setPreviewTemplate}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-0">
            <AddTemplateTab
              editingTemplate={editingTemplate}
              formData={formData}
              formError={formError}
              isSubmitting={isSubmitting}
              formId={formId}
              onFormDataChange={handleFormDataChange}
              onCategoryChange={handleCategoryChange}
              onSubmit={handleSubmit}
              onCancel={handleCancelForm}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Preview Dialog */}
      <TemplatePreviewDialog
        open={previewTemplate !== null}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
        template={previewTemplate}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        itemType="Prompt Template"
        itemName={deleteTarget?.name || ''}
        isLoading={isDeleting}
      />
    </div>
  );
}
