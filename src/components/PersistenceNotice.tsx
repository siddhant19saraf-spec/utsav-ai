import { AlertTriangle, Database } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useWorkspace } from '@/features/workspace/workspaceContext';
import type { WorkspacePersistenceStatus } from '@/features/workspace/workspaceContext';

const titles: Record<Exclude<WorkspacePersistenceStatus, 'local'>, string> = {
  'load-partial': 'Some saved data could not be loaded',
  'load-failed': 'Saved data could not be loaded',
  'save-failed': 'The latest changes may not be saved',
  unavailable: 'Local saving is unavailable',
};

export function PersistenceNotice() {
  const { persistence } = useWorkspace();
  const { pathname } = useLocation();

  // Settings carries the full storage detail panel, including export controls.
  if (persistence.status === 'local' || pathname === '/settings') {
    return null;
  }

  const isPartial = persistence.status === 'load-partial';

  return (
    <div
      role={isPartial ? 'status' : 'alert'}
      aria-live={isPartial ? 'polite' : undefined}
      className="mb-6 flex items-start gap-3 rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3.5 text-sm leading-relaxed text-ink"
    >
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-rust-100 text-rust-700"
        aria-hidden="true"
      >
        {isPartial ? (
          <Database className="size-4" strokeWidth={1.8} />
        ) : (
          <AlertTriangle className="size-4" strokeWidth={1.8} />
        )}
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{titles[persistence.status]}</p>
        <p className="mt-0.5 text-ink-muted">{persistence.message}</p>
        <Link
          to="/settings"
          className="mt-1.5 inline-flex font-medium text-rust-700 underline underline-offset-2 hover:text-rust-600"
        >
          Review storage status and export a backup
        </Link>
      </div>
    </div>
  );
}
