import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Header } from './Header';
import { PageLoading } from './PageLoading';
import { PersistenceNotice } from './PersistenceNotice';
import { Sidebar } from './Sidebar';
import {
  navigationSections,
  settingsNavigationItem,
  type NavigationItem,
} from './navigation';

function MobileNavigationLink({
  item,
  onNavigate,
}: {
  readonly item: NavigationItem;
  readonly onNavigate: () => void;
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-maroon-50 text-maroon-800'
            : 'text-ink-muted hover:bg-surface-muted hover:text-ink'
        }`
      }
    >
      <Icon className="size-[1.15rem] shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  );
}

export function AppLayout() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navigationOpen) {
      return;
    }

    mobilePanelRef.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavigationOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigationOpen]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Sidebar />

      <div className="flex min-h-screen min-w-0 flex-col">
        <Header
          navigationOpen={navigationOpen}
          onToggleNavigation={() => setNavigationOpen((open) => !open)}
          onNavigate={() => setNavigationOpen(false)}
          navigationButtonRef={menuButtonRef}
        />

        <div
          id="mobile-navigation"
          ref={mobilePanelRef}
          hidden={!navigationOpen}
          className="border-b border-line bg-surface lg:hidden"
        >
          <nav
            aria-label="Mobile primary"
            className="mx-auto w-full max-w-[86rem] px-4 py-4 sm:px-6"
          >
            <div className="space-y-4">
              {navigationSections.map((section) => (
                <div key={section.title}>
                  <p className="px-3 text-[0.625rem] font-semibold tracking-[0.18em] text-ink-soft uppercase">
                    {section.title}
                  </p>
                  <ul aria-label={section.title} className="mt-1.5 space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.to}>
                        <MobileNavigationLink
                          item={item}
                          onNavigate={() => setNavigationOpen(false)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-line pt-2">
              <MobileNavigationLink
                item={settingsNavigationItem}
                onNavigate={() => setNavigationOpen(false)}
              />
            </div>
          </nav>
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 focus:outline-none"
        >
          <div className="mx-auto w-full max-w-[86rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
            <PersistenceNotice />
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        <footer className="border-t border-line/80 py-6">
          <div className="mx-auto flex w-full max-w-[86rem] flex-col gap-2 px-4 text-xs leading-relaxed text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
            <p className="font-medium">UTSAV AI · Plan Smarter. Celebrate Better.</p>
            <p>Local workspace · Deterministic checks · AI proposals require approval</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
