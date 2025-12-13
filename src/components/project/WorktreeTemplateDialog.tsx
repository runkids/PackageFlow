/**
 * Worktree Template Dialog Component
 * Create worktrees from templates with preset configurations
 * @see specs/001-worktree-enhancements/tasks.md - T052-T055
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  GitBranch,
  Play,
  Code2,
  Plus,
  Trash2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import {
  worktreeTemplateAPI,
  worktreeAPI,
  type WorktreeTemplate,
  type EditorDefinition,
} from '../../lib/tauri-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { DeleteConfirmDialog } from '../ui/ConfirmDialog';
import { Select, type SelectOption } from '../ui/Select';

interface WorktreeTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  projectName: string;
  branches: string[];
  onWorktreeCreated?: (worktreePath?: string) => void;
  onRunPostCreateScript?: (worktreePath: string, scriptName: string) => void;
}

type DialogView = 'select' | 'create' | 'manage';

// Sub-component: Base Branch Select
interface BaseBranchSelectProps {
  branches: string[];
  value: string;
  onValueChange: (value: string) => void;
}

function BaseBranchSelect({ branches, value, onValueChange }: BaseBranchSelectProps) {
  const options = useMemo<SelectOption[]>(
    () => branches.map((branch) => ({ value: branch, label: branch })),
    [branches]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-foreground/90 mb-2">
        Base Branch
      </label>
      <Select
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder="Select base branch..."
        aria-label="Base branch"
      />
    </div>
  );
}

// Sub-component: Preferred Editor Select
interface PreferredEditorSelectProps {
  editors: EditorDefinition[];
  value: string;
  onValueChange: (value: string) => void;
}

function PreferredEditorSelect({ editors, value, onValueChange }: PreferredEditorSelectProps) {
  const options = useMemo<SelectOption[]>(
    () => [
      { value: '', label: 'System Default' },
      ...editors.map((editor) => ({
        value: editor.id,
        label: editor.name,
      })),
    ],
    [editors]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-foreground/90 mb-2">
        Preferred Editor
      </label>
      <Select
        value={value}
        onValueChange={onValueChange}
        options={options}
        placeholder="Select editor..."
        aria-label="Preferred editor"
      />
    </div>
  );
}

export function WorktreeTemplateDialog({
  isOpen,
  onClose,
  projectPath,
  projectName,
  branches,
  onWorktreeCreated,
  onRunPostCreateScript,
}: WorktreeTemplateDialogProps) {
  const [view, setView] = useState<DialogView>('select');
  const [templates, setTemplates] = useState<WorktreeTemplate[]>([]);
  const [defaultTemplates, setDefaultTemplates] = useState<WorktreeTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Template selection state
  const [selectedTemplate, setSelectedTemplate] = useState<WorktreeTemplate | null>(null);
  const [featureName, setFeatureName] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [isCreating, setIsCreating] = useState(false);
  const [nextFeatureNumber, setNextFeatureNumber] = useState<string | null>(null);

  // Custom template editing state
  const [editingTemplate, setEditingTemplate] = useState<Partial<WorktreeTemplate> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation dialog state
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Available editors
  const [availableEditors, setAvailableEditors] = useState<EditorDefinition[]>([]);

  // Load templates
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [savedResult, defaultResult, editorsResult] = await Promise.all([
        worktreeTemplateAPI.listTemplates(),
        worktreeTemplateAPI.getDefaultTemplates(),
        worktreeAPI.getAvailableEditors(),
      ]);

      if (savedResult.success && savedResult.templates) {
        setTemplates(savedResult.templates);
      }
      if (defaultResult.success && defaultResult.templates) {
        setDefaultTemplates(defaultResult.templates);
      }
      if (editorsResult.success && editorsResult.editors) {
        setAvailableEditors(editorsResult.editors.filter(e => e.isAvailable));
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setView('select');
      setSelectedTemplate(null);
      setFeatureName('');
      setBaseBranch(branches.includes('main') ? 'main' : branches[0] || 'main');
      setNextFeatureNumber(null);
    }
  }, [isOpen, loadTemplates, branches]);

  const isNumberedTemplate = Boolean(
    selectedTemplate
      && (selectedTemplate.branchPattern.includes('{num}') || selectedTemplate.pathPattern.includes('{num}'))
  );

  useEffect(() => {
    if (!isOpen || view !== 'create' || !selectedTemplate) return;
    if (!isNumberedTemplate) {
      setNextFeatureNumber(null);
      return;
    }

    let cancelled = false;
    worktreeTemplateAPI
      .getNextFeatureNumber(projectPath)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.featureNumber) {
          setNextFeatureNumber(res.featureNumber);
          return;
        }
        setNextFeatureNumber(null);
      })
      .catch(() => {
        if (!cancelled) setNextFeatureNumber(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, view, selectedTemplate, isNumberedTemplate, projectPath]);

  // Get all available templates (defaults + custom)
  const allTemplates = [...defaultTemplates, ...templates.filter(
    t => !defaultTemplates.some(d => d.id === t.id)
  )];

  // Preview the generated branch and path names
  const previewNum = nextFeatureNumber || '###';
  const previewBranchName = selectedTemplate && featureName
    ? selectedTemplate.branchPattern
        .replace('{name}', featureName)
        .replace('{repo}', projectName)
        .replace('{date}', new Date().toISOString().slice(0, 10).replace(/-/g, ''))
        .replace('{user}', 'user')
        .replace('{num}', previewNum)
    : '';

  const previewWorktreePath = selectedTemplate && featureName
    ? selectedTemplate.pathPattern
        .replace('{name}', featureName)
        .replace('{repo}', projectName)
        .replace('{date}', new Date().toISOString().slice(0, 10).replace(/-/g, ''))
        .replace('{user}', 'user')
        .replace('{num}', previewNum)
    : '';

  // Create worktree from template
  const handleCreateFromTemplate = async () => {
    if (!selectedTemplate || !featureName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await worktreeTemplateAPI.createWorktreeFromTemplate({
        projectPath,
        templateId: selectedTemplate.id,
        name: featureName.trim(),
        customBaseBranch: baseBranch !== selectedTemplate.baseBranch ? baseBranch : undefined,
      });

      if (result.success) {
        // Run post-create scripts if any
        console.log('[WorktreeTemplateDialog] Create success, result:', {
          executedScripts: result.executedScripts,
          worktree: result.worktree,
          hasCallback: !!onRunPostCreateScript,
        });

        if (result.executedScripts && result.executedScripts.length > 0 && result.worktree && onRunPostCreateScript) {
          for (const script of result.executedScripts) {
            console.log(`[WorktreeTemplateDialog] Running post-create script: ${script} in ${result.worktree.path}`);
            onRunPostCreateScript(result.worktree.path, script);
          }
        }
        // Pass the worktree path for gitignore check
        onWorktreeCreated?.(result.worktree?.path);
        onClose();
      } else {
        const errorMessages: Record<string, string> = {
          NOT_GIT_REPO: 'Not a Git repository',
          TEMPLATE_NOT_FOUND: 'Template not found',
          INVALID_NAME: 'Invalid feature name',
          PATH_EXISTS: 'Worktree path already exists',
          BRANCH_EXISTS: 'Branch already exists',
          GIT_ERROR: 'Git error occurred',
        };
        setError(errorMessages[result.error || ''] || result.error || 'Failed to create worktree');
      }
    } catch (err) {
      console.error('Failed to create worktree from template:', err);
      setError('Failed to create worktree');
    } finally {
      setIsCreating(false);
    }
  };

  // Save custom template
  const handleSaveTemplate = async () => {
    if (!editingTemplate?.name || !editingTemplate?.branchPattern || !editingTemplate?.pathPattern) return;

    setIsSaving(true);
    setError(null);

    try {
      const template: WorktreeTemplate = {
        id: editingTemplate.id || `custom-${Date.now()}`,
        name: editingTemplate.name,
        description: editingTemplate.description,
        branchPattern: editingTemplate.branchPattern,
        pathPattern: editingTemplate.pathPattern,
        postCreateScripts: editingTemplate.postCreateScripts || [],
        openInEditor: editingTemplate.openInEditor ?? true,
        preferredEditor: editingTemplate.preferredEditor,
        baseBranch: editingTemplate.baseBranch,
        isDefault: false,
        createdAt: editingTemplate.createdAt || new Date().toISOString(),
        updatedAt: editingTemplate.id ? new Date().toISOString() : undefined,
      };

      const result = await worktreeTemplateAPI.saveTemplate(template);

      if (result.success) {
        await loadTemplates();
        setEditingTemplate(null);
        setView('select');
      } else {
        setError(result.error || 'Failed to save template');
      }
    } catch (err) {
      console.error('Failed to save template:', err);
      setError('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete custom template
  const handleDeleteTemplate = async (templateId: string) => {
    setIsDeleting(true);
    try {
      const result = await worktreeTemplateAPI.deleteTemplate(templateId);
      if (result.success) {
        await loadTemplates();
        setTemplateToDelete(null);
      } else {
        setError(result.error || 'Failed to delete template');
      }
    } catch (err) {
      console.error('Failed to delete template:', err);
      setError('Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open delete confirmation dialog
  const handleOpenDeleteDialog = (templateId: string) => {
    setTemplateToDelete(templateId);
  };

  // Start creating a new custom template
  const handleStartCreateTemplate = () => {
    setEditingTemplate({
      name: '',
      description: '',
      branchPattern: 'feature/{name}',
      pathPattern: '.worktrees/{name}',
      postCreateScripts: ['install'],
      openInEditor: true,
      baseBranch: 'main',
    });
    setView('manage');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] flex flex-col">
        {/* Fixed Header */}
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Layers className="w-5 h-5" />
            {view === 'select' && 'Create Worktree from Template'}
            {view === 'create' && 'Configure Worktree'}
            {view === 'manage' && (editingTemplate?.id ? 'Edit Template' : 'Create Template')}
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400 flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Template Selection View */}
        {view === 'select' && (
          <div className="flex flex-col min-h-0 flex-1">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading templates...</div>
            ) : (
              <>
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
                  {allTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center gap-2 p-3 bg-background/50 border border-border rounded-lg hover:border-blue-500/50 hover:bg-muted transition-colors group"
                    >
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setBaseBranch(template.baseBranch || 'main');
                          setView('create');
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="font-medium text-foreground">{template.name}</span>
                          {template.isDefault && (
                            <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                              Built-in
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground/70">
                          <span className="font-mono">{template.branchPattern}</span>
                          {template.postCreateScripts && template.postCreateScripts.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Play className="w-3 h-3" />
                              {template.postCreateScripts.join(', ')}
                            </span>
                          )}
                        </div>
                      </button>
                      {/* Delete button for custom templates only */}
                      {!template.isDefault && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDeleteDialog(template.id);
                          }}
                          className="p-1.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Delete template"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                    </div>
                  ))}
                </div>

                {/* Fixed Footer */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-border shrink-0">
                  <button
                    onClick={handleStartCreateTemplate}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Plus className="w-4 h-4" />
                    Create Custom Template
                  </button>
                  <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Create Worktree View */}
        {view === 'create' && selectedTemplate && (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
              <div className="p-3 bg-background/50 border border-border rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <GitBranch className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-foreground">{selectedTemplate.name}</span>
                </div>
                {selectedTemplate.description && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedTemplate.description}</p>
                )}
              </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Feature Name
              </label>
              <input
                type="text"
                value={featureName}
                onChange={(e) => setFeatureName(e.target.value)}
                placeholder="my-new-feature"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
              />
              {isNumberedTemplate && (
                <p className="text-xs text-muted-foreground mt-1">
                  This template will auto-assign the next available 3-digit number (e.g., {previewNum}-...).
                </p>
              )}
            </div>

              <BaseBranchSelect
                branches={branches}
                value={baseBranch}
                onValueChange={setBaseBranch}
              />

              {featureName && (
                <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Branch:</span>
                    <span className="font-mono text-foreground">{previewBranchName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Path:</span>
                    <span className="font-mono text-foreground truncate ml-4" title={previewWorktreePath}>
                      {previewWorktreePath}
                    </span>
                  </div>
                  {selectedTemplate.postCreateScripts && selectedTemplate.postCreateScripts.length > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Will run:</span>
                      <span className="text-foreground">
                        {selectedTemplate.postCreateScripts.join(', ')}
                      </span>
                    </div>
                  )}
                  {selectedTemplate.openInEditor && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Code2 className="w-3.5 h-3.5" />
                      Will open in editor
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fixed Footer */}
            <div className="flex justify-between gap-2 pt-4 mt-4 border-t border-border shrink-0">
              <Button
                variant="ghost"
                onClick={() => {
                  setView('select');
                  setSelectedTemplate(null);
                }}
                className="text-muted-foreground"
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} className="text-muted-foreground">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateFromTemplate}
                  disabled={isCreating || !featureName.trim()}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {isCreating ? 'Creating...' : 'Create Worktree'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Template View */}
        {view === 'manage' && editingTemplate && (
          <div className="flex flex-col min-h-0 flex-1">
            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editingTemplate.name || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                  placeholder="My Custom Template"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={editingTemplate.description || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                  placeholder="Brief description of this template"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Branch Pattern
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Variables: {'{name}'}, {'{repo}'}, {'{date}'}, {'{user}'}
                  </span>
                </label>
                <input
                  type="text"
                  value={editingTemplate.branchPattern || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, branchPattern: e.target.value })}
                  placeholder="feature/{name}"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Path Pattern
                </label>
                <input
                  type="text"
                  value={editingTemplate.pathPattern || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, pathPattern: e.target.value })}
                  placeholder="../{repo}-{name}"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Default Base Branch
                </label>
                <input
                  type="text"
                  value={editingTemplate.baseBranch || ''}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, baseBranch: e.target.value })}
                  placeholder="main"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Post-Create Scripts (comma-separated)
                </label>
                <input
                  type="text"
                  value={(editingTemplate.postCreateScripts || []).join(', ')}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    postCreateScripts: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  placeholder="install, build"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500"
                />
              </div>

              <Checkbox
                checked={editingTemplate.openInEditor ?? true}
                onCheckedChange={(checked) => setEditingTemplate({ ...editingTemplate, openInEditor: checked })}
                label="Open in editor after creation"
              />

              {editingTemplate.openInEditor && availableEditors.length > 1 && (
                <PreferredEditorSelect
                  editors={availableEditors}
                  value={editingTemplate.preferredEditor || ''}
                  onValueChange={(value) =>
                    setEditingTemplate({ ...editingTemplate, preferredEditor: value || undefined })
                  }
                />
              )}
            </div>

            {/* Fixed Footer */}
            <div className="flex justify-between gap-2 pt-4 mt-4 border-t border-border shrink-0">
              <div>
                {editingTemplate.id && !editingTemplate.isDefault && (
                  <Button
                    variant="ghost"
                    onClick={() => handleOpenDeleteDialog(editingTemplate.id!)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditingTemplate(null);
                    setView('select');
                  }}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={isSaving || !editingTemplate.name || !editingTemplate.branchPattern || !editingTemplate.pathPattern}
                  className="bg-blue-600 hover:bg-blue-500"
                >
                  {isSaving ? 'Saving...' : 'Save Template'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Delete Template Confirmation Dialog */}
      <DeleteConfirmDialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTemplateToDelete(null);
          }
        }}
        itemType="template"
        itemName={templates.find(t => t.id === templateToDelete)?.name || ''}
        onConfirm={() => templateToDelete && handleDeleteTemplate(templateToDelete)}
        isLoading={isDeleting}
      />
    </Dialog>
  );
}
