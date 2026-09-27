import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'semantic-instruments-theme';
const SWITCH_MS = 260;
let switchTimer = 0;
/** White is the default; dark applies only after it was explicitly chosen. */
export function readSavedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
/** Apply the saved theme before the first paint. Idempotent. */
export function initializeTheme(): Theme {
  const theme = readSavedTheme();
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
  return theme;
}
function applyTheme(theme: Theme) {
  const root = document.documentElement,
    calm =
      root.classList.contains('scene-fixed') ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!calm) {
    // Colors cross-fade only during the switch, so no permanent transitions are added.
    root.classList.add('theme-switching');
    clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => root.classList.remove('theme-switching'), SWITCH_MS);
  }
  root.dataset.theme = theme;
}
function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be denied; the choice then lasts for this page only.
  }
}
// Importing the toggle is enough to avoid a white flash before React mounts.
if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) initializeTheme();
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme),
    dark = theme === 'dark';
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next: Theme = e.newValue === 'dark' ? 'dark' : 'light';
      applyTheme(next);
      setTheme(next);
    };
    addEventListener('storage', sync);
    return () => removeEventListener('storage', sync);
  }, []);
  return (
    <button
      type="button"
      className={'theme-toggle ' + className}
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next: Theme = dark ? 'light' : 'dark';
        applyTheme(next);
        saveTheme(next);
        setTheme(next);
      }}
    >
      <Moon className="theme-toggle-moon" size={16} aria-hidden="true" />
      <Sun className="theme-toggle-sun" size={16} aria-hidden="true" />
    </button>
  );
}
