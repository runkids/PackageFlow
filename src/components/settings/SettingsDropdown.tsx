/**
 * Settings Dropdown Component
 * A desktop-optimized dropdown menu with improved visual hierarchy,
 * toggle switches, keyboard shortcuts, and current state indicators.
 *
 * UI/UX Improvements:
 * - Toggle switches for boolean settings (theme, path format)
 * - Keyboard shortcut hints
 * - Current storage path preview
 * - Improved visual grouping with less separators
 * - Larger touch/click targets
 * - Better focus states
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Settings,
  Download,
  Upload,
  FolderOpen,
  RotateCcw,
  ExternalLink,
  Keyboard,
  Sun,
  Moon,
  Users,
  Bot,
  FileText,
  ChevronRight,
  HardDrive,
  Palette,
  Wrench,
} from 'lucide-react';
import { settingsAPI, open } from '../../lib/tauri-api';
import type { StorePathInfo } from '../../types/tauri';
import { useSettings } from '../../contexts/SettingsContext';
import { DeployAccountsDialog } from './DeployAccountsDialog';
import { AIServiceSettingsDialog } from './AIServiceSettingsDialog';
import { PromptTemplateEditor } from './PromptTemplateEditor';
import { Toggle } from '../ui/Toggle';
import { cn } from '../../lib/utils';

interface SettingsDropdownProps {
  onExport: () => void;
  onImport: () => void;
  onKeyboardShortcuts?: () => void;
}

// Keyboard shortcut display helper
const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? 'Cmd' : 'Ctrl';

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  onExport,
  onImport,
  onKeyboardShortcuts,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [storePathInfo, setStorePathInfo] = useState<StorePathInfo | null>(null);
  const [isChangingPath, setIsChangingPath] = useState(false);
  const [showDeployAccounts, setShowDeployAccounts] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showPromptTemplates, setShowPromptTemplates] = useState(false);

  // Path display format from settings context
  const { pathDisplayFormat, setPathDisplayFormat } = useSettings();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

  // Formatted storage path for display
  const displayPath = useMemo(() => {
    if (!storePathInfo?.currentPath) return null;
    const path = storePathInfo.currentPath;
    // Shorten home directory
    const homeMatch = path.match(/^\/Users\/[^/]+/) || path.match(/^\/home\/[^/]+/);
    if (homeMatch) {
      return path.replace(homeMatch[0], '~');
    }
    return path;
  }, [storePathInfo?.currentPath]);

  // Load store path info on mount
  useEffect(() => {
    const loadPathInfo = async () => {
      try {
        const info = await settingsAPI.getStorePath();
        setStorePathInfo(info);
      } catch (error) {
        console.error('Failed to load store path info:', error);
      }
    };
    loadPathInfo();
  }, []);

  // Theme: apply changes to DOM and localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Theme: load from localStorage or system preference on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }
  }, []);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-settings-dropdown]')) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Toggle theme
  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Toggle path display format
  const togglePathFormat = useCallback(async () => {
    try {
      await setPathDisplayFormat(pathDisplayFormat === 'short' ? 'full' : 'short');
    } catch (error) {
      console.error('Failed to change path format:', error);
    }
  }, [pathDisplayFormat, setPathDisplayFormat]);

  // Handle change storage location
  const handleChangeStorePath = useCallback(async () => {
    if (isChangingPath) return;

    try {
      setIsChangingPath(true);
      setIsOpen(false);

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Storage Location',
      });

      if (selected && typeof selected === 'string') {
        const newPath = `${selected}/packageflow.json`;
        const result = await settingsAPI.setStorePath(newPath);
        setStorePathInfo(result);
      }
    } catch (error) {
      console.error('Failed to change store path:', error);
      alert(`Failed to change storage location: ${(error as Error).message}`);
    } finally {
      setIsChangingPath(false);
    }
  }, [isChangingPath]);

  // Handle reset to default path
  const handleResetPath = useCallback(async () => {
    if (isChangingPath) return;

    try {
      setIsChangingPath(true);
      const result = await settingsAPI.resetStorePath();
      setStorePathInfo(result);
    } catch (error) {
      console.error('Failed to reset store path:', error);
      alert(`Failed to reset storage location: ${(error as Error).message}`);
    } finally {
      setIsChangingPath(false);
    }
  }, [isChangingPath]);

  // Handle open store location in file explorer
  const handleOpenLocation = useCallback(async () => {
    try {
      await settingsAPI.openStoreLocation();
    } catch (error) {
      console.error('Failed to open store location:', error);
    }
  }, []);

  // Handle dialog opens (close dropdown first)
  const handleOpenDialog = useCallback((dialogSetter: React.Dispatch<React.SetStateAction<boolean>>) => {
    setIsOpen(false);
    // Small delay to ensure dropdown closes before dialog opens
    setTimeout(() => dialogSetter(true), 50);
  }, []);

  return (
    <>
      <div className="relative" data-settings-dropdown>
        {/* Trigger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'p-1.5 rounded-md transition-all duration-150',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-accent',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isOpen && 'bg-accent text-foreground'
          )}
          aria-label="Settings"
          aria-expanded={isOpen}
          aria-haspopup="menu"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div
            role="menu"
            className={cn(
              'absolute right-0 mt-2 w-72 z-50',
              'bg-card border border-border rounded-xl',
              'shadow-xl shadow-black/20',
              'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
              'duration-150',
              'overflow-hidden'
            )}
          >
            {/* Appearance Section */}
            <SettingsSection icon={<Palette className="w-4 h-4" />} title="Appearance">
              <SettingsToggleItem
                label="Dark Mode"
                icon={theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                checked={theme === 'dark'}
                onChange={toggleTheme}
              />
              <SettingsToggleItem
                label="Compact Paths"
                description="Show ~/... instead of full paths"
                checked={pathDisplayFormat === 'short'}
                onChange={togglePathFormat}
              />
            </SettingsSection>

            <SettingsDivider />

            {/* Services Section */}
            <SettingsSection icon={<Wrench className="w-4 h-4" />} title="Services">
              <SettingsLinkItem
                label="Deploy Accounts"
                icon={<Users className="w-4 h-4" />}
                onClick={() => handleOpenDialog(setShowDeployAccounts)}
              />
              <SettingsLinkItem
                label="AI Services"
                icon={<Bot className="w-4 h-4" />}
                onClick={() => handleOpenDialog(setShowAISettings)}
              />
              <SettingsLinkItem
                label="Prompt Templates"
                icon={<FileText className="w-4 h-4" />}
                onClick={() => handleOpenDialog(setShowPromptTemplates)}
              />
            </SettingsSection>

            <SettingsDivider />

            {/* Data Section */}
            <SettingsSection icon={<HardDrive className="w-4 h-4" />} title="Data">
              <SettingsActionItem
                label="Export Data"
                icon={<Download className="w-4 h-4" />}
                shortcut={`${modKey}+E`}
                onClick={() => {
                  setIsOpen(false);
                  onExport();
                }}
              />
              <SettingsActionItem
                label="Import Data"
                icon={<Upload className="w-4 h-4" />}
                shortcut={`${modKey}+I`}
                onClick={() => {
                  setIsOpen(false);
                  onImport();
                }}
              />
            </SettingsSection>

            <SettingsDivider />

            {/* Storage Info */}
            <div className="px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Storage Location
              </div>
              {displayPath && (
                <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-muted/50 rounded-lg">
                  <code className="flex-1 text-xs text-muted-foreground font-mono truncate" title={storePathInfo?.currentPath}>
                    {displayPath}
                  </code>
                  <button
                    onClick={handleOpenLocation}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                    title="Open in Finder"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleChangeStorePath}
                  disabled={isChangingPath}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5',
                    'text-xs text-muted-foreground rounded-lg',
                    'border border-border hover:bg-accent hover:text-foreground',
                    'transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>{isChangingPath ? 'Changing...' : 'Change'}</span>
                </button>
                {storePathInfo?.isCustom && (
                  <button
                    onClick={handleResetPath}
                    disabled={isChangingPath}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-2 py-1.5',
                      'text-xs text-muted-foreground rounded-lg',
                      'border border-border hover:bg-accent hover:text-foreground',
                      'transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                    title="Reset to Default"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Help Section */}
            {onKeyboardShortcuts && (
              <>
                <SettingsDivider />
                <div className="px-3 py-2">
                  <SettingsActionItem
                    label="Keyboard Shortcuts"
                    icon={<Keyboard className="w-4 h-4" />}
                    shortcut="?"
                    onClick={() => {
                      setIsOpen(false);
                      onKeyboardShortcuts();
                    }}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Dialogs - Outside dropdown to persist when dropdown closes */}
      <DeployAccountsDialog
        isOpen={showDeployAccounts}
        onClose={() => setShowDeployAccounts(false)}
      />
      <AIServiceSettingsDialog
        isOpen={showAISettings}
        onClose={() => setShowAISettings(false)}
      />
      <PromptTemplateEditor
        isOpen={showPromptTemplates}
        onClose={() => setShowPromptTemplates(false)}
      />
    </>
  );
};

// ============================================
// Sub-components for Settings Items
// ============================================

interface SettingsSectionProps {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ icon, title, children }) => (
  <div className="px-3 py-2">
    <div className="flex items-center gap-2 mb-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
    <div className="space-y-0.5">
      {children}
    </div>
  </div>
);

const SettingsDivider: React.FC = () => (
  <div className="my-1 mx-3 border-t border-border" />
);

interface SettingsToggleItemProps {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const SettingsToggleItem: React.FC<SettingsToggleItemProps> = ({
  label,
  description,
  icon,
  checked,
  onChange,
}) => (
  <div
    className={cn(
      'flex items-center gap-3 px-2 py-2 rounded-lg',
      'hover:bg-accent/50 transition-colors cursor-pointer'
    )}
    onClick={() => onChange(!checked)}
  >
    {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
    <div className="flex-1 min-w-0">
      <div className="text-sm text-foreground">{label}</div>
      {description && (
        <div className="text-xs text-muted-foreground truncate">{description}</div>
      )}
    </div>
    <Toggle
      checked={checked}
      onChange={onChange}
      size="sm"
      aria-label={label}
    />
  </div>
);

interface SettingsLinkItemProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

const SettingsLinkItem: React.FC<SettingsLinkItemProps> = ({ label, icon, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-2 py-2 rounded-lg',
      'text-left text-sm text-foreground',
      'hover:bg-accent/50 transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
    )}
  >
    {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
    <span className="flex-1">{label}</span>
    <ChevronRight className="w-4 h-4 text-muted-foreground" />
  </button>
);

interface SettingsActionItemProps {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}

const SettingsActionItem: React.FC<SettingsActionItemProps> = ({
  label,
  icon,
  shortcut,
  onClick,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'w-full flex items-center gap-3 px-2 py-2 rounded-lg',
      'text-left text-sm text-foreground',
      'hover:bg-accent/50 transition-colors',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      'disabled:opacity-50 disabled:cursor-not-allowed'
    )}
  >
    {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
    <span className="flex-1">{label}</span>
    {shortcut && (
      <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted text-muted-foreground rounded border border-border">
        {shortcut}
      </kbd>
    )}
  </button>
);
