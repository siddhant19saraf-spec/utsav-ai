import { HardDrive } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { BrandMark } from './BrandMark';
import {
  navigationSections,
  settingsNavigationItem,
  type NavigationItem,
} from './navigation';

function SidebarLink({ item }: { readonly item: NavigationItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-nav-accent ${
          isActive
            ? 'bg-white/[0.09] text-nav-strong'
            : 'text-nav-text/70 hover:bg-white/[0.05] hover:text-nav-strong'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-nav-accent"
              aria-hidden="true"
            />
          ) : null}
          <Icon
            className={`size-[1.15rem] shrink-0 ${
              isActive
                ? 'text-nav-accent'
                : 'text-nav-muted/55 group-hover:text-nav-muted'
            }`}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <span>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-maroon-900/70 bg-maroon-950 px-5 py-6 text-nav-text lg:flex">
      <div
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/70 to-transparent"
        aria-hidden="true"
      />

      <Link
        to="/"
        aria-label="UTSAV AI, go to overview"
        className="flex items-center gap-3 rounded-xl focus-visible:outline-nav-accent"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-nav-accent/40 bg-white/[0.04] text-nav-accent">
          <BrandMark className="size-8" />
        </span>
        <span>
          <span className="block font-display text-[1.35rem] leading-none font-semibold tracking-[0.1em] text-nav-strong">
            UTSAV AI
          </span>
          <span className="mt-1.5 block text-[0.6875rem] leading-snug text-nav-text/65">
            Plan Smarter. Celebrate Better.
          </span>
        </span>
      </Link>

      <nav aria-label="Primary" className="mt-9 flex-1">
        <div className="space-y-7">
          {navigationSections.map((section) => (
            <div key={section.title}>
              <p className="px-3 text-[0.625rem] font-semibold tracking-[0.22em] text-nav-muted/60 uppercase">
                {section.title}
              </p>
              <ul aria-label={section.title} className="mt-2 space-y-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-7 border-t border-white/10 pt-4">
          <SidebarLink item={settingsNavigationItem} />
        </div>
      </nav>

      <div className="mt-6 rounded-2xl border border-nav-accent/15 bg-white/[0.03] p-3.5">
        <p className="flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.14em] text-nav-muted/85 uppercase">
          <HardDrive className="size-3.5 shrink-0" aria-hidden="true" />
          Browser workspace
        </p>
        <p className="mt-2 text-xs leading-relaxed text-nav-text/65">
          Changes are saved in this browser&apos;s local storage. No account or cloud sync is
          connected. Optional AI requests use the app&apos;s API server only.
        </p>
      </div>
    </aside>
  );
}
