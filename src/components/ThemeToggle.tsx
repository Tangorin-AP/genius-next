'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from './ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const sliderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.checked = theme === 'dark';
    }
  }, [theme]);

  return (
    <label className="theme-toggle" title="Toggle dark / light mode">
      <input
        ref={sliderRef}
        type="checkbox"
        aria-label="Toggle dark or light mode"
        onChange={(event) => setTheme(event.currentTarget.checked ? 'dark' : 'light')}
      />
      <span className="track">
        <span className="thumb" />
        <span className="mode mode--light">☀️</span>
        <span className="mode mode--dark">🌙</span>
      </span>
    </label>
  );
}
