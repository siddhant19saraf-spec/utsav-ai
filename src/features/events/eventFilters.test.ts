import { describe, expect, it } from 'vitest';
import { makeEvent } from '@/test/fixtures';
import { filterAndSortEvents } from './eventFilters';

const TODAY = '2026-10-24';

const upcomingWedding = makeEvent({
  id: 'wedding',
  name: 'Ananya Wedding',
  category: 'wedding',
  startsAt: '2026-12-01',
  venue: 'The Leela Palace, Bengaluru',
  status: 'on-track',
});
const upcomingCorporate = makeEvent({
  id: 'corporate',
  name: 'Acme Gala',
  category: 'corporate',
  startsAt: '2026-11-01',
  venue: 'Taj Coromandel, Chennai',
  status: 'planning',
});
const pastCompleted = makeEvent({
  id: 'diwali',
  name: 'Family Diwali',
  category: 'festival',
  startsAt: '2026-10-01',
  status: 'completed',
});
const pastPlanning = makeEvent({
  id: 'birthday',
  name: 'Old Birthday',
  category: 'birthday',
  startsAt: '2026-09-01',
  status: 'at-risk',
});
const todayEvent = makeEvent({
  id: 'today',
  name: 'Today Launch',
  category: 'other',
  startsAt: TODAY,
  status: 'draft',
});
const events = [upcomingWedding, upcomingCorporate, pastCompleted, pastPlanning, todayEvent];

function ids(results: readonly { id: string }[]): string[] {
  return results.map((event) => event.id);
}

describe('filterAndSortEvents', () => {
  it('shows upcoming events first by nearest date, then past events newest first', () => {
    expect(ids(filterAndSortEvents(events, '', 'all', TODAY))).toEqual([
      'today',
      'corporate',
      'wedding',
      'diwali',
      'birthday',
    ]);
  });

  it('searches name, venue, and category label without case sensitivity', () => {
    expect(ids(filterAndSortEvents(events, 'leela', 'all', TODAY))).toEqual(['wedding']);
    expect(ids(filterAndSortEvents(events, 'CHENNAI', 'all', TODAY))).toEqual(['corporate']);
    expect(ids(filterAndSortEvents(events, 'birthday', 'all', TODAY))).toEqual(['birthday']);
    expect(ids(filterAndSortEvents(events, 'wedding', 'all', TODAY))).toEqual(['wedding']);
  });

  it('ignores surrounding whitespace in search terms', () => {
    expect(ids(filterAndSortEvents(events, '   ', 'all', TODAY))).toHaveLength(events.length);
  });

  it('filters by planning status', () => {
    expect(ids(filterAndSortEvents(events, '', 'completed', TODAY))).toEqual(['diwali']);
    expect(ids(filterAndSortEvents(events, '', 'at-risk', TODAY))).toEqual(['birthday']);
    expect(ids(filterAndSortEvents(events, '', 'draft', TODAY))).toEqual(['today']);
  });

  it('combines search and status filters', () => {
    expect(filterAndSortEvents(events, 'acme', 'completed', TODAY)).toEqual([]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterAndSortEvents(events, 'no-such-event', 'all', TODAY)).toEqual([]);
  });

  it('does not mutate the source list', () => {
    const source = [...events];
    filterAndSortEvents(source, '', 'all', TODAY);
    expect(source).toEqual(events);
  });
});
