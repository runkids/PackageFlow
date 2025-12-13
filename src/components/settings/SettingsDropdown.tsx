/**
 * Settings Dropdown Component
 * A dropdown menu with settings icon containing import, export, and storage location options
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Download, Upload, FolderOpen, RotateCcw, ExternalLink, Keyboard, Sun, Moon, FolderTree, TextCursorInput, Users } from 'lucide-react';
import { Dropdown, DropdownItem, DropdownSection, DropdownSeparator } from '../ui/Dropdown';
import { settingsAPI, open } from '../../lib/tauri-api';
import type { StorePathInfo } from '../../types/tauri';
import { useSettings } from '../../contexts/SettingsContext';
import { DeployAccountsDialog } from './DeployAccountsDialog';

interface SettingsDropdownProps {
  onExport: () => void;
  onImport: () => void;
  onKeyboardShortcuts?: () => void;
}

export const SettingsDropdown: React.FC<SettingsDropdownProps> = ({
  onExport,
  onImport,
  onKeyboardShortcuts,
}) => {
  const [storePathInfo, setStorePathInfo] = useState<StorePathInfo | null>(null);
  const [isChangingPath, setIsChangingPath] = useState(false);
  const [showDeployAccounts, setShowDeployAccounts] = useState(false);

  // Path display format from settings context
  const { pathDisplayFormat, setPathDisplayFormat } = useSettings();

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    }
    return 'dark';
  });

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

      // Open folder picker dialog
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Storage Location',
      });

      if (selected && typeof selected === 'string') {
        // Append the file name to the selected directory
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

  return (
    <>
    <Dropdown
      align="right"
      trigger={
        <button
          className="p-1.5 rounded transition-colors hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label="Settings"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      }
    >
      {/* Appearance */}
      <DropdownSection title="Appearance">
        <DropdownItem
          onClick={toggleTheme}
          icon={theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        >
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </DropdownItem>
        <DropdownItem
          onClick={togglePathFormat}
          icon={pathDisplayFormat === 'short' ? <FolderTree className="w-4 h-4" /> : <TextCursorInput className="w-4 h-4" />}
        >
          {pathDisplayFormat === 'short' ? 'Show Full Paths' : 'Show Short Paths'}
        </DropdownItem>
      </DropdownSection>

      <DropdownSeparator />

      {/* Accounts */}
      <DropdownSection title="Accounts">
        <DropdownItem
          onClick={() => setShowDeployAccounts(true)}
          icon={<Users className="w-4 h-4" />}
        >
          Deploy Accounts
        </DropdownItem>
      </DropdownSection>

      <DropdownSeparator />

      {/* Data */}
      <DropdownSection title="Data">
        <DropdownItem
          onClick={onExport}
          icon={<Download className="w-4 h-4" />}
        >
          Export Data
        </DropdownItem>
        <DropdownItem
          onClick={onImport}
          icon={<Upload className="w-4 h-4" />}
        >
          Import Data
        </DropdownItem>
      </DropdownSection>

      <DropdownSeparator />

      {/* Storage */}
      <DropdownSection title="Storage">
        <DropdownItem
          onClick={handleChangeStorePath}
          icon={<FolderOpen className="w-4 h-4" />}
          disabled={isChangingPath}
        >
          {isChangingPath ? 'Changing...' : 'Change Location'}
        </DropdownItem>
        {storePathInfo?.isCustom && (
          <DropdownItem
            onClick={handleResetPath}
            icon={<RotateCcw className="w-4 h-4" />}
            disabled={isChangingPath}
          >
            Reset to Default
          </DropdownItem>
        )}
        <DropdownItem
          onClick={handleOpenLocation}
          icon={<ExternalLink className="w-4 h-4" />}
        >
          Open in Finder
        </DropdownItem>
      </DropdownSection>

      {/* Help */}
      {onKeyboardShortcuts && (
        <>
          <DropdownSeparator />
          <DropdownSection title="Help">
            <DropdownItem
              onClick={onKeyboardShortcuts}
              icon={<Keyboard className="w-4 h-4" />}
            >
              Keyboard Shortcuts
            </DropdownItem>
          </DropdownSection>
        </>
      )}
    </Dropdown>

    {/* Deploy Accounts Dialog - Must be outside Dropdown to persist when dropdown closes */}
    <DeployAccountsDialog
      isOpen={showDeployAccounts}
      onClose={() => setShowDeployAccounts(false)}
    />
  </>
  );
};
