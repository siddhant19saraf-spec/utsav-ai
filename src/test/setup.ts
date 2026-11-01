import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { diagnosticsStore } from '@/features/diagnostics/diagnosticsStore';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  diagnosticsStore.reset();
});
