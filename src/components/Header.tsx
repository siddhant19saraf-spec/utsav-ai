import { HardDrive, Menu, Moon, Settings, Sun, X } from 'lucide-react';
import type { RefObject } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/features/theme/themeContext';
import { BrandMark } from './BrandMark';
import { allNavigationItems } from './navigation';

interface HeaderProps {
  readonly navigationOpen: boolean;
  readonly onToggleNavigation: () => void;
  readonly onNavigate: () => void;
  readonly navigationButtonRef: RefObject<HTMLButtonElement | null>;
}

export function Header({
  navigationOpen,
  onToggleNavigation,
  onNavigate,
  navigationButtonRef,
}: HeaderProps) {
  const { pathname } = useLocation();
  const { theme, setPreference } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const currentItem = allNavigationItems.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas">
      <div className="mx-auto flex h-16 w-full max-w-[86rem] items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            ref={navigationButtonRef}
            type="button"
            onClick={onToggleNavigation}
            aria-expanded={navigationOpen}
            aria-controls="mobile-navigation"
            aria-label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition-colors hover:border-maroon-600 hover:bg-maroon-50 dark:hover:text-maroon-200 lg:hidden"
          >
            {navigationOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>

          <Link
            to="/"
            onClick={onNavigate}
            aria-label="UTSAV AI, go to overview"
            className="flex min-w-0 items-center gap-2.5 rounded-lg lg:hidden"
          >
            <BrandMark className="size-8 shrink-0 text-maroon-800 dark:text-gold-400" />
            <span className="truncate font-display text-lg font-semibold tracking-[0.08em] text-ink">
              UTSAV AI
            </span>
          </Link>

          <div className="hidden min-w-0 items-center gap-2.5 lg:flex">
            <span className="eyebrow">Workspace</span>
            <span className="text-line-strong" aria-hidden="true">
              /
            </span>
            <span
              aria-current="page"
              className="truncate text-sm font-semibold text-ink"
            >
              {currentItem?.label ?? 'Page not found'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className="hidden min-h-9 items-center gap-1.5 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-medium text-ink-muted min-[380px]:inline-flex"
            title="Changes are saved in this browser's local storage."
          >
            <HardDrive className="size-3.5 text-gold-700" aria-hidden="true" />
            <span className="hidden sm:inline">Saved locally</span>
            <span className="sm:hidden">Local</span>
          </span>
          <button
            type="button"
            onClick={() => setPreference(nextTheme)}
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-muted transition-colors hover:border-maroon-600 hover:bg-maroon-50 hover:text-maroon-800 dark:hover:text-maroon-200"
          >
            {theme === 'dark' ? (
              <Sun className="size-[1.15rem]" aria-hidden="true" strokeWidth={1.8} />
            ) : (
              <Moon className="size-[1.15rem]" aria-hidden="true" strokeWidth={1.8} />
            )}
          </button>
          <Link
            to="/settings"
            onClick={onNavigate}
            aria-label="Open settings"
            title="Settings"
            className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-muted transition-colors hover:border-maroon-600 hover:bg-maroon-50 hover:text-maroon-800 dark:hover:text-maroon-200"
          >
            <Settings className="size-[1.15rem]" aria-hidden="true" strokeWidth={1.8} />
          </Link>
        </div>
      </div>
    </header>
  );
}
