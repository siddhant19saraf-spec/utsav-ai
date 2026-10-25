import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

interface ModalDialogProps {
  readonly open: boolean;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
}

export function ModalDialog({
  open,
  eyebrow,
  title,
  description,
  onClose,
  children,
  initialFocusRef,
}: ModalDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <ModalDialogContent
      eyebrow={eyebrow}
      title={title}
      description={description}
      onClose={onClose}
      {...(initialFocusRef ? { initialFocusRef } : {})}
    >
      {children}
    </ModalDialogContent>
  );
}

type ModalDialogContentProps = Omit<ModalDialogProps, 'open'>;

function ModalDialogContent({
  eyebrow,
  title,
  description,
  onClose,
  children,
  initialFocusRef,
}: ModalDialogContentProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const descriptionId = `${baseId}-description`;

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocusRef?.current?.focus();

    if (!initialFocusRef?.current) {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
        )
        ?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
        ) ?? [],
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [initialFocusRef, onClose]);

  function handleBackdropMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-maroon-950/55 p-4 sm:p-6"
      onMouseDown={handleBackdropMouseDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="dialog-enter relative mx-auto my-4 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-surface shadow-lift sm:my-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7 sm:py-6">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-1.5 text-2xl leading-tight font-semibold tracking-[-0.015em] text-ink"
            >
              {title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="btn-icon"
          >
            <X className="size-4.5" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
