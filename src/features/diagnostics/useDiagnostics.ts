import { useSyncExternalStore } from 'react';
import { diagnosticsStore, type DiagnosticsSnapshot } from './diagnosticsStore';

export function useDiagnostics(): DiagnosticsSnapshot {
  return useSyncExternalStore(
    diagnosticsStore.subscribe,
    diagnosticsStore.getSnapshot,
    diagnosticsStore.getSnapshot,
  );
}
