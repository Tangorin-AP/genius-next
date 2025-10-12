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
  const [mounted, setMounted] = useState(false);

  const persistTheme = useCallback((next: Theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    applyTheme(next);
  }, []);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? (window.localStorage.getItem(STORAGE_KEY) as Theme | null) : null;
    const initial = stored === 'dark' ? 'dark' : 'light';
    setThemeState(initial);
    persistTheme(initial);
    setMounted(true);
  }, [persistTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persistTheme(next);
  }, [persistTheme]);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      persistTheme(next);
      return next;
    });
  }, [persistTheme]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  if (!mounted) {
    return <>{children}</>;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}
