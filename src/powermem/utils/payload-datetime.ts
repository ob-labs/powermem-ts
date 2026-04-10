/**
 * Mirrors Python powermem `get_current_datetime().isoformat()` and timezone wiring:
 * - `set_timezone(config)` → `setPayloadTimezoneFromConfig` (from Memory / UserMemory init)
 * - `get_timezone()` / `get_current_datetime()` → `getPayloadTimezone` / `getCurrentDatetimeIsoformat`
 *
 * Wall time in the configured IANA zone, explicit offset (+00:00 not Z), 6-digit fractional (JS ms → xxx000).
 */

let timezoneFromMemoryConfig: string | undefined;

/**
 * Call from `Memory.create` / `UserMemory.create` when config is resolved (like Python `set_timezone`).
 * Pass `undefined` to clear and fall back to `TIMEZONE` env only.
 */
export function setPayloadTimezoneFromConfig(tz: string | undefined): void {
  if (tz !== undefined && String(tz).trim() !== '') {
    timezoneFromMemoryConfig = String(tz).trim();
  } else {
    timezoneFromMemoryConfig = undefined;
  }
}

/** Like Python `get_timezone()` result as IANA name: config override, else `TIMEZONE` env, else UTC. */
export function getPayloadTimezone(): string {
  if (timezoneFromMemoryConfig !== undefined) return timezoneFromMemoryConfig;
  return process.env.TIMEZONE?.trim() || 'UTC';
}

function offsetSuffixPythonStyle(date: Date, timeZone: string): string {
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  if (raw === 'GMT' || raw === 'UTC') return '+00:00';
  if (raw.startsWith('GMT')) {
    const rest = raw.slice(3);
    return rest === '' ? '+00:00' : rest;
  }
  return '+00:00';
}

export function formatInstantAsPythonIsoformat(date: Date, timeZone: string): string {
  const zone = timeZone.trim() || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      fractionalSecondDigits: 3,
    }).formatToParts(date);
  } catch {
    const iso = date.toISOString();
    const m = iso.match(/^(.+)\.(\d{3})Z$/);
    if (m) return `${m[1]}.${m[2]}000+00:00`;
    return iso.replace('Z', '+00:00');
  }

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const y = get('year');
  const mo = get('month');
  const da = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');
  const ms3 = get('fractionalSecond') || '000';
  const micros = `${ms3}000`.slice(0, 6);
  const off = offsetSuffixPythonStyle(date, zone);
  return `${y}-${mo}-${da}T${h}:${mi}:${s}.${micros}${off}`;
}

export function nowIsoInTimeZone(timeZone: string): string {
  return formatInstantAsPythonIsoformat(new Date(), timeZone);
}

/** Python `get_current_datetime().isoformat()`. */
export function getCurrentDatetimeIsoformat(): string {
  return nowIsoInTimeZone(getPayloadTimezone());
}
