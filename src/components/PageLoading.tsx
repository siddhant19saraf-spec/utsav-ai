export function PageLoading() {
  return (
    <div
      role="status"
      className="surface-card flex min-h-[22rem] flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <span className="relative flex size-11 items-center justify-center" aria-hidden="true">
        <span className="absolute size-11 rounded-full border-2 border-line" />
        <span className="absolute size-11 animate-spin rounded-full border-2 border-transparent border-t-maroon-700 motion-reduce:animate-none" />
      </span>
      <p className="text-sm font-medium text-ink-muted">Loading this planning view…</p>
    </div>
  );
}
