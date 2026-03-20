import Card from '../../../components/Card';
import SegmentedControl from '../../../components/SegmentedControl';
import { useTheme, type Style, type ModePreference } from '../../../context/ThemeContext';
import { tauriBridge } from '../../api/tauri-bridge';

const STYLES: { id: Style; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'playful', label: 'Playful' },
];

const MODES: { id: ModePreference; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export default function AppearanceSettings() {
  const { style, setStyle, modePreference, setModePreference } = useTheme();

  const handleStyleChange = (s: Style) => {
    setStyle(s);
    // Persist for iframe sync
    tauriBridge.setPreferredTheme(
      s === 'playful' ? 'playful' : modePreference === 'dark' ? 'dark' : 'clean'
    );
  };

  const handleModeChange = (m: ModePreference) => {
    setModePreference(m);
    // Persist for iframe sync — resolve CLI theme value
    const resolved =
      m === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : style === 'playful'
            ? 'playful'
            : 'clean'
        : m === 'dark'
          ? 'dark'
          : style === 'playful'
            ? 'playful'
            : 'clean';
    tauriBridge.setPreferredTheme(resolved);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-pencil" style={{ fontFamily: 'var(--font-heading)' }}>
        Appearance
      </h1>

      <Card className="divide-y divide-muted">
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p className="text-sm font-medium text-pencil">Style</p>
            <p className="text-xs text-pencil-light mt-0.5">Visual style of the interface</p>
          </div>
          <SegmentedControl options={STYLES} value={style} onChange={handleStyleChange} />
        </div>

        <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p className="text-sm font-medium text-pencil">Mode</p>
            <p className="text-xs text-pencil-light mt-0.5">Light or dark appearance</p>
          </div>
          <SegmentedControl options={MODES} value={modePreference} onChange={handleModeChange} />
        </div>
      </Card>
    </div>
  );
}
