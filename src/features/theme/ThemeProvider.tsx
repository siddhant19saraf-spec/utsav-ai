import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme';
import { ThemeContext, type ThemeContextValue } from './themeContext';

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readThemePreference(),
  );
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark());
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);

    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
