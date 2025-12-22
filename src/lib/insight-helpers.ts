/**
 * Insight Type Helpers
 * Maps insight types to display properties (icons, labels, descriptions)
 */

import type { InsightType, InsightSeverity } from '../types/snapshot';

/**
 * Display configuration for each insight type
 */
export interface InsightTypeConfig {
  label: string;
  description: string;
  icon: string;
  category: 'dependency' | 'security' | 'validation';
}

/**
 * Get display configuration for an insight type
 */
export function getInsightTypeConfig(type: InsightType): InsightTypeConfig {
  const configs: Record<InsightType, InsightTypeConfig> = {
    // Existing types
    new_dependency: {
      label: 'New Dependency',
      description: 'A new package was added to the project',
      icon: 'PackagePlus',
      category: 'dependency',
    },
    removed_dependency: {
      label: 'Removed Dependency',
      description: 'A package was removed from the project',
      icon: 'PackageMinus',
      category: 'dependency',
    },
    version_change: {
      label: 'Version Change',
      description: 'A package version was updated',
      icon: 'ArrowUpDown',
      category: 'dependency',
    },
    postinstall_added: {
      label: 'Postinstall Added',
      description: 'A postinstall script was added',
      icon: 'Terminal',
      category: 'security',
    },
    postinstall_removed: {
      label: 'Postinstall Removed',
      description: 'A postinstall script was removed',
      icon: 'Terminal',
      category: 'security',
    },
    postinstall_changed: {
      label: 'Postinstall Changed',
      description: 'A postinstall script was modified',
      icon: 'FileCode',
      category: 'security',
    },
    integrity_mismatch: {
      label: 'Integrity Mismatch',
      description: 'Package integrity hash does not match',
      icon: 'ShieldX',
      category: 'security',
    },
    typosquatting_suspect: {
      label: 'Typosquatting Suspect',
      description: 'Package name similar to a popular package',
      icon: 'AlertTriangle',
      category: 'security',
    },
    frequent_updater: {
      label: 'Frequent Updater',
      description: 'Package updates very frequently',
      icon: 'TrendingUp',
      category: 'dependency',
    },
    suspicious_script: {
      label: 'Suspicious Script',
      description: 'Potentially malicious script detected',
      icon: 'ShieldAlert',
      category: 'security',
    },

    // Lockfile validation types (v7)
    insecure_protocol: {
      label: 'Insecure Protocol',
      description: 'Package resolved via insecure protocol (git:// or http://)',
      icon: 'Unlock',
      category: 'validation',
    },
    unexpected_registry: {
      label: 'Unexpected Registry',
      description: 'Package from non-whitelisted registry',
      icon: 'Globe',
      category: 'validation',
    },
    manifest_mismatch: {
      label: 'Manifest Mismatch',
      description: 'Lockfile does not match package.json',
      icon: 'FileX2',
      category: 'validation',
    },
    blocked_package: {
      label: 'Blocked Package',
      description: 'Package is on your blocked list',
      icon: 'Ban',
      category: 'validation',
    },
    missing_integrity: {
      label: 'Missing Integrity',
      description: 'Package lacks integrity hash',
      icon: 'ShieldQuestion',
      category: 'validation',
    },
    scope_confusion: {
      label: 'Scope Confusion',
      description: 'Potential scope confusion attack (@scope/pkg vs scope-pkg)',
      icon: 'AtSign',
      category: 'validation',
    },
    homoglyph_suspect: {
      label: 'Homoglyph Suspect',
      description: 'Package name uses lookalike characters',
      icon: 'Eye',
      category: 'validation',
    },
  };

  return configs[type] || {
    label: type,
    description: 'Unknown insight type',
    icon: 'HelpCircle',
    category: 'security',
  };
}

/**
 * Get Lucide icon name for an insight type
 */
export function getInsightTypeIcon(type: InsightType): string {
  return getInsightTypeConfig(type).icon;
}

/**
 * Get display label for an insight type
 */
export function getInsightTypeLabel(type: InsightType): string {
  return getInsightTypeConfig(type).label;
}

/**
 * Get severity color classes
 */
export function getSeverityColors(severity: InsightSeverity): {
  text: string;
  bg: string;
  border: string;
} {
  const colors: Record<InsightSeverity, { text: string; bg: string; border: string }> = {
    critical: {
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
    high: {
      text: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
    },
    medium: {
      text: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
    },
    low: {
      text: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
    },
    info: {
      text: 'text-zinc-400',
      bg: 'bg-zinc-500/10',
      border: 'border-zinc-500/30',
    },
  };

  return colors[severity] || colors.info;
}

/**
 * Check if an insight type is a validation type (v7)
 */
export function isValidationInsightType(type: InsightType): boolean {
  const validationTypes: InsightType[] = [
    'insecure_protocol',
    'unexpected_registry',
    'manifest_mismatch',
    'blocked_package',
    'missing_integrity',
    'scope_confusion',
    'homoglyph_suspect',
  ];
  return validationTypes.includes(type);
}

/**
 * Group insight types by category
 */
export function groupInsightTypes(): Record<string, InsightType[]> {
  return {
    dependency: [
      'new_dependency',
      'removed_dependency',
      'version_change',
      'frequent_updater',
    ],
    security: [
      'postinstall_added',
      'postinstall_removed',
      'postinstall_changed',
      'integrity_mismatch',
      'typosquatting_suspect',
      'suspicious_script',
    ],
    validation: [
      'insecure_protocol',
      'unexpected_registry',
      'manifest_mismatch',
      'blocked_package',
      'missing_integrity',
      'scope_confusion',
      'homoglyph_suspect',
    ],
  };
}
