/**
 * Settings Page Types
 */

export type SettingsSection =
  | 'storage'
  | 'deploy-accounts'
  | 'appearance'
  | 'notifications'
  | 'shortcuts'
  | 'ai-providers'
  | 'prompts'
  | 'ai-activity'
  | 'mcp'
  | 'toolchain'
  | 'lockfile-validation'
  | 'data'
  | 'about';

export interface SettingsSidebarSection {
  id: string;
  label: string;
  items: SettingsSidebarItem[];
}

export interface SettingsSidebarItem {
  id: SettingsSection;
  label: string;
  icon: string;
  badge?: string;
}

export const SETTINGS_SECTIONS: SettingsSidebarSection[] = [
  {
    id: 'project',
    label: 'Project',
    items: [
      { id: 'storage', label: 'Storage', icon: 'HardDrive' },
      { id: 'deploy-accounts', label: 'Deploy Accounts', icon: 'Users' },
    ],
  },
  {
    id: 'preferences',
    label: 'Preferences',
    items: [
      { id: 'appearance', label: 'Appearance', icon: 'Palette' },
      { id: 'notifications', label: 'Notifications', icon: 'Bell' },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'Keyboard' },
      { id: 'toolchain', label: 'Toolchain', icon: 'Wrench' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'lockfile-validation', label: 'Lockfile Validation', icon: 'ShieldCheck' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'ai-providers', label: 'AI Providers', icon: 'Bot' },
      { id: 'prompts', label: 'Prompt Templates', icon: 'FileText' },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP',
    items: [{ id: 'mcp', label: 'MCP Integration', icon: 'Server' }],
  },
  {
    id: 'data',
    label: 'Data',
    items: [{ id: 'data', label: 'Import / Export', icon: 'ArrowLeftRight' }],
  },
];
