import type { Workspace } from '@/types/domain';
import { salvageWorkspace } from './workspaceSalvage';
import { isSupportedVersion, parseWorkspace } from './workspaceSchema';
import { isRecord } from './workspaceValueParsers';

export const WORKSPACE_STORAGE_KEY = 'utsav-ai.workspace.v1';
export const WORKSPACE_RECOVERY_KEY = 'utsav-ai.workspace.recovery.v1';
const WORKSPACE_STORAGE_VERSION = 2;
const MAX_IMPORT_LENGTH = 5_000_000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type RecoveryCopyStatus = 'saved' | 'existing' | 'failed';

export type LoadWorkspaceResult =
  | { readonly status: 'loaded'; readonly workspace: Workspace }
  | {
      readonly status: 'partial';
      readonly workspace: Workspace;
      /** Safe summary of skipped records. Never includes record contents. */
      readonly message: string;
      readonly issues: readonly string[];
      readonly recovery: RecoveryCopyStatus;
    }
  | { readonly status: 'empty' }
  | {
      readonly status: 'invalid';
      readonly message: string;
      readonly recovery: RecoveryCopyStatus;
    }
  | { readonly status: 'unavailable'; readonly message: string };

export type SaveWorkspaceFailureCode = 'unavailable' | 'quota' | 'write-failed';

export type SaveWorkspaceResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: SaveWorkspaceFailureCode;
      readonly message: string;
    };

export type ParseWorkspaceResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly message: string };

export type ExportWorkspaceResult =
  | { readonly ok: true; readonly json: string }
  | { readonly ok: false; readonly message: string };

export type ImportWorkspaceResult =
  | { readonly ok: true; readonly workspace: Workspace }
  | { readonly ok: false; readonly message: string };

interface DecodedWorkspace {
  readonly workspace: unknown;
  readonly version: 1 | 2;
}

type DecodeWorkspaceResult =
  | { readonly ok: true; readonly decoded: DecodedWorkspace }
  | { readonly ok: false; readonly message: string };

function decodeWorkspace(raw: string): DecodeWorkspaceResult {
  let decoded: unknown;

  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'The saved workspace is not valid JSON.' };
  }

  if (!isRecord(decoded) || !isSupportedVersion(decoded.version)) {
    return { ok: false, message: 'The saved workspace version is not supported.' };
  }

  return {
    ok: true,
    decoded: { workspace: decoded.workspace, version: decoded.version },
  };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The saved workspace could not be read.';
}

export function parseStoredWorkspace(raw: string): ParseWorkspaceResult {
  const decoded = decodeWorkspace(raw);

  if (!decoded.ok) {
    return { ok: false, message: decoded.message };
  }

  try {
    return { ok: true, workspace: parseWorkspace(decoded.decoded.workspace) };
  } catch (error) {
    return {
      ok: false,
      message: `The saved workspace could not be read: ${safeErrorMessage(error)}`,
    };
  }
}

function recoveryNote(status: RecoveryCopyStatus): string {
  if (status === 'saved') {
    return ' A recovery copy of the unreadable saved data was kept in this browser.';
  }

  if (status === 'existing') {
    return ' An earlier recovery copy of unreadable saved data is still kept in this browser.';
  }

  return ' A recovery copy could not be saved; the original saved data stays in place until your next change.';
}

function writeRecoveryCopy(
  storage: StorageLike,
  raw: string,
  reason: 'invalid' | 'partial',
): RecoveryCopyStatus {
  try {
    if (storage.getItem(WORKSPACE_RECOVERY_KEY) !== null) {
      return 'existing';
    }

    storage.setItem(
      WORKSPACE_RECOVERY_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        reason,
        payload: raw,
      }),
    );
    return 'saved';
  } catch {
    return 'failed';
  }
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadWorkspaceFromStorage(
  storage: StorageLike | null = getBrowserStorage(),
): LoadWorkspaceResult {
  if (!storage) {
    return {
      status: 'unavailable',
      message: 'Local saving is unavailable. Changes stay in memory for this tab.',
    };
  }

  let raw: string | null;

  try {
    raw = storage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return {
      status: 'unavailable',
      message: 'Saved data could not be accessed. Changes stay in memory for this tab.',
    };
  }

  if (raw === null) {
    return { status: 'empty' };
  }

  const decoded = decodeWorkspace(raw);

  if (!decoded.ok) {
    const recovery = writeRecoveryCopy(storage, raw, 'invalid');

    return {
      status: 'invalid',
      message: `${decoded.message}${recoveryNote(recovery)}`,
      recovery,
    };
  }

  const salvaged = salvageWorkspace(decoded.decoded.workspace);

  if (!salvaged.ok) {
    const recovery = writeRecoveryCopy(storage, raw, 'invalid');

    return {
      status: 'invalid',
      message: `${salvaged.message}${recoveryNote(recovery)}`,
      recovery,
    };
  }

  if (salvaged.salvage.issues.length > 0) {
    const recovery = writeRecoveryCopy(storage, raw, 'partial');

    return {
      status: 'partial',
      workspace: salvaged.salvage.workspace,
      message: `Some saved records were skipped so the rest of your data could load. ${salvaged.salvage.issues.join(' ')}${recoveryNote(recovery)}`,
      issues: salvaged.salvage.issues,
      recovery,
    };
  }

  return { status: 'loaded', workspace: salvaged.salvage.workspace };
}

function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };

  return (
    candidate.name === 'QuotaExceededError' ||
    candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    candidate.code === 22 ||
    candidate.code === 1014 ||
    (typeof candidate.message === 'string' &&
      candidate.message.includes('QuotaExceeded'))
  );
}

export function saveWorkspaceToStorage(
  workspace: Workspace,
  storage: StorageLike | null = getBrowserStorage(),
): SaveWorkspaceResult {
  if (!storage) {
    return {
      ok: false,
      code: 'unavailable',
      message: 'Local saving is unavailable. Changes stay in memory for this tab.',
    };
  }

  let serialized: string;

  try {
    serialized = JSON.stringify({
      version: WORKSPACE_STORAGE_VERSION,
      workspace,
    });
  } catch {
    return {
      ok: false,
      code: 'write-failed',
      message:
        'Changes could not be prepared for saving. They remain available in this tab.',
    };
  }

  try {
    storage.setItem(WORKSPACE_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    if (isQuotaExceeded(error)) {
      return {
        ok: false,
        code: 'quota',
        message:
          'Changes could not be saved because this browser’s local storage is full. Export a backup, free up space, or remove sample data. Your edits remain available in this tab.',
      };
    }

    return {
      ok: false,
      code: 'write-failed',
      message:
        'Changes could not be saved to this browser. They remain available in this tab. Export a backup before closing the tab.',
    };
  }
}

export function exportWorkspaceToJson(workspace: Workspace): ExportWorkspaceResult {
  try {
    parseWorkspace(workspace);

    return {
      ok: true,
      json: JSON.stringify(
        {
          version: WORKSPACE_STORAGE_VERSION,
          exportedAt: new Date().toISOString(),
          workspace,
        },
        null,
        2,
      ),
    };
  } catch {
    return {
      ok: false,
      message:
        'This workspace could not be exported because some data is not valid. Review the latest validation messages and try again.',
    };
  }
}

export function importWorkspaceFromJson(raw: string): ImportWorkspaceResult {
  if (!raw.trim()) {
    return { ok: false, message: 'That file is empty. Nothing was imported.' };
  }

  if (raw.length > MAX_IMPORT_LENGTH) {
    return {
      ok: false,
      message: 'That file is too large to import safely. Nothing was imported.',
    };
  }

  const parsed = parseStoredWorkspace(raw);

  if (!parsed.ok) {
    return {
      ok: false,
      message: `That workspace file could not be imported. ${parsed.message} Nothing was changed.`,
    };
  }

  return parsed;
}
