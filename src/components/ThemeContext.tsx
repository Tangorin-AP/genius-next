'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

const STORAGE_KEY = 'genius-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? (window.localStorage.getItem(STORAGE_KEY) as Theme | null) : null;
    const initial = stored === 'dark' ? 'dark' : 'light';
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    applyTheme(next);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}
