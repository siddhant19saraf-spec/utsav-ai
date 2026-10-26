import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLoading } from './PageLoading';

describe('PageLoading', () => {
  it('announces the loading state with a status role', () => {
    render(<PageLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading this planning view…');
  });
});
