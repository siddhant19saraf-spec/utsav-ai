import { createContext, useContext } from 'react';
import type { ResolvedTheme, ThemePreference } from '@/lib/theme';

export interface ThemeContextValue {
  /** What the user chose, including following the device setting. */
  readonly preference: ThemePreference;
  /** The theme currently applied to the document. */
  readonly theme: ResolvedTheme;
  readonly setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider.');
  }

  return context;
}
