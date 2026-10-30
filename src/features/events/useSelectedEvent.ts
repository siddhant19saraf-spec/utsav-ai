import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CelebrationEvent } from '@/types/domain';
import { useWorkspace } from '@/features/workspace/workspaceContext';

export interface SelectedEventState {
  readonly selectedEvent: CelebrationEvent | null;
  readonly handleEventChange: (eventId: string) => void;
}

export function useSelectedEvent(): SelectedEventState {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedEventId = searchParams.get('event');
  const selectedEvent =
    workspace.events.find((event) => event.id === requestedEventId) ??
    workspace.events[0] ??
    null;

  const handleEventChange = useCallback(
    (eventId: string) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('event', eventId);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return { selectedEvent, handleEventChange };
}
