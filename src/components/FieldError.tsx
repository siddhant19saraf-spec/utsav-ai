import type { ReactNode } from 'react';

interface FieldErrorProps {
  readonly id: string;
  readonly children: ReactNode;
}

/** Inline validation message referenced by a control's aria-describedby. */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} className="field-error mt-1.5">
      {children}
    </p>
  );
}
