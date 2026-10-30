interface FormErrorSummaryProps {
  readonly message: string;
  readonly id?: string;
  readonly className?: string;
}

const baseClassName =
  'rounded-2xl border border-rust-100 bg-rust-50 px-4 py-3 text-sm font-medium text-rust-700';

/**
 * Announced error banner shared by every form dialog. Renders nothing while
 * there is no message so the alert region is not mounted empty.
 */
export function FormErrorSummary({ message, id, className }: FormErrorSummaryProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      id={id}
      role="alert"
      className={className ? `${baseClassName} ${className}` : baseClassName}
    >
      {message}
    </div>
  );
}
