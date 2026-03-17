/**
 * SpecEditor
 * Main editor with split layout: left panel (metadata form + workflow) and right panel (markdown).
 * Loads spec + schema on mount, saves changes via update_spec.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, Save, Loader2, AlertTriangle, ChevronRight, GitBranch } from 'lucide-react';
import { Button } from '../ui/Button';
import { FrontmatterForm } from './FrontmatterForm';
import { MarkdownEditor } from './MarkdownEditor';
import { cn } from '../../lib/utils';
import { useWorkflowStatus } from '../../hooks/useWorkflowStatus';
import { useSpecBranch } from '../../hooks/useSpecBranch';
import type { Spec } from '../../types/spec';
import type { SchemaDefinition } from '../../types/schema';
import type { AdvanceResult } from '../../types/workflow-phase';

// ---------------------------------------------------------------------------
// Status badge (reused from SpecList)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  implement: 'bg-green-500/20 text-green-400 border-green-500/30',
  verify: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  archived: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const PHASE_COLORS: Record<string, string> = {
  discuss: 'text-indigo-400',
  specify: 'text-blue-400',
  review: 'text-yellow-400',
  implement: 'text-green-400',
  verify: 'text-cyan-400',
  deploy: 'text-blue-400',
  done: 'text-emerald-400',
};

const PHASE_DOT_COLORS: Record<string, string> = {
  discuss: 'bg-indigo-400',
  specify: 'bg-blue-400',
  review: 'bg-yellow-400',
  implement: 'bg-green-400',
  verify: 'bg-cyan-400',
  deploy: 'bg-blue-400',
  done: 'bg-emerald-400',
};

function phaseTextColor(phase: string): string {
  return PHASE_COLORS[phase] ?? 'text-indigo-400';
}

function phaseDotColor(phase: string): string {
  return PHASE_DOT_COLORS[phase] ?? 'bg-indigo-400';
}

// ---------------------------------------------------------------------------
// WorkflowSection — extracted sub-component
// ---------------------------------------------------------------------------

interface WorkflowSectionProps {
  specId: string;
  projectDir: string;
  workflowPhase?: string;
}

function WorkflowSection({ specId, projectDir, workflowPhase }: WorkflowSectionProps) {
  const { status, loading: wfLoading } = useWorkflowStatus(
    workflowPhase ? specId : null,
    projectDir
  );
  const branchInfo = useSpecBranch(specId, projectDir);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const handleAdvance = useCallback(
    async (toPhase?: string) => {
      setAdvancing(true);
      setAdvanceError(null);
      try {
        await invoke<AdvanceResult>('advance_spec', {
          specId,
          toPhase: toPhase ?? null,
          projectDir,
        });
      } catch (e) {
        setAdvanceError(String(e));
      } finally {
        setAdvancing(false);
      }
    },
    [specId, projectDir]
  );

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Workflow
      </h3>

      {!workflowPhase ? (
        <p className="text-xs text-muted-foreground">No workflow assigned</p>
      ) : (
        <div className="space-y-3">
          {/* Current phase */}
          <div className="flex items-center gap-2">
            <span className={cn('w-2 h-2 rounded-full', phaseDotColor(workflowPhase))} />
            <span className={cn('text-sm font-medium', phaseTextColor(workflowPhase))}>
              {workflowPhase}
            </span>
            {wfLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Workflow name */}
          {status?.workflowName && (
            <p className="text-[11px] text-muted-foreground">Workflow: {status.workflowName}</p>
          )}

          {/* Branch info */}
          {branchInfo && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <GitBranch className="w-3 h-3 flex-shrink-0" />
              {branchInfo.exists ? (
                <span>
                  <span className="font-mono text-foreground/80">{branchInfo.branch_name}</span>
                  <span className="ml-1.5 text-muted-foreground">
                    ({branchInfo.commit_count}{' '}
                    {branchInfo.commit_count === 1 ? 'commit' : 'commits'})
                  </span>
                </span>
              ) : (
                <span>No branch yet</span>
              )}
            </div>
          )}

          {/* Available transitions */}
          {status && status.availableTransitions.length > 0 && (
            <div className="space-y-1.5">
              {status.availableTransitions.map((t) => (
                <div key={t.to} className="space-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={advancing}
                    onClick={() => handleAdvance(t.to)}
                    className={cn(
                      'w-full text-xs justify-between',
                      t.gatePassed
                        ? 'border-green-500/30 hover:border-green-500/50'
                        : 'border-amber-500/30 hover:border-amber-500/50'
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {advancing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Advance to {t.to}
                    </span>
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        t.gatePassed ? 'bg-green-500' : 'bg-amber-500'
                      )}
                    />
                  </Button>

                  {/* Gate warning message */}
                  {!t.gatePassed && t.gateMessage && (
                    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-[10px] text-amber-400 leading-snug">
                        {t.gateMessage}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Advance error */}
          {advanceError && (
            <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-red-400 leading-snug">{advanceError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SpecEditorProps {
  specId: string;
  projectDir: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpecEditor({ specId, projectDir, onBack }: SpecEditorProps) {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [schema, setSchema] = useState<SchemaDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Working copies — mutated by user, sent on save
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [body, setBody] = useState('');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Load spec + schema
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const loadedSpec = await invoke<Spec>('get_spec', { id: specId, projectDir });
        if (cancelled) return;

        setSpec(loadedSpec);
        setFields(loadedSpec.fields ?? {});
        setBody(loadedSpec.body ?? '');

        // Load schema
        const loadedSchema = await invoke<SchemaDefinition>('get_schema', {
          name: loadedSpec.schema,
          projectDir,
        });
        if (cancelled) return;
        setSchema(loadedSchema);
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [specId, projectDir]);

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const save = useCallback(async () => {
    if (!spec) return;
    try {
      setSaving(true);
      const updated = await invoke<Spec>('update_spec', {
        id: spec.id,
        fields,
        body,
        projectDir,
      });
      setSpec(updated);
      setDirty(false);
    } catch (e) {
      console.error('Failed to save spec:', e);
    } finally {
      setSaving(false);
    }
  }, [spec, fields, body, projectDir]);

  // Debounced auto-save on blur
  const debouncedSave = useCallback(() => {
    if (!dirty) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save();
    }, 500);
  }, [dirty, save]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dirty, save]);

  // ---------------------------------------------------------------------------
  // Field / body change handlers
  // ---------------------------------------------------------------------------

  const handleFieldsChange = useCallback((newFields: Record<string, unknown>) => {
    setFields(newFields);
    setDirty(true);
  }, []);

  const handleBodyChange = useCallback((newBody: string) => {
    setBody(newBody);
    setDirty(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading spec...</span>
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error ?? 'Spec not found'}</p>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Specs
        </Button>
      </div>
    );
  }

  const statusClass = STATUS_COLORS[spec.status] ?? STATUS_COLORS['draft'];

  return (
    <div className="flex flex-col h-full">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="w-px h-5 bg-border" />

        {/* Title */}
        <h2 className="text-sm font-medium text-foreground truncate flex-1">{spec.title}</h2>

        {/* Badges */}
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
          {spec.schema}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${statusClass}`}
        >
          {spec.status}
        </span>

        {/* Save button */}
        <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1.5">
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? 'Saving...' : dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      {/* ---- Body: split layout ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — metadata + workflow */}
        <div
          className="w-[280px] flex-shrink-0 border-r border-border overflow-y-auto"
          onBlur={debouncedSave}
        >
          {/* Metadata form */}
          <div className="p-4 space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Metadata
            </h3>
            {schema ? (
              <FrontmatterForm fields={fields} schema={schema} onChange={handleFieldsChange} />
            ) : (
              <p className="text-xs text-muted-foreground">No schema loaded</p>
            )}
          </div>

          {/* Divider */}
          <div className="mx-4 border-t border-border" />

          {/* Workflow section */}
          <WorkflowSection
            specId={spec.id}
            projectDir={projectDir}
            workflowPhase={spec.workflow_phase}
          />
        </div>

        {/* Right panel — Markdown editor */}
        <div className="flex-1 min-w-0">
          <MarkdownEditor value={body} onChange={handleBodyChange} />
        </div>
      </div>
    </div>
  );
}
