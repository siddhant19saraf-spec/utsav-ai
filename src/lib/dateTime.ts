const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const activityDateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const activityTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
});

function parseParts(value: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
} | null {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hours: Number(match[4]),
    minutes: Number(match[5]),
  };
}

/**
 * Parses a local calendar date-time without applying a timezone offset.
 * Returns null for malformed values and for local times that do not exist.
 */
export function parseLocalDateTime(value: string): Date | null {
  const parts = parseParts(value);

  if (!parts) {
    return null;
  }

  const date = new Date(0);
  date.setFullYear(parts.year, parts.month - 1, parts.day);
  date.setHours(parts.hours, parts.minutes, 0, 0);

  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day ||
    date.getHours() !== parts.hours ||
    date.getMinutes() !== parts.minutes
  ) {
    return null;
  }

  return date;
}

export function isValidLocalDateTime(value: string): boolean {
  return parseLocalDateTime(value) !== null;
}

export function toLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatActivityDateTime(value: string): string {
  const date = parseLocalDateTime(value);

  if (!date) {
    return value;
  }

  return activityDateTimeFormatter.format(date);
}

export function formatActivityTime(value: string): string {
  const date = parseLocalDateTime(value);

  if (!date) {
    return value;
  }

  return activityTimeFormatter.format(date);
}

export function localDateTimeDatePart(value: string): string {
  return value.slice(0, 10);
}
