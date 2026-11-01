const countFormatter = new Intl.NumberFormat('en-IN');
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** Formats a non-negative whole count with Indian digit grouping. */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/** Formats a count together with a correctly pluralised noun. */
export function formatCountLabel(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${countFormatter.format(value)} ${value === 1 ? singular : plural}`;
}

/** Formats an ISO timestamp for local, human-readable diagnostics. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return dateTimeFormatter.format(date);
}
