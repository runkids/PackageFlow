/**
 * Notification Settings Panel
 * Configure desktop notification preferences including categories and DND settings
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Volume2,
  Webhook,
  Play,
  GitBranch,
  Shield,
  Rocket,
  Moon,
  Clock,
  Loader2,
} from 'lucide-react';
import { notificationAPI } from '../../../lib/tauri-api';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_CATEGORIES,
  type NotificationSettings,
  type NotificationCategoryId,
} from '../../../types/notification';
import { Toggle } from '../../ui/Toggle';
import { SettingSection } from '../ui/SettingSection';
import { SettingRow } from '../ui/SettingRow';
import { cn } from '../../../lib/utils';

// Icon mapping for notification categories
const CATEGORY_ICONS: Record<NotificationCategoryId, React.ElementType> = {
  webhooks: Webhook,
  workflowExecution: Play,
  gitOperations: GitBranch,
  securityScans: Shield,
  deployments: Rocket,
};

export const NotificationSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const loaded = await notificationAPI.loadSettings();
        setSettings(loaded);
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Save settings helper
  const saveSettings = useCallback(async (newSettings: NotificationSettings) => {
    setIsSaving(true);
    try {
      await notificationAPI.saveSettings(newSettings);
      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to save notification settings:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Toggle master switch
  const handleMasterToggle = useCallback(() => {
    saveSettings({ ...settings, enabled: !settings.enabled });
  }, [settings, saveSettings]);

  // Toggle sound
  const handleSoundToggle = useCallback(() => {
    saveSettings({ ...settings, soundEnabled: !settings.soundEnabled });
  }, [settings, saveSettings]);

  // Toggle category
  const handleCategoryToggle = useCallback((categoryId: NotificationCategoryId) => {
    const newCategories = {
      ...settings.categories,
      [categoryId]: !settings.categories[categoryId],
    };
    saveSettings({ ...settings, categories: newCategories });
  }, [settings, saveSettings]);

  // Toggle DND
  const handleDndToggle = useCallback(() => {
    saveSettings({
      ...settings,
      doNotDisturb: {
        ...settings.doNotDisturb,
        enabled: !settings.doNotDisturb.enabled,
      },
    });
  }, [settings, saveSettings]);

  // Update DND time
  const handleDndTimeChange = useCallback((field: 'startTime' | 'endTime', value: string) => {
    saveSettings({
      ...settings,
      doNotDisturb: {
        ...settings.doNotDisturb,
        [field]: value,
      },
    });
  }, [settings, saveSettings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header - Fixed */}
      <div className="shrink-0 pb-6">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notifications
          {isSaving && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure desktop notification preferences
        </p>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto space-y-6 min-h-0">
        {/* General Section */}
      <SettingSection
        title="General"
        description="Master controls for notifications"
        icon={<Bell className="w-4 h-4" />}
      >
        <SettingRow
          icon={<Bell className="w-4 h-4" />}
          label="Enable Notifications"
          description="Show desktop notifications for events"
          action={
            <Toggle
              checked={settings.enabled}
              onChange={handleMasterToggle}
              aria-label="Enable notifications"
            />
          }
        />
        <SettingRow
          icon={<Volume2 className="w-4 h-4" />}
          label="Notification Sound"
          description="Play sound when notifications appear"
          disabled={!settings.enabled}
          action={
            <Toggle
              checked={settings.soundEnabled}
              onChange={handleSoundToggle}
              disabled={!settings.enabled}
              aria-label="Notification sound"
            />
          }
        />
      </SettingSection>

      {/* Categories Section */}
      <SettingSection
        title="Categories"
        description="Choose which types of notifications to receive"
        icon={<Bell className="w-4 h-4" />}
      >
        {NOTIFICATION_CATEGORIES.map((category) => {
          const Icon = CATEGORY_ICONS[category.id];
          return (
            <SettingRow
              key={category.id}
              icon={<Icon className="w-4 h-4" />}
              label={category.label}
              description={category.description}
              disabled={!settings.enabled}
              action={
                <Toggle
                  checked={settings.categories[category.id]}
                  onChange={() => handleCategoryToggle(category.id)}
                  disabled={!settings.enabled}
                  aria-label={`${category.label} notifications`}
                />
              }
            />
          );
        })}
      </SettingSection>

      {/* Do Not Disturb Section */}
      <SettingSection
        title="Do Not Disturb"
        description="Schedule quiet hours for notifications"
        icon={<Moon className="w-4 h-4" />}
      >
        <SettingRow
          icon={<Moon className="w-4 h-4" />}
          label="Enable Do Not Disturb"
          description="Suppress notifications during specified hours"
          disabled={!settings.enabled}
          action={
            <Toggle
              checked={settings.doNotDisturb.enabled}
              onChange={handleDndToggle}
              disabled={!settings.enabled}
              aria-label="Enable do not disturb"
            />
          }
        />

        {settings.enabled && settings.doNotDisturb.enabled && (
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Quiet Hours</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="dnd-start" className="text-sm text-muted-foreground">
                  From
                </label>
                <input
                  id="dnd-start"
                  type="time"
                  value={settings.doNotDisturb.startTime}
                  onChange={(e) => handleDndTimeChange('startTime', e.target.value)}
                  className={cn(
                    'px-2 py-1 rounded border border-input bg-background text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="dnd-end" className="text-sm text-muted-foreground">
                  To
                </label>
                <input
                  id="dnd-end"
                  type="time"
                  value={settings.doNotDisturb.endTime}
                  onChange={(e) => handleDndTimeChange('endTime', e.target.value)}
                  className={cn(
                    'px-2 py-1 rounded border border-input bg-background text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-ring'
                  )}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Notifications will be silenced between {settings.doNotDisturb.startTime} and{' '}
              {settings.doNotDisturb.endTime}
            </p>
          </div>
        )}
      </SettingSection>
      </div>
    </div>
  );
};
