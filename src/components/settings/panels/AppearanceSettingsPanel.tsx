/**
 * Appearance Settings Panel
 * Configure visual settings like theme and path display format
 */

import React, { useCallback } from 'react';
import { Palette, Sun, Moon, FolderTree } from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { Toggle } from '../../ui/Toggle';
import { cn } from '../../../lib/utils';

export const AppearanceSettingsPanel: React.FC = () => {
  const { pathDisplayFormat, setPathDisplayFormat } = useSettings();
  const { theme, setTheme } = useTheme();

  // Toggle path display format
  const togglePathFormat = useCallback(async () => {
    try {
      await setPathDisplayFormat(pathDisplayFormat === 'short' ? 'full' : 'short');
    } catch (error) {
      console.error('Failed to change path format:', error);
    }
  }, [pathDisplayFormat, setPathDisplayFormat]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize the look and feel of PackageFlow
        </p>
      </div>

      {/* Theme */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Theme</h3>

        <div className="grid grid-cols-2 gap-3">
          <ThemeCard
            label="Light"
            icon={<Sun className="w-5 h-5" />}
            isActive={theme === 'light'}
            onClick={() => setTheme('light')}
            activeCardClassName="border-amber-500 bg-amber-500/10 text-amber-500"
            activeIconClassName="bg-amber-500 text-white"
          />
          <ThemeCard
            label="Dark"
            icon={<Moon className="w-5 h-5" />}
            isActive={theme === 'dark'}
            onClick={() => setTheme('dark')}
            activeCardClassName="border-blue-400 bg-blue-400/10 text-blue-400"
            activeIconClassName="bg-blue-400 text-white"
          />
        </div>
      </div>

      {/* Path Display */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Display</h3>

        <SettingRow
          icon={<FolderTree className="w-4 h-4" />}
          label="Compact Paths"
          description="Show ~/... instead of full paths like /Users/name/..."
        >
          <Toggle
            checked={pathDisplayFormat === 'short'}
            onChange={togglePathFormat}
            aria-label="Compact paths"
          />
        </SettingRow>
      </div>
    </div>
  );
};

interface ThemeCardProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  activeCardClassName?: string;
  activeIconClassName?: string;
}

const ThemeCard: React.FC<ThemeCardProps> = ({ label, icon, isActive, onClick, activeCardClassName, activeIconClassName }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
      isActive
        ? activeCardClassName || 'border-primary bg-primary/10'
        : 'border-border hover:border-primary/50 hover:bg-accent/50'
    )}
  >
    <div
      className={cn(
        'p-3 rounded-full',
        isActive ? activeIconClassName || 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      )}
    >
      {icon}
    </div>
    <span
      className={cn(
        'text-sm font-medium',
        isActive ? activeCardClassName?.split(' ').find(cls => cls.startsWith('text-')) || 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {label}
    </span>
  </button>
);

interface SettingRowProps {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ icon, label, description, children }) => (
  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
    </div>
    {children}
  </div>
);
