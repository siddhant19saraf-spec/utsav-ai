import { FlaskConical, HardDrive } from 'lucide-react';

interface SampleDataNoticeProps {
  readonly hasSampleData: boolean;
  readonly onLoadSampleData: () => void;
  readonly onRemoveSampleData: () => void;
}

export function SampleDataNotice({
  hasSampleData,
  onLoadSampleData,
  onRemoveSampleData,
}: SampleDataNoticeProps) {
  return (
    <aside
      className="rounded-3xl border border-gold-200/80 bg-gold-50/75 px-5 py-4 sm:px-6"
      aria-label="Sample data status"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-gold-300/70 bg-gold-100 text-gold-700"
            aria-hidden="true"
          >
            <FlaskConical className="size-4" strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {hasSampleData ? 'You are exploring sample celebrations' : 'Sample data is out of view'}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">
              {hasSampleData
                ? 'Demo events are marked Sample. Add your own or remove the samples at any time — changes are saved in this browser.'
                : 'The workspace now shows only events you create. You can bring the clearly labelled sample dataset back whenever you want.'}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
              <HardDrive className="size-3.5" aria-hidden="true" />
              Local browser storage. No cloud sync.
            </p>
          </div>
        </div>

        {hasSampleData ? (
          <button type="button" onClick={onRemoveSampleData} className="btn-secondary shrink-0">
            Remove sample data
          </button>
        ) : (
          <button type="button" onClick={onLoadSampleData} className="btn-secondary shrink-0">
            Add sample data
          </button>
        )}
      </div>
    </aside>
  );
}
