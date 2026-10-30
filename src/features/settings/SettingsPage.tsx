import {
  Check,
  Database,
  Download,
  FileJson,
  HardDrive,
  Minus,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Upload,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { useTheme } from '@/features/theme/themeContext';
import { toIsoDate } from '@/lib/date';
import type { ThemePreference } from '@/lib/theme';
import {
  useWorkspace,
  type WorkspacePersistenceStatus,
} from '@/features/workspace/workspaceContext';
import { importWorkspaceFromJson } from '@/features/workspace/workspaceStorage';

const implementedItems = [
  'Overview dashboard with saved workspace summaries and deterministic early warnings',
  'Event creation and editing with client-side validation',
  'Timeline activities, preparation tasks, guest RSVPs, and deterministic catering estimates',
  'Deterministic budget categories, protection rules, and review-first repair',
  'Event Rescue analysis with schedule and guest findings and explicit, atomic approval',
  'Risk Intelligence with severity filters, evidence, dismissal history, and rescue-proposal checks',
  'Secure AI planning with validated proposals, stale checks, preview, and explicit approval',
  'Browser-local persistence with schema versioning, per-record salvage, and a recovery copy',
  'Validated JSON workspace export and explicitly confirmed import',
  'Clearly labelled sample data controls',
];

const notConnectedItems = [
  'A deployed hosted API, accounts, or cloud sync',
  'Authentication, payments, or deployment',
  'Automatic backup outside this browser',
  'Live vendor prices, bookings, or availability checks',
];

const persistenceLabels: Record<WorkspacePersistenceStatus, string> = {
  local: 'Saved in this browser',
  'load-partial': 'Some saved data could not be loaded',
  'load-failed': 'Saved data could not be loaded',
  'save-failed': 'The latest changes may not be saved',
  unavailable: 'Browser storage is unavailable',
};

interface PendingImport {
  readonly fileName: string;
  readonly raw: string;
  readonly events: number;
  readonly tasks: number;
  readonly guests: number;
  readonly findings: number;
}

const themeOptions: ReadonlyArray<{
  readonly value: ThemePreference;
  readonly label: string;
  readonly description: string;
  readonly Icon: typeof Sun;
}> = [
  { value: 'light', label: 'Light', description: 'Always use the light theme', Icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Always use the dark theme', Icon: Moon },
  {
    value: 'system',
    label: 'System',
    description: 'Follow your device setting',
    Icon: Monitor,
  },
];

export function SettingsPage() {
  const {
    workspace,
    hasSampleData,
    persistence,
    loadDemoData,
    removeDemoData,
    exportWorkspace,
    importWorkspace,
  } = useWorkspace();
  const { preference, theme, setPreference } = useTheme();
  const [announcement, setAnnouncement] = useState('');
  const [dataError, setDataError] = useState('');
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleEventCount = workspace.events.filter((event) => event.origin === 'sample').length;
  const riskFindingCount = workspace.riskFindings?.length ?? 0;

  function handleLoadSampleData() {
    loadDemoData();
    setAnnouncement('Sample celebrations added and saved in this browser.');
  }

  function handleRemoveSampleData() {
    removeDemoData();
    setAnnouncement('Sample celebrations removed. Events you created were kept.');
  }

  function handleExport() {
    const result = exportWorkspace();

    if (!result.ok) {
      setDataError(result.message);
      return;
    }

    const blob = new Blob([result.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `utsav-ai-workspace-${toIsoDate(new Date())}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDataError('');
    setAnnouncement(
      'Workspace backup downloaded. The file contains the local data shown on this page.',
    );
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setPendingImport(null);
    setDataError('');

    let raw: string;

    try {
      raw = await file.text();
    } catch {
      setDataError(
        'The selected file could not be read. Nothing was imported and your workspace is unchanged.',
      );
      return;
    }

    const validation = importWorkspaceFromJson(raw);

    if (!validation.ok) {
      setDataError(validation.message);
      return;
    }

    setPendingImport({
      fileName: file.name,
      raw,
      events: validation.workspace.events.length,
      tasks: validation.workspace.tasks.length,
      guests: validation.workspace.guests.length,
      findings: validation.workspace.riskFindings?.length ?? 0,
    });
  }

  function handleConfirmImport() {
    if (!pendingImport) {
      return;
    }

    const result = importWorkspace(pendingImport.raw);

    if (!result.ok) {
      setPendingImport(null);
      setDataError(result.message);
      return;
    }

    const fileName = pendingImport.fileName;
    setPendingImport(null);
    setDataError('');
    setAnnouncement(
      `Imported ${fileName}. The previous workspace in this browser was replaced.`,
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="Control the sample dataset, choose how this workspace looks, back up your local data, and review exactly what is connected in this build. This is a frontend preview, not a production account."
        actions={
          <Link to="/" className="btn-secondary">
            Back to overview
          </Link>
        }
      />

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface-card p-5 sm:p-6" aria-labelledby="workspace-data-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-gold-200 bg-gold-50 text-gold-700"
                aria-hidden="true"
              >
                <Database className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <h2 id="workspace-data-heading" className="text-xl font-semibold text-ink">
                  Workspace data
                </h2>
                <p className="mt-1 text-xs text-ink-muted">Source and size of the saved workspace</p>
              </div>
            </div>
            <StatusBadge tone={hasSampleData ? 'warning' : 'success'} showDot={false}>
              {hasSampleData ? 'Sample data loaded' : 'Your data only'}
            </StatusBadge>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Events
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">
                {workspace.events.length}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Tasks
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">
                {workspace.tasks.length}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Guests
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">
                {workspace.guests.length}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-3.5">
              <dt className="text-[0.625rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
                Risk findings
              </dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">
                {riskFindingCount}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            {sampleEventCount > 0
              ? `${sampleEventCount} sample event${
                  sampleEventCount === 1 ? '' : 's'
                } loaded. Removing sample data keeps events you created.`
              : 'No sample events are loaded. The workspace reflects only events you create.'}
          </p>

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleRemoveSampleData}
              disabled={!hasSampleData}
              className="btn-secondary"
            >
              Remove sample data
            </button>
            <button
              type="button"
              onClick={handleLoadSampleData}
              disabled={hasSampleData}
              className="btn-secondary"
            >
              Add sample data
            </button>
          </div>

          <div
            className={`mt-4 rounded-2xl border px-3.5 py-3 ${
              persistence.status === 'local'
                ? 'border-line bg-canvas/70'
                : persistence.status === 'load-partial'
                  ? 'border-gold-200 bg-gold-50/60'
                  : 'border-rust-100 bg-rust-50/60'
            }`}
          >
            <p className="flex items-center gap-2 text-xs font-semibold text-ink">
              <HardDrive
                className="size-3.5 shrink-0 text-gold-700"
                aria-hidden="true"
              />
              {persistenceLabels[persistence.status]}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              {persistence.status === 'local'
                ? "Changes are saved in this browser's local storage. They do not sync across browsers, devices, or people, and clearing site data removes them. Local storage is not encrypted and is not a backup."
                : persistence.message}
            </p>
            {persistence.status === 'load-partial' ? (
              <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                Valid records were kept and a copy of the original saved payload was
                retained in this browser before any new change is saved. Export a backup
                now if you need an independent copy.
              </p>
            ) : null}
          </div>
        </section>

        <section className="surface-card p-5 sm:p-6" aria-labelledby="build-status-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-sage-100 bg-sage-50 text-sage-700"
                aria-hidden="true"
              >
                <ShieldCheck className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <h2 id="build-status-heading" className="text-xl font-semibold text-ink">
                  Build status
                </h2>
                <p className="mt-1 text-xs text-ink-muted">What works and what is planned</p>
              </div>
            </div>
            <StatusBadge tone="info" showDot={false}>
              Local-first build
            </StatusBadge>
          </div>

          <div className="mt-5">
            <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase">
              Implemented in this build
            </h3>
            <ul className="mt-2.5 space-y-2">
              {implementedItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sage-700"
                    aria-hidden="true"
                  >
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-semibold tracking-[0.08em] text-ink-soft uppercase">
              Not connected
            </h3>
            <ul className="mt-2.5 space-y-2">
              {notConnectedItems.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <span
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-soft"
                    aria-hidden="true"
                  >
                    <Minus className="size-3" strokeWidth={2.5} />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-5 rounded-2xl border border-line bg-canvas/70 px-3.5 py-3 text-xs leading-relaxed text-ink-muted">
            Budget, catering, rescue, and risk checks are deterministic and remain the
            source of truth. AI proposals are advisory: they are validated against saved
            data and never applied without explicit approval. The optional AI provider is
            configured only on the server-side API through environment variables; no API
            key or secret is bundled into the frontend.
          </p>
        </section>
      </div>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="appearance-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-maroon-100 bg-maroon-50 text-maroon-700"
              aria-hidden="true"
            >
              {theme === 'dark' ? (
                <Moon className="size-5" strokeWidth={1.7} />
              ) : (
                <Sun className="size-5" strokeWidth={1.7} />
              )}
            </span>
            <div>
              <h2 id="appearance-heading" className="text-xl font-semibold text-ink">
                Appearance
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                Theme preference for this browser
              </p>
            </div>
          </div>
          <StatusBadge tone="info" showDot={false}>
            {theme === 'dark' ? 'Dark theme' : 'Light theme'}
          </StatusBadge>
        </div>

        <fieldset className="mt-5">
          <legend className="field-label">Theme</legend>
          <p className="field-hint mt-1">
            Saved in this browser only. &ldquo;System&rdquo; follows your device setting and
            updates when it changes.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {themeOptions.map((option) => {
              const OptionIcon = option.Icon;

              return (
                <label key={option.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="theme-preference"
                    value={option.value}
                    checked={preference === option.value}
                    onChange={() => setPreference(option.value)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-line-strong peer-checked:border-maroon-600 peer-checked:bg-maroon-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sage-600">
                    <OptionIcon
                      className="mt-0.5 size-4 shrink-0 text-maroon-700"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {option.description}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <section className="surface-card p-5 sm:p-6" aria-labelledby="backup-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-slate-blue-100 bg-slate-blue-50 text-slate-blue-700"
              aria-hidden="true"
            >
              <FileJson className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <h2 id="backup-heading" className="text-xl font-semibold text-ink">
                Backup and restore
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                A validated JSON copy of the workspace in this browser
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-muted">
          Export includes every saved event, budget, task, activity, guest, catering
          assumption, rescue proposal snapshot, and risk finding history. The file stays
          on your device and is never uploaded. Import validates the whole file and
          replaces the workspace in this browser only after you confirm.
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" onClick={handleExport} className="btn-primary">
            <Download className="size-4" aria-hidden="true" />
            Export workspace
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary"
          >
            <Upload className="size-4" aria-hidden="true" />
            Choose import file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            tabIndex={-1}
            className="sr-only"
            aria-label="Workspace JSON file to import"
          />
        </div>

        {dataError ? (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-rust-100 bg-rust-50 px-3.5 py-3 text-xs leading-relaxed text-rust-700"
          >
            {dataError}
          </p>
        ) : null}

        {pendingImport ? (
          <div
            role="group"
            aria-labelledby="confirm-import-heading"
            className="mt-4 rounded-2xl border border-rust-100 bg-rust-50/50 px-4 py-3.5"
          >
            <h3 id="confirm-import-heading" className="text-sm font-semibold text-ink">
              Replace this browser&rsquo;s workspace?
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
              <span className="font-semibold text-ink">{pendingImport.fileName}</span> is
              valid and contains {pendingImport.events} event
              {pendingImport.events === 1 ? '' : 's'}, {pendingImport.tasks} task
              {pendingImport.tasks === 1 ? '' : 's'}, {pendingImport.guests} guest
              {pendingImport.guests === 1 ? '' : 's'}, and {pendingImport.findings} risk
              finding{pendingImport.findings === 1 ? '' : 's'}. Importing replaces all
              current local data, including dismissals and rescue proposal history. This
              cannot be undone here — export a backup first if you need one.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rust-800 bg-rust-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rust-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust-800"
              >
                Replace my workspace
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-soft">
          Local storage is scoped to this browser and profile. It can be cleared by
          browser settings or privacy tools and is not a substitute for an independent
          backup. Imported files are validated strictly; a partial or malformed file is
          rejected without changing the current workspace.
        </p>
      </section>
    </div>
  );
}
