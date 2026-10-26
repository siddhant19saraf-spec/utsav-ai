import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeProvider } from './ThemeProvider';
import { useTheme } from './themeContext';

type ChangeListener = (event: MediaQueryListEvent) => void;

function installColorScheme(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const query = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) =>
      listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query as unknown as MediaQueryList),
  );

  return {
    emit(matches: boolean) {
      query.matches = matches;
      act(() => {
        listeners.forEach((listener) =>
          listener({ matches } as MediaQueryListEvent),
        );
      });
    },
  };
}

function Probe() {
  const { preference, theme, setPreference } = useTheme();

  return (
    <div>
      <p data-testid="theme-state">{`${preference}:${theme}`}</p>
      <button type="button" onClick={() => setPreference('dark')}>
        Use dark
      </button>
      <button type="button" onClick={() => setPreference('system')}>
        Use system
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  document.querySelector('meta[name="theme-color"]')?.remove();
});

describe('ThemeProvider', () => {
  it('applies a stored explicit preference', () => {
    installColorScheme(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    renderProvider();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('dark:dark');
    expect(document.documentElement).toHaveClass('dark');
  });

  it('follows the device setting while the system preference is selected', () => {
    const colorScheme = installColorScheme(true);

    renderProvider();

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system:dark');
    expect(document.documentElement).toHaveClass('dark');

    colorScheme.emit(false);

    expect(screen.getByTestId('theme-state')).toHaveTextContent('system:light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('persists an explicit choice and ignores later device changes', async () => {
    const user = userEvent.setup();
    const colorScheme = installColorScheme(false);

    renderProvider();

    await user.click(screen.getByRole('button', { name: 'Use dark' }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByTestId('theme-state')).toHaveTextContent('dark:dark');

    colorScheme.emit(true);
    await user.click(screen.getByRole('button', { name: 'Use system' }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(screen.getByTestId('theme-state')).toHaveTextContent('system:dark');
  });
});
