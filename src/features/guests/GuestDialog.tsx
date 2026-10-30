import { Save, UserPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { ModalDialog } from '@/components/ModalDialog';
import { FieldError } from '@/components/FieldError';
import { FormErrorSummary } from '@/components/FormErrorSummary';
import { formatEventDate } from '@/lib/date';
import { clearFieldError, firstInvalidField } from '@/lib/formState';
import type { CelebrationEvent, Guest, RsvpStatus } from '@/types/domain';
import {
  normalizeGuestDraft,
  validateGuestDraft,
  type GuestDraft,
  type GuestFormErrors,
  type GuestFormField,
} from './guestRules';

interface GuestDialogProps {
  readonly open: boolean;
  readonly event: CelebrationEvent;
  readonly guest: Guest | null;
  readonly onClose: () => void;
  readonly onSave: (draft: GuestDraft) => void;
}

const fieldOrder: readonly GuestFormField[] = [
  'name',
  'dietaryPreference',
  'accessibilityRequest',
  'notes',
];

const rsvpOptions: readonly { value: RsvpStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
];

function initialDraft(guest: Guest | null): GuestDraft {
  if (guest) {
    return {
      name: guest.name,
      rsvp: guest.rsvp,
      dietaryPreference: guest.dietaryPreference ?? '',
      accessibilityRequest: guest.accessibilityRequest ?? '',
      notes: guest.notes ?? '',
    };
  }

  return {
    name: '',
    rsvp: 'pending',
    dietaryPreference: '',
    accessibilityRequest: '',
    notes: '',
  };
}

export function GuestDialog({ open, event, guest, onClose, onSave }: GuestDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <GuestDialogContent
      key={guest?.id ?? 'new'}
      event={event}
      guest={guest}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function GuestDialogContent({
  event,
  guest,
  onClose,
  onSave,
}: Omit<GuestDialogProps, 'open'>) {
  const [values, setValues] = useState<GuestDraft>(() => initialDraft(guest));
  const [errors, setErrors] = useState<GuestFormErrors>({});
  const [errorSummary, setErrorSummary] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  const fieldIds: Record<GuestFormField, string> = {
    name: 'guest-name',
    dietaryPreference: 'guest-dietary',
    accessibilityRequest: 'guest-accessibility',
    notes: 'guest-notes',
  };

  function updateField<K extends keyof GuestDraft>(field: K, value: GuestDraft[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearFieldError(current, field));
    setErrorSummary('');
  }

  function handleSubmit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    if (submittedRef.current) {
      return;
    }

    const draft = normalizeGuestDraft(values);
    const nextErrors = validateGuestDraft(draft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorSummary('Please fix the highlighted fields before saving the guest.');
      const firstInvalid = firstInvalidField(fieldOrder, nextErrors);

      if (firstInvalid) {
        document.getElementById(fieldIds[firstInvalid])?.focus();
      }

      return;
    }

    submittedRef.current = true;
    setErrors({});
    setErrorSummary('');
    onSave(draft);
  }

  return (
    <ModalDialog
      open
      eyebrow={guest ? 'Edit guest' : 'New guest'}
      title={guest ? 'Update this guest' : 'Add a guest'}
      description={`${event.name} · ${formatEventDate(event.startsAt)}. Only add information you actually need. Guest details stay in this browser.`}
      onClose={onClose}
      initialFocusRef={nameRef}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-7">
        <FormErrorSummary message={errorSummary} />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={fieldIds.name} className="field-label">
              Guest name
            </label>
            <input
              ref={nameRef}
              id={fieldIds.name}
              name="name"
              type="text"
              value={values.name}
              maxLength={120}
              onChange={(changeEvent) => updateField('name', changeEvent.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'guest-name-error' : undefined}
              autoComplete="off"
              placeholder="Meera Kapoor"
              className={`field-control mt-1.5 ${errors.name ? 'border-rust-600' : ''}`}
            />
            {errors.name ? (
              <FieldError id="guest-name-error">{errors.name}</FieldError>
            ) : null}
          </div>

          <div>
            <label htmlFor="guest-rsvp" className="field-label">
              RSVP status
            </label>
            <select
              id="guest-rsvp"
              name="rsvp"
              value={values.rsvp}
              onChange={(changeEvent) =>
                updateField(
                  'rsvp',
                  changeEvent.target.value === 'confirmed' ||
                    changeEvent.target.value === 'declined'
                    ? changeEvent.target.value
                    : 'pending',
                )
              }
              className="field-control mt-1.5"
            >
              {rsvpOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="field-hint mt-1.5">
              Pending and declined guests are not counted as confirmed attendees.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor={fieldIds.dietaryPreference} className="field-label">
            Dietary preference <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id={fieldIds.dietaryPreference}
            name="dietaryPreference"
            type="text"
            value={values.dietaryPreference}
            maxLength={200}
            onChange={(changeEvent) =>
              updateField('dietaryPreference', changeEvent.target.value)
            }
            aria-invalid={errors.dietaryPreference ? true : undefined}
            aria-describedby={
              errors.dietaryPreference ? 'guest-dietary-error' : undefined
            }
            autoComplete="off"
            placeholder="Vegetarian, no nuts…"
            className={`field-control mt-1.5 ${errors.dietaryPreference ? 'border-rust-600' : ''}`}
          />
          {errors.dietaryPreference ? (
            <FieldError id="guest-dietary-error">{errors.dietaryPreference}</FieldError>
          ) : null}
        </div>

        <div>
          <label htmlFor={fieldIds.accessibilityRequest} className="field-label">
            Accessibility request{' '}
            <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            id={fieldIds.accessibilityRequest}
            name="accessibilityRequest"
            type="text"
            value={values.accessibilityRequest}
            maxLength={300}
            onChange={(changeEvent) =>
              updateField('accessibilityRequest', changeEvent.target.value)
            }
            aria-invalid={errors.accessibilityRequest ? true : undefined}
            aria-describedby={
              errors.accessibilityRequest ? 'guest-accessibility-error' : undefined
            }
            autoComplete="off"
            placeholder="Wheelchair access, step-free seating…"
            className={`field-control mt-1.5 ${errors.accessibilityRequest ? 'border-rust-600' : ''}`}
          />
          {errors.accessibilityRequest ? (
            <FieldError id="guest-accessibility-error">{errors.accessibilityRequest}</FieldError>
          ) : null}
        </div>

        <div>
          <label htmlFor={fieldIds.notes} className="field-label">
            Notes <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <textarea
            id={fieldIds.notes}
            name="notes"
            rows={3}
            value={values.notes}
            maxLength={500}
            onChange={(changeEvent) => updateField('notes', changeEvent.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? 'guest-notes-error' : undefined}
            placeholder="Arriving late, travelling with family…"
            className={`field-control mt-1.5 resize-y ${errors.notes ? 'border-rust-600' : ''}`}
          />
          {errors.notes ? (
            <FieldError id="guest-notes-error">{errors.notes}</FieldError>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {guest ? (
              <Save className="size-4" aria-hidden="true" />
            ) : (
              <UserPlus className="size-4" aria-hidden="true" />
            )}
            {guest ? 'Save changes' : 'Add guest'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
