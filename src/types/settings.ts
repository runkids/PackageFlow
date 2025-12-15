/**
 * Settings Page Types
 */

export type SettingsSection =
  | 'storage'
  | 'deploy-accounts'
  | 'appearance'
  | 'shortcuts'
  | 'ai-services'
  | 'prompts'
  | 'mcp'
  | 'toolchain'
  | 'data';

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
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: 'Keyboard' },
      { id: 'toolchain', label: 'Toolchain', icon: 'Wrench' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'ai-services', label: 'AI Services', icon: 'Bot' },
      { id: 'prompts', label: 'Prompt Templates', icon: 'FileText' },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP',
    items: [
      { id: 'mcp', label: 'MCP Integration', icon: 'Server' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    items: [
      { id: 'data', label: 'Import / Export', icon: 'ArrowLeftRight' },
    ],
  },
];
