/**
 * FrontmatterForm
 * Schema-driven dynamic form that renders spec fields based on the schema definition.
 */

import { useCallback } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import type { FieldType, SchemaDefinition } from '../../types/schema';

interface FrontmatterFormProps {
  fields: Record<string, unknown>;
  schema: SchemaDefinition;
  onChange: (fields: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Field renderers
// ---------------------------------------------------------------------------

function StringField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
        placeholder={`Enter ${label}...`}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | '';
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        className="h-8 text-sm"
        placeholder={`Enter ${label}...`}
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </div>
  );
}

function ListField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const handleAdd = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
    },
    [value, onChange]
  );

  const handleRemove = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const input = e.currentTarget;
        handleAdd(input.value);
        input.value = '';
      }
    },
    [handleAdd]
  );

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      {/* Tag pills */}
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30"
          >
            {tag}
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="hover:text-blue-200 transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {/* Add input */}
      <div className="flex items-center gap-1">
        <Input
          onKeyDown={handleKeyDown}
          className="h-7 text-xs flex-1"
          placeholder={`Add ${label}...`}
        />
        <button
          type="button"
          onClick={(e) => {
            const input = (e.currentTarget as HTMLElement)
              .previousElementSibling as HTMLInputElement;
            if (input?.value) {
              handleAdd(input.value);
              input.value = '';
            }
          }}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={`Add ${label}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function EnumField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={cn(
                'px-2.5 py-1 rounded text-xs font-medium border transition-colors duration-150',
                isSelected
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

function resolveFieldType(fieldType: FieldType): { kind: string; options?: string[] } {
  if (Array.isArray(fieldType)) {
    return { kind: 'enum', options: fieldType };
  }
  return { kind: fieldType };
}

export function FrontmatterForm({ fields, schema, onChange }: FrontmatterFormProps) {
  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      onChange({ ...fields, [key]: value });
    },
    [fields, onChange]
  );

  const schemaFields = schema.fields;

  return (
    <div className="space-y-3">
      {Object.entries(schemaFields).map(([key, fieldType]) => {
        const { kind, options } = resolveFieldType(fieldType);
        const value = fields[key];
        const label = key.replace(/_/g, ' ');

        switch (kind) {
          case 'string':
            return (
              <StringField
                key={key}
                label={label}
                value={typeof value === 'string' ? value : ''}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          case 'number':
            return (
              <NumberField
                key={key}
                label={label}
                value={typeof value === 'number' ? value : ''}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          case 'date':
            return (
              <DateField
                key={key}
                label={label}
                value={typeof value === 'string' ? value : ''}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          case 'list':
            return (
              <ListField
                key={key}
                label={label}
                value={Array.isArray(value) ? (value as string[]) : []}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          case 'enum':
            return (
              <EnumField
                key={key}
                label={label}
                value={typeof value === 'string' ? value : ''}
                options={options ?? []}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
          default:
            // Fallback: render as string input
            return (
              <StringField
                key={key}
                label={label}
                value={typeof value === 'string' ? value : String(value ?? '')}
                onChange={(v) => handleFieldChange(key, v)}
              />
            );
        }
      })}
    </div>
  );
}
