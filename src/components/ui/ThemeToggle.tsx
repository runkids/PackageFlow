import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from './Button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'light' ? (
        <Sun className="h-5 w-5 text-amber-500 transition-colors" />
      ) : (
        <Moon className="h-5 w-5 text-blue-400 transition-colors" />
      )}
    </Button>
  );
}
