const countFormatter = new Intl.NumberFormat('en-IN');

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
