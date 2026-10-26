export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'utsav-ai.theme';
export const DARK_THEME_COLOR = '#1a1216';
export const LIGHT_THEME_COLOR = '#4a1325';

const themePreferences: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' && (themePreferences as readonly string[]).includes(value)
  );
}

export function parseThemePreference(raw: string | null): ThemePreference {
  return isThemePreference(raw) ? raw : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }

  return preference;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readThemePreference(storage: Storage | null = browserStorage()): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: Storage | null = browserStorage(),
): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A blocked storage API must not stop the theme from applying for this visit.
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function applyTheme(
  theme: ResolvedTheme,
  root: Element | null = typeof document === 'undefined'
    ? null
    : document.documentElement,
): void {
  if (!root) {
    return;
  }

  root.classList.toggle('dark', theme === 'dark');

  if (typeof document !== 'undefined') {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }
}
