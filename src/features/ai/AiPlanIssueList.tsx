import type { AiPlanIssue } from './planValidation';
import { severityMeta } from './aiPlanPresentation';

export function IssueList({ issues }: { readonly issues: readonly AiPlanIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1.5">
      {issues.map((issue) => (
        <li key={issue.id} className="flex items-start gap-2 text-xs leading-relaxed">
          <span
            className={`mt-1 size-1.5 shrink-0 rounded-full ${
              issue.severity === 'error'
                ? 'bg-rust-700'
                : issue.severity === 'warning'
                  ? 'bg-gold-600'
                  : 'bg-slate-blue-700'
            }`}
            aria-hidden="true"
          />
          <span className="text-ink-muted">
            <span className="font-semibold text-ink">
              {severityMeta[issue.severity].label}:
            </span>{' '}
            {issue.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
