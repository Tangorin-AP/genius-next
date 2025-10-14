'use client';

import { useTheme } from './ThemeContext';

type ThemeToggleProps = {
  className?: string;
};

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <label
      className={[className, 'theme-toggle'].filter(Boolean).join(' ')}
      data-theme={isDark ? 'dark' : 'light'}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <input
        type="checkbox"
        checked={isDark}
        onChange={() => setTheme(isDark ? 'light' : 'dark')}
        aria-label="Toggle theme"
      />
      <span className="theme-toggle__slider">
        <span className="theme-toggle__thumb" />
      </span>
    </label>
  );
}
