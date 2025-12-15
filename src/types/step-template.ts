/**
 * Step Template Types
 * Type definitions for workflow step templates
 */

/** Template category identifiers */
export type TemplateCategory =
  | 'package-manager'
  | 'git'
  | 'docker'
  | 'shell'
  | 'testing'
  | 'code-quality'
  | 'kubernetes'
  | 'database'
  | 'cloud'
  | 'ai'
  | 'security'
  | 'nodejs'
  | 'custom';

/** Category metadata for display */
export interface TemplateCategoryInfo {
  id: TemplateCategory;
  name: string;
  icon: string; // Lucide icon name
}

/** Step template definition */
export interface StepTemplate {
  id: string;
  name: string;
  command: string;
  category: TemplateCategory;
  description?: string;
}

/** Grouped templates for display */
export interface GroupedTemplates {
  category: TemplateCategoryInfo;
  templates: StepTemplate[];
}

/** Export format for sharing templates */
export interface TemplateExportData {
  version: string;
  exportedAt: string;
  templates: StepTemplate[];
}

/** Custom template saved by user */
export interface CustomTemplate extends StepTemplate {
  /** Marks this as a user-created template */
  isCustom: true;
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
}
