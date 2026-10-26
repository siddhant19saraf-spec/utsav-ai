import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  systemPrefersDark,
  writeThemePreference,
} from './theme';

const failingStorage = {
  getItem: () => {
    throw new Error('storage blocked');
  },
  setItem: () => {
    throw new Error('storage blocked');
  },
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  length: 0,
} as Storage;

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('theme preference parsing', () => {
  it('accepts only the supported preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });

  it('falls back to the system preference for missing or unknown values', () => {
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('{"dark":true}')).toBe('system');
  });
});

describe('theme resolution', () => {
  it('uses the explicit preference when one is chosen', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the device setting for the system preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('theme storage', () => {
  it('reads a stored preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    expect(readThemePreference()).toBe('dark');
  });

  it('treats unknown stored values as the system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');

    expect(readThemePreference()).toBe('system');
  });

  it('survives an unavailable storage API', () => {
    expect(readThemePreference(failingStorage)).toBe('system');
    expect(() => writeThemePreference('dark', failingStorage)).not.toThrow();
  });

  it('writes the selected preference', () => {
    writeThemePreference('light');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});

describe('system color scheme', () => {
  it('reports the device preference', () => {
    stubMatchMedia(true);
    expect(systemPrefersDark()).toBe(true);

    stubMatchMedia(false);
    expect(systemPrefersDark()).toBe(false);
  });

  it('defaults to light when the API is missing', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(systemPrefersDark()).toBe(false);
  });
});

describe('applying a theme', () => {
  it('toggles the root class and the browser theme color', () => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);

    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(meta).toHaveAttribute('content', DARK_THEME_COLOR);

    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(meta).toHaveAttribute('content', LIGHT_THEME_COLOR);
  });

  it('ignores a missing root element', () => {
    expect(() => applyTheme('dark', null)).not.toThrow();
  });
});
