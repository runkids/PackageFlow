/**
 * Appearance Settings Panel
 * Configure visual settings like theme, path display format, and animations
 *
 * Features:
 * - Theme selection with visual preview cards
 * - Path display format toggle
 * - Reduce motion accessibility setting
 * - Consistent gradient card styling
 */

import React, { useCallback } from 'react';
import {
  Palette,
  Sun,
  Moon,
  Monitor,
  FolderTree,
  Sparkles,
  Eye,
  Info,
  Accessibility,
  CheckCircle2,
} from 'lucide-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { useTheme, type ThemeMode } from '../../../contexts/ThemeContext';
import { Toggle } from '../../ui/Toggle';
import { SettingSection } from '../ui/SettingSection';
import { SettingInfoBox } from '../ui/SettingInfoBox';
import { cn } from '../../../lib/utils';

export const AppearanceSettingsPanel: React.FC = () => {
  const { pathDisplayFormat, setPathDisplayFormat, reduceMotion, setReduceMotion } = useSettings();
  const { themeMode, setThemeMode, resolvedTheme } = useTheme();

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
  const handleThemeModeChange = useCallback(
    (mode: ThemeMode) => {
      setThemeMode(mode);
    },
    [setThemeMode]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Fixed Header */}
      <div className="flex-shrink-0 pb-4 border-b border-border bg-background">
        <h2 className="text-xl font-semibold text-foreground flex items-center">
          <Palette className="w-5 h-5 pr-1" />
          Appearance
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize the look and feel of SpecForge
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-6">
        {/* Theme Section */}
        <SettingSection
          title="Theme"
          description="Choose your preferred color scheme"
          icon={<Sun className="w-4 h-4" />}
        >
          <div className="grid grid-cols-3 gap-3">
            <ThemePreviewCard
              mode="light"
              label="Light"
              description="Bright and clean"
              isActive={themeMode === 'light'}
              onClick={() => handleThemeModeChange('light')}
            />
            <ThemePreviewCard
              mode="dark"
              label="Dark"
              description="Easy on the eyes"
              isActive={themeMode === 'dark'}
              onClick={() => handleThemeModeChange('dark')}
            />
            <ThemePreviewCard
              mode="system"
              label="System"
              description="Follow OS setting"
              isActive={themeMode === 'system'}
              onClick={() => handleThemeModeChange('system')}
            />
          </div>

          {/* Current theme indicator */}
          {themeMode === 'system' && (
            <div
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg mt-3',
                'bg-purple-500/5 border border-purple-500/20'
              )}
            >
              <div className="p-1.5 rounded-md bg-purple-500/10">
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Currently using <span className="font-medium text-foreground">{resolvedTheme}</span>{' '}
                theme based on system preferences
              </span>
            </div>
          )}
        </SettingSection>

        {/* Display Section */}
        <SettingSection
          title="Display"
          description="Adjust how information is displayed"
          icon={<Eye className="w-4 h-4" />}
        >
          <div
            className={cn(
              'group relative p-4 rounded-lg',
              'bg-gradient-to-r from-blue-500/5 via-transparent to-transparent',
              'border border-blue-500/20',
              'transition-colors hover:border-blue-500/40'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className={cn(
                  'flex-shrink-0 p-2.5 rounded-lg',
                  'bg-blue-500/10 text-blue-500 dark:text-blue-400'
                )}
              >
                <FolderTree className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Compact Paths</span>
                  {pathDisplayFormat === 'short' && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      )}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Enabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Show ~/... instead of full paths like /Users/name/...
                </p>

                {/* Preview */}
                <div className="mt-3 p-2.5 rounded-md bg-muted/50 border border-border">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Preview
                  </div>
                  <code className="text-xs font-mono text-foreground">
                    {pathDisplayFormat === 'short'
                      ? '~/Developer/Projects/my-app'
                      : '/Users/username/Developer/Projects/my-app'}
                  </code>
                </div>
              </div>

              {/* Toggle */}
              <div className="flex-shrink-0">
                <Toggle
                  checked={pathDisplayFormat === 'short'}
                  onChange={handlePathFormatToggle}
                  aria-label="Compact paths"
                />
              </div>
            </div>
          </div>
        </SettingSection>

        {/* Accessibility Section */}
        <SettingSection
          title="Accessibility"
          description="Settings for improved accessibility"
          icon={<Accessibility className="w-4 h-4" />}
        >
          <div
            className={cn(
              'group relative p-4 rounded-lg',
              'bg-gradient-to-r from-green-500/5 via-transparent to-transparent',
              'border border-green-500/20',
              'transition-colors hover:border-green-500/40'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className={cn(
                  'flex-shrink-0 p-2.5 rounded-lg',
                  'bg-green-500/10 text-green-500 dark:text-green-400'
                )}
              >
                <Sparkles className="w-5 h-5" />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Reduce Motion</span>
                  {reduceMotion && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                      )}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Enabled
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Minimize animations and transitions throughout the app
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recommended for users sensitive to motion or using screen readers
                </p>
              </div>

              {/* Toggle */}
              <div className="flex-shrink-0">
                <Toggle
                  checked={reduceMotion}
                  onChange={handleReduceMotionToggle}
                  aria-label="Reduce motion"
                />
              </div>
            </div>
          </div>
        </SettingSection>

        {/* Tips */}
        <SettingInfoBox title="Display Tips" variant="info">
          <ul className="space-y-1.5">
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>Theme changes take effect immediately without requiring a restart</span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>
                Use <strong>System</strong> theme to automatically switch between light and dark
                based on your OS settings
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 pr-1 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>Reduce Motion also respects your system's motion preferences</span>
            </li>
          </ul>
        </SettingInfoBox>
      </div>
    </div>
  );
};

// ===== Internal Components =====

interface ThemePreviewCardProps {
  mode: ThemeMode;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

const ThemePreviewCard: React.FC<ThemePreviewCardProps> = ({
  mode,
  label,
  description,
  isActive,
  onClick,
}) => {
  // Define styles for each theme mode
  const modeConfig: Record<
    ThemeMode,
    {
      gradient: string;
      border: string;
      iconBg: string;
      iconColor: string;
      previewBg: string;
      previewSidebar: string;
      previewHeader: string;
      previewContent: string;
    }
  > = {
    light: {
      gradient: 'from-amber-500/5 via-transparent to-transparent',
      border: isActive ? 'border-amber-500' : 'border-border hover:border-amber-500/50',
      iconBg: isActive ? 'bg-amber-500' : 'bg-amber-500/10',
      iconColor: isActive ? 'text-white' : 'text-amber-600 dark:text-amber-400',
      previewBg: 'bg-white',
      previewSidebar: 'bg-gray-100',
      previewHeader: 'bg-gray-50',
      previewContent: 'bg-gray-200',
    },
    dark: {
      gradient: 'from-blue-500/5 via-transparent to-transparent',
      border: isActive ? 'border-blue-500' : 'border-border hover:border-blue-500/50',
      iconBg: isActive ? 'bg-blue-500' : 'bg-blue-500/10',
      iconColor: isActive ? 'text-white' : 'text-blue-600 dark:text-blue-400',
      previewBg: 'bg-zinc-900',
      previewSidebar: 'bg-zinc-800',
      previewHeader: 'bg-zinc-800/50',
      previewContent: 'bg-zinc-700',
    },
    system: {
      gradient: 'from-purple-500/5 via-transparent to-transparent',
      border: isActive ? 'border-purple-500' : 'border-border hover:border-purple-500/50',
      iconBg: isActive ? 'bg-purple-500' : 'bg-purple-500/10',
      iconColor: isActive ? 'text-white' : 'text-purple-600 dark:text-purple-400',
      // System shows a split preview
      previewBg: 'bg-gradient-to-r from-white to-zinc-900',
      previewSidebar: 'bg-gradient-to-r from-gray-100 to-zinc-800',
      previewHeader: 'bg-gradient-to-r from-gray-50 to-zinc-800/50',
      previewContent: 'bg-gradient-to-r from-gray-200 to-zinc-700',
    },
  };

  const config = modeConfig[mode];

  const ThemeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col rounded-lg border-2 transition-all overflow-hidden',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        config.border,
        isActive && 'ring-1 ring-offset-1 ring-offset-background',
        isActive && mode === 'light' && 'ring-amber-500/50',
        isActive && mode === 'dark' && 'ring-blue-500/50',
        isActive && mode === 'system' && 'ring-purple-500/50'
      )}
      aria-pressed={isActive}
    >
      {/* Mini Preview */}
      <div className={cn('w-full h-16 relative overflow-hidden', config.previewBg)}>
        {/* Simulated UI elements */}
        <div className={cn('absolute left-0 top-0 bottom-0 w-4', config.previewSidebar)} />
        <div className={cn('absolute left-4 right-0 top-0 h-3', config.previewHeader)} />
        <div className="absolute left-6 right-2 top-5 space-y-1">
          <div className={cn('h-1.5 w-3/4 rounded-sm', config.previewContent)} />
          <div className={cn('h-1.5 w-1/2 rounded-sm', config.previewContent)} />
          <div className={cn('h-1.5 w-2/3 rounded-sm', config.previewContent)} />
        </div>

        {/* Active indicator checkmark */}
        {isActive && (
          <div className="absolute top-1.5 right-1.5">
            <div
              className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center',
                mode === 'light' && 'bg-amber-500',
                mode === 'dark' && 'bg-blue-500',
                mode === 'system' && 'bg-purple-500'
              )}
            >
              <CheckCircle2 className="w-3 h-3 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Label Area */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2.5',
          'bg-gradient-to-r',
          config.gradient,
          'border-t border-border'
        )}
      >
        <div className={cn('p-1.5 rounded-md transition-colors', config.iconBg)}>
          <ThemeIcon className={cn('w-3.5 h-3.5', config.iconColor)} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-xs font-medium text-foreground">{label}</div>
          <div className="text-[10px] text-muted-foreground truncate">{description}</div>
        </div>
      </div>
    </button>
  );
};
