import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 text-[2.15rem] leading-[1.1] font-semibold tracking-[-0.025em] text-ink sm:text-[2.6rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted sm:text-[0.9375rem]">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}
