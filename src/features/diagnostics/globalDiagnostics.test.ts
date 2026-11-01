import { describe, expect, it } from 'vitest';
import { createDiagnosticsStore } from './diagnosticsStore';
import { installGlobalDiagnostics } from './globalDiagnostics';

function makeStore() {
  return createDiagnosticsStore({
    now: () => new Date('2026-10-31T09:00:00.000Z'),
    createReferenceId: () => 'diag-global-1',
  });
}

describe('global diagnostics', () => {
  it('captures an uncaught error without storing its message', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });

    try {
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new TypeError('secret-workspace-detail'),
          message: 'secret-workspace-detail',
        }),
      );
    } finally {
      uninstall();
    }

    const [entry] = store.getSnapshot().entries;
    expect(entry).toMatchObject({
      category: 'uncaught',
      severity: 'error',
      feature: 'Application shell',
      recovery: 'unknown',
      count: 1,
    });
    expect(entry?.message).toContain('TypeError');
    expect(entry?.message).not.toContain('secret-workspace-detail');
    expect(JSON.stringify(store.getSnapshot())).not.toContain('secret-workspace-detail');
  });

  it('replaces an untrusted error name with a generic label', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });

    try {
      const error = new Error('detail');
      error.name = 'Bad Name!';
      window.dispatchEvent(new ErrorEvent('error', { error, message: 'detail' }));
    } finally {
      uninstall();
    }

    expect(store.getSnapshot().entries[0]?.message).toContain('An unexpected error');
  });

  it('ignores an error event with no error or message', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });

    try {
      window.dispatchEvent(new ErrorEvent('error'));
    } finally {
      uninstall();
    }

    expect(store.getSnapshot().entries).toEqual([]);
  });

  it('captures an unhandled promise rejection with a fixed summary', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });

    try {
      window.dispatchEvent(new Event('unhandledrejection'));
    } finally {
      uninstall();
    }

    const [entry] = store.getSnapshot().entries;
    expect(entry?.category).toBe('unhandled-rejection');
    expect(entry?.message).toBe(
      'An asynchronous operation failed without a handler. The screen may be incomplete; saved planning data is unchanged.',
    );
  });

  it('installs only once per window until it is uninstalled', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });
    const secondUninstall = installGlobalDiagnostics({ target: window, store });

    try {
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new RangeError('detail'),
          message: 'detail',
        }),
      );
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: new RangeError('detail'),
          message: 'detail',
        }),
      );
    } finally {
      secondUninstall();
      uninstall();
    }

    expect(store.getSnapshot().entries).toHaveLength(1);
    expect(store.getSnapshot().entries[0]?.count).toBe(2);
  });

  it('stops listening after uninstall', () => {
    const store = makeStore();
    const uninstall = installGlobalDiagnostics({ target: window, store });

    uninstall();
    window.dispatchEvent(new Event('unhandledrejection'));

    expect(store.getSnapshot().entries).toEqual([]);
  });
});
