/**
 * Notification Settings Types
 * Corresponds to Rust types in src-tauri/src/utils/store.rs
 */

/**
 * Do Not Disturb settings for notifications
 */
export interface DoNotDisturbSettings {
  /** Whether DND is enabled */
  enabled: boolean;
  /** Start time in 24h format (e.g., "22:00") */
  startTime: string;
  /** End time in 24h format (e.g., "08:00") */
  endTime: string;
}

/**
 * Notification category toggles
 */
export interface NotificationCategories {
  /** Webhook notifications (incoming triggered, outgoing success/failure) */
  webhooks: boolean;
  /** Workflow execution (completed, failed) */
  workflowExecution: boolean;
  /** Git operations (push success/failure) */
  gitOperations: boolean;
  /** Security scan (completed, vulnerabilities found) */
  securityScans: boolean;
  /** Deployment (success, failure) */
  deployments: boolean;
}

/**
 * Complete notification settings
 */
export interface NotificationSettings {
  /** Master toggle for all notifications */
  enabled: boolean;
  /** Play sound with notifications */
  soundEnabled: boolean;
  /** Category-specific toggles */
  categories: NotificationCategories;
  /** Do Not Disturb settings */
  doNotDisturb: DoNotDisturbSettings;
}

/**
 * Default notification settings
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  categories: {
    webhooks: true,
    workflowExecution: true,
    gitOperations: true,
    securityScans: true,
    deployments: true,
  },
  doNotDisturb: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
  },
};

/**
 * Notification category identifier
 */
export type NotificationCategoryId = keyof NotificationCategories;

/**
 * Notification category information for UI display
 */
export interface NotificationCategoryInfo {
  id: NotificationCategoryId;
  label: string;
  description: string;
  icon: string; // Lucide icon name
}

/**
 * All notification categories with their display information
 */
export const NOTIFICATION_CATEGORIES: NotificationCategoryInfo[] = [
  {
    id: 'webhooks',
    label: 'Webhooks',
    description: 'Incoming webhook triggers and outgoing webhook delivery status',
    icon: 'Webhook',
  },
  {
    id: 'workflowExecution',
    label: 'Workflow Execution',
    description: 'Workflow completion and failure notifications',
    icon: 'Play',
  },
  {
    id: 'gitOperations',
    label: 'Git Operations',
    description: 'Push operation results',
    icon: 'GitBranch',
  },
  {
    id: 'securityScans',
    label: 'Security Scans',
    description: 'Scan completion and vulnerability alerts',
    icon: 'Shield',
  },
  {
    id: 'deployments',
    label: 'Deployments',
    description: 'Deployment success and failure notifications',
    icon: 'Rocket',
  },
];

// ============================================================================
// Notification History Types (for Notification Center)
// ============================================================================

/**
 * Notification type identifier
 */
export type NotificationTypeName =
  | 'webhook_incoming_triggered'
  | 'webhook_outgoing_success'
  | 'webhook_outgoing_failure'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'git_push_success'
  | 'git_push_failed'
  | 'security_scan_completed'
  | 'deployment_success'
  | 'deployment_failed';

/**
 * Notification metadata for different notification types
 */
export interface NotificationMetadata {
  workflowName?: string;
  projectName?: string;
  url?: string;
  error?: string;
  branch?: string;
  platform?: string;
  durationMs?: number;
  vulnerabilityCount?: number;
}

/**
 * A single notification record from the database
 */
export interface NotificationRecord {
  id: string;
  notificationType: NotificationTypeName;
  category: NotificationCategoryId;
  title: string;
  body: string;
  isRead: boolean;
  metadata?: NotificationMetadata;
  createdAt: string; // ISO 8601 datetime string
}

/**
 * Response from get_notifications API
 */
export interface NotificationListResponse {
  notifications: NotificationRecord[];
  totalCount: number;
  unreadCount: number;
}
