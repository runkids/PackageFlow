/**
 * Settings Page Component
 * Full-page settings interface with sidebar navigation and quick settings
 * Desktop-optimized with focus management and keyboard navigation
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Sun, Moon, FolderTree } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SettingsSection } from '../../types/settings';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsContent } from './SettingsContent';
import { Toggle } from '../ui/Toggle';
import { useSettings } from '../../contexts/SettingsContext';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialSection?: SettingsSection;
  onExport?: () => void;
  onImport?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  isOpen,
  onClose,
  initialSection = 'storage',
  onExport,
  onImport,
}) => {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection);
  const [isClosing, setIsClosing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Settings context for path display format
  const { pathDisplayFormat, setPathDisplayFormat } = useSettings();

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light';
    }
    return 'dark';
  });

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

  // Toggle path display format
  const togglePathFormat = useCallback(async () => {
    try {
      await setPathDisplayFormat(
        pathDisplayFormat === 'short' ? 'full' : 'short'
      );
    } catch (error) {
      console.error('Failed to change path format:', error);
    }
  }, [pathDisplayFormat, setPathDisplayFormat]);

  // Close with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  }, [onClose]);

  const handleSectionChange = useCallback((section: SettingsSection) => {
    setActiveSection(section);
  }, []);

  // Update active section when initialSection changes
  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  // Focus management - save previous focus and restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Focus the close button after a short delay to allow animation
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50',
        'bg-background',
        'transition-opacity duration-150',
        isClosing
          ? 'opacity-0'
          : 'opacity-100 animate-in fade-in-0 duration-200'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4">
        <h1
          id="settings-title"
          className="text-lg font-semibold text-foreground"
        >
          Settings
        </h1>

        {/* Quick Settings */}
        <div className="flex items-center gap-6">
          {/* Theme Toggle */}
          <div className="flex items-center gap-2">
            <Sun
              className={cn(
                'w-4 h-4 transition-colors',
                theme === 'light' ? 'text-amber-500' : 'text-muted-foreground'
              )}
            />
            <Toggle
              checked={theme === 'dark'}
              onChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              size="sm"
              aria-label="Toggle dark mode"
            />
            <Moon
              className={cn(
                'w-4 h-4 transition-colors',
                theme === 'dark' ? 'text-blue-400' : 'text-muted-foreground'
              )}
            />
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Compact Paths Toggle */}
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Compact</span>
            <Toggle
              checked={pathDisplayFormat === 'short'}
              onChange={togglePathFormat}
              size="sm"
              aria-label="Toggle compact paths"
            />
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-border" />

          {/* Close Button */}
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className={cn(
              'p-1 rounded-lg',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-accent transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            aria-label="Close settings (Escape)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-4xl mx-auto p-6">
            <SettingsContent
              section={activeSection}
              onExport={onExport}
              onImport={onImport}
            />
          </div>
        </main>
      </div>
    </div>
  );
};
