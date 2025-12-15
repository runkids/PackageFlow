/**
 * Appearance Settings Panel
 * Configure visual settings like theme, path display format, and animations
 */

import React, { useCallback } from 'react';
import { Palette, Sun, Moon, Monitor, FolderTree, Sparkles } from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';
import { Toggle } from '../../ui/Toggle';
import { SettingSection } from '../ui/SettingSection';
import { SettingRow } from '../ui/SettingRow';
import { cn } from '../../../lib/utils';

export const AppearanceSettingsPanel: React.FC = () => {
  const { pathDisplayFormat, setPathDisplayFormat, reduceMotion, setReduceMotion } = useSettings();
  const { themeMode, setThemeMode } = useTheme();

  // Toggle path display format
  const handlePathFormatToggle = useCallback(async () => {
    try {
      await setPathDisplayFormat(pathDisplayFormat === 'short' ? 'full' : 'short');
    } catch (error) {
      console.error('Failed to change path format:', error);
    }
  }, [pathDisplayFormat, setPathDisplayFormat]);

  // Toggle reduce motion
  const handleReduceMotionToggle = useCallback(async () => {
    try {
      await setReduceMotion(!reduceMotion);
    } catch (error) {
      console.error('Failed to change reduce motion setting:', error);
    }
  }, [reduceMotion, setReduceMotion]);

  // Handle theme mode selection
  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
  }, [setThemeMode]);

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

      {/* Theme Section */}
      <SettingSection
        title="Theme"
        description="Choose your preferred color scheme"
        icon={<Sun className="w-4 h-4" />}
      >
        <div className="grid grid-cols-3 gap-2">
          <ThemeOptionButton
            mode="light"
            icon={<Sun className="w-4 h-4" />}
            label="Light"
            isActive={themeMode === 'light'}
            onClick={() => handleThemeModeChange('light')}
          />
          <ThemeOptionButton
            mode="dark"
            icon={<Moon className="w-4 h-4" />}
            label="Dark"
            isActive={themeMode === 'dark'}
            onClick={() => handleThemeModeChange('dark')}
          />
          <ThemeOptionButton
            mode="system"
            icon={<Monitor className="w-4 h-4" />}
            label="System"
            isActive={themeMode === 'system'}
            onClick={() => handleThemeModeChange('system')}
          />
        </div>
      </SettingSection>

      {/* Display Section */}
      <SettingSection
        title="Display"
        description="Adjust how information is displayed"
        icon={<FolderTree className="w-4 h-4" />}
      >
        <SettingRow
          icon={<FolderTree className="w-4 h-4" />}
          label="Compact Paths"
          description="Show ~/... instead of full paths like /Users/name/..."
          action={
            <Toggle
              checked={pathDisplayFormat === 'short'}
              onChange={handlePathFormatToggle}
              aria-label="Compact paths"
            />
          }
        />
      </SettingSection>

      {/* Motion Section */}
      <SettingSection
        title="Motion"
        description="Control animations and transitions"
        icon={<Sparkles className="w-4 h-4" />}
      >
        <SettingRow
          icon={<Sparkles className="w-4 h-4" />}
          label="Reduce Motion"
          description="Minimize animations for better accessibility"
          action={
            <Toggle
              checked={reduceMotion}
              onChange={handleReduceMotionToggle}
              aria-label="Reduce motion"
            />
          }
        />
      </SettingSection>
    </div>
  );
};

// ===== Internal Components =====

interface ThemeOptionButtonProps {
  mode: ThemeMode;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  subtitle?: string;
}

const ThemeOptionButton: React.FC<ThemeOptionButtonProps> = ({
  mode,
  icon,
  label,
  isActive,
  onClick,
  disabled,
  subtitle,
}) => {
  // Define active styles for each theme mode
  const activeStyles: Record<ThemeMode, { card: string; icon: string }> = {
    light: {
      card: 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      icon: 'bg-amber-500 text-white',
    },
    dark: {
      card: 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      icon: 'bg-blue-500 text-white',
    },
    system: {
      card: 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400',
      icon: 'bg-purple-500 text-white',
    },
  };

  const styles = activeStyles[mode];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isActive
          ? styles.card
          : 'border-border bg-card hover:border-muted-foreground/50 hover:bg-accent/50 text-muted-foreground',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      aria-pressed={isActive}
    >
      <div
        className={cn(
          'p-2 rounded-full transition-colors',
          isActive ? styles.icon : 'bg-muted'
        )}
      >
        {icon}
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs font-medium">{label}</span>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </button>
  );
};
